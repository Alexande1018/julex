-- ============================================================
-- JULEX · la reserva, en hora real
--
-- huecos_publicos() construía horas «de reloj» y las comparaba con
-- citas.inicio, que es un instante. Con la base en UTC, una cita a las
-- 10:00 de Madrid se guarda a las 09:00Z y el hueco de las 10:00 seguía
-- apareciendo libre: dos clientes podían coger la misma hora.
--
-- Ahora el cálculo se hace con instantes (timestamptz) en la zona del
-- local, y se sigue devolviendo "HH:MM" para que la interfaz no cambie.
-- ============================================================

-- Al añadir un parámetro nace una firma nueva: hay que tirar la vieja o
-- quedarían las dos, y la de cuatro argumentos seguiría con el fallo.
drop function if exists public.huecos_publicos(text, date, int, int);

create or replace function public.huecos_publicos(
  p_slug    text,
  p_dia     date,
  p_minutos int default 30,
  p_paso    int default 30,
  p_zona    text default 'Europe/Madrid'
) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_abre     time;
  v_cierra   time;
  v_desde_t  time;
  v_hasta_t  time;
  v_sillas   int;
  v_huecos   json;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then return '[]'::json; end if;

  v_sillas := public.sillas_activas(v_barberia);

  select abre, cierra, descanso_desde, descanso_hasta
    into v_abre, v_cierra, v_desde_t, v_hasta_t
    from horarios
   where barberia_id = v_barberia
     and dia_semana = extract(dow from p_dia)::int;

  if v_abre is null then return '[]'::json; end if;

  with candidatos as (
    select (p_dia + make_interval(mins => m)) as reloj,
           ((p_dia + make_interval(mins => m)) at time zone p_zona) as ini
      from generate_series(
             (extract(epoch from v_abre) / 60)::int,
             (extract(epoch from v_cierra) / 60)::int - p_minutos,
             p_paso
           ) as m
  ),
  validos as (
    select reloj, ini, ini + make_interval(mins => p_minutos) as fin
      from candidatos
     where ini > now() + interval '30 minutes'
       and reloj::time >= v_abre
       and (reloj + make_interval(mins => p_minutos))::time <= v_cierra
       and (v_desde_t is null or not (
              reloj::time < v_hasta_t
              and (reloj + make_interval(mins => p_minutos))::time > v_desde_t))
  )
  select coalesce(json_agg(to_char(v.reloj, 'HH24:MI') order by v.ini), '[]'::json)
    into v_huecos
  from validos v
  where (
    select count(*)
      from citas ci
      join servicios s on s.id = ci.servicio_id
     where ci.barberia_id = v_barberia
       and ci.estado in ('pendiente', 'confirmada')
       and tstzrange(ci.inicio, ci.inicio + make_interval(mins => s.minutos), '[)')
           && tstzrange(v.ini, v.fin, '[)')
  ) < v_sillas
  and not exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_barberia
       and tstzrange(b.desde, b.hasta, '[)')
           && tstzrange(v.ini, v.fin, '[)')
  );

  return v_huecos;
end;
$$;

revoke all on function public.huecos_publicos(text, date, int, int, text) from public;
grant execute on function public.huecos_publicos(text, date, int, int, text) to anon, authenticated;

-- El asistente reutiliza la misma definición de «se puede», con su zona.
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

  v_horas := public.huecos_publicos(p_slug, p_dia, p_minutos, p_paso, p_zona);
  if v_horas is null or json_array_length(v_horas) = 0 then
    return '[]'::json;
  end if;

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

revoke all on function public.huecos_asistente(text, date, int, int, text) from public;
grant execute on function public.huecos_asistente(text, date, int, int, text) to anon, authenticated;
