-- ============================================================
-- JULEX · tipo de negocio
--
-- La entidad `barberias` sirve para una barbería, una peluquería,
-- un salón de uñas o un estudio de tatuaje. Lo que cambia es el
-- vocabulario de la app y los valores con los que nace el local;
-- los datos siguen siendo los mismos.
--
-- Lo elige el administrador al crear el local y el propio local
-- puede cambiarlo después en Ajustes.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_negocio') then
    create type tipo_negocio as enum ('barberia', 'peluqueria', 'unas', 'tatuaje');
  end if;
end $$;

alter table barberias
  add column if not exists tipo tipo_negocio not null default 'barberia';

-- ------------------------------------------------------------
-- Cómo nace un local de cada tipo
-- ------------------------------------------------------------

/*
 * Primera silla y tres servicios de partida, según el sector. Son valores
 * iniciales: el local los cambia en Ajustes sin ninguna restricción.
 */
create or replace function public.sembrar_local(
  p_barberia uuid,
  p_tipo     tipo_negocio
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into sillas (barberia_id, nombre, orden)
  values (p_barberia,
          (case p_tipo
             when 'peluqueria' then 'Puesto 1'
             when 'unas'       then 'Mesa 1'
             when 'tatuaje'    then 'Estación 1'
             else 'Silla 1'
           end), 1);

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      ('Corte',          15, 30, 1),
      ('Corte + barba',  22, 45, 2),
      ('Niño',           10, 20, 3)
    ) as x(nombre, precio, minutos, orden)
   where p_tipo = 'barberia';

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      ('Corte',   18, 40, 1),
      ('Color',   45, 90, 2),
      ('Peinado', 15, 30, 3)
    ) as x(nombre, precio, minutos, orden)
   where p_tipo = 'peluqueria';

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      ('Manicura',       20, 45, 1),
      ('Pedicura',       25, 50, 2),
      ('Semipermanente', 25, 60, 3)
    ) as x(nombre, precio, minutos, orden)
   where p_tipo = 'unas';

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      ('Sesión pequeña', 60,  60, 1),
      ('Sesión media',  120, 120, 2),
      ('Retoque',        30,  30, 3)
    ) as x(nombre, precio, minutos, orden)
   where p_tipo = 'tatuaje';
end;
$$;

revoke all on function public.sembrar_local(uuid, tipo_negocio) from public;
revoke all on function public.sembrar_local(uuid, tipo_negocio) from anon, authenticated;

-- ------------------------------------------------------------
-- Alta: el administrador elige el tipo
-- ------------------------------------------------------------

drop function if exists public.crear_local(text, text, text);

