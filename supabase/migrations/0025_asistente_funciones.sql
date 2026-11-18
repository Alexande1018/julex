-- ============================================================
-- JULEX · asistente del llavero (2/2): funciones
--
-- Lo que el cliente puede hacer sin cuenta (mirar, proponer su
-- ficha, mover su cita) va por funciones security definer, igual
-- que la tarjeta y la reserva. Lo que hace el barbero, por funciones
-- que exigen sesión.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lo que ve el recuadro al abrirse
-- ------------------------------------------------------------
-- Devuelve solo lo necesario para saludar. La frase la compone la
-- interfaz; aquí se decide QUÉ saludo toca (variante), no cómo se dice.
create or replace function public.asistente_publico(p_token text, p_pin text default null)
returns json language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cliente     clientes%rowtype;
  v_local       barberias%rowtype;
  v_config      asistente_config%rowtype;
  v_estado      text;
  v_meta        int;
  v_cortes      int;
  v_disponibles int;
  v_restante    int;
  v_faltan      int;
  v_proxima     json;
  v_cola        json;
  v_ultima      timestamptz;
  v_variante    text;
begin
  select * into v_cliente from clientes where token_publico = p_token;
  if not found then
    return null;
  end if;

  -- El PIN manda: sin él no sale ni el nombre.
  v_estado := public.pin_comprobar(v_cliente.id, p_pin);
  if v_estado <> 'abierta' then
    return json_build_object('estado', v_estado);
  end if;

  select * into v_local from barberias where id = v_cliente.barberia_id;
  if v_local.estado_cobro = 'suspendido' or not v_local.activo then
    return json_build_object('estado', 'suspendido');
  end if;

  select * into v_config from asistente_config where barberia_id = v_local.id;
  if v_config.barberia_id is not null and not v_config.activo then
    return json_build_object('estado', 'apagado');
  end if;

  -- Próxima cita viva.
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
   order by ci.inicio
   limit 1;

  -- En la cola ahora mismo (esperando o en el sillón).
  select json_build_object(
           'estado', q.estado,
           'silla', si.nombre,
           'posicion', (select count(*) + 1
                          from cola q2
                         where q2.barberia_id = q.barberia_id
                           and q2.estado = 'esperando'
                           and q2.llegada_en < q.llegada_en))
    into v_cola
    from cola q
    left join sillas si on si.id = q.silla_id
   where q.cliente_id = v_cliente.id
     and q.estado in ('esperando', 'sillon')
   order by q.llegada_en desc
   limit 1;

  -- Fidelización, con la misma cuenta que hace la app.
  v_meta    := greatest(1, v_local.fidelidad_meta);
  v_cortes  := (select count(*) from visitas v where v.cliente_id = v_cliente.id);
  v_disponibles := (select count(*) from recompensas r
                     where r.cliente_id = v_cliente.id and r.estado = 'disponible');
  v_restante := v_cortes % v_meta;
  v_faltan   := case when v_disponibles > 0 then 0 else v_meta - v_restante end;
  v_ultima   := (select max(v.fecha) from visitas v where v.cliente_id = v_cliente.id);

  -- Qué saludo toca, por prioridad. La interfaz solo elige la frase.
  v_variante := case
    when v_cola is not null                 then 'cola'
    when v_proxima is not null              then 'cita'
    when v_disponibles > 0                  then 'premio'
    when coalesce(v_cortes, 0) = 0          then 'nuevo'
    when v_ultima < now() - interval '45 days' then 'ausencia'
    else 'normal'
  end;

  return json_build_object(
    'estado', 'abierta',
    'barberia_id', v_local.id,
    'asistente', json_build_object('nombre', nullif(trim(coalesce(v_config.nombre, '')), '')),
    'local', json_build_object(
      'nombre', v_local.nombre, 'slug', v_local.slug,
      'telefono', v_local.telefono, 'direccion', v_local.direccion),
    'cliente', json_build_object(
      'id', v_cliente.id,
      'nombre', v_cliente.nombre,
      'sellos', json_build_object(
        'en_ciclo', case when v_disponibles > 0 then v_meta else v_restante end,
        'meta', v_meta, 'faltan', v_faltan, 'disponibles', v_disponibles)),
    'variante', v_variante,
    'proxima', v_proxima,
    'cola', v_cola,
    'ultima_visita', v_ultima
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. El cliente propone su ficha
-- ------------------------------------------------------------
-- No toca clientes: crea o actualiza UNA propuesta pendiente. El
-- barbero decide después. Así el cliente no puede reescribir sus
-- notas a espaldas del local.
create or replace function public.proponer_ficha(
  p_token          text,
  p_como_corta     text default '',
  p_preferencias   text default '',
  p_texto_original text default '',
  p_pin            text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
  v_id      uuid;
  v_corta   text := left(coalesce(trim(p_como_corta), ''), 600);
  v_prefs   text := left(coalesce(trim(p_preferencias), ''), 400);
  v_texto   text := left(coalesce(trim(p_texto_original), ''), 1200);
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then
    raise exception 'tarjeta_no_valida';
  end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    raise exception 'tarjeta_protegida';
  end if;

  if v_corta = '' and v_prefs = '' then
    raise exception 'propuesta_vacia';
  end if;

  -- Si ya había una pendiente, se reescribe en vez de acumular.
  select id into v_id from ficha_propuesta
   where cliente_id = v_cliente and estado = 'pendiente'
   order by creada_en desc
   limit 1;

  if v_id is not null then
    update ficha_propuesta
       set como_corta = v_corta, preferencias = v_prefs,
           texto_original = v_texto, creada_en = now()
     where id = v_id;
    return v_id;
  end if;

  insert into ficha_propuesta (barberia_id, cliente_id, como_corta, preferencias, texto_original)
  select barberia_id, id, v_corta, v_prefs, v_texto from clientes where id = v_cliente
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. El barbero acepta o descarta
-- ------------------------------------------------------------
create or replace function public.aceptar_propuesta(p_propuesta uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p ficha_propuesta%rowtype;
begin
  select * into v_p from ficha_propuesta
   where id = p_propuesta and estado = 'pendiente';
  if not found then
    return false;
  end if;
  if v_p.barberia_id <> public.mi_barberia() then
    return false;
  end if;

  update clientes
     set como_corta = coalesce(nullif(trim(v_p.como_corta), ''), como_corta),
         preferencias = coalesce(nullif(trim(v_p.preferencias), ''), preferencias),
         actualizado_en = now()
   where id = v_p.cliente_id;

  update ficha_propuesta
     set estado = 'aceptada', resuelta_en = now()
   where id = p_propuesta;

  return true;
end;
$$;

create or replace function public.descartar_propuesta(p_propuesta uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local uuid;
begin
  select barberia_id into v_local from ficha_propuesta
   where id = p_propuesta and estado = 'pendiente';
  if v_local is null or v_local <> public.mi_barberia() then
    return false;
  end if;

  update ficha_propuesta
     set estado = 'descartada', resuelta_en = now()
   where id = p_propuesta;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 4. Mover una cita sin perder el hueco
-- ------------------------------------------------------------
-- Una transacción: se libera la cita vieja, se busca sillón para la
-- nueva y, si algo falla, la excepción deshace todo. Mismo cerrojo
-- por local que solicitar_cita().
create or replace function public.mover_cita(
  p_token  text,
  p_cita   uuid,
  p_inicio timestamptz,
  p_pin    text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente  uuid;
  v_cita     citas%rowtype;
  v_servicio servicios%rowtype;
  v_fin      timestamptz;
  v_silla    uuid;
  v_nueva    uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then
    raise exception 'tarjeta_no_valida';
  end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    raise exception 'tarjeta_protegida';
  end if;

  select * into v_cita from citas
   where id = p_cita and cliente_id = v_cliente
     and estado in ('pendiente', 'confirmada');
  if not found then
    raise exception 'cita_no_valida';
  end if;

  if v_cita.inicio <= now() + interval '2 hours' then
    raise exception 'demasiado_tarde';
  end if;
  if p_inicio <= now() + interval '30 minutes' then
    raise exception 'hora_pasada';
  end if;

  select * into v_servicio from servicios where id = v_cita.servicio_id;
  if not found then
    raise exception 'servicio_no_valido';
  end if;

  v_fin := p_inicio + make_interval(mins => v_servicio.minutos);

  perform pg_advisory_xact_lock(hashtext(v_cita.barberia_id::text));

  -- Primero se libera el hueco viejo; si el nuevo no vale, la
  -- excepción devuelve la cita a donde estaba.
  update citas set estado = 'cancelada' where id = p_cita;

  v_silla := public.silla_libre(v_cita.barberia_id, p_inicio, v_fin);
  if v_silla is null then
    raise exception 'horario_ocupado';
  end if;

  if exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_cita.barberia_id
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(p_inicio, v_fin, '[)')
  ) then
    raise exception 'horario_bloqueado';
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen, silla_id)
  values (v_cita.barberia_id, v_cliente, v_cita.servicio_id, p_inicio, 'confirmada', 'asistente', v_silla)
  returning id into v_nueva;

  return v_nueva;
end;
$$;

-- ------------------------------------------------------------
-- 5. Consumo y limpieza
-- ------------------------------------------------------------
-- El barbero ve cuántas conversaciones lleva este mes (tope de 300).
create or replace function public.asistente_consumo(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  if p_barberia is null or p_barberia <> public.mi_barberia() then
    return null;
  end if;

  select count(*)::int into v_n
    from asistente_conversacion
   where barberia_id = p_barberia
     and abierta_en >= date_trunc('month', now());

  return json_build_object(
    'conversaciones', v_n,
    'limite', 300,
    'porcentaje', round(coalesce(v_n, 0) * 100.0 / 300)
  );
end;
$$;

-- Las conversaciones caducan a los 90 días. Las propuestas se quedan:
-- son historial de la ficha, no chat.
create or replace function public.limpiar_asistente()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  delete from asistente_conversacion
   where abierta_en < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- 6. Permisos
-- ------------------------------------------------------------
revoke all on function public.asistente_publico(text, text) from public;
revoke all on function public.proponer_ficha(text, text, text, text, text) from public;
revoke all on function public.mover_cita(text, uuid, timestamptz, text) from public;
revoke all on function public.aceptar_propuesta(uuid) from public;
revoke all on function public.descartar_propuesta(uuid) from public;
revoke all on function public.asistente_consumo(uuid) from public;
revoke all on function public.limpiar_asistente() from public;

grant execute on function public.asistente_publico(text, text) to anon, authenticated;
grant execute on function public.proponer_ficha(text, text, text, text, text) to anon, authenticated;
grant execute on function public.mover_cita(text, uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.aceptar_propuesta(uuid) to authenticated;
grant execute on function public.descartar_propuesta(uuid) to authenticated;
grant execute on function public.asistente_consumo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. Limpieza diaria, si el plan deja usar pg_cron
-- ------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('limpiar-asistente', '30 3 * * *', 'select public.limpiar_asistente()');
exception
  when others then
    raise notice 'pg_cron no disponible: limpiar_asistente() se lanza a mano';
end $$;
