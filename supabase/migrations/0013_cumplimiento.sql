-- ============================================================
-- JULEX · cumplimiento
--
-- Tres cosas:
--  1. Consentimientos separados de verdad. La casilla obligatoria
--     pasa a ser constancia de información, no permiso.
--  2. Datos legales del local (domicilio y correo) para su página
--     de identidad.
--  3. Solicitudes de baja con bandeja y resolución real: borrado
--     o bloqueo, no un mensaje al registro.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Consentimientos
-- ------------------------------------------------------------

alter table clientes
  add column if not exists cons_fidelidad    boolean not null default false,
  add column if not exists cons_preferencias boolean not null default false,
  add column if not exists cons_promociones  boolean not null default false;

-- Lo que había en `cons_marketing` pasa a promociones, que es lo que era.
update clientes
   set cons_promociones = true
 where cons_marketing
   and not cons_promociones;

-- Estado de privacidad del cliente. `activo` es el único que permite
-- abrir su tarjeta o su llavero.
alter table clientes
  add column if not exists privacidad text not null default 'activo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_privacidad_chk') then
    alter table clientes
      add constraint clientes_privacidad_chk
      check (privacidad in ('activo', 'bloqueado', 'anonimizado'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Datos legales del local
-- ------------------------------------------------------------

alter table barberias
  add column if not exists domicilio_legal text not null default '',
  add column if not exists correo_legal    text not null default '';

-- ------------------------------------------------------------
-- 3. Solicitudes de baja
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_solicitud') then
    create type estado_solicitud as enum ('recibida', 'en_curso', 'resuelta');
  end if;
end $$;

create table if not exists solicitudes_baja (
  id              uuid primary key default gen_random_uuid(),
  barberia_id     uuid not null references barberias (id) on delete cascade,
  cliente_id      uuid not null references clientes (id) on delete cascade,
  estado          estado_solicitud not null default 'recibida',
  creada_en       timestamptz not null default now(),
  actualizada_en  timestamptz not null default now(),
  resuelta_en     timestamptz,
  accion          text,
  nota            text not null default ''
);

-- Una sola solicitud abierta por cliente: pedirla dos veces no duplica.
create unique index if not exists solicitudes_baja_abierta_idx
  on solicitudes_baja (cliente_id)
  where estado <> 'resuelta';

create index if not exists solicitudes_baja_local_idx
  on solicitudes_baja (barberia_id, creada_en desc);

alter table solicitudes_baja enable row level security;

drop policy if exists "solo su local" on solicitudes_baja;
create policy "solo su local" on solicitudes_baja
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

-- ------------------------------------------------------------
-- 4. La baja del cliente crea la solicitud (y apaga comunicaciones)
-- ------------------------------------------------------------

drop function if exists public.solicitar_baja(text, text);

create or replace function public.solicitar_baja(p_token text, p_pin text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente  uuid;
  v_barberia uuid;
  v_estado   text;
begin
  select id, barberia_id into v_cliente, v_barberia
    from clientes where token_publico = p_token;

  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then return false; end if;

  -- Baja inmediata de comunicaciones: eso sí es ya.
  update clientes
     set cons_avisos = false,
         cons_marketing = false,
         cons_promociones = false,
         cons_preferencias = false
   where id = v_cliente;

  -- Y la solicitud de supresión, que el local tiene que atender.
  select estado into v_estado
    from solicitudes_baja
   where cliente_id = v_cliente and estado <> 'resuelta'
   limit 1;

  if v_estado is null then
    insert into solicitudes_baja (barberia_id, cliente_id, estado)
    values (v_barberia, v_cliente, 'recibida');
  end if;

  insert into mensajes_log (barberia_id, cliente_id, tipo, canal, texto)
  values (v_barberia, v_cliente, 'confirmacion', 'whatsapp',
          'SOLICITUD DE BAJA recibida desde la tarjeta del cliente');

  return true;
end;
$$;

-- Estado de la baja, para que la tarjeta pueda decirlo.
create or replace function public.baja_del_cliente(p_token text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'privacidad', c.privacidad,
    'solicitud', (
      select json_build_object('estado', s.estado, 'creada_en', s.creada_en,
                               'resuelta_en', s.resuelta_en, 'accion', s.accion)
        from solicitudes_baja s
       where s.cliente_id = c.id and s.estado <> 'resuelta'
       order by s.creada_en desc limit 1),
    'historial', (
      select coalesce(json_agg(json_build_object(
               'estado', s.estado, 'creada_en', s.creada_en, 'resuelta_en', s.resuelta_en,
               'accion', s.accion) order by s.creada_en desc), '[]'::json)
        from solicitudes_baja s where s.cliente_id = c.id))
   from clientes c
  where c.token_publico = p_token;
$$;

-- Los permisos nuevos viajan con los datos de la tarjeta.
-- `p_preferencias` es el texto libre; `p_cons_preferencias` es el permiso.
drop function if exists public.actualizar_mis_datos(text, text, text, boolean, boolean, text);

create or replace function public.actualizar_mis_datos(
  p_token            text,
  p_telefono         text default null,
  p_preferencias     text default null,
  p_avisos           boolean default null,
  p_marketing        boolean default null,
  p_fidelidad        boolean default null,
  p_cons_preferencias boolean default null,
  p_promociones      boolean default null,
  p_pin              text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then return false; end if;

  update clientes set
    telefono           = coalesce(nullif(trim(p_telefono), ''), telefono),
    preferencias       = coalesce(p_preferencias, preferencias),
    cons_avisos        = coalesce(p_avisos, cons_avisos),
    cons_marketing     = coalesce(p_marketing, cons_marketing),
    cons_fidelidad     = coalesce(p_fidelidad, cons_fidelidad),
    cons_preferencias  = coalesce(p_cons_preferencias, cons_preferencias),
    cons_promociones   = coalesce(p_promociones, cons_promociones)
  where id = v_cliente;

  return true;
end;
$$;

revoke all on function public.actualizar_mis_datos(text, text, text, boolean, boolean, boolean, boolean, boolean, text) from public;
grant execute on function public.actualizar_mis_datos(text, text, text, boolean, boolean, boolean, boolean, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Resolver la solicitud: anonimizar o bloquear
-- ------------------------------------------------------------

create or replace function public.resolver_solicitud_baja(
  p_solicitud uuid,
  p_accion    text,
  p_nota      text default ''
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
  v_local   uuid;
begin
  if p_accion not in ('anonimizar', 'bloquear') then
    raise exception 'accion_invalida';
  end if;

  select s.cliente_id, s.barberia_id into v_cliente, v_local
    from solicitudes_baja s
   where s.id = p_solicitud;

  if v_cliente is null then return false; end if;
  if v_local <> public.mi_barberia() then return false; end if;

  -- El llavero muere con la ficha, y el PIN sobra.
  update llaveros set estado = 'retirado'
   where cliente_id = v_cliente and estado <> 'retirado';
  delete from clientes_pin where cliente_id = v_cliente;

  if p_accion = 'anonimizar' then
    update clientes set
      nombre             = 'Cliente dado de baja',
      telefono           = '',
      como_corta         = '',
      notas              = '',
      preferencias       = '',
      cons_datos         = true,
      cons_avisos        = false,
      cons_marketing     = false,
      cons_fidelidad     = false,
      cons_preferencias  = false,
      cons_promociones   = false,
      privacidad         = 'anonimizado'
    where id = v_cliente;
  else
    update clientes set privacidad = 'bloqueado' where id = v_cliente;
  end if;

  update solicitudes_baja set
    estado = 'resuelta',
    resuelta_en = now(),
    actualizada_en = now(),
    accion = p_accion,
    nota = coalesce(p_nota, '')
  where id = p_solicitud;

  insert into mensajes_log (barberia_id, cliente_id, tipo, canal, texto)
  values (v_local, v_cliente, 'confirmacion', 'whatsapp',
          case when p_accion = 'anonimizar'
               then 'BAJA RESUELTA: datos anonimizados'
               else 'BAJA RESUELTA: ficha bloqueada' end);

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 6. Lo que ya no se puede abrir
-- ------------------------------------------------------------

-- Un cliente bloqueado o anonimizado no tiene tarjeta pública.
create or replace function public.llavero_tarjeta(p_token text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select c.token_publico
    from llaveros l
    join clientes c on c.id = l.cliente_id
   where l.token = p_token
     and l.estado = 'activo'
     and c.privacidad = 'activo';
$$;

-- ------------------------------------------------------------
-- 7. Datos legales en las altas y en el panel
-- ------------------------------------------------------------

drop function if exists public.crear_local_admin(text, text, text, text, text, tipo_negocio);

create or replace function public.crear_local_admin(
  p_nombre           text,
  p_slug             text,
  p_email            text,
  p_password         text,
  p_color            text default '#3E4A35',
  p_tipo             tipo_negocio default 'barberia',
  p_domicilio_legal  text default '',
  p_correo_legal     text default ''
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

  insert into barberias (nombre, slug, color, tipo, domicilio_legal, correo_legal)
  values (trim(p_nombre), v_slug, coalesce(nullif(trim(p_color), ''), '#3E4A35'), p_tipo,
          trim(coalesce(p_domicilio_legal, '')), trim(coalesce(p_correo_legal, '')))
  returning id into v_barberia;

  insert into barberos (id, barberia_id, nombre, rol)
  values (v_uid, v_barberia, trim(p_nombre), 'dueno');

  perform public.sembrar_local(v_barberia, p_tipo);

  insert into horarios (barberia_id, dia_semana, abre, cierra)
  select v_barberia, d, '10:00', '20:00' from generate_series(0, 6) as d;

  return json_build_object('barberia', v_barberia, 'barbero', v_uid, 'tipo', p_tipo);
end;
$$;

-- El local público enseña sus datos legales para su página de identidad.
create or replace function public.local_publico(p_slug text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'color', b.color,
    'direccion', b.direccion, 'telefono', b.telefono, 'logo_url', b.logo_url,
    'fidelidad_meta', b.fidelidad_meta, 'tipo', b.tipo,
    'domicilio_legal', b.domicilio_legal, 'correo_legal', b.correo_legal,
    'servicios', coalesce((
      select json_agg(json_build_object('id', s.id, 'nombre', s.nombre,
                                        'precio', s.precio, 'minutos', s.minutos) order by s.orden)
      from servicios s where s.barberia_id = b.id and s.activo), '[]'::json)
  )
  from barberias b
  where b.slug = p_slug and b.activo;
$$;

-- ------------------------------------------------------------
-- 8. La tarjeta: estado de baja y datos legales del local
-- ------------------------------------------------------------

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

  -- Bloqueada o anonimizada: como si no existiera.
  if (select privacidad from clientes where id = v_cliente) <> 'activo' then
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
      'tipo', b.tipo,
      'domicilio_legal', b.domicilio_legal, 'correo_legal', b.correo_legal),
    'cliente', json_build_object(
      'nombre', c.nombre, 'codigo', c.codigo, 'telefono', c.telefono,
      'preferencias', c.preferencias, 'creado_en', c.creado_en),
    'consentimientos', json_build_object(
      'datos', c.cons_datos, 'avisos', c.cons_avisos, 'marketing', c.cons_marketing,
      'fidelidad', c.cons_fidelidad, 'preferencias', c.cons_preferencias,
      'promociones', c.cons_promociones),
    'baja', (
      select json_build_object('estado', s.estado, 'creada_en', s.creada_en)
        from solicitudes_baja s
       where s.cliente_id = c.id and s.estado <> 'resuelta'
       order by s.creada_en desc limit 1),
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
-- 9. Permisos
-- ------------------------------------------------------------

revoke all on function public.solicitar_baja(text, text) from public;
revoke all on function public.baja_del_cliente(text) from public;
revoke all on function public.resolver_solicitud_baja(uuid, text, text) from public;
revoke all on function public.llavero_tarjeta(text) from public;
revoke all on function public.crear_local_admin(text, text, text, text, text, tipo_negocio, text, text) from public;
revoke all on function public.local_publico(text) from public;
revoke all on function public.ficha_publica(text, text) from public;

grant execute on function public.solicitar_baja(text, text) to anon, authenticated;
grant execute on function public.baja_del_cliente(text) to anon, authenticated;
grant execute on function public.resolver_solicitud_baja(uuid, text, text) to authenticated;
grant execute on function public.llavero_tarjeta(text) to anon, authenticated;
grant execute on function public.crear_local_admin(text, text, text, text, text, tipo_negocio, text, text) to authenticated;
grant execute on function public.local_publico(text) to anon, authenticated;
grant execute on function public.ficha_publica(text, text) to anon, authenticated;
