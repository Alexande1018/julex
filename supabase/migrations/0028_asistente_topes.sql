-- ============================================================
-- JULEX · topes del asistente, medidos donde toca
--
-- El tope de 300 contaba conversaciones nuevas: reutilizando un
-- conversacion_id se podían enviar mensajes sin límite. Ahora se
-- cuentan mensajes, por tarjeta y por día, y el mes se corta en
-- hora de Madrid, no en UTC.
--
-- Estas funciones las usa la Edge Function con la clave de servicio.
-- ============================================================

create or replace function public.asistente_mensajes_24h(p_cliente uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from asistente_mensaje m
    join asistente_conversacion c on c.id = m.conversacion_id
   where c.cliente_id = p_cliente
     and m.creado_en >= now() - interval '24 hours';
$$;

create or replace function public.asistente_mensajes_mes(p_barberia uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from asistente_mensaje m
    join asistente_conversacion c on c.id = m.conversacion_id
   where c.barberia_id = p_barberia
     and m.creado_en >= (date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid');
$$;

create or replace function public.asistente_mensajes_hoy()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from asistente_mensaje m
   where m.creado_en >= (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid');
$$;

-- El panel del local también cuenta el mes en Madrid.
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
     and abierta_en >= (date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid');

  return json_build_object(
    'conversaciones', v_n,
    'limite', 300,
    'porcentaje', round(coalesce(v_n, 0) * 100.0 / 300)
  );
end;
$$;

revoke all on function public.asistente_mensajes_24h(uuid) from public;
revoke all on function public.asistente_mensajes_mes(uuid) from public;
revoke all on function public.asistente_mensajes_hoy() from public;

-- Solo la función con clave de servicio las llama.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.asistente_mensajes_24h(uuid) to service_role;
    grant execute on function public.asistente_mensajes_mes(uuid) to service_role;
    grant execute on function public.asistente_mensajes_hoy() to service_role;
  end if;
end $$;

-- El turno se apunta sumando, no sobrescribiendo: así el coste del mes
-- es la suma real de lo consumido. `coste` va en dólares (precio del
-- proveedor), y el panel puede convertirlo a euros con su cambio.
create or replace function public.asistente_registrar_turno(
  p_conversacion uuid,
  p_entrada      int,
  p_salida       int,
  p_coste        numeric,
  p_resultado    text,
  p_derivada     boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update asistente_conversacion
     set tokens_entrada = tokens_entrada + greatest(coalesce(p_entrada, 0), 0),
         tokens_salida  = tokens_salida  + greatest(coalesce(p_salida, 0), 0),
         coste          = coste          + greatest(coalesce(p_coste, 0), 0),
         resultado      = coalesce(p_resultado, resultado),
         estado         = case when p_derivada then 'derivada' else estado end
   where id = p_conversacion;
end;
$$;

revoke all on function public.asistente_registrar_turno(uuid, int, int, numeric, text, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.asistente_registrar_turno(uuid, int, int, numeric, text, boolean) to service_role;
  end if;
end $$;
