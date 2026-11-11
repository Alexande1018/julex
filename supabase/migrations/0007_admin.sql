-- ============================================================
-- JULEX · administración
-- El administrador no es un barbero: gestiona todos los locales,
-- crea locales y reparte llaveros. Cada local sigue viendo solo
-- lo suyo: la RLS no cambia para ellos.
-- ============================================================

create table if not exists admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

alter table admins enable row level security;

-- Un admin puede leer su propia fila; nadie más ve esta tabla.
create policy "mi fila de admin" on admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- El administrador puede LEER todos los locales y su inventario.
-- No puede escribir en ellos desde aquí: para eso están las funciones.
do $$
declare t text;
begin
  foreach t in array array['barberias', 'llaveros', 'clientes', 'servicios', 'sillas', 'cola', 'citas']
  loop
    execute format(
      'drop policy if exists "admin: lectura total" on %I;
       create policy "admin: lectura total" on %I
         for select to authenticated using (public.soy_admin());', t, t);
  end loop;
end $$;

-- Crear un local con su barbero, servicios, horario y primera silla.
create or replace function public.crear_local_admin(
  p_nombre   text,
  p_slug     text,
  p_email    text,
  p_password text,
  p_color    text default '#3E4A35'
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := gen_random_uuid();
  v_barberia uuid;
  v_slug     text;
  v_email    text := lower(trim(p_email));
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if length(trim(p_nombre)) < 2 then raise exception 'nombre_invalido'; end if;
  if length(trim(p_password)) < 6 then raise exception 'password_corta'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'email_invalido'; end if;
  if exists (select 1 from auth.users where email = v_email) then raise exception 'email_en_uso'; end if;

  v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then raise exception 'slug_invalido'; end if;
  if exists (select 1 from barberias where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    false, false, '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid,
          jsonb_build_object('sub', v_uid::text, 'email', v_email),
          'email', v_uid::text, now(), now(), now());

  insert into barberias (nombre, slug, color)
  values (trim(p_nombre), v_slug, coalesce(nullif(trim(p_color), ''), '#3E4A35'))
  returning id into v_barberia;

  insert into barberos (id, barberia_id, nombre, rol)
  values (v_uid, v_barberia, trim(p_nombre), 'dueno');

  insert into sillas (barberia_id, nombre, orden) values (v_barberia, 'Silla 1', 1);

  insert into servicios (barberia_id, nombre, precio, minutos, orden) values
    (v_barberia, 'Corte', 15, 30, 1),
    (v_barberia, 'Corte + barba', 22, 45, 2),
    (v_barberia, 'Niño', 10, 20, 3);

  insert into horarios (barberia_id, dia_semana, abre, cierra)
  select v_barberia, d, '10:00', '20:00' from generate_series(0, 6) as d;

  return json_build_object('barberia', v_barberia, 'slug', v_slug, 'email', v_email);
end;
$$;

-- Repartir llaveros a un local concreto.
create or replace function public.crear_lote_admin(
  p_barberia uuid,
  p_cantidad int,
  p_lote     text default ''
) returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int := greatest(1, least(coalesce(p_cantidad, 1), 200));
  v_lote text := coalesce(nullif(trim(p_lote), ''), 'L-' || to_char(now(), 'YYMMDD'));
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if not exists (select 1 from barberias where id = p_barberia) then
    raise exception 'local_no_encontrado';
  end if;

  insert into llaveros (barberia_id, token, codigo_corto, lote, estado)
  select p_barberia,
         encode(extensions.gen_random_bytes(16), 'hex'),
         'JX-' || upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4)),
         v_lote,
         'sin_asignar'
    from generate_series(1, v_n);

  return v_n;
end;
$$;

revoke all on function public.soy_admin() from public;
revoke all on function public.crear_local_admin(text, text, text, text, text) from public;
revoke all on function public.crear_lote_admin(uuid, int, text) from public;
grant execute on function public.soy_admin() to authenticated;
grant execute on function public.crear_local_admin(text, text, text, text, text) to authenticated;
grant execute on function public.crear_lote_admin(uuid, int, text) to authenticated;
