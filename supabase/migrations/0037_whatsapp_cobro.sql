-- ============================================================
-- JULEX · la recepción y el cobro van juntos
--
-- Si el local no paga, no puede haber un WhatsApp contestando a sus
-- clientes con su nombre. Hasta ahora el canal se activaba igual y el
-- cliente se quedaba sin respuesta (silencio); y los recordatorios
-- seguían saliendo, gastando dinero de un local suspendido.
--
-- Regla: la línea vive y muere con el cobro.
--   suspendido            → la línea se pausa y no sale ni un mensaje
--   al_dia/pendiente/lectura → vuelve a activa, si el dueño la tenía puesta
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sincronizar la línea con el estado de cobro
-- ------------------------------------------------------------
create or replace function public.wa_sincronizar_cobro()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.estado_cobro = 'suspendido' and old.estado_cobro is distinct from 'suspendido' then
    update wa_linea
       set estado = 'pausa',
           ultimo_error = 'local_suspendido'
     where barberia_id = new.id and estado = 'activa';

  elsif new.estado_cobro <> 'suspendido' and old.estado_cobro = 'suspendido' then
    -- Solo revive si el dueño no la había desconectado a mano: si apagó el
    -- canal (canal_whatsapp = false), pagar no se lo vuelve a encender.
    update wa_linea w
       set estado = 'activa',
           ultimo_error = ''
      from asistente_config c
     where w.barberia_id = new.id
       and c.barberia_id = w.barberia_id
       and c.canal_whatsapp
       and w.estado = 'pausa'
       and w.phone_number_id <> ''
       and w.ultimo_error = 'local_suspendido';
  end if;

  return new;
end;
$$;

drop trigger if exists barberias_wa_cobro on barberias;
create trigger barberias_wa_cobro
  after update of estado_cobro on barberias
  for each row execute function public.wa_sincronizar_cobro();

-- ------------------------------------------------------------
-- 2. Los recordatorios y las ofertas no salen de un local suspendido
-- ------------------------------------------------------------
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
       and b.estado_cobro <> 'suspendido'
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
       and b.estado_cobro <> 'suspendido'
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

revoke all on function public.wa_recordatorios_reclamar(int) from public, anon, authenticated;
revoke all on function public.wa_ofertas_reclamar(int) from public, anon, authenticated;
grant execute on function public.wa_recordatorios_reclamar(int) to service_role;
grant execute on function public.wa_ofertas_reclamar(int) to service_role;

-- ------------------------------------------------------------
-- 3. El panel dice por qué está parada
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
    'cobro', (select json_build_object(
                'estado', b.estado_cobro,
                -- La línea se pausa sola cuando el local se suspende.
                'pausa_por_cobro', (select w.ultimo_error = 'local_suspendido'
                                      from wa_linea w where w.barberia_id = p_barberia))
                from barberias b where b.id = p_barberia),
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

grant execute on function public.recepcion_panel(uuid) to authenticated;
