-- ============================================================
-- JULEX · recepción por WhatsApp (2/3): funciones
--
-- Aquí se decide. El webhook de Meta solo transporta: quién es el
-- cliente, qué puede hacer y qué se guarda se resuelve en estas
-- funciones, con las mismas reglas que la tarjeta y la agenda.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Utilidades
-- ------------------------------------------------------------

-- El teléfono es la llave. Se comparan los últimos 9 dígitos: el
-- cliente escribe «+34 600 11 22 33», la ficha guarda «600112233» y
-- Meta manda «34600112233». Los tres son el mismo.
create or replace function public.normalizar_telefono(p_telefono text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9);
$$;

-- ¿Está el local abierto en ese instante? Se usa para saber si el
-- agente trabajó fuera de horario (y poder enseñarlo).
create or replace function public.local_abierto(p_barberia uuid, p_instante timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce((
    select (p_instante at time zone 'Europe/Madrid')::time >= h.abre
       and (p_instante at time zone 'Europe/Madrid')::time < h.cierra
       and not (h.descanso_desde is not null and h.descanso_hasta is not null
                and (p_instante at time zone 'Europe/Madrid')::time >= h.descanso_desde
                and (p_instante at time zone 'Europe/Madrid')::time < h.descanso_hasta)
      from horarios h
     where h.barberia_id = p_barberia
       and h.dia_semana = extract(dow from p_instante at time zone 'Europe/Madrid')::int
  ), false);
$$;

-- La parte pública de la ficha: lo mismo que calcula asistente_publico
-- para el llavero. Se repite aquí porque el llavero comprueba el PIN
-- antes de llegar a este punto y WhatsApp no: el teléfono ya es la
-- prueba. Si cambia la cuenta de sellos, hay que cambiar las dos.
create or replace function public.cliente_publico_json(p_cliente uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente     clientes%rowtype;
  v_local       barberias%rowtype;
  v_meta        int;
  v_visitas     int;
  v_disponibles int;
  v_restante    int;
  v_faltan      int;
  v_proxima     json;
  v_ultima      timestamptz;
begin
  select * into v_cliente from clientes where id = p_cliente;
  if not found then return null; end if;
  select * into v_local from barberias where id = v_cliente.barberia_id;

  v_meta        := greatest(1, v_local.fidelidad_meta);
  v_visitas     := (select count(*) from visitas v where v.cliente_id = v_cliente.id);
  v_disponibles := (select count(*) from recompensas r
                     where r.cliente_id = v_cliente.id and r.estado = 'disponible');
  v_restante    := v_visitas % v_meta;
  v_faltan      := case when v_disponibles > 0 then 0 else v_meta - v_restante end;
  v_ultima      := (select max(v.fecha) from visitas v where v.cliente_id = v_cliente.id);

  select json_build_object(
           'id', ci.id, 'inicio', ci.inicio, 'estado', ci.estado,
           'servicio', s.nombre, 'silla', si.nombre)
    into v_proxima
    from citas ci
    join servicios s on s.id = ci.servicio_id
    left join sillas si on si.id = ci.silla_id
   where ci.cliente_id = v_cliente.id
     and ci.estado in ('pendiente', 'confirmada')
     and ci.inicio >= now()
   order by ci.inicio limit 1;

  return json_build_object(
    'id', v_cliente.id,
    'nombre', v_cliente.nombre,
    'telefono', v_cliente.telefono,
    'token', v_cliente.token_publico,
    'avisos', v_cliente.cons_avisos,
    'sellos', json_build_object(
      'en_ciclo', case when v_disponibles > 0 then v_meta else v_restante end,
      'meta', v_meta, 'faltan', v_faltan, 'disponibles', v_disponibles),
    'proxima', v_proxima,
    'ultima_visita', v_ultima
  );
end;
$$;

-- ------------------------------------------------------------
-- 1. Quién habla: el teléfono manda
-- ------------------------------------------------------------
-- Devuelve la ficha del cliente que escribe, o null. No pide PIN: en
-- WhatsApp la prueba es controlar el número, y a eso no se le puede
-- mentir desde fuera. Quien quiera más detalle, tiene la tarjeta.
create or replace function public.wa_publico(p_barberia uuid, p_telefono text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local   barberias%rowtype;
  v_config  asistente_config%rowtype;
  v_linea   wa_linea%rowtype;
  v_cliente uuid;
  v_nueve   text := public.normalizar_telefono(p_telefono);
begin
  select * into v_local from barberias where id = p_barberia;
  if not found or not v_local.activo then return json_build_object('estado', 'no_existe'); end if;
  if v_local.estado_cobro = 'suspendido' then return json_build_object('estado', 'suspendido'); end if;

  select * into v_config from asistente_config where barberia_id = p_barberia;
  if v_config.barberia_id is null or not v_config.canal_whatsapp then
    return json_build_object('estado', 'apagado');
  end if;

  select * into v_linea from wa_linea where barberia_id = p_barberia;
  if v_linea.barberia_id is null or v_linea.estado <> 'activa' then
    return json_build_object('estado', 'sin_linea');
  end if;

  select v.cliente_id into v_cliente
    from wa_vinculo v
   where v.barberia_id = p_barberia
     and v.telefono = v_nueve
     and v.estado = 'confirmado'
     and v.cliente_id is not null;

  -- Sin vínculo: es un cliente nuevo o alguien que escribe desde otro
  -- número. Se atiende igual, pero sin historial.
  if v_cliente is null then
    return json_build_object(
      'estado', 'nuevo',
      'barberia_id', p_barberia,
      'local', json_build_object(
        'nombre', v_local.nombre, 'slug', v_local.slug,
        'telefono', v_local.telefono, 'direccion', v_local.direccion),
      'asistente', json_build_object(
        'nombre', nullif(trim(coalesce(v_config.nombre, '')), ''),
        'avatar_id', coalesce(v_config.avatar_id, ''),
        'bienvenida', coalesce(v_config.bienvenida, '')),
      'cliente', null,
      'telefono', v_nueve
    );
  end if;

  return json_build_object(
    'estado', 'abierta',
    'barberia_id', p_barberia,
    'local', json_build_object(
      'nombre', v_local.nombre, 'slug', v_local.slug,
      'telefono', v_local.telefono, 'direccion', v_local.direccion),
    'asistente', json_build_object(
      'nombre', nullif(trim(coalesce(v_config.nombre, '')), ''),
      'avatar_id', coalesce(v_config.avatar_id, ''),
      'bienvenida', coalesce(v_config.bienvenida, '')),
    'cliente', public.cliente_publico_json(v_cliente),
    'telefono', v_nueve
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. Vínculo automático por número
-- ------------------------------------------------------------
-- Si el número que escribe ya está en una ficha del local, no hay nada
-- que preguntar: se vincula. Si no, el cliente sigue sin ficha y el
-- agente le pedirá el código cuando él quiera ver sus cosas.
create or replace function public.wa_vincular_auto(
  p_barberia uuid, p_telefono text, p_wa_id text default ''
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_cliente uuid;
begin
  if length(coalesce(v_nueve, '')) <> 9 then
    return json_build_object('vinculado', false, 'motivo', 'telefono');
  end if;

  select id into v_cliente
    from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve
     and cons_datos
   order by creado_en
   limit 1;

  if v_cliente is null then
    return json_build_object('vinculado', false, 'motivo', 'sin_ficha');
  end if;

  insert into wa_vinculo (barberia_id, telefono, wa_id, cliente_id, metodo, estado,
                          confirmado_en, ultimo_uso)
  values (p_barberia, v_nueve, coalesce(p_wa_id, ''), v_cliente, 'telefono', 'confirmado',
          now(), now())
  on conflict (barberia_id, telefono) do update
    set cliente_id    = excluded.cliente_id,
        wa_id         = excluded.wa_id,
        estado        = 'confirmado',
        confirmado_en = coalesce(wa_vinculo.confirmado_en, now()),
        ultimo_uso    = now();

  return json_build_object('vinculado', true, 'cliente_id', v_cliente);
end;
$$;

-- ------------------------------------------------------------
-- 3. Código de comprobación
-- ------------------------------------------------------------
-- Para el cliente que no tiene ficha pero quiere que el agente le
-- enseñe su historial: se le manda un código al WhatsApp y lo teclea.
-- Se guarda el hash, no el código.
create or replace function public.wa_codigo_pedir(p_barberia uuid, p_telefono text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_codigo  text;
  v_cliente uuid;
begin
  if length(coalesce(v_nueve, '')) <> 9 then
    return json_build_object('error', 'telefono');
  end if;

  -- Un código cada dos minutos y por teléfono: ni spam ni fuerza bruta.
  if exists (select 1 from wa_codigo
              where barberia_id = p_barberia and telefono = v_nueve
                and creado_en > now() - interval '2 minutes') then
    return json_build_object('error', 'demasiado_pronto');
  end if;

  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve
   limit 1;

  v_codigo := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');

  insert into wa_codigo (barberia_id, telefono, cliente_id, hash, caduca)
  values (p_barberia, v_nueve, v_cliente,
          encode(extensions.digest(v_codigo || v_nueve || p_barberia::text, 'sha256'), 'hex'),
          now() + interval '10 minutes');

  return json_build_object('codigo', v_codigo, 'cliente_id', v_cliente);
end;
$$;

create or replace function public.wa_codigo_comprobar(
  p_barberia uuid, p_telefono text, p_codigo text
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_fila    wa_codigo%rowtype;
  v_hash    text;
  v_cliente uuid;
begin
  select * into v_fila from wa_codigo
   where barberia_id = p_barberia and telefono = v_nueve and usado_en is null
   order by creado_en desc limit 1;

  if not found then return json_build_object('ok', false, 'motivo', 'sin_codigo'); end if;
  if v_fila.caduca < now() then return json_build_object('ok', false, 'motivo', 'caducado'); end if;
  if v_fila.intentos >= 5 then return json_build_object('ok', false, 'motivo', 'bloqueado'); end if;

  v_hash := encode(extensions.digest(coalesce(p_codigo, '') || v_nueve || p_barberia::text, 'sha256'), 'hex');

  if v_hash <> v_fila.hash then
    update wa_codigo set intentos = intentos + 1 where id = v_fila.id;
    return json_build_object('ok', false, 'motivo', 'no_coincide');
  end if;

  update wa_codigo set usado_en = now() where id = v_fila.id;

  -- El código demuestra que controla el número. Si había ficha con ese
  -- teléfono, se usa; si no, la crea el alta normal cuando reserve.
  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve
   limit 1;

  if v_cliente is not null then
    insert into wa_vinculo (barberia_id, telefono, cliente_id, metodo, estado,
                            confirmado_en, ultimo_uso)
    values (p_barberia, v_nueve, v_cliente, 'codigo', 'confirmado', now(), now())
    on conflict (barberia_id, telefono) do update
      set cliente_id    = excluded.cliente_id,
          estado        = 'confirmado',
          metodo        = 'codigo',
          confirmado_en = coalesce(wa_vinculo.confirmado_en, now()),
          ultimo_uso    = now();
  end if;

  return json_build_object(
    'ok', true,
    'cliente_id', v_cliente,
    'nombre', (select nombre from clientes where id = v_cliente)
  );
end;
$$;

create or replace function public.wa_token_de(p_barberia uuid, p_telefono text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono)
   limit 1;

  return json_build_object(
    'cliente_id', v_cliente,
    'token', (select token_publico from clientes where id = v_cliente),
    'nombre', (select nombre from clientes where id = v_cliente)
  );
end;
$$;

-- Un móvil cambia de dueño: el vínculo se revoca y la ficha deja de
-- estar detrás de ese número.
create or replace function public.wa_desvincular(p_barberia uuid, p_telefono text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update wa_vinculo
     set estado = 'revocado', cliente_id = null
   where barberia_id = p_barberia
     and telefono = public.normalizar_telefono(p_telefono);
  return found;
end;
$$;

-- ------------------------------------------------------------
-- 4. Registro de mensajes
-- ------------------------------------------------------------
-- Devuelve true la primera vez que se ve ese mensaje. Meta reintenta
-- sus webhooks: sin esto, un «sí» acabaría reservando dos veces.
create or replace function public.wa_mensaje_entrante(
  p_barberia uuid, p_wa_id text, p_message_id text, p_tipo text, p_texto text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into wa_mensaje (barberia_id, direccion, wa_id, wa_message_id, tipo, texto, estado)
  values (p_barberia, 'entrante', coalesce(p_wa_id, ''), p_message_id,
          left(coalesce(p_tipo, 'text'), 20), left(coalesce(p_texto, ''), 4000), 'recibido')
  on conflict (wa_message_id) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

-- Se llama al terminar de contestar: el mensaje saliente queda atado al
-- turno y con su coste. Si falla, no se pierde la respuesta.
create or replace function public.wa_mensaje_saliente(
  p_barberia uuid, p_wa_id text, p_message_id text, p_tipo text, p_texto text,
  p_estado text default 'enviado', p_error text default '', p_coste numeric default 0
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into wa_mensaje (barberia_id, direccion, wa_id, wa_message_id, tipo, texto,
                          estado, error, coste)
  values (p_barberia, 'saliente', coalesce(p_wa_id, ''), p_message_id,
          left(coalesce(p_tipo, 'text'), 20), left(coalesce(p_texto, ''), 4000),
          case when p_estado in ('enviado','entregado','leido','fallo','ignorado')
               then p_estado else 'enviado' end,
          left(coalesce(p_error, ''), 500), greatest(coalesce(p_coste, 0), 0))
  on conflict (wa_message_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Lista de espera
-- ------------------------------------------------------------
create or replace function public.wa_espera_apuntar(
  p_barberia uuid, p_telefono text, p_nombre text default '',
  p_servicio uuid default null, p_desde date default current_date,
  p_hasta date default null, p_preferencia text default 'cualquiera'
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_cliente uuid;
  v_id      uuid;
  v_puesto  int;
begin
  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve limit 1;

  -- Si ya estaba esperando, no se duplica: se actualiza su ventana.
  select id into v_id from lista_espera
   where barberia_id = p_barberia and telefono = v_nueve
     and estado in ('esperando', 'ofrecido')
   limit 1;

  if v_id is not null then
    update lista_espera
       set servicio_id = coalesce(p_servicio, servicio_id),
           desde = p_desde, hasta = p_hasta,
           preferencia = coalesce(nullif(p_preferencia, ''), preferencia),
           nombre = coalesce(nullif(trim(p_nombre), ''), nombre)
     where id = v_id;
  else
    insert into lista_espera (barberia_id, cliente_id, telefono, nombre, servicio_id,
                              desde, hasta, preferencia)
    values (p_barberia, v_cliente, v_nueve, left(coalesce(trim(p_nombre), ''), 80),
            p_servicio, p_desde, p_hasta,
            case when p_preferencia in ('manana','tarde','cualquiera')
                 then p_preferencia else 'cualquiera' end)
    returning id into v_id;
  end if;

  select count(*) + 1 into v_puesto
    from lista_espera
   where barberia_id = p_barberia and estado = 'esperando'
     and creado_en < (select creado_en from lista_espera where id = v_id);

  return json_build_object('apuntado', true, 'espera_id', v_id, 'puesto', v_puesto);
end;
$$;

create or replace function public.wa_espera_mia(p_barberia uuid, p_telefono text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_nueve  text := public.normalizar_telefono(p_telefono);
  v_espera lista_espera%rowtype;
  v_oferta json;
begin
  select * into v_espera from lista_espera
   where barberia_id = p_barberia and telefono = v_nueve
     and estado in ('esperando', 'ofrecido')
   order by creado_en desc limit 1;

  if not found then return null; end if;

  select json_build_object(
           'id', o.id, 'inicio', o.inicio,
           'servicio', (select nombre from servicios where id = o.servicio_id),
           'caduca', o.caduca)
    into v_oferta
    from lista_espera_oferta o
   where o.espera_id = v_espera.id
     and o.estado in ('pendiente', 'enviada')
     and o.caduca > now()
   order by o.creada_en desc limit 1;

  return json_build_object(
    'espera_id', v_espera.id,
    'estado', v_espera.estado,
    'desde', v_espera.desde,
    'hasta', v_espera.hasta,
    'preferencia', v_espera.preferencia,
    'puesto', (select count(*) + 1 from lista_espera e2
                where e2.barberia_id = p_barberia and e2.estado = 'esperando'
                  and e2.creado_en < v_espera.creado_en),
    'oferta', v_oferta
  );
end;
$$;

create or replace function public.wa_espera_soltar(p_barberia uuid, p_telefono text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update lista_espera
     set estado = 'caducado', resuelto_en = now()
   where barberia_id = p_barberia
     and telefono = public.normalizar_telefono(p_telefono)
     and estado in ('esperando', 'ofrecido');
  return found;
end;
$$;

-- El agente acepta o rechaza la oferta dentro de la conversación. Se
-- vuelve a comprobar el hueco: entre el aviso y el «sí» puede haber
-- pasado cualquier cosa.
create or replace function public.wa_oferta_resolver(
  p_oferta uuid, p_aceptada boolean
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_oferta lista_espera_oferta%rowtype;
begin
  select * into v_oferta from lista_espera_oferta where id = p_oferta;
  if not found then return json_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if v_oferta.estado in ('aceptada', 'rechazada', 'caducada') then
    return json_build_object('ok', false, 'motivo', 'ya_resuelta');
  end if;
  if v_oferta.caduca < now() then
    update lista_espera_oferta set estado = 'caducada', resuelta_en = now()
     where id = p_oferta;
    return json_build_object('ok', false, 'motivo', 'caducada');
  end if;

  update lista_espera_oferta
     set estado = case when p_aceptada then 'aceptada' else 'rechazada' end,
         resuelta_en = now()
   where id = p_oferta;

  update lista_espera
     set estado = case when p_aceptada then 'resuelto' else 'esperando' end,
         resuelto_en = case when p_aceptada then now() else null end
   where id = v_oferta.espera_id;

  return json_build_object('ok', true, 'inicio', v_oferta.inicio);
end;
$$;

-- ------------------------------------------------------------
-- 6. Recordatorios
-- ------------------------------------------------------------
-- Reclama las citas de las próximas 18–26 horas que aún no tienen
-- recordatorio. Deja la fila creada en el mismo paso: si el envío
-- falla, no se reintenta en bucle, queda en 'fallo' y se ve.
create or replace function public.wa_recordatorios_reclamar(p_limite int default 50)
returns json language sql security definer set search_path = public, pg_temp as $$
  with candidatas as (
    select ci.id, ci.barberia_id, public.normalizar_telefono(cl.telefono) as tel
      from citas ci
      join clientes cl on cl.id = ci.cliente_id
      join barberias b on b.id = ci.barberia_id
      join wa_linea w on w.barberia_id = ci.barberia_id
     where ci.estado in ('pendiente', 'confirmada')
       and ci.inicio between now() + interval '18 hours' and now() + interval '26 hours'
       and cl.cons_avisos
       and length(public.normalizar_telefono(cl.telefono)) = 9
       and w.estado = 'activa'
       and w.modo = 'real'
       and not exists (select 1 from recordatorio r where r.cita_id = ci.id)
     order by ci.inicio
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  ), creadas as (
    insert into recordatorio (cita_id, barberia_id, telefono, estado)
    select id, barberia_id, tel, 'pendiente' from candidatas
    on conflict (cita_id) do nothing
    returning cita_id, barberia_id, telefono
  )
  select coalesce(json_agg(json_build_object(
           'cita_id', cr.cita_id, 'barberia_id', cr.barberia_id,
           'telefono', cr.telefono, 'nombre', cl.nombre,
           'inicio', ci.inicio, 'servicio', s.nombre,
           'local', b.nombre)), '[]'::json)
    from creadas cr
    join citas ci on ci.id = cr.cita_id
    join clientes cl on cl.id = ci.cliente_id
    join servicios s on s.id = ci.servicio_id
    join barberias b on b.id = cr.barberia_id;
$$;

create or replace function public.wa_recordatorio_resultado(
  p_cita uuid, p_ok boolean, p_error text default ''
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update recordatorio
     set estado = case when p_ok then 'enviado' else 'fallo' end,
         enviado_en = now(),
         error = left(coalesce(p_error, ''), 500)
   where cita_id = p_cita;
  return found;
end;
$$;

-- ------------------------------------------------------------
-- 7. Ofertas de hueco a la lista de espera
-- ------------------------------------------------------------
-- Marca como enviadas las que toca mandar y devuelve lo necesario para
-- escribir el mensaje. Caducar primero evita ofrecer huecos muertos.
create or replace function public.wa_ofertas_reclamar(p_limite int default 20)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_json json;
begin
  update lista_espera_oferta
     set estado = 'caducada', resuelta_en = now()
   where estado in ('pendiente', 'enviada') and caduca < now();

  update lista_espera e
     set estado = 'esperando'
   where e.estado = 'ofrecido'
     and not exists (select 1 from lista_espera_oferta o
                      where o.espera_id = e.id
                        and o.estado in ('pendiente', 'enviada'));

  with candidatas as (
    select o.id
      from lista_espera_oferta o
      join lista_espera e on e.id = o.espera_id
      join barberias b on b.id = o.barberia_id
      join wa_linea w on w.barberia_id = o.barberia_id
     where o.estado = 'pendiente'
       and o.caduca > now()
       and w.estado = 'activa'
       and w.modo = 'real'
     order by o.inicio
     limit greatest(1, least(coalesce(p_limite, 20), 100))
     for update of o skip locked
  ), marcadas as (
    update lista_espera_oferta o
       set estado = 'enviada'
      from candidatas c
     where o.id = c.id
     returning o.*
  )
  select coalesce(json_agg(json_build_object(
           'oferta_id', m.id, 'espera_id', m.espera_id, 'barberia_id', m.barberia_id,
           'telefono', e.telefono, 'nombre', e.nombre,
           'inicio', m.inicio,
           'servicio', (select nombre from servicios where id = m.servicio_id),
           'local', (select nombre from barberias where id = m.barberia_id))), '[]'::json)
    into v_json
    from marcadas m join lista_espera e on e.id = m.espera_id;

  return v_json;
end;
$$;

-- ------------------------------------------------------------
-- 8. Aprobaciones del dueño
-- ------------------------------------------------------------
create or replace function public.wa_aprobacion_crear(
  p_barberia uuid, p_tipo text, p_referencia uuid, p_texto text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into wa_aprobacion (barberia_id, tipo, referencia, texto)
  values (p_barberia,
          case when p_tipo in ('cita','ficha') then p_tipo else 'cita' end,
          p_referencia, left(coalesce(p_texto, ''), 600))
  returning id into v_id;
  return v_id;
end;
$$;

-- Aprobar confirma la cita; descartar la cancela y deja el hueco libre.
-- El hueco estaba bloqueado desde el primer momento: no hay dobles.
create or replace function public.recepcion_aprobar(p_id uuid, p_aprobar boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ap wa_aprobacion%rowtype;
begin
  select * into v_ap from wa_aprobacion
   where id = p_id and barberia_id = public.mi_barberia() and estado = 'pendiente';
  if not found then return false; end if;

  update wa_aprobacion
     set estado = case when p_aprobar then 'aprobada' else 'descartada' end,
         resuelta_en = now()
   where id = p_id;

  if v_ap.tipo = 'cita' and v_ap.referencia is not null then
    update citas
       set estado = case when p_aprobar then 'confirmada'::estado_cita
                         else 'cancelada'::estado_cita end
     where id = v_ap.referencia
       and estado = 'pendiente';
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 9. El panel del dueño
-- ------------------------------------------------------------
create or replace function public.recepcion_panel(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid')
                              at time zone 'Europe/Madrid';
  v_json json;
begin
  -- `is distinct from` y no `<>`: sin sesión mi_barberia() es null, y
  -- null <> uuid no es verdadero, así que el `if` no cortaría nada.
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select json_build_object(
    'linea', (select json_build_object(
                'telefono', w.telefono_visible, 'estado', w.estado, 'modo', w.modo,
                'autorizados', coalesce(to_jsonb(w.autorizados), '[]'::jsonb))
                from wa_linea w where w.barberia_id = p_barberia),
    'metricas', json_build_object(
      'conversaciones', (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.abierta_en > now() - interval '30 days'),
      'citas',          (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.resultado = 'cita'
                            and c.abierta_en > now() - interval '30 days'),
      'fuera_horario',  (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.abierta_en > now() - interval '30 days'
                            and not public.local_abierto(p_barberia, c.abierta_en)),
      'derivadas',      (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.estado = 'derivada'
                            and c.abierta_en > now() - interval '30 days'),
      'recordatorios',  (select count(*) from recordatorio r
                          where r.barberia_id = p_barberia and r.estado = 'enviado'
                            and r.enviado_en > now() - interval '30 days'),
      'espera',         (select count(*) from lista_espera e
                          where e.barberia_id = p_barberia and e.estado in ('esperando','ofrecido')),
      'premios',        (select count(*) from recompensas r
                           join clientes cl on cl.id = r.cliente_id
                          where cl.barberia_id = p_barberia and r.estado = 'disponible')),
    'pendientes', coalesce((select json_agg(json_build_object(
             'id', a.id, 'tipo', a.tipo, 'texto', a.texto, 'creado_en', a.creada_en)
             order by a.creada_en desc)
           from wa_aprobacion a
          where a.barberia_id = p_barberia and a.estado = 'pendiente'), '[]'::json),
    'espera', coalesce((select json_agg(json_build_object(
             'id', e.id, 'nombre', coalesce(nullif(e.nombre, ''), 'Sin nombre'),
             'servicio', (select nombre from servicios where id = e.servicio_id),
             'desde', e.creado_en)
             order by e.creado_en)
           from lista_espera e
          where e.barberia_id = p_barberia and e.estado in ('esperando','ofrecido')), '[]'::json),
    'topes', json_build_object(
      'conversaciones', 300,
      'usadas', (select count(*) from asistente_conversacion c
                  where c.barberia_id = p_barberia and c.abierta_en >= v_inicio_mes),
      'mensajes', 1500,
      'usados', (select count(*) from asistente_mensaje m
                   join asistente_conversacion c on c.id = m.conversacion_id
                  where c.barberia_id = p_barberia and m.creado_en >= v_inicio_mes))
  ) into v_json;

  return v_json;
end;
$$;

-- Desconectar es una acción del dueño, no del servicio: apaga el canal
-- y deja la fila para volver a conectar sin perder el número.
create or replace function public.wa_desconectar(p_barberia uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_barberia is distinct from public.mi_barberia() then return false; end if;

  update wa_linea set estado = 'pausa', modo = 'prueba' where barberia_id = p_barberia;
  update asistente_config set canal_whatsapp = false where barberia_id = p_barberia;
  delete from wa_secreto where barberia_id = p_barberia;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 10. Permisos
-- ------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array[
    'normalizar_telefono(text)', 'local_abierto(uuid, timestamptz)',
    'cliente_publico_json(uuid)', 'wa_publico(uuid, text)',
    'wa_vincular_auto(uuid, text, text)', 'wa_codigo_pedir(uuid, text)',
    'wa_codigo_comprobar(uuid, text, text)', 'wa_token_de(uuid, text)',
    'wa_desvincular(uuid, text)', 'wa_mensaje_entrante(uuid, text, text, text, text)',
    'wa_mensaje_saliente(uuid, text, text, text, text, text, text, numeric)',
    'wa_espera_apuntar(uuid, text, text, uuid, date, date, text)',
    'wa_espera_mia(uuid, text)', 'wa_espera_soltar(uuid, text)',
    'wa_oferta_resolver(uuid, boolean)',
    'wa_recordatorios_reclamar(int)', 'wa_recordatorio_resultado(uuid, boolean, text)',
    'wa_ofertas_reclamar(int)', 'wa_aprobacion_crear(uuid, text, uuid, text)',
    'recepcion_aprobar(uuid, boolean)', 'recepcion_panel(uuid)',
    'wa_desconectar(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', r);
    execute format('grant execute on function public.%s to service_role', r);
  end loop;
end;
$$;

-- El dueño necesita estas tres desde el navegador con su sesión.
grant execute on function public.recepcion_panel(uuid)      to authenticated;
grant execute on function public.recepcion_aprobar(uuid, boolean) to authenticated;
grant execute on function public.wa_desconectar(uuid)       to authenticated;