create or replace function public.crear_local(
  p_nombre text,
  p_slug   text,
  p_color  text default '#3E4A35',
  p_tipo   tipo_negocio default 'barberia'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_barberia uuid;
  v_slug     text;
begin
  if v_uid is null then raise exception 'sin_sesion'; end if;
  if exists (select 1 from barberos where id = v_uid) then raise exception 'ya_tiene_local'; end if;

  v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then raise exception 'slug_invalido'; end if;

  if exists (select 1 from barberias where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

  insert into barberias (nombre, slug, color, tipo)
  values (trim(p_nombre), v_slug, coalesce(nullif(trim(p_color), ''), '#3E4A35'), p_tipo)
  returning id into v_barberia;

  insert into barberos (id, barberia_id, nombre, rol)
  values (v_uid, v_barberia, trim(p_nombre), 'dueno');

  perform public.sembrar_local(v_barberia, p_tipo);

  insert into horarios (barberia_id, dia_semana, abre, cierra)
  select v_barberia, d, '10:00', '20:00' from generate_series(0, 6) as d;

  return v_barberia;
end;
$$;

drop function if exists public.crear_local_admin(text, text, text, text, text);

create or replace function public.crear_local_admin(
  p_nombre   text,
  p_slug     text,
  p_email    text,
  p_password text,
  p_color    text default '#3E4A35',
  p_tipo     tipo_negocio default 'barberia'
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

  insert into barberias (nombre, slug, color, tipo)
  values (trim(p_nombre), v_slug, coalesce(nullif(trim(p_color), ''), '#3E4A35'), p_tipo)
  returning id into v_barberia;

  insert into barberos (id, barberia_id, nombre, rol)
  values (v_uid, v_barberia, trim(p_nombre), 'dueno');

  perform public.sembrar_local(v_barberia, p_tipo);

  insert into horarios (barberia_id, dia_semana, abre, cierra)
  select v_barberia, d, '10:00', '20:00' from generate_series(0, 6) as d;

  return json_build_object('barberia', v_barberia, 'barbero', v_uid, 'tipo', p_tipo);
end;
$$;

-- ------------------------------------------------------------
-- Cambiar el tipo después
-- ------------------------------------------------------------

create or replace function public.cambiar_tipo_local(p_barberia uuid, p_tipo tipo_negocio)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  update barberias set tipo = p_tipo where id = p_barberia;
  return found;
end;
$$;

-- ------------------------------------------------------------
-- El tipo viaja a las pantallas públicas
-- ------------------------------------------------------------

create or replace function public.local_publico(p_slug text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'color', b.color,
    'direccion', b.direccion, 'telefono', b.telefono, 'logo_url', b.logo_url,
    'fidelidad_meta', b.fidelidad_meta, 'tipo', b.tipo,
    'servicios', coalesce((
      select json_agg(json_build_object('id', s.id, 'nombre', s.nombre,
                                        'precio', s.precio, 'minutos', s.minutos) order by s.orden)
      from servicios s where s.barberia_id = b.id and s.activo), '[]'::json)
  )
  from barberias b
  where b.slug = p_slug and b.activo;
$$;

-- ficha_publica: se le añade el tipo del local, sin tocar el resto.
drop function if exists public.ficha_publica(text, text);

create or replace function public.ficha_publica(p_token text, p_pin text default null)
returns json language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
  v_estado  text;
  v_ficha   json;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then
    return null;
  end if;

  v_estado := public.pin_comprobar(v_cliente, p_pin);
  if v_estado <> 'abierta' then
    return json_build_object('estado', v_estado);
  end if;

  select json_build_object(
    'estado', 'abierta',
    'local', json_build_object(
      'nombre', b.nombre, 'slug', b.slug, 'color', b.color, 'direccion', b.direccion,
      'telefono', b.telefono, 'logo_url', b.logo_url, 'fidelidad_meta', b.fidelidad_meta,
      'tipo', b.tipo),
    'cliente', json_build_object(
      'nombre', c.nombre, 'codigo', c.codigo, 'telefono', c.telefono,
      'preferencias', c.preferencias, 'creado_en', c.creado_en),
    'consentimientos', json_build_object(
      'datos', c.cons_datos, 'avisos', c.cons_avisos, 'marketing', c.cons_marketing),
    'servicios', coalesce((
      select json_agg(json_build_object('id', s.id, 'nombre', s.nombre,
                                        'precio', s.precio, 'minutos', s.minutos) order by s.orden)
      from servicios s where s.barberia_id = b.id and s.activo), '[]'::json),
    'cortes', (select count(*) from visitas v where v.cliente_id = c.id),
    'gastado', (select coalesce(sum(v.precio), 0) from visitas v where v.cliente_id = c.id),
    'recompensas', json_build_object(
      'disponibles', (select count(*) from recompensas r where r.cliente_id = c.id and r.estado = 'disponible'),
      'aplicadas',  (select count(*) from recompensas r where r.cliente_id = c.id and r.estado = 'aplicada')),
    'cola', (
      select json_build_object('estado', q.estado, 'silla', si.nombre, 'desde', q.inicio_en)
        from cola q
        left join sillas si on si.id = q.silla_id
       where q.cliente_id = c.id and q.estado in ('esperando', 'sillon')
       order by q.llegada_en desc limit 1),
    'proxima', (
      select json_build_object('id', ci.id, 'inicio', ci.inicio, 'estado', ci.estado,
                               'servicio', s.nombre, 'precio', s.precio)
      from citas ci join servicios s on s.id = ci.servicio_id
      where ci.cliente_id = c.id and ci.estado in ('pendiente','confirmada') and ci.inicio >= now()
      order by ci.inicio limit 1),
    'visitas', coalesce((
      select json_agg(x) from (
        select v.fecha, v.precio, s.nombre as servicio
        from visitas v left join servicios s on s.id = v.servicio_id
        where v.cliente_id = c.id order by v.fecha desc limit 10) x), '[]'::json)
  )
  into v_ficha
  from clientes c join barberias b on b.id = c.barberia_id
  where c.id = v_cliente;

  return v_ficha;
end;
$$;

-- ------------------------------------------------------------
-- El panel del administrador ve el tipo
-- ------------------------------------------------------------

create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'tipo', b.tipo,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now())
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------

revoke all on function public.crear_local(text, text, text, tipo_negocio) from public;
revoke all on function public.crear_local_admin(text, text, text, text, text, tipo_negocio) from public;
revoke all on function public.cambiar_tipo_local(uuid, tipo_negocio) from public;
revoke all on function public.local_publico(text) from public;
revoke all on function public.ficha_publica(text, text) from public;

grant execute on function public.crear_local(text, text, text, tipo_negocio) to authenticated;
grant execute on function public.crear_local_admin(text, text, text, text, text, tipo_negocio) to authenticated;
grant execute on function public.cambiar_tipo_local(uuid, tipo_negocio) to authenticated;
grant execute on function public.local_publico(text) to anon, authenticated;
grant execute on function public.ficha_publica(text, text) to anon, authenticated;
