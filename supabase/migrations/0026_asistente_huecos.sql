-- ============================================================
-- JULEX · asistente del llavero (3/3): huecos en hora real
--
-- huecos_publicos() devuelve "10:00" (hora de reloj) y el navegador la
-- convierte a la hora del local al reservar. Para que el asistente no
-- dependa de esa conversión, aquí se entregan INSTANTES ya resueltos en
-- la zona del local, y se vuelve a comprobar la ocupación contra las
-- citas reales.
--
-- La zona es un parámetro: hoy todos los locales son de España. Si algún
-- día hay uno fuera, se pasa la suya sin tocar el resto.
-- ============================================================

create or replace function public.huecos_asistente(
  p_slug    text,
  p_dia     date,
  p_minutos int default 30,
  p_paso    int default 30,
  p_zona    text default 'Europe/Madrid'
) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_horas    json;
  v_sillas   int;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then
    return '[]'::json;
  end if;

  v_sillas := public.sillas_activas(v_barberia);

  -- Las reglas (horario, descanso, antelación, bloqueos) siguen siendo
  -- las de huecos_publicos(): una sola definición de "se puede".
  v_horas := public.huecos_publicos(p_slug, p_dia, p_minutos, p_paso);
  if v_horas is null or json_array_length(v_horas) = 0 then
    return '[]'::json;
  end if;

  -- Y aquí se pasan a instantes reales y se revisa la ocupación con la
  -- comparación correcta (timestamptz contra timestamptz).
  return coalesce((
    select json_agg(to_jsonb(x.ini) order by x.ini)
      from (
        select ((p_dia + h.hora::time) at time zone p_zona) as ini
          from json_array_elements_text(v_horas) as h(hora)
      ) x
     where x.ini > now() + interval '30 minutes'
       and (
         select count(*)
           from citas ci
           join servicios s on s.id = ci.servicio_id
          where ci.barberia_id = v_barberia
            and ci.estado in ('pendiente', 'confirmada')
            and tstzrange(ci.inicio, ci.inicio + make_interval(mins => s.minutos), '[)')
                && tstzrange(x.ini, x.ini + make_interval(mins => p_minutos), '[)')
       ) < v_sillas
       and not exists (
         select 1 from bloqueos_agenda b
          where b.barberia_id = v_barberia
            and tstzrange(b.desde, b.hasta, '[)')
                && tstzrange(x.ini, x.ini + make_interval(mins => p_minutos), '[)')
       )
  ), '[]'::json);
end;
$$;

-- Las citas vivas del cliente, para que el asistente pueda cancelar o
-- mover sin manejar identificadores que no ve.
create or replace function public.mis_citas(p_token text, p_pin text default null)
returns json language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then
    return null;
  end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    return json_build_object('estado', 'protegida');
  end if;

  return json_build_object('citas', coalesce((
    select json_agg(json_build_object(
             'id', ci.id, 'inicio', ci.inicio, 'estado', ci.estado,
             'servicio_id', ci.servicio_id, 'servicio', s.nombre, 'minutos', s.minutos)
             order by ci.inicio)
      from citas ci
      join servicios s on s.id = ci.servicio_id
     where ci.cliente_id = v_cliente
       and ci.estado in ('pendiente', 'confirmada')
       and ci.inicio >= now()
  ), '[]'::json));
end;
$$;

revoke all on function public.huecos_asistente(text, date, int, int, text) from public;
revoke all on function public.mis_citas(text, text) from public;

grant execute on function public.huecos_asistente(text, date, int, int, text) to anon, authenticated;
grant execute on function public.mis_citas(text, text) to anon, authenticated;
