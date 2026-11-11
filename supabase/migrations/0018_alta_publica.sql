-- ============================================================
-- JULEX · alta a distancia
--
-- Un negocio se da de alta solo: datos, dirección de envío y pago.
-- La cuenta queda creada al momento, con sus servicios y sus
-- llaveros (sin asignar). El envío lo gestiona el administrador.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Datos de envío
-- ------------------------------------------------------------

alter table barberias
  add column if not exists direccion_envio   text not null default '',
  add column if not exists cp_envio          text not null default '',
  add column if not exists ciudad_envio      text not null default '',
  add column if not exists provincia_envio   text not null default '',
  add column if not exists telefono_contacto text not null default '';

-- ------------------------------------------------------------
-- 2. Alta pública
-- ------------------------------------------------------------

create or replace function public.crear_alta_publica(
  p_nombre      text,
  p_slug        text,
  p_email       text,
  p_password    text,
  p_tipo        tipo_negocio default 'barberia',
  p_domicilio   text default '',
  p_correo      text default '',
  p_direccion   text default '',
  p_cp          text default '',
  p_ciudad      text default '',
  p_provincia   text default '',
  p_telefono    text default '',
  p_llaveros    int default 15
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := gen_random_uuid();
  v_barberia uuid;
  v_slug     text;
  v_email    text := lower(trim(p_email));
  v_llaveros int := greatest(15, least(200, coalesce(p_llaveros, 15)));
  v_prefijo  text;
begin
  if length(trim(p_nombre)) < 2 then raise exception 'nombre_invalido'; end if;
  if length(trim(p_password)) < 8 then raise exception 'password_corta'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'email_invalido'; end if;
  if length(trim(p_direccion)) < 5 or length(trim(p_ciudad)) < 2 then
    raise exception 'direccion_incompleta';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'email_en_uso';
  end if;

  v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then raise exception 'slug_invalido'; end if;
  if exists (select 1 from barberias where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

  -- Cuenta con el correo ya confirmado: el alta no espera verificación.
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

  insert into barberias (
    nombre, slug, color, tipo, domicilio_legal, correo_legal,
    direccion_envio, cp_envio, ciudad_envio, provincia_envio, telefono_contacto)
  values (
    trim(p_nombre), v_slug, '#3E4A35', p_tipo,
    trim(coalesce(p_domicilio, '')), trim(coalesce(p_correo, '')),
    trim(p_direccion), trim(coalesce(p_cp, '')), trim(p_ciudad),
    trim(coalesce(p_provincia, '')), trim(coalesce(p_telefono, '')))
  returning id into v_barberia;

  insert into barberos (id, barberia_id, nombre, rol)
  values (v_uid, v_barberia, trim(p_nombre), 'dueno');

  perform public.sembrar_local(v_barberia, p_tipo);

  insert into horarios (barberia_id, dia_semana, abre, cierra)
  select v_barberia, d, '10:00', '20:00' from generate_series(0, 6) as d;

  -- Los llaveros existen desde ya, sin asignar. Se graban y se envían
  -- cuando el pago está confirmado.
  v_prefijo := upper(substr(regexp_replace(v_slug, '[^a-z0-9]', '', 'g'), 1, 3));

  insert into llaveros (barberia_id, token, codigo_corto, lote, estado)
  select v_barberia,
         substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 12),
         v_prefijo || '-' || lpad(g::text, 3, '0'),
         'alta',
         'sin_asignar'
    from generate_series(1, v_llaveros) g;

  return json_build_object(
    'barberia_id', v_barberia,
    'slug', v_slug,
    'email', v_email,
    'llaveros', v_llaveros
  );
end;
$$;

revoke all on function public.crear_alta_publica(text, text, text, text, tipo_negocio, text, text, text, text, text, text, text, int) from public;
grant execute on function public.crear_alta_publica(text, text, text, text, tipo_negocio, text, text, text, text, text, text, text, int) to anon, authenticated;
