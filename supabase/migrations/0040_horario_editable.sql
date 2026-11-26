-- ============================================================
-- JULEX · el horario, editable
--
-- La tabla `horarios` ya gobernaba la reserva (huecos, solapes, el asistente),
-- pero no había forma de cambiarla desde la app: todo local nacía de lunes a
-- domingo, 10:00–20:00, y para tocar algo había que entrar al SQL Editor.
--
-- Esta función guarda la semana entera de una vez. Valida antes de escribir,
-- así que una semana mal puesta no borra la que ya estaba. Un día cerrado es
-- un día sin fila: es lo que ya entendían `huecos_publicos()` y `solicitar_cita()`.
-- ============================================================

create or replace function public.guardar_horario(p_dias jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_barberia uuid := public.mi_barberia();
  v_item     jsonb;
  v_dia      int;
  v_abre     time;
  v_cierra   time;
  v_desde    time;
  v_hasta    time;
  v_vistos   int[] := '{}';
begin
  if v_barberia is null then
    raise exception 'sin_local';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' then
    raise exception 'horario_invalido';
  end if;

  -- Primero se comprueba toda la semana. Nada se borra hasta que esté entera bien.
  for v_item in select * from jsonb_array_elements(p_dias) loop
    v_dia := (v_item->>'dia')::int;
    if v_dia is null or v_dia < 0 or v_dia > 6 then
      raise exception 'dia_invalido';
    end if;
    if v_dia = any(v_vistos) then
      raise exception 'dia_repetido';
    end if;
    v_vistos := v_vistos || v_dia;

    if not coalesce((v_item->>'abierto')::boolean, true) then
      continue;
    end if;

    v_abre   := nullif(v_item->>'abre', '')::time;
    v_cierra := nullif(v_item->>'cierra', '')::time;
    if v_abre is null or v_cierra is null then
      raise exception 'hora_invalida';
    end if;
    if v_abre >= v_cierra then
      raise exception 'horas_invertidas';
    end if;

    v_desde := nullif(v_item->>'descanso_desde', '')::time;
    v_hasta := nullif(v_item->>'descanso_hasta', '')::time;
    if (v_desde is null) <> (v_hasta is null) then
      raise exception 'descanso_incompleto';
    end if;
    if v_desde is not null then
      if v_desde >= v_hasta then
        raise exception 'descanso_invertido';
      end if;
      if v_desde < v_abre or v_hasta > v_cierra then
        raise exception 'descanso_fuera';
      end if;
    end if;
  end loop;

  delete from horarios where barberia_id = v_barberia;

  insert into horarios (barberia_id, dia_semana, abre, cierra, descanso_desde, descanso_hasta)
  select v_barberia,
         (item->>'dia')::int,
         nullif(item->>'abre', '')::time,
         nullif(item->>'cierra', '')::time,
         nullif(item->>'descanso_desde', '')::time,
         nullif(item->>'descanso_hasta', '')::time
    from jsonb_array_elements(p_dias) as e(item)
   where coalesce((item->>'abierto')::boolean, true);
end;
$$;

revoke all on function public.guardar_horario(jsonb) from public;
grant execute on function public.guardar_horario(jsonb) to authenticated;
