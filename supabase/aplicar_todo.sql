-- JULEX · esquema completo
-- Pega este archivo en el SQL Editor de un proyecto NUEVO y ejecútalo.

-- ---------- 0001_esquema_inicial.sql ----------

-- ============================================================
-- JULEX · esquema inicial
-- Un local por cuenta. RLS por barberia_id en todas las tablas.
-- Aplicar con: npx supabase db push
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- tipos ----------
create type rol_barbero        as enum ('dueno', 'barbero');
create type estado_llavero     as enum ('sin_asignar', 'activo', 'retirado');
create type estado_cita        as enum ('pendiente', 'confirmada', 'atendida', 'no_vino', 'cancelada');
create type origen_cita        as enum ('qr', 'llavero', 'manual', 'web', 'mostrador');
create type estado_cola        as enum ('esperando', 'sillon', 'terminado', 'no_vino');
create type tipo_movimiento    as enum ('corte', 'recompensa_ganada', 'recompensa_canjeada');
create type estado_recompensa  as enum ('disponible', 'aplicada');
create type tipo_mensaje       as enum ('aviso_turno', 'reactivacion', 'resena', 'confirmacion');
create type canal_mensaje      as enum ('whatsapp', 'sms');

-- ---------- locales ----------
create table barberias (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (length(trim(nombre)) between 2 and 80),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  color           text not null default '#3E4A35' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  telefono        text not null default '',
  direccion       text not null default '',
  logo_url        text,
  fidelidad_meta  int  not null default 10 check (fidelidad_meta between 2 and 30),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table barberos (
  id          uuid primary key references auth.users (id) on delete cascade,
  barberia_id uuid not null references barberias (id) on delete cascade,
  nombre      text not null,
  rol         rol_barbero not null default 'barbero',
  creado_en   timestamptz not null default now()
);
create index barberos_barberia_idx on barberos (barberia_id);

create table servicios (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  nombre      text not null,
  precio      numeric(8,2) not null check (precio >= 0),
  minutos     int not null check (minutos between 5 and 240),
  activo      boolean not null default true,
  orden       int not null default 0
);
create index servicios_barberia_idx on servicios (barberia_id);

-- ---------- clientes ----------
create table clientes (
  id             uuid primary key default gen_random_uuid(),
  barberia_id    uuid not null references barberias (id) on delete cascade,
  codigo         text not null,
  -- token público del enlace de tarjeta: no secuencial, revocable
  token_publico  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  nombre         text not null check (length(trim(nombre)) >= 2),
  telefono       text not null default '',
  como_corta     text not null default '',
  notas          text not null default '',
  preferencias   text not null default '',
  cons_datos     boolean not null default true,
  cons_avisos    boolean not null default false,
  cons_marketing boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (barberia_id, codigo)
);
create index clientes_barberia_idx on clientes (barberia_id);
create index clientes_telefono_idx on clientes (barberia_id, telefono);

-- ---------- llaveros ----------
create table llaveros (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references barberias (id) on delete cascade,
  token        text not null unique,
  codigo_corto text not null,
  lote         text not null default '',
  estado       estado_llavero not null default 'sin_asignar',
  cliente_id   uuid references clientes (id) on delete set null,
  creado_en    timestamptz not null default now(),
  asignado_en  timestamptz,
  retirado_en  timestamptz,
  unique (barberia_id, codigo_corto),
  -- un llavero retirado no vuelve a tener cliente nunca
  constraint llavero_coherente check (
    (estado = 'activo' and cliente_id is not null) or
    (estado = 'sin_asignar' and cliente_id is null and asignado_en is null) or
    (estado = 'retirado')
  )
);
create index llaveros_barberia_idx on llaveros (barberia_id, estado);

-- ---------- citas ----------
create table citas (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  servicio_id uuid not null references servicios (id),
  inicio      timestamptz not null,
  estado      estado_cita not null default 'pendiente',
  origen      origen_cita not null default 'manual',
  nota        text not null default '',
  creado_en   timestamptz not null default now()
);
create index citas_barberia_inicio_idx on citas (barberia_id, inicio);
create index citas_cliente_idx on citas (cliente_id, inicio desc);

-- ---------- cola ----------
create table cola (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  servicio_id uuid references servicios (id),
  estado      estado_cola not null default 'esperando',
  origen      origen_cita not null default 'mostrador',
  llegada_en  timestamptz not null default now(),
  inicio_en   timestamptz,
  fin_en      timestamptz
);
create index cola_barberia_estado_idx on cola (barberia_id, estado, llegada_en);

-- ---------- historial y fidelización ----------
create table visitas (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  servicio_id uuid references servicios (id),
  fecha       timestamptz not null default now(),
  precio      numeric(8,2) not null check (precio >= 0),
  pagado      boolean not null default false,
  metodo      text check (metodo in ('efectivo', 'tarjeta', 'bono'))
);
create index visitas_barberia_fecha_idx on visitas (barberia_id, fecha desc);
create index visitas_cliente_idx on visitas (cliente_id, fecha desc);

create table movimientos_fidelizacion (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  tipo        tipo_movimiento not null,
  fecha       timestamptz not null default now(),
  nota        text not null default ''
);
create index movimientos_cliente_idx on movimientos_fidelizacion (cliente_id, fecha desc);

create table recompensas (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  estado      estado_recompensa not null default 'disponible',
  creada_en   timestamptz not null default now(),
  aplicada_en timestamptz
);

-- ---------- mensajería y eventos ----------
create table mensajes_log (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  tipo        tipo_mensaje not null,
  canal       canal_mensaje not null,
  estado      text not null default 'simulado',
  texto       text not null,
  fecha       timestamptz not null default now()
);
create index mensajes_barberia_idx on mensajes_log (barberia_id, fecha desc);

create table eventos (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid references clientes (id) on delete set null,
  tipo        text not null,
  meta        jsonb not null default '{}'::jsonb,
  fecha       timestamptz not null default now()
);
create index eventos_barberia_idx on eventos (barberia_id, fecha desc);

-- ---------- agenda ----------
create table horarios (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references barberias (id) on delete cascade,
  dia_semana   int not null check (dia_semana between 0 and 6),
  abre         time not null default '10:00',
  cierra       time not null default '20:00',
  descanso_desde time,
  descanso_hasta time,
  unique (barberia_id, dia_semana)
);

create table bloqueos_agenda (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  desde       timestamptz not null,
  hasta       timestamptz not null,
  motivo      text not null default '',
  check (hasta > desde)
);

-- ============================================================
-- Utilidades
-- ============================================================

create or replace function public.set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger barberias_actualizado before update on barberias
for each row execute function public.set_actualizado_en();

create trigger clientes_actualizado before update on clientes
for each row execute function public.set_actualizado_en();

-- Local del usuario que ha iniciado sesión. SECURITY DEFINER para no
-- recursar en la propia RLS de barberos.
create or replace function public.mi_barberia()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select barberia_id from public.barberos where id = auth.uid() limit 1;
$$;

-- ============================================================
-- RLS: el personal solo ve lo de su local. El público, nada.
-- ============================================================

alter table barberias              enable row level security;
alter table barberos               enable row level security;
alter table servicios              enable row level security;
alter table clientes               enable row level security;
alter table llaveros               enable row level security;
alter table citas                  enable row level security;
alter table cola                   enable row level security;
alter table visitas                enable row level security;
alter table movimientos_fidelizacion enable row level security;
alter table recompensas            enable row level security;
alter table mensajes_log           enable row level security;
alter table eventos                enable row level security;
alter table horarios               enable row level security;
alter table bloqueos_agenda        enable row level security;

create policy "local propio: lectura" on barberias
  for select to authenticated using (id = public.mi_barberia());
create policy "local propio: edición" on barberias
  for update to authenticated using (id = public.mi_barberia()) with check (id = public.mi_barberia());

create policy "equipo del local" on barberos
  for select to authenticated using (barberia_id = public.mi_barberia());

do $$
declare t text;
begin
  foreach t in array array['servicios','clientes','llaveros','citas','cola','visitas',
                           'movimientos_fidelizacion','recompensas','mensajes_log','eventos',
                           'horarios','bloqueos_agenda']
  loop
    execute format(
      'create policy "solo su local" on %I for all to authenticated
         using (barberia_id = public.mi_barberia())
         with check (barberia_id = public.mi_barberia());', t);
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ============================================================
-- Storage: logos de los locales
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 524288, array['image/webp','image/png','image/jpeg','image/svg+xml'])
on conflict (id) do nothing;

create policy "logos: lectura pública" on storage.objects
  for select using (bucket_id = 'logos');

create policy "logos: escritura del local" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.mi_barberia()::text);

create policy "logos: edición del local" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.mi_barberia()::text);

create policy "logos: borrado del local" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.mi_barberia()::text);

-- ============================================================
-- Cara pública (sin sesión): solo lo imprescindible
-- ============================================================

create or replace function public.local_publico(p_slug text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'color', b.color,
    'direccion', b.direccion, 'telefono', b.telefono, 'logo_url', b.logo_url,
    'fidelidad_meta', b.fidelidad_meta,
    'servicios', coalesce((
      select json_agg(json_build_object('id', s.id, 'nombre', s.nombre,
                                        'precio', s.precio, 'minutos', s.minutos) order by s.orden)
      from servicios s where s.barberia_id = b.id and s.activo), '[]'::json)
  )
  from barberias b
  where b.slug = p_slug and b.activo;
$$;

