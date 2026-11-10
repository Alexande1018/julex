-- ============================================================
-- JULEX · alta de un local
-- Un usuario recién registrado crea su local y sus servicios base.
-- SECURITY DEFINER: es la única puerta para insertar en barberias.
-- ============================================================

create or replace function public.crear_local(
  p_nombre text,
  p_slug   text,
  p_color  text default '#3E4A35'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_barberia uuid;
  v_slug     text;
begin
  if v_uid is null then
    raise exception 'sin_sesion';
  end if;

  if exists (select 1 from barberos where id = v_uid) then
    raise exception 'ya_tiene_local';
  end if;

  v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then
    raise exception 'slug_invalido';
  end if;

  -- si está ocupado, añade un sufijo corto
  if exists (select 1 from barberias where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

  insert into barberias (nombre, slug, color)
  values (trim(p_nombre), v_slug, coalesce(nullif(trim(p_color), ''), '#3E4A35'))
  returning id into v_barberia;

  insert into barberos (id, barberia_id, nombre, rol)
  values (v_uid, v_barberia, trim(p_nombre), 'dueno');

  insert into servicios (barberia_id, nombre, precio, minutos, orden) values
    (v_barberia, 'Corte', 15, 30, 1),
    (v_barberia, 'Corte + barba', 22, 45, 2),
    (v_barberia, 'Niño', 10, 20, 3);

  insert into horarios (barberia_id, dia_semana, abre, cierra)
  select v_barberia, d, '10:00', '20:00' from generate_series(0, 6) as d;

  return v_barberia;
end;
$$;

revoke all on function public.crear_local(text, text, text) from public;
grant execute on function public.crear_local(text, text, text) to authenticated;

-- El barbero puede cambiar su propio nombre, pero no de local.
create or replace function public.mi_barberia()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select barberia_id from public.barberos where id = auth.uid() limit 1;
$$;