create or replace function public.ficha_publica(p_token text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'local', json_build_object(
      'nombre', b.nombre, 'slug', b.slug, 'color', b.color, 'direccion', b.direccion,
      'telefono', b.telefono, 'logo_url', b.logo_url, 'fidelidad_meta', b.fidelidad_meta),
    'cliente', json_build_object('nombre', c.nombre, 'codigo', c.codigo),
    'cortes', (select count(*) from visitas v where v.cliente_id = c.id),
    'recompensas', json_build_object(
      'disponibles', (select count(*) from recompensas r where r.cliente_id = c.id and r.estado = 'disponible'),
      'aplicadas',  (select count(*) from recompensas r where r.cliente_id = c.id and r.estado = 'aplicada')),
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
  from clientes c join barberias b on b.id = c.barberia_id
  where c.token_publico = p_token;
$$;

-- Solicitud de cita desde la web o el QR. Crea el cliente si no existe.
create or replace function public.solicitar_cita(
  p_slug      text,
  p_servicio  uuid,
  p_inicio    timestamptz,
  p_nombre    text,
  p_telefono  text,
  p_token     text default null,
  p_origen    origen_cita default 'web'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_cliente  uuid;
  v_servicio uuid;
  v_codigo   text;
  v_cita     uuid;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then raise exception 'local_no_encontrado'; end if;

  select id into v_servicio from servicios
   where id = p_servicio and barberia_id = v_barberia and activo;
  if v_servicio is null then raise exception 'servicio_no_valido'; end if;

  if p_token is not null then
    select id into v_cliente from clientes
     where token_publico = p_token and barberia_id = v_barberia;
  end if;

  if v_cliente is null and length(trim(p_telefono)) >= 6 then
    select id into v_cliente from clientes
     where barberia_id = v_barberia and telefono = trim(p_telefono) limit 1;
  end if;

  if v_cliente is null then
    -- serializa la numeración por local
    perform 1 from barberias where id = v_barberia for update;
    select 'P-' || lpad((coalesce(max(substring(codigo from 3)::int), 0) + 1)::text, 4, '0')
      into v_codigo from clientes where barberia_id = v_barberia;

    insert into clientes (barberia_id, codigo, nombre, telefono, cons_datos)
    values (v_barberia, v_codigo, trim(p_nombre), trim(p_telefono), true)
    returning id into v_cliente;
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen)
  values (v_barberia, v_cliente, v_servicio, p_inicio, 'pendiente', p_origen)
  returning id into v_cita;

  return v_cita;
end;
$$;

-- El público no puede llamar a nada más.
revoke all on function public.local_publico(text) from public;
revoke all on function public.ficha_publica(text) from public;
revoke all on function public.solicitar_cita(text, uuid, timestamptz, text, text, text, origen_cita) from public;

grant execute on function public.local_publico(text) to anon, authenticated;
grant execute on function public.ficha_publica(text) to anon, authenticated;
grant execute on function public.solicitar_cita(text, uuid, timestamptz, text, text, text, origen_cita) to anon, authenticated;

-- ---------- 0002_alta_local.sql ----------

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

-- ---------- 0003_mostrador.sql ----------

-- ============================================================
-- JULEX · operaciones atómicas del mostrador
-- Cerrar una visita toca cinco tablas: o entran todas, o ninguna.
-- ============================================================

create or replace function public.atender_cola(p_cola_id uuid, p_servicio_id uuid default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cola     cola%rowtype;
  v_servicio servicios%rowtype;
  v_barberia barberias%rowtype;
  v_ahora    timestamptz := now();
  v_cortes   int;
  v_ganada   boolean := false;
  v_cita     uuid;
begin
  select * into v_cola
    from cola where id = p_cola_id and barberia_id = public.mi_barberia();

  if not found then raise exception 'cola_no_encontrada'; end if;
  if v_cola.estado <> 'sillon' then raise exception 'no_esta_en_sillon'; end if;

  select * into v_servicio
    from servicios
   where id = coalesce(p_servicio_id, v_cola.servicio_id)
     and barberia_id = v_cola.barberia_id;

  if not found then raise exception 'servicio_no_valido'; end if;

  select * into v_barberia from barberias where id = v_cola.barberia_id;

  update cola
     set estado = 'terminado', fin_en = v_ahora, servicio_id = v_servicio.id
   where id = v_cola.id;

  insert into visitas (barberia_id, cliente_id, servicio_id, fecha, precio, pagado)
  values (v_cola.barberia_id, v_cola.cliente_id, v_servicio.id, v_ahora, v_servicio.precio, true);

  insert into movimientos_fidelizacion (barberia_id, cliente_id, tipo, fecha, nota)
  values (v_cola.barberia_id, v_cola.cliente_id, 'corte', v_ahora, v_servicio.nombre);

  select count(*) into v_cortes from visitas where cliente_id = v_cola.cliente_id;

  v_ganada := (v_cortes % v_barberia.fidelidad_meta) = 0;

  if v_ganada then
    insert into recompensas (barberia_id, cliente_id)
    values (v_cola.barberia_id, v_cola.cliente_id);

    insert into movimientos_fidelizacion (barberia_id, cliente_id, tipo, fecha, nota)
    values (v_cola.barberia_id, v_cola.cliente_id, 'recompensa_ganada', v_ahora,
            'Corte gratis nº ' || (v_cortes / v_barberia.fidelidad_meta));

    insert into eventos (barberia_id, cliente_id, tipo, meta)
    values (v_cola.barberia_id, v_cola.cliente_id, 'recompensa_obtenida',
            jsonb_build_object('corte', v_cortes));
  end if;

  select id into v_cita
    from citas
   where cliente_id = v_cola.cliente_id
     and barberia_id = v_cola.barberia_id
     and estado in ('pendiente', 'confirmada')
     and inicio::date = current_date
   order by inicio
   limit 1;

  if v_cita is not null then
    update citas set estado = 'atendida' where id = v_cita;
  end if;

  insert into eventos (barberia_id, cliente_id, tipo, meta)
  values (v_cola.barberia_id, v_cola.cliente_id, 'servicio_terminado',
          jsonb_build_object('servicio', v_servicio.nombre, 'precio', v_servicio.precio));

  return json_build_object(
    'cortesTotales', v_cortes,
    'recompensaGanada', v_ganada,
    'servicio', v_servicio.nombre,
    'precio', v_servicio.precio
  );
end;
$$;

create or replace function public.aplicar_recompensa(p_cliente_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid := public.mi_barberia();
  v_rw       uuid;
begin
  if v_barberia is null then raise exception 'sin_sesion'; end if;

  select id into v_rw
    from recompensas
   where cliente_id = p_cliente_id
     and barberia_id = v_barberia
     and estado = 'disponible'
   order by creada_en
   limit 1;

  if v_rw is null then return; end if;

  update recompensas set estado = 'aplicada', aplicada_en = now() where id = v_rw;

  insert into movimientos_fidelizacion (barberia_id, cliente_id, tipo, nota)
  values (v_barberia, p_cliente_id, 'recompensa_canjeada', 'Aplicada en el corte de hoy');
end;
$$;

revoke all on function public.atender_cola(uuid, uuid) from public;
revoke all on function public.aplicar_recompensa(uuid) from public;
grant execute on function public.atender_cola(uuid, uuid) to authenticated;
grant execute on function public.aplicar_recompensa(uuid) to authenticated;

-- ---------- 0004_cara_publica.sql ----------

-- ============================================================
-- JULEX · cara pública del cliente
-- Lo que puede hacer alguien sin cuenta, con el token de su tarjeta.
-- ============================================================

-- La ficha incluye ahora lo gastado y el total de visitas, para que la
-- tarjeta no tenga que recalcular desde una lista recortada.
create or replace function public.ficha_publica(p_token text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'local', json_build_object(
      'nombre', b.nombre, 'slug', b.slug, 'color', b.color, 'direccion', b.direccion,
      'telefono', b.telefono, 'logo_url', b.logo_url, 'fidelidad_meta', b.fidelidad_meta),
    'cliente', json_build_object(
      'nombre', c.nombre, 'codigo', c.codigo, 'telefono', c.telefono,
      'preferencias', c.preferencias, 'creado_en', c.creado_en),
    'consentimientos', json_build_object(
      'datos', c.cons_datos, 'avisos', c.cons_avisos, 'marketing', c.cons_marketing),
    'cortes', (select count(*) from visitas v where v.cliente_id = c.id),
    'gastado', (select coalesce(sum(v.precio), 0) from visitas v where v.cliente_id = c.id),
    'recompensas', json_build_object(
      'disponibles', (select count(*) from recompensas r where r.cliente_id = c.id and r.estado = 'disponible'),
      'aplicadas',  (select count(*) from recompensas r where r.cliente_id = c.id and r.estado = 'aplicada')),
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
  from clientes c join barberias b on b.id = c.barberia_id
  where c.token_publico = p_token;
$$;

-- Cancelar su propia cita. Con dos horas de margen: menos es cosa de la barbería.
create or replace function public.cancelar_cita(p_token text, p_cita uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;

  update citas
     set estado = 'cancelada'
   where id = p_cita
     and cliente_id = v_cliente
     and estado in ('pendiente', 'confirmada')
     and inicio > now() + interval '2 hours';

  return found;
end;
$$;

-- Sus datos: teléfono, preferencias y los consentimientos opcionales.
-- El consentimiento de datos no se toca desde aquí: sin él no hay tarjeta.
create or replace function public.actualizar_mis_datos(
  p_token        text,
  p_telefono     text default null,
  p_preferencias text default null,
  p_avisos       boolean default null,
  p_marketing    boolean default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;

  update clientes set
    telefono       = coalesce(nullif(trim(p_telefono), ''), telefono),
    preferencias   = coalesce(p_preferencias, preferencias),
    cons_avisos    = coalesce(p_avisos, cons_avisos),
    cons_marketing = coalesce(p_marketing, cons_marketing)
  where id = v_cliente;

  return true;
end;
$$;

-- Baja: se apagan los consentimientos opcionales y queda constancia para el local.
create or replace function public.solicitar_baja(p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente  uuid;
  v_barberia uuid;
begin
  select id, barberia_id into v_cliente, v_barberia
    from clientes where token_publico = p_token;

  if v_cliente is null then return false; end if;

  update clientes set cons_avisos = false, cons_marketing = false where id = v_cliente;

  insert into mensajes_log (barberia_id, cliente_id, tipo, canal, texto)
  values (v_barberia, v_cliente, 'confirmacion', 'whatsapp',
          'SOLICITUD DE BAJA recibida desde la tarjeta del cliente');

  return true;
end;
$$;

revoke all on function public.cancelar_cita(text, uuid) from public;
revoke all on function public.actualizar_mis_datos(text, text, text, boolean, boolean) from public;
revoke all on function public.solicitar_baja(text) from public;

grant execute on function public.cancelar_cita(text, uuid) to anon, authenticated;
grant execute on function public.actualizar_mis_datos(text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.solicitar_baja(text) to anon, authenticated;

-- ---------- 0005_disponibilidad.sql ----------

-- ============================================================
-- JULEX · disponibilidad pública y reserva sin dobles
-- El navegador del cliente no puede calcular huecos: no ve las
-- citas de los demás. Se calculan aquí y la reserva se comprueba.
-- ============================================================

-- La ficha de la tarjeta incluye los servicios del local, para que la
-- reserva desde la tarjeta no necesite una segunda llamada.
create or replace function public.ficha_publica(p_token text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'local', json_build_object(
      'nombre', b.nombre, 'slug', b.slug, 'color', b.color, 'direccion', b.direccion,
      'telefono', b.telefono, 'logo_url', b.logo_url, 'fidelidad_meta', b.fidelidad_meta),
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
  from clientes c join barberias b on b.id = c.barberia_id
  where c.token_publico = p_token;
$$;

-- Huéspedes libres de un día, según horario y citas ya cogidas.
create or replace function public.huecos_publicos(
  p_slug    text,
  p_dia     date,
  p_minutos int default 30,
  p_paso    int default 30
) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_abre     time;
  v_cierra   time;
  v_desde_t  time;
  v_hasta_t  time;
  v_inicio   timestamptz;
  v_fin      timestamptz;
  v_huecos   json;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then return '[]'::json; end if;

  select abre, cierra, descanso_desde, descanso_hasta
    into v_abre, v_cierra, v_desde_t, v_hasta_t
    from horarios
   where barberia_id = v_barberia
     and dia_semana = extract(dow from p_dia)::int;

  if v_abre is null then return '[]'::json; end if;  -- cerrado ese día

  with candidatos as (
    select (p_dia + make_interval(mins => m)) as ini
    from generate_series(
           (extract(epoch from v_abre) / 60)::int,
           (extract(epoch from v_cierra) / 60)::int - p_minutos,
           p_paso
         ) as m
  ),
  validos as (
    select c.ini,
           c.ini + make_interval(mins => p_minutos) as fin
    from candidatos c
    where c.ini > now() + interval '30 minutes'
      -- dentro del horario de apertura
      and c.ini::time >= v_abre
      and (c.ini + make_interval(mins => p_minutos))::time <= v_cierra
      -- fuera del descanso
      and (v_desde_t is null or not (
             c.ini::time < v_hasta_t and (c.ini + make_interval(mins => p_minutos))::time > v_desde_t))
  )
  select coalesce(json_agg(to_char(v.ini, 'HH24:MI') order by v.ini), '[]'::json)
    into v_huecos
  from validos v
  where not exists (
    select 1
    from citas ci
    join servicios s on s.id = ci.servicio_id
    where ci.barberia_id = v_barberia
      and ci.estado in ('pendiente', 'confirmada')
      and tstzrange(ci.inicio, ci.inicio + make_interval(mins => s.minutos), '[)')
          && tstzrange(v.ini, v.fin, '[)')
  )
  and not exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_barberia
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(v.ini, v.fin, '[)')
  );

  return v_huecos;
end;
$$;

-- La reserva comprueba el hueco antes de insertar: si dos clientes
-- pulsan a la vez, el segundo recibe 'horario_ocupado'.
create or replace function public.solicitar_cita(
  p_slug      text,
  p_servicio  uuid,
  p_inicio    timestamptz,
  p_nombre    text,
  p_telefono  text,
  p_token     text default null,
  p_origen    origen_cita default 'web'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_cliente  uuid;
  v_servicio servicios%rowtype;
  v_codigo   text;
  v_cita     uuid;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then raise exception 'local_no_encontrado'; end if;

  select * into v_servicio
    from servicios
   where id = p_servicio and barberia_id = v_barberia and activo;
  if not found then raise exception 'servicio_no_valido'; end if;

  -- serializa las reservas del local para que no se crucen dos huecos
  perform pg_advisory_xact_lock(hashtext(v_barberia::text));

  if exists (
    select 1
    from citas ci
    join servicios s on s.id = ci.servicio_id
    where ci.barberia_id = v_barberia
      and ci.estado in ('pendiente', 'confirmada')
      and tstzrange(ci.inicio, ci.inicio + make_interval(mins => s.minutos), '[)')
          && tstzrange(p_inicio, p_inicio + make_interval(mins => v_servicio.minutos), '[)')
  ) then
    raise exception 'horario_ocupado';
  end if;

  if exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_barberia
       and tstzrange(b.desde, b.hasta, '[)')
           && tstzrange(p_inicio, p_inicio + make_interval(mins => v_servicio.minutos), '[)')
  ) then
    raise exception 'horario_bloqueado';
  end if;

  if p_token is not null then
    select id into v_cliente from clientes
     where token_publico = p_token and barberia_id = v_barberia;
  end if;

  if v_cliente is null and length(trim(p_telefono)) >= 6 then
    select id into v_cliente from clientes
     where barberia_id = v_barberia and telefono = trim(p_telefono) limit 1;
  end if;

  if v_cliente is null then
    select 'P-' || lpad((coalesce(max(substring(codigo from 3)::int), 0) + 1)::text, 4, '0')
      into v_codigo from clientes where barberia_id = v_barberia;

    insert into clientes (barberia_id, codigo, nombre, telefono, cons_datos)
    values (v_barberia, v_codigo, trim(p_nombre), trim(p_telefono), true)
    returning id into v_cliente;
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen)
  values (v_barberia, v_cliente, v_servicio.id, p_inicio, 'pendiente', p_origen)
  returning id into v_cita;

  return v_cita;
end;
$$;

revoke all on function public.huecos_publicos(text, date, int, int) from public;
grant execute on function public.huecos_publicos(text, date, int, int) to anon, authenticated;

-- ---------- 0006_sillas.sql ----------

-- ============================================================
-- JULEX · sillas
-- Un local puede tener varias sillas (varios trabajadores a la vez).
-- La silla es un recurso del local, no una cuenta: no hace falta que
-- cada barbero tenga usuario para que su silla cuente.
-- ============================================================

create table if not exists sillas (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  nombre      text not null,
  orden       int  not null default 1,
  activa      boolean not null default true,
  creada_en   timestamptz not null default now(),
  unique (barberia_id, nombre)
);
create index if not exists sillas_barberia on sillas (barberia_id, orden);

alter table sillas enable row level security;
create policy "solo su local" on sillas
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

alter table citas add column if not exists silla_id uuid references sillas (id) on delete set null;
alter table cola  add column if not exists silla_id uuid references sillas (id) on delete set null;
create index if not exists citas_silla on citas (silla_id, inicio);

-- Cada local arranca con una silla, y las citas ya existentes se le asignan.
insert into sillas (barberia_id, nombre, orden)
select b.id, 'Silla 1', 1
  from barberias b
 where not exists (select 1 from sillas s where s.barberia_id = b.id);

update citas c
   set silla_id = s.id
  from sillas s
 where s.barberia_id = c.barberia_id
   and s.orden = 1
   and c.silla_id is null;

-- ¿Cuántas sillas puede atender a la vez?
create or replace function public.sillas_activas(p_barberia uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(1, count(*)::int) from sillas where barberia_id = p_barberia and activa;
$$;

-- Primera silla libre en un tramo (por orden), o null si están todas cogidas.
create or replace function public.silla_libre(
  p_barberia uuid, p_inicio timestamptz, p_fin timestamptz
) returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select s.id
    from sillas s
   where s.barberia_id = p_barberia
     and s.activa
     and not exists (
       select 1
         from citas ci
         join servicios sv on sv.id = ci.servicio_id
        where ci.barberia_id = p_barberia
          and ci.silla_id = s.id
          and ci.estado in ('pendiente', 'confirmada')
          and tstzrange(ci.inicio, ci.inicio + make_interval(mins => sv.minutos), '[)')
              && tstzrange(p_inicio, p_fin, '[)')
     )
   order by s.orden, s.nombre
   limit 1;
$$;

-- Huecos: un tramo está libre mientras haya alguna silla sin ocupar.
create or replace function public.huecos_publicos(
  p_slug    text,
  p_dia     date,
  p_minutos int default 30,
  p_paso    int default 30
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
    select (p_dia + make_interval(mins => m)) as ini
    from generate_series(
           (extract(epoch from v_abre) / 60)::int,
           (extract(epoch from v_cierra) / 60)::int - p_minutos,
           p_paso
         ) as m
  ),
  validos as (
    select c.ini,
           c.ini + make_interval(mins => p_minutos) as fin
    from candidatos c
    where c.ini > now() + interval '30 minutes'
      and c.ini::time >= v_abre
      and (c.ini + make_interval(mins => p_minutos))::time <= v_cierra
      and (v_desde_t is null or not (
             c.ini::time < v_hasta_t and (c.ini + make_interval(mins => p_minutos))::time > v_desde_t))
  )
  select coalesce(json_agg(to_char(v.ini, 'HH24:MI') order by v.ini), '[]'::json)
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
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(v.ini, v.fin, '[)')
  );

  return v_huecos;
end;
$$;

-- La reserva asigna la primera silla libre y rechaza si están todas cogidas.
create or replace function public.solicitar_cita(
  p_slug      text,
  p_servicio  uuid,
  p_inicio    timestamptz,
  p_nombre    text,
  p_telefono  text,
  p_token     text default null,
  p_origen    origen_cita default 'web'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_cliente  uuid;
  v_servicio servicios%rowtype;
  v_codigo   text;
  v_cita     uuid;
  v_silla    uuid;
  v_fin      timestamptz;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then raise exception 'local_no_encontrado'; end if;

  select * into v_servicio
    from servicios
   where id = p_servicio and barberia_id = v_barberia and activo;
  if not found then raise exception 'servicio_no_valido'; end if;

  v_fin := p_inicio + make_interval(mins => v_servicio.minutos);

  -- serializa las reservas del local para que no se crucen dos huecos
  perform pg_advisory_xact_lock(hashtext(v_barberia::text));

  v_silla := public.silla_libre(v_barberia, p_inicio, v_fin);
  if v_silla is null then raise exception 'horario_ocupado'; end if;

  if exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_barberia
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(p_inicio, v_fin, '[)')
  ) then
    raise exception 'horario_bloqueado';
  end if;

  if p_token is not null then
    select id into v_cliente from clientes
     where token_publico = p_token and barberia_id = v_barberia;
  end if;

  if v_cliente is null and length(trim(p_telefono)) >= 6 then
    select id into v_cliente from clientes
     where barberia_id = v_barberia and telefono = trim(p_telefono) limit 1;
  end if;

  if v_cliente is null then
    select 'P-' || lpad((coalesce(max(substring(codigo from 3)::int), 0) + 1)::text, 4, '0')
      into v_codigo from clientes where barberia_id = v_barberia;

    insert into clientes (barberia_id, codigo, nombre, telefono, cons_datos)
    values (v_barberia, v_codigo, trim(p_nombre), trim(p_telefono), true)
    returning id into v_cliente;
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen, silla_id)
  values (v_barberia, v_cliente, v_servicio.id, p_inicio, 'pendiente', p_origen, v_silla)
  returning id into v_cita;

  return v_cita;
end;
$$;

-- Un local nuevo nace con su primera silla.
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
  if v_uid is null then raise exception 'sin_sesion'; end if;
  if exists (select 1 from barberos where id = v_uid) then raise exception 'ya_tiene_local'; end if;

  v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then raise exception 'slug_invalido'; end if;

  if exists (select 1 from barberias where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

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

  return v_barberia;
end;
$$;

revoke all on function public.sillas_activas(uuid) from public;
revoke all on function public.silla_libre(uuid, timestamptz, timestamptz) from public;
grant execute on function public.sillas_activas(uuid) to authenticated;
grant execute on function public.silla_libre(uuid, timestamptz, timestamptz) to authenticated;

-- ---------- 0007_admin.sql ----------

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

-- ---------- 0008_cuentas.sql ----------

-- ============================================================
-- JULEX · cuentas de barbero
-- El administrador puede cambiar la contraseña, corregir el correo
-- y cortar el acceso sin borrar el local ni sus datos.
-- ============================================================

-- Lectura de administración sobre el equipo (sin exponer auth.users a nadie más).
drop policy if exists "admin: lectura total" on barberos;
create policy "admin: lectura total" on barberos
  for select to authenticated using (public.soy_admin());

-- Locales con los datos de su cuenta, para pintar el panel.
create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now())
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

create or replace function public.admin_cambiar_password(p_usuario uuid, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if length(trim(p_password)) < 6 then raise exception 'password_corta'; end if;
  if not exists (select 1 from barberos where id = p_usuario) then
    raise exception 'usuario_no_valido';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_usuario;
end;
$$;

create or replace function public.admin_cambiar_email(p_usuario uuid, p_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'email_invalido'; end if;
  if exists (select 1 from auth.users where email = v_email and id <> p_usuario) then
    raise exception 'email_en_uso';
  end if;
  if not exists (select 1 from barberos where id = p_usuario) then
    raise exception 'usuario_no_valido';
  end if;

  update auth.users set email = v_email, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where id = p_usuario;

  update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)),
         updated_at = now()
   where user_id = p_usuario;
end;
$$;

create or replace function public.admin_activar(p_usuario uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if not exists (select 1 from barberos where id = p_usuario) then
    raise exception 'usuario_no_valido';
  end if;
  update auth.users
     set banned_until = case when p_activo then null else now() + interval '100 years' end,
         updated_at = now()
   where id = p_usuario;
end;
$$;

revoke all on function public.admin_locales() from public;
revoke all on function public.admin_cambiar_password(uuid, text) from public;
revoke all on function public.admin_cambiar_email(uuid, text) from public;
revoke all on function public.admin_activar(uuid, boolean) from public;
grant execute on function public.admin_locales() to authenticated;
grant execute on function public.admin_cambiar_password(uuid, text) to authenticated;
grant execute on function public.admin_cambiar_email(uuid, text) to authenticated;
grant execute on function public.admin_activar(uuid, boolean) to authenticated;

-- ---------- 0009_automatico.sql ----------

-- ============================================================
-- JULEX · reparto automático
-- 1) Una cita que pide el cliente entra confirmada: no hay
--    «pendiente de confirmar» porque nadie tiene que confirmarla.
-- 2) La tarjeta del cliente enseña en qué silla está.
-- ============================================================

create or replace function public.solicitar_cita(
  p_slug      text,
  p_servicio  uuid,
  p_inicio    timestamptz,
  p_nombre    text,
  p_telefono  text,
  p_token     text default null,
  p_origen    origen_cita default 'web'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_cliente  uuid;
  v_servicio servicios%rowtype;
  v_codigo   text;
  v_cita     uuid;
  v_silla    uuid;
  v_fin      timestamptz;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then raise exception 'local_no_encontrado'; end if;

  select * into v_servicio
    from servicios
   where id = p_servicio and barberia_id = v_barberia and activo;
  if not found then raise exception 'servicio_no_valido'; end if;

  v_fin := p_inicio + make_interval(mins => v_servicio.minutos);

  perform pg_advisory_xact_lock(hashtext(v_barberia::text));

  v_silla := public.silla_libre(v_barberia, p_inicio, v_fin);
  if v_silla is null then raise exception 'horario_ocupado'; end if;

  if exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_barberia
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(p_inicio, v_fin, '[)')
  ) then
    raise exception 'horario_bloqueado';
  end if;

  if p_token is not null then
    select id into v_cliente from clientes
     where token_publico = p_token and barberia_id = v_barberia;
  end if;

  if v_cliente is null and length(trim(p_telefono)) >= 6 then
    select id into v_cliente from clientes
     where barberia_id = v_barberia and telefono = trim(p_telefono) limit 1;
  end if;

  if v_cliente is null then
    select 'P-' || lpad((coalesce(max(substring(codigo from 3)::int), 0) + 1)::text, 4, '0')
      into v_codigo from clientes where barberia_id = v_barberia;

    insert into clientes (barberia_id, codigo, nombre, telefono, cons_datos)
    values (v_barberia, v_codigo, trim(p_nombre), trim(p_telefono), true)
    returning id into v_cliente;
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen, silla_id)
  values (v_barberia, v_cliente, v_servicio.id, p_inicio, 'confirmada', p_origen, v_silla)
  returning id into v_cita;

  return v_cita;
end;
$$;

-- La tarjeta del cliente dice en qué silla está, si está en la cola.
create or replace function public.ficha_publica(p_token text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'local', json_build_object(
      'nombre', b.nombre, 'slug', b.slug, 'color', b.color, 'direccion', b.direccion,
      'telefono', b.telefono, 'logo_url', b.logo_url, 'fidelidad_meta', b.fidelidad_meta),
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
  from clientes c join barberias b on b.id = c.barberia_id
  where c.token_publico = p_token;
$$;

-- ---------- 0010_pin_tarjeta.sql ----------

-- ============================================================
-- JULEX · la tarjeta del cliente, protegida con un PIN
--
-- Opcional: una tarjeta sin fila en `clientes_pin` se abre como
-- siempre. Quien la quiera proteger pone un PIN de 4 a 6 cifras.
--
-- El PIN no se guarda: se guarda su hash (bcrypt de pgcrypto).
-- Cinco intentos fallidos la bloquean quince minutos. Sin ese
-- límite, un PIN de cuatro cifras se rompe por fuerza bruta desde
-- la consola del navegador en minutos, y entonces no protegería
-- de nada.
--
-- Lo que esto protege es el enlace: quien lo tenga sin el PIN no
-- ve ni el nombre, ni el teléfono, ni el historial.
-- ============================================================

create table if not exists clientes_pin (
  cliente_id      uuid primary key references clientes (id) on delete cascade,
  hash            text not null,
  fallos          integer not null default 0,
  bloqueado_hasta timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- RLS encendida y **sin políticas**, a propósito: ni el público ni el
-- barbero leen esta tabla. Solo la tocan las funciones `security definer`,
-- que se ejecutan como su dueño. El hash no viaja al navegador de nadie.
alter table clientes_pin enable row level security;
revoke all on clientes_pin from anon, authenticated;

-- ------------------------------------------------------------
-- La comprobación, en un solo sitio
-- ------------------------------------------------------------

-- Devuelve 'abierta' (sin PIN o PIN correcto), 'denegada' o 'bloqueada'.
-- No contar el intento cuando no se envía PIN es deliberado: abrir el
-- enlace sin escribir nada no es un intento de adivinarlo.
create or replace function public.pin_comprobar(p_cliente uuid, p_pin text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash   text;
  v_fallos integer;
  v_hasta  timestamptz;
begin
  select hash, fallos, bloqueado_hasta
    into v_hash, v_fallos, v_hasta
    from clientes_pin
   where cliente_id = p_cliente;

  if not found then
    return 'abierta';
  end if;

  if v_hasta is not null and v_hasta > now() then
    return 'bloqueada';
  end if;

  if p_pin is null then
    return 'denegada';
  end if;

  if v_hash = extensions.crypt(p_pin, v_hash) then
    update clientes_pin
       set fallos = 0, bloqueado_hasta = null, actualizado_en = now()
     where cliente_id = p_cliente;
    return 'abierta';
  end if;

  v_fallos := v_fallos + 1;
  if v_fallos >= 5 then
    update clientes_pin
       set fallos = 0, bloqueado_hasta = now() + interval '15 minutes', actualizado_en = now()
     where cliente_id = p_cliente;
    return 'bloqueada';
  end if;

  update clientes_pin
     set fallos = v_fallos, actualizado_en = now()
   where cliente_id = p_cliente;
  return 'denegada';
end;
$$;

revoke all on function public.pin_comprobar(uuid, text) from public;
revoke all on function public.pin_comprobar(uuid, text) from anon, authenticated;

-- ------------------------------------------------------------
-- La tarjeta, ahora con PIN
-- ------------------------------------------------------------

-- Al añadir un parámetro nace una función nueva: hay que tirar la vieja o
-- quedarían las dos, y la de antes seguiría abierta al público sin PIN.
drop function if exists public.ficha_publica(text);

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
      'telefono', b.telefono, 'logo_url', b.logo_url, 'fidelidad_meta', b.fidelidad_meta),
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

-- Las acciones de la tarjeta piden el mismo PIN. Sin él, false: no hay
-- datos, pero tampoco se puede tocar nada de esa tarjeta.

drop function if exists public.cancelar_cita(text, uuid);

create or replace function public.cancelar_cita(p_token text, p_cita uuid, p_pin text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then return false; end if;

  update citas
     set estado = 'cancelada'
   where id = p_cita
     and cliente_id = v_cliente
     and estado in ('pendiente', 'confirmada')
     and inicio > now() + interval '2 hours';

  return found;
end;
$$;

drop function if exists public.actualizar_mis_datos(text, text, text, boolean, boolean);

create or replace function public.actualizar_mis_datos(
  p_token        text,
  p_telefono     text default null,
  p_preferencias text default null,
  p_avisos       boolean default null,
  p_marketing    boolean default null,
  p_pin          text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then return false; end if;

  update clientes set
    telefono       = coalesce(nullif(trim(p_telefono), ''), telefono),
    preferencias   = coalesce(p_preferencias, preferencias),
    cons_avisos    = coalesce(p_avisos, cons_avisos),
    cons_marketing = coalesce(p_marketing, cons_marketing)
  where id = v_cliente;

  return true;
end;
$$;

drop function if exists public.solicitar_baja(text);

create or replace function public.solicitar_baja(p_token text, p_pin text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente  uuid;
  v_barberia uuid;
begin
  select id, barberia_id into v_cliente, v_barberia
    from clientes where token_publico = p_token;

  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then return false; end if;

  update clientes set cons_avisos = false, cons_marketing = false where id = v_cliente;

  insert into mensajes_log (barberia_id, cliente_id, tipo, canal, texto)
  values (v_barberia, v_cliente, 'confirmacion', 'whatsapp',
          'SOLICITUD DE BAJA recibida desde la tarjeta del cliente');

  return true;
end;
$$;

drop function if exists public.solicitar_cita(text, uuid, timestamptz, text, text, text, origen_cita);

create or replace function public.solicitar_cita(
  p_slug      text,
  p_servicio  uuid,
  p_inicio    timestamptz,
  p_nombre    text,
  p_telefono  text,
  p_token     text default null,
  p_origen    origen_cita default 'web',
  p_pin       text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_barberia uuid;
  v_cliente  uuid;
  v_servicio servicios%rowtype;
  v_codigo   text;
  v_cita     uuid;
  v_silla    uuid;
  v_fin      timestamptz;
begin
  select id into v_barberia from barberias where slug = p_slug and activo;
  if v_barberia is null then raise exception 'local_no_encontrado'; end if;

  -- Antes de tocar nada: si viene de una tarjeta protegida, el PIN manda.
  if p_token is not null then
    select id into v_cliente from clientes
     where token_publico = p_token and barberia_id = v_barberia;
    if v_cliente is not null and public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
      raise exception 'tarjeta_protegida';
    end if;
  end if;

  select * into v_servicio
    from servicios
   where id = p_servicio and barberia_id = v_barberia and activo;
  if not found then raise exception 'servicio_no_valido'; end if;

  v_fin := p_inicio + make_interval(mins => v_servicio.minutos);

  perform pg_advisory_xact_lock(hashtext(v_barberia::text));

  v_silla := public.silla_libre(v_barberia, p_inicio, v_fin);
  if v_silla is null then raise exception 'horario_ocupado'; end if;

  if exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_barberia
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(p_inicio, v_fin, '[)')
  ) then
    raise exception 'horario_bloqueado';
  end if;

  if v_cliente is null and p_token is not null then
    select id into v_cliente from clientes
     where token_publico = p_token and barberia_id = v_barberia;
  end if;

  if v_cliente is null and length(trim(p_telefono)) >= 6 then
    select id into v_cliente from clientes
     where barberia_id = v_barberia and telefono = trim(p_telefono) limit 1;
  end if;

  if v_cliente is null then
    select 'P-' || lpad((coalesce(max(substring(codigo from 3)::int), 0) + 1)::text, 4, '0')
      into v_codigo from clientes where barberia_id = v_barberia;

    insert into clientes (barberia_id, codigo, nombre, telefono, cons_datos)
    values (v_barberia, v_codigo, trim(p_nombre), trim(p_telefono), true)
    returning id into v_cliente;
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen, silla_id)
  values (v_barberia, v_cliente, v_servicio.id, p_inicio, 'confirmada', p_origen, v_silla)
  returning id into v_cita;

  return v_cita;
end;
$$;

-- ------------------------------------------------------------
-- Poner, cambiar y quitar el PIN
-- ------------------------------------------------------------

-- La primera vez basta con tener el enlace. Después, el PIN actual.
create or replace function public.pin_poner(
  p_token     text,
  p_pin_nuevo text,
  p_pin_actual text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  if p_pin_nuevo is null or p_pin_nuevo !~ '^[0-9]{4,6}$' then
    raise exception 'pin_invalido';
  end if;

  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin_actual) <> 'abierta' then return false; end if;

  insert into clientes_pin (cliente_id, hash)
  values (v_cliente, extensions.crypt(p_pin_nuevo, extensions.gen_salt('bf')))
  on conflict (cliente_id) do update
     set hash = excluded.hash, fallos = 0, bloqueado_hasta = null, actualizado_en = now();

  return true;
end;
$$;

create or replace function public.pin_quitar(p_token text, p_pin text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then return false; end if;

  delete from clientes_pin where cliente_id = v_cliente;
  return true;
end;
$$;

-- El barbero, desde la ficha: si el cliente olvida el PIN, se le quita y
-- vuelve a entrar con el enlace. No lo puede leer, solo borrarlo.
create or replace function public.pin_barbero_estado(p_cliente uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from clientes c
     where c.id = p_cliente
       and (c.barberia_id = public.mi_barberia() or public.soy_admin())
  ) then
    return false;
  end if;
  return exists (select 1 from clientes_pin where cliente_id = p_cliente);
end;
$$;

create or replace function public.pin_barbero_quitar(p_cliente uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from clientes c
     where c.id = p_cliente
       and (c.barberia_id = public.mi_barberia() or public.soy_admin())
  ) then
    return false;
  end if;

  delete from clientes_pin where cliente_id = p_cliente;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------

revoke all on function public.ficha_publica(text, text) from public;
revoke all on function public.cancelar_cita(text, uuid, text) from public;
revoke all on function public.actualizar_mis_datos(text, text, text, boolean, boolean, text) from public;
revoke all on function public.solicitar_baja(text, text) from public;
revoke all on function public.solicitar_cita(text, uuid, timestamptz, text, text, text, origen_cita, text) from public;
revoke all on function public.pin_poner(text, text, text) from public;
revoke all on function public.pin_quitar(text, text) from public;
revoke all on function public.pin_barbero_estado(uuid) from public;
revoke all on function public.pin_barbero_quitar(uuid) from public;

grant execute on function public.ficha_publica(text, text) to anon, authenticated;
grant execute on function public.cancelar_cita(text, uuid, text) to anon, authenticated;
grant execute on function public.actualizar_mis_datos(text, text, text, boolean, boolean, text) to anon, authenticated;
grant execute on function public.solicitar_baja(text, text) to anon, authenticated;
grant execute on function public.solicitar_cita(text, uuid, timestamptz, text, text, text, origen_cita, text) to anon, authenticated;
grant execute on function public.pin_poner(text, text, text) to anon, authenticated;
grant execute on function public.pin_quitar(text, text) to anon, authenticated;
grant execute on function public.pin_barbero_estado(uuid) to authenticated;
grant execute on function public.pin_barbero_quitar(uuid) to authenticated;

-- ---------- 0011_llavero_tarjeta.sql ----------

-- ============================================================
-- JULEX · el llavero abre dos puertas
--
-- El chip lleva una sola URL: /nfc/<token>. Quien la abre con la
-- sesión de la barbería ve la ficha; quien la abre sin sesión (el
-- móvil del propio cliente) acaba en su tarjeta.
--
-- Para eso hace falta una única puerta pública que traduzca el
-- token del llavero al de la tarjeta. Devuelve **solo eso**: un
-- texto opaco. Ni nombre, ni teléfono, ni historial; la tarjeta,
-- con su PIN si lo tiene, es la que decide qué se enseña después.
-- ============================================================

create or replace function public.llavero_tarjeta(p_token text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.token_publico
    from llaveros l
    join clientes c on c.id = l.cliente_id
   where l.token = p_token
     and l.estado = 'activo';
$$;

-- Un llavero en blanco, retirado o inventado devuelve null: la app
-- enseña la pantalla neutra y no distingue entre esos casos.
revoke all on function public.llavero_tarjeta(text) from public;
grant execute on function public.llavero_tarjeta(text) to anon, authenticated;

-- ---------- 0012_tipo_negocio.sql ----------

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

-- ---------- 0013_cumplimiento.sql ----------

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

-- ---------- 0014_cobro.sql ----------

-- ============================================================
-- JULEX · cobro
--
-- Una escalera, no un apagón:
--
--   al_dia     → todo funciona
--   pendiente  → venció hace menos de 8 días: aviso, todo sigue
--   lectura    → hasta 15 días: el local no puede escribir, sus
--                clientes sí (reservar y tocar su tarjeta)
--   suspendido → más de 15 días: no entra, sus páginas públicas
--                desaparecen y sus llaveros dejan de abrir
--
-- El llavero no se retira: se marca `suspendido` y vuelve cuando
-- pagan, porque retirar es irreversible.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estado del cobro en el local
-- ------------------------------------------------------------

alter table barberias
  add column if not exists proximo_pago       date,
  add column if not exists estado_cobro       text not null default 'al_dia',
  add column if not exists suspension_manual  boolean not null default false,
  add column if not exists suspendido_en      timestamptz,
  add column if not exists nota_cobro         text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'barberias_estado_cobro_chk') then
    alter table barberias
      add constraint barberias_estado_cobro_chk
      check (estado_cobro in ('al_dia', 'pendiente', 'lectura', 'suspendido'));
  end if;
end $$;

alter table llaveros
  add column if not exists suspendido boolean not null default false;

-- ------------------------------------------------------------
-- 2. Efectos y su reverso
-- ------------------------------------------------------------

create or replace function public.suspender_efectos(p_local uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('julex.escritura', 'si', true);
  update llaveros set suspendido = true where barberia_id = p_local and not suspendido;
  update auth.users set banned_until = now() + interval '100 years', updated_at = now()
   where id in (select id from barberos where barberia_id = p_local);
end;
$$;

create or replace function public.reactivar_efectos(p_local uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('julex.escritura', 'si', true);
  update llaveros set suspendido = false where barberia_id = p_local and suspendido;
  update auth.users set banned_until = null, updated_at = now()
   where id in (select id from barberos where barberia_id = p_local);
end;
$$;

-- ------------------------------------------------------------
-- 3. El interruptor del administrador
-- ------------------------------------------------------------

create or replace function public.marcar_pagado(p_local uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base date;
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;

  select coalesce(proximo_pago, current_date) into v_base from barberias where id = p_local;
  if v_base is null then return false; end if;

  update barberias set
    proximo_pago      = greatest(v_base, current_date) + interval '1 month',
    estado_cobro      = 'al_dia',
    suspension_manual = false,
    suspendido_en     = null,
    activo            = true,
    nota_cobro        = 'Pagado el ' || to_char(current_date, 'DD/MM/YYYY')
  where id = p_local;

  perform public.reactivar_efectos(p_local);
  return true;
end;
$$;

create or replace function public.suspender_local(p_local uuid, p_nota text default '')
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if not exists (select 1 from barberias where id = p_local) then return false; end if;

  update barberias set
    estado_cobro      = 'suspendido',
    suspension_manual = true,
    suspendido_en     = coalesce(suspendido_en, now()),
    activo            = false,
    nota_cobro        = coalesce(nullif(trim(p_nota), ''), 'Suspendido a mano')
  where id = p_local;

  perform public.suspender_efectos(p_local);
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 4. El barrido diario
-- ------------------------------------------------------------

create or replace function public.revisar_cobros()
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r        record;
  v_dias   int;
  v_estado text;
  v_cambio int := 0;
begin
  -- Si hay una sesión y no es del administrador, no.
  if auth.uid() is not null and not public.soy_admin() then
    raise exception 'solo_admin';
  end if;

  perform set_config('julex.escritura', 'si', true);

  for r in
    select id, proximo_pago, estado_cobro, suspension_manual
      from barberias
     where proximo_pago is not null
  loop
    if r.suspension_manual then
      continue;
    end if;

    v_dias := current_date - r.proximo_pago;
    v_estado := case
                  when v_dias <= 0  then 'al_dia'
                  when v_dias <= 7  then 'pendiente'
                  when v_dias <= 15 then 'lectura'
                  else 'suspendido'
                end;

    if v_estado = r.estado_cobro then
      continue;
    end if;

    update barberias set
      estado_cobro  = v_estado,
      activo        = (v_estado <> 'suspendido'),
      suspendido_en = case when v_estado = 'suspendido'
                           then coalesce(suspendido_en, now()) else null end
    where id = r.id;

    if v_estado = 'suspendido' then
      perform public.suspender_efectos(r.id);
    elsif v_estado in ('al_dia', 'pendiente') then
      perform public.reactivar_efectos(r.id);
    end if;

    v_cambio := v_cambio + 1;
  end loop;

  return json_build_object('cambiados', v_cambio);
end;
$$;

-- ------------------------------------------------------------
-- 5. Solo lectura: el local no escribe, su cliente sí
-- ------------------------------------------------------------

create or replace function public.exigir_cobro_al_dia()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_local uuid;
  v_fila  record;
begin
  if tg_op = 'DELETE' then
    v_fila := old;
  else
    v_fila := new;
  end if;

  -- Funciones que tienen que escribir aunque el local esté en lectura
  -- (derechos del cliente, cobro, administración). Va primero: son las
  -- que aplican las propias transiciones.
  if current_setting('julex.escritura', true) = 'si' then
    return v_fila;
  end if;

  -- Cliente anónimo: reservar o tocar su tarjeta no se le corta,
  -- salvo que el local esté suspendido (ahí ya no hay negocio abierto).
  if auth.uid() is null then
    if v_fila.barberia_id is not null and exists (
      select 1 from barberias
       where id = v_fila.barberia_id and estado_cobro = 'suspendido'
    ) then
      raise exception 'local_suspendido';
    end if;
    return v_fila;
  end if;

  v_local := v_fila.barberia_id;
  if v_local is null then
    return v_fila;
  end if;

  if exists (
    select 1 from barberias
     where id = v_local and estado_cobro in ('lectura', 'suspendido')
  ) then
    raise exception 'local_en_solo_lectura'
      using hint = 'El local tiene la cuota pendiente: solo lectura.';
  end if;

  return v_fila;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'servicios', 'sillas', 'horarios', 'bloqueos_agenda', 'clientes', 'llaveros',
    'citas', 'cola', 'visitas', 'movimientos_fidelizacion', 'recompensas',
    'mensajes_log', 'eventos', 'solicitudes_baja'
  ]
  loop
    execute format('drop trigger if exists cobro_al_dia on public.%I', t);
    execute format(
      'create trigger cobro_al_dia before insert or update or delete on public.%I
       for each row execute function public.exigir_cobro_al_dia()', t);
  end loop;
end $$;

-- Las funciones con derechos del cliente y las de cobro abren la puerta
-- desde dentro.
create or replace function public.abrir_escritura()
returns void language sql set search_path = public, pg_temp as $$
  select set_config('julex.escritura', 'si', true);
$$;

-- La resolución de una baja es una obligación legal del local: se le deja
-- escribir aunque esté en solo lectura.
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

  perform public.abrir_escritura();

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
-- 6. Lo público y el panel del administrador
-- ------------------------------------------------------------

create or replace function public.llavero_tarjeta(p_token text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select c.token_publico
    from llaveros l
    join clientes c on c.id = l.cliente_id
   where l.token = p_token
     and l.estado = 'activo'
     and not l.suspendido
     and c.privacidad = 'activo';
$$;

create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'tipo', b.tipo,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now()),
           'estado_cobro', b.estado_cobro,
           'proximo_pago', b.proximo_pago,
           'nota_cobro', b.nota_cobro,
           'suspension_manual', b.suspension_manual
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

-- La tarjeta de un local suspendido no se abre.
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
  where c.id = v_cliente and b.activo;

  return v_ficha;
end;
$$;

-- ------------------------------------------------------------
-- 7. Barrido automático, si el plan deja usar pg_cron
-- ------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('revisar-cobros', '0 6 * * *', 'select public.revisar_cobros()');
exception
  when others then
    raise notice 'pg_cron no disponible: el barrido se lanza a mano desde el panel';
end $$;

-- ------------------------------------------------------------
-- 8. Permisos
-- ------------------------------------------------------------

revoke all on function public.marcar_pagado(uuid) from public;
revoke all on function public.suspender_local(uuid, text) from public;
revoke all on function public.revisar_cobros() from public;
revoke all on function public.suspender_efectos(uuid) from public;
revoke all on function public.reactivar_efectos(uuid) from public;
revoke all on function public.abrir_escritura() from public;
revoke all on function public.exigir_cobro_al_dia() from public;
revoke all on function public.admin_locales() from public;
revoke all on function public.llavero_tarjeta(text) from public;

grant execute on function public.marcar_pagado(uuid) to authenticated;
grant execute on function public.suspender_local(uuid, text) to authenticated;
grant execute on function public.revisar_cobros() to authenticated;
grant execute on function public.admin_locales() to authenticated;
grant execute on function public.llavero_tarjeta(text) to anon, authenticated;

-- ---------- 0015_tope_cuota.sql ----------

-- ============================================================
-- JULEX · precio con tope
--
-- La cuota mensual sube con los llaveros activos hasta 40 €/mes.
-- A partir del llavero 41, cada uno cuesta 1 € UNA SOLA VEZ: no
-- vuelve a subir la cuota.
--
--   activos   cuota/mes   pago único
--        15         15 €   —
--        30         30 €   —
--        40         40 €   —
--        50         40 €   10 €
--       100         40 €   60 €
-- ============================================================

-- ------------------------------------------------------------
-- 1. El límite, en un solo sitio
-- ------------------------------------------------------------

create or replace function public.llaveros_incluidos()
returns int language sql immutable as $$
  select 40;
$$;

create or replace function public.precio_llavero_extra()
returns numeric language sql immutable as $$
  select 1::numeric;
$$;

-- ------------------------------------------------------------
-- 2. Cargos únicos por llavero
-- ------------------------------------------------------------

create table if not exists cargos_llavero (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  llavero_id  uuid references llaveros (id) on delete set null,
  importe     numeric(8, 2) not null default 1,
  creado_en   timestamptz not null default now(),
  cobrado_en  timestamptz,
  nota        text not null default ''
);

create index if not exists cargos_llavero_local_idx
  on cargos_llavero (barberia_id, creado_en desc);

-- Un llavero se cobra una vez y no se repite, aunque se desvincule y vuelva.
create unique index if not exists cargos_llavero_unico_idx
  on cargos_llavero (llavero_id)
  where llavero_id is not null;

alter table cargos_llavero enable row level security;

drop policy if exists "su local lo ve" on cargos_llavero;
create policy "su local lo ve" on cargos_llavero
  for select to authenticated
  using (barberia_id = public.mi_barberia() or public.soy_admin());

drop policy if exists "solo el admin escribe" on cargos_llavero;
create policy "solo el admin escribe" on cargos_llavero
  for all to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- Al activar un llavero, si el local ya tiene los incluidos, se apunta
-- el euro. Va antes de la fila para no cobrar dos veces el mismo.
create or replace function public.apuntar_cargo_llavero()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_activos int;
begin
  if new.estado <> 'activo' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'activo' then
    return new;
  end if;

  select count(*) into v_activos
    from llaveros
   where barberia_id = new.barberia_id
     and estado = 'activo'
     and id <> new.id;

  if v_activos >= public.llaveros_incluidos() then
    insert into cargos_llavero (barberia_id, llavero_id, importe, nota)
    values (new.barberia_id, new.id, public.precio_llavero_extra(),
            'Llavero por encima de los incluidos')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- AFTER: el cargo referencia al llavero, que tiene que existir ya.
drop trigger if exists cargo_llavero on llaveros;
create trigger cargo_llavero
  after insert or update of estado on llaveros
  for each row execute function public.apuntar_cargo_llavero();

-- ------------------------------------------------------------
-- 3. Cobrar el material
-- ------------------------------------------------------------

create or replace function public.marcar_material_cobrado(p_local uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;

  with tocados as (
    update cargos_llavero set cobrado_en = now()
     where barberia_id = p_local and cobrado_en is null
     returning 1
  )
  select count(*) into v_n from tocados;

  return coalesce(v_n, 0);
end;
$$;

-- ------------------------------------------------------------
-- 4. El panel del administrador ve la deuda de material
-- ------------------------------------------------------------

create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'tipo', b.tipo,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now()),
           'estado_cobro', b.estado_cobro,
           'proximo_pago', b.proximo_pago,
           'nota_cobro', b.nota_cobro,
           'suspension_manual', b.suspension_manual,
           'material_pendiente', coalesce((
             select sum(c.importe) from cargos_llavero c
              where c.barberia_id = b.id and c.cobrado_en is null), 0),
           'material_llaveros', coalesce((
             select count(*) from cargos_llavero c
              where c.barberia_id = b.id and c.cobrado_en is null), 0)
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

-- ------------------------------------------------------------
-- 5. Permisos
-- ------------------------------------------------------------

revoke all on function public.llaveros_incluidos() from public;
revoke all on function public.precio_llavero_extra() from public;
revoke all on function public.marcar_material_cobrado(uuid) from public;
revoke all on function public.apuntar_cargo_llavero() from public;
revoke all on function public.admin_locales() from public;

grant execute on function public.llaveros_incluidos() to anon, authenticated;
grant execute on function public.precio_llavero_extra() to anon, authenticated;
grant execute on function public.marcar_material_cobrado(uuid) to authenticated;
grant execute on function public.admin_locales() to authenticated;

-- ---------- 0016_peticiones.sql ----------

-- ============================================================
-- JULEX · peticiones del local al administrador
--
-- Un cliente lleva 60 días sin venir y el local quiere soltar su
-- llavero. El local no puede retirarlo solo: manda una petición y
-- el administrador decide. Queda registrada y sin duplicados.
-- ============================================================

create table if not exists peticiones_admin (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid not null references clientes (id) on delete cascade,
  tipo        text not null default 'baja_llavero',
  estado      text not null default 'pendiente',
  nota        text not null default '',
  creada_en   timestamptz not null default now(),
  resuelta_en timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_estado_chk') then
    alter table peticiones_admin
      add constraint peticiones_estado_chk
      check (estado in ('pendiente', 'resuelta', 'descartada'));
  end if;
end $$;

-- Una sola petición abierta por cliente y tipo.
create unique index if not exists peticiones_pendiente_idx
  on peticiones_admin (cliente_id, tipo)
  where estado = 'pendiente';

create index if not exists peticiones_local_idx
  on peticiones_admin (barberia_id, creada_en desc);

alter table peticiones_admin enable row level security;

drop policy if exists "su local la ve" on peticiones_admin;
create policy "su local la ve" on peticiones_admin
  for select to authenticated
  using (barberia_id = public.mi_barberia() or public.soy_admin());

drop policy if exists "solo el admin resuelve" on peticiones_admin;
create policy "solo el admin resuelve" on peticiones_admin
  for update to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- ------------------------------------------------------------
-- El local pide la baja
-- ------------------------------------------------------------

create or replace function public.peticion_baja_cliente(p_cliente uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local uuid;
begin
  select barberia_id into v_local from clientes where id = p_cliente;
  if v_local is null then return false; end if;
  if v_local <> public.mi_barberia() then return false; end if;

  insert into peticiones_admin (barberia_id, cliente_id, tipo)
  values (v_local, p_cliente, 'baja_llavero')
  on conflict do nothing;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- El administrador resuelve
-- ------------------------------------------------------------

create or replace function public.resolver_peticion_admin(
  p_id     uuid,
  p_accion text,
  p_nota   text default ''
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
  v_local   uuid;
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if p_accion not in ('retirar', 'descartar') then
    raise exception 'accion_invalida';
  end if;

  select cliente_id, barberia_id into v_cliente, v_local
    from peticiones_admin where id = p_id;

  if v_cliente is null then return false; end if;

  if p_accion = 'retirar' then
    update llaveros set estado = 'retirado', retirado_en = now()
     where cliente_id = v_cliente and estado <> 'retirado';

    insert into mensajes_log (barberia_id, cliente_id, tipo, canal, texto)
    values (v_local, v_cliente, 'confirmacion', 'whatsapp',
            'PETICIÓN ATENDIDA: llavero retirado a petición del local');
  end if;

  update peticiones_admin set
    estado = case when p_accion = 'retirar' then 'resuelta' else 'descartada' end,
    resuelta_en = now(),
    nota = coalesce(p_nota, '')
  where id = p_id;

  return true;
end;
$$;

revoke all on function public.peticion_baja_cliente(uuid) from public;
revoke all on function public.resolver_peticion_admin(uuid, text, text) from public;

grant execute on function public.peticion_baja_cliente(uuid) to authenticated;
grant execute on function public.resolver_peticion_admin(uuid, text, text) to authenticated;

-- ---------- 0017_suscripciones_pedidos.sql ----------

-- ============================================================
-- JULEX · suscripciones y pedidos de llaveros
--
-- El cobro automático vive en Stripe; aquí se guarda el estado
-- que la app necesita leer sin preguntar a Stripe en cada carga.
--
-- Los pedidos de llaveros van de 5 en 5 y los gestiona el local;
-- el administrador los marca como enviados y entregados.
-- ============================================================

create table if not exists suscripciones (
  barberia_id           uuid primary key references barberias (id) on delete cascade,
  stripe_customer_id    text,
  stripe_subscription_id text,
  estado                text not null default 'sin_activar',
  cantidad              int not null default 0,
  periodo_fin           timestamptz,
  pausa_hasta           date,
  actualizado_en        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suscripciones_estado_chk') then
    alter table suscripciones
      add constraint suscripciones_estado_chk
      check (estado in ('sin_activar', 'activa', 'pausada', 'impagada', 'cancelada'));
  end if;
end $$;

alter table suscripciones enable row level security;

drop policy if exists "su local la ve" on suscripciones;
create policy "su local la ve" on suscripciones
  for select to authenticated
  using (barberia_id = public.mi_barberia() or public.soy_admin());

drop policy if exists "solo el admin la toca" on suscripciones;
create policy "solo el admin la toca" on suscripciones
  for all to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- ------------------------------------------------------------
-- Pedidos de llaveros
-- ------------------------------------------------------------

create table if not exists pedidos_llavero (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references barberias (id) on delete cascade,
  cantidad     int not null,
  estado       text not null default 'pedido',
  nota         text not null default '',
  creado_en    timestamptz not null default now(),
  enviado_en   timestamptz,
  entregado_en timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_llavero_cantidad_chk') then
    alter table pedidos_llavero
      add constraint pedidos_llavero_cantidad_chk check (cantidad >= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_llavero_estado_chk') then
    alter table pedidos_llavero
      add constraint pedidos_llavero_estado_chk
      check (estado in ('pedido', 'enviado', 'entregado', 'cancelado'));
  end if;
end $$;

create index if not exists pedidos_llavero_local_idx
  on pedidos_llavero (barberia_id, creado_en desc);

alter table pedidos_llavero enable row level security;

drop policy if exists "su local los ve" on pedidos_llavero;
create policy "su local los ve" on pedidos_llavero
  for select to authenticated
  using (barberia_id = public.mi_barberia() or public.soy_admin());

drop policy if exists "su local los pide" on pedidos_llavero;
create policy "su local los pide" on pedidos_llavero
  for insert to authenticated
  with check (barberia_id = public.mi_barberia() and cantidad >= 5);

drop policy if exists "solo el admin los mueve" on pedidos_llavero;
create policy "solo el admin los mueve" on pedidos_llavero
  for update to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- ------------------------------------------------------------
-- Funciones
-- ------------------------------------------------------------

/** El local pide llaveros: de 5 en 5 y con el precio ya calculado. */
create or replace function public.pedir_llaveros(p_cantidad int)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local    uuid := public.mi_barberia();
  v_activos  int;
  v_id       uuid;
  v_extra    int;   -- llaveros que se cobran a 1 € una sola vez (material)
  v_cuota    numeric;
begin
  if v_local is null then return null; end if;
  if p_cantidad < 5 then raise exception 'minimo_cinco'; end if;

  select count(*) into v_activos
    from llaveros where barberia_id = v_local and estado = 'activo';

  -- El material se paga por cada llavero nuevo: el alta ya incluyó 15.
  v_extra  := p_cantidad;

  -- Cuota resultante si se activan todos los que quepan en el tope.
  v_cuota := least(
    public.llaveros_incluidos(),
    greatest(15, v_activos + p_cantidad)
  );

  insert into pedidos_llavero (barberia_id, cantidad, nota)
  values (v_local, p_cantidad, '')
  returning id into v_id;

  return json_build_object(
    'id', v_id,
    'cantidad', p_cantidad,
    'activos', v_activos,
    'cuota', v_cuota,
    'extras', v_extra,
    'importe_extra', v_extra * public.precio_llavero_extra()
  );
end;
$$;

/** El administrador mueve el pedido. */
create or replace function public.mover_pedido(p_id uuid, p_estado text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if p_estado not in ('enviado', 'entregado', 'cancelado') then
    raise exception 'estado_invalido';
  end if;

  update pedidos_llavero set
    estado = p_estado,
    enviado_en = case when p_estado = 'enviado' then coalesce(enviado_en, now()) else enviado_en end,
    entregado_en = case when p_estado = 'entregado' then now() else entregado_en end
  where id = p_id;

  return true;
end;
$$;

revoke all on function public.pedir_llaveros(int) from public;
revoke all on function public.mover_pedido(uuid, text) from public;

grant execute on function public.pedir_llaveros(int) to authenticated;
grant execute on function public.mover_pedido(uuid, text) to authenticated;

-- ---------- 0018_alta_publica.sql ----------

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

-- ---------- 0019_admin_envio.sql ----------

-- JULEX · el panel del administrador ve dónde se envía

create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'tipo', b.tipo,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now()),
           'estado_cobro', b.estado_cobro,
           'proximo_pago', b.proximo_pago,
           'nota_cobro', b.nota_cobro,
           'suspension_manual', b.suspension_manual,
           'material_pendiente', coalesce((
             select sum(c.importe) from cargos_llavero c
              where c.barberia_id = b.id and c.cobrado_en is null), 0),
           'material_llaveros', coalesce((
             select count(*) from cargos_llavero c
              where c.barberia_id = b.id and c.cobrado_en is null), 0),
           'direccion_envio', b.direccion_envio,
           'cp_envio', b.cp_envio,
           'ciudad_envio', b.ciudad_envio,
           'provincia_envio', b.provincia_envio,
           'telefono_contacto', b.telefono_contacto
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

revoke all on function public.admin_locales() from public;
grant execute on function public.admin_locales() to authenticated;

-- ---------- 0020_llavero_extra.sql ----------

-- ============================================================
-- JULEX · el llavero extra se cobra desde el 16.º
--
-- El alta incluye 15 llaveros. A partir de ahí, cada llavero que
-- se da de alta cuesta 1 € UNA VEZ (el material), aparte de su
-- euro mensual mientras esté activo.
--
-- Antes se cobraba solo a partir del 41, que era un error.
--
-- Se hace por sentencia y no por fila: en un alta se insertan 15 o
-- 30 llaveros de golpe, y un disparador por fila los ve todos ya
-- insertados, así que cobraba de más. El recuento por `row_number`
-- sobre el total del local es exacto e idempotente.
-- ============================================================

create or replace function public.llaveros_incluidos_alta()
returns int language sql immutable as $$
  select 15;
$$;

create or replace function public.reconciliar_cargos_llaveros()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into cargos_llavero (barberia_id, llavero_id, importe, nota)
  select t.barberia_id, t.id, public.precio_llavero_extra(),
         'Llavero adicional a los 15 del alta'
    from (
      select l.id, l.barberia_id,
             row_number() over (partition by l.barberia_id order by l.creado_en, l.id) as rn
        from llaveros l
    ) t
   where t.rn > public.llaveros_incluidos_alta()
     and not exists (select 1 from cargos_llavero c where c.llavero_id = t.id)
  on conflict do nothing;
end;
$$;

create or replace function public.cargo_llaveros_por_sentencia()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.reconciliar_cargos_llaveros();
  return null;
end;
$$;

drop trigger if exists cargo_llavero on llaveros;
drop trigger if exists cargo_llaveros_stmt on llaveros;

create trigger cargo_llaveros_stmt
  after insert on llaveros
  for each statement execute function public.cargo_llaveros_por_sentencia();

revoke all on function public.llaveros_incluidos_alta() from public;
revoke all on function public.reconciliar_cargos_llaveros() from public;
revoke all on function public.cargo_llaveros_por_sentencia() from public;

grant execute on function public.llaveros_incluidos_alta() to anon, authenticated;

-- ---------- 0021_admin_lectura.sql ----------

-- JULEX · el administrador puede leer el historial de un local
--
-- Hacía falta para poder exportar los datos de un local desde su ficha:
-- visitas, recompensas y movimientos no estaban en la lista de lectura
-- del administrador. Solo lectura; para escribir están las funciones.

do $$
declare t text;
begin
  foreach t in array array['visitas', 'recompensas', 'movimientos_fidelizacion']
  loop
    execute format(
      'drop policy if exists "admin: lectura total" on %I;
       create policy "admin: lectura total" on %I
         for select to authenticated using (public.soy_admin());', t, t);
  end loop;
end $$;

-- ---------- 0022_aviso_alta.sql ----------

-- ============================================================
-- JULEX · el alta deja un aviso de envío
--
-- Antes, el alta creaba los llaveros y no dejaba rastro para el
-- administrador: un negocio se daba de alta solo y nadie sabía que
-- había que enviarle nada. Ahora cada alta abre un pedido pendiente
-- que solo desaparece al marcarlo como enviado o cancelado.
-- ============================================================

alter table pedidos_llavero
  add column if not exists origen text not null default 'reposicion';

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

  -- El alta deja el envío pendiente: el administrador lo ve como aviso
  -- hasta que lo marca como enviado o lo cancela.
  insert into pedidos_llavero (barberia_id, cantidad, nota, origen)
  values (v_barberia, v_llaveros, 'Alta: ' || v_llaveros || ' llaveros', 'alta');

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

-- ---------- 0023_resenas.sql ----------

-- ============================================================
-- JULEX · reseñas de Google
--
-- Dos horas después de cerrar un servicio, el cliente entra en la
-- cola de reseñas del local. El mensaje no se envía solo: JULEX no
-- tiene proveedor de mensajería, así que en el panel aparece como
-- pendiente y se manda desde el móvil del negocio con un toque.
-- ============================================================

alter table barberias
  add column if not exists google_resena_url text not null default '';

create table if not exists resenas (
  id               uuid primary key default gen_random_uuid(),
  barberia_id      uuid not null references barberias (id) on delete cascade,
  cliente_id       uuid not null references clientes (id) on delete cascade,
  visita_id        uuid references visitas (id) on delete set null,
  programada_para  timestamptz not null default now() + interval '2 hours',
  estado           text not null default 'pendiente',
  canal            text,
  enviada_en       timestamptz,
  creada_en        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resenas_estado_chk') then
    alter table resenas
      add constraint resenas_estado_chk
      check (estado in ('pendiente', 'enviada', 'descartada'));
  end if;
end $$;

create index if not exists resenas_local_idx
  on resenas (barberia_id, programada_para desc);

alter table resenas enable row level security;

drop policy if exists "su local las ve" on resenas;
create policy "su local las ve" on resenas
  for select to authenticated
  using (barberia_id = public.mi_barberia() or public.soy_admin());

drop policy if exists "su local las mueve" on resenas;
create policy "su local las mueve" on resenas
  for update to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

-- ------------------------------------------------------------
-- Al cerrar un servicio, se programa la reseña
-- ------------------------------------------------------------

create or replace function public.programar_resena(
  p_barberia uuid,
  p_cliente  uuid,
  p_visita   uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into resenas (barberia_id, cliente_id, visita_id)
  values (p_barberia, p_cliente, p_visita);
end;
$$;

revoke all on function public.programar_resena(uuid, uuid, uuid) from public;
grant execute on function public.programar_resena(uuid, uuid, uuid) to authenticated;

-- `atender_cola` es la que cierra el servicio: ahí se engancha.
-- Se recrea entera para añadir la llamada.
create or replace function public.atender_cola(p_cola_id uuid, p_servicio_id uuid default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cola     cola%rowtype;
  v_servicio servicios%rowtype;
  v_barberia barberias%rowtype;
  v_ahora    timestamptz := now();
  v_cortes   int;
  v_ganada   boolean := false;
  v_cita     uuid;
  v_visita   uuid;
begin
  select * into v_cola
    from cola where id = p_cola_id and barberia_id = public.mi_barberia();

  if not found then raise exception 'cola_no_encontrada'; end if;
  if v_cola.estado <> 'sillon' then raise exception 'no_esta_en_sillon'; end if;

  select * into v_servicio
    from servicios
   where id = coalesce(p_servicio_id, v_cola.servicio_id)
     and barberia_id = v_cola.barberia_id;

  if not found then raise exception 'servicio_no_valido'; end if;

  select * into v_barberia from barberias where id = v_cola.barberia_id;

  update cola
     set estado = 'terminado', fin_en = v_ahora, servicio_id = v_servicio.id
   where id = v_cola.id;

  insert into visitas (barberia_id, cliente_id, servicio_id, fecha, precio, pagado)
  values (v_cola.barberia_id, v_cola.cliente_id, v_servicio.id, v_ahora, v_servicio.precio, true)
  returning id into v_visita;

  insert into movimientos_fidelizacion (barberia_id, cliente_id, tipo, fecha, nota)
  values (v_cola.barberia_id, v_cola.cliente_id, 'corte', v_ahora, v_servicio.nombre);

  select count(*) into v_cortes from visitas where cliente_id = v_cola.cliente_id;

  v_ganada := (v_cortes % v_barberia.fidelidad_meta) = 0;

  if v_ganada then
    insert into recompensas (barberia_id, cliente_id)
    values (v_cola.barberia_id, v_cola.cliente_id);

    insert into movimientos_fidelizacion (barberia_id, cliente_id, tipo, fecha, nota)
    values (v_cola.barberia_id, v_cola.cliente_id, 'recompensa_ganada', v_ahora,
            'Corte gratis nº ' || (v_cortes / v_barberia.fidelidad_meta));

    insert into eventos (barberia_id, cliente_id, tipo, meta)
    values (v_cola.barberia_id, v_cola.cliente_id, 'recompensa_obtenida',
            jsonb_build_object('corte', v_cortes));
  end if;

  -- La reseña, dos horas después.
  perform public.programar_resena(v_cola.barberia_id, v_cola.cliente_id, v_visita);

  select id into v_cita
    from citas
   where cliente_id = v_cola.cliente_id
     and barberia_id = v_cola.barberia_id
     and estado in ('pendiente', 'confirmada')
     and inicio::date = current_date
   order by inicio
   limit 1;

  if v_cita is not null then
    update citas set estado = 'atendida' where id = v_cita;
  end if;

  insert into eventos (barberia_id, cliente_id, tipo, meta)
  values (v_cola.barberia_id, v_cola.cliente_id, 'servicio_terminado',
          jsonb_build_object('servicio', v_servicio.nombre, 'precio', v_servicio.precio));

  return json_build_object(
    'cortesTotales', v_cortes,
    'recompensaGanada', v_ganada,
    'servicio', v_servicio.nombre,
    'precio', v_servicio.precio
  );
end;
$$;
