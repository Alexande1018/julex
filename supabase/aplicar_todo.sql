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
--
-- El enum nace con los diez oficios para que `aplicar_todo.sql` se
-- pueda pegar de una vez en un proyecto nuevo. Los valores que se
-- añadieron después de la primera puesta en marcha llevan además su
-- `alter type` en `0041_tipos_negocio.sql`, que es lo que se aplica
-- sobre una base que ya existe.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_negocio') then
    create type tipo_negocio as enum (
      'barberia', 'peluqueria', 'unas', 'tatuaje',
      'estetica', 'depilacion', 'canina', 'masaje', 'auto', 'otro'
    );
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

-- ---------- 0024_asistente.sql ----------

-- ============================================================
-- JULEX · asistente del llavero (1/2): datos
--
-- El recuadro que aparece al tocar el llavero guarda aquí su
-- configuración, sus conversaciones y las propuestas de ficha que
-- el cliente deja al barbero.
--
-- Nada de esto lo lee el navegador: el público solo entra por
-- funciones security definer, como en el resto del esquema.
-- ============================================================

-- Una cita pedida hablando se distingue de las demás en la agenda,
-- en el panel y en las métricas.
alter type origen_cita add value if not exists 'asistente';

-- ---------- configuración del asistente ----------
-- No nace con el local: si no hay fila, se usan los valores por
-- defecto (sin nombre propio, tono cercano, encendido). El barbero
-- la crea o la edita desde Ajustes.
create table asistente_config (
  barberia_id    uuid primary key references barberias (id) on delete cascade,
  nombre         text not null default '' check (length(nombre) <= 40),
  tono           text not null default 'cercano' check (tono in ('cercano','formal','divertido')),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------- conversaciones ----------
-- coste y tokens se guardan desde el primer turno: la factura de la
-- IA se mide, no se estima.
create table asistente_conversacion (
  id             uuid primary key default gen_random_uuid(),
  barberia_id    uuid not null references barberias (id) on delete cascade,
  cliente_id     uuid not null references clientes (id) on delete cascade,
  canal          text not null default 'llavero' check (canal in ('llavero','enlace')),
  estado         text not null default 'abierta' check (estado in ('abierta','cerrada','derivada')),
  resultado      text check (resultado in ('cita','ficha','consulta','ninguno')),
  tokens_entrada int not null default 0 check (tokens_entrada >= 0),
  tokens_salida  int not null default 0 check (tokens_salida >= 0),
  coste          numeric(10,6) not null default 0 check (coste >= 0),
  abierta_en     timestamptz not null default now(),
  cerrada_en     timestamptz
);
create index asistente_conversacion_local on asistente_conversacion (barberia_id, abierta_en desc);
create index asistente_conversacion_cliente on asistente_conversacion (cliente_id, abierta_en desc);

create table asistente_mensaje (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references asistente_conversacion (id) on delete cascade,
  papel           text not null check (papel in ('cliente','asistente','sistema')),
  texto           text not null check (length(texto) between 1 and 4000),
  tokens          int not null default 0 check (tokens >= 0),
  creado_en       timestamptz not null default now()
);
create index asistente_mensaje_conversacion on asistente_mensaje (conversacion_id, creado_en);

-- ---------- propuestas de ficha ----------
-- El cliente no escribe en su ficha: propone. El barbero acepta o
-- descarta. Se guardan sus palabras exactas y el resumen.
create table ficha_propuesta (
  id              uuid primary key default gen_random_uuid(),
  barberia_id     uuid not null references barberias (id) on delete cascade,
  cliente_id      uuid not null references clientes (id) on delete cascade,
  conversacion_id uuid references asistente_conversacion (id) on delete set null,
  como_corta      text not null default '' check (length(como_corta) <= 600),
  preferencias    text not null default '' check (length(preferencias) <= 400),
  texto_original  text not null default '' check (length(texto_original) <= 1200),
  estado          text not null default 'pendiente' check (estado in ('pendiente','aceptada','descartada')),
  creada_en       timestamptz not null default now(),
  resuelta_en     timestamptz,
  -- una propuesta resuelta siempre dice cuándo se resolvió
  constraint propuesta_resuelta check (estado = 'pendiente' or resuelta_en is not null),
  -- y una propuesta no puede estar vacía
  constraint propuesta_con_algo check (
    length(trim(como_corta)) > 0 or length(trim(preferencias)) > 0
  )
);
create index ficha_propuesta_pendiente on ficha_propuesta (barberia_id, estado, creada_en desc);

-- ---------- RLS ----------
alter table asistente_config       enable row level security;
alter table asistente_conversacion enable row level security;
alter table asistente_mensaje      enable row level security;
alter table ficha_propuesta        enable row level security;

create policy "solo su local" on asistente_config
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

create policy "solo su local" on asistente_conversacion
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

create policy "solo su local" on ficha_propuesta
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

-- asistente_mensaje se queda sin políticas a propósito: RLS encendida
-- y nadie pasa. Solo lo tocan las funciones security definer y el
-- servicio que habla con la IA (service_role).

grant select, insert, update, delete on asistente_config, asistente_conversacion, ficha_propuesta
  to authenticated;

create trigger asistente_config_actualizado before update on asistente_config
  for each row execute function public.set_actualizado_en();

-- ---------- 0025_asistente_funciones.sql ----------

-- ============================================================
-- JULEX · asistente del llavero (2/2): funciones
--
-- Lo que el cliente puede hacer sin cuenta (mirar, proponer su
-- ficha, mover su cita) va por funciones security definer, igual
-- que la tarjeta y la reserva. Lo que hace el barbero, por funciones
-- que exigen sesión.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lo que ve el recuadro al abrirse
-- ------------------------------------------------------------
-- Devuelve solo lo necesario para saludar. La frase la compone la
-- interfaz; aquí se decide QUÉ saludo toca (variante), no cómo se dice.
create or replace function public.asistente_publico(p_token text, p_pin text default null)
returns json language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cliente     clientes%rowtype;
  v_local       barberias%rowtype;
  v_config      asistente_config%rowtype;
  v_estado      text;
  v_meta        int;
  v_cortes      int;
  v_disponibles int;
  v_restante    int;
  v_faltan      int;
  v_proxima     json;
  v_cola        json;
  v_ultima      timestamptz;
  v_variante    text;
begin
  select * into v_cliente from clientes where token_publico = p_token;
  if not found then
    return null;
  end if;

  -- El PIN manda: sin él no sale ni el nombre.
  v_estado := public.pin_comprobar(v_cliente.id, p_pin);
  if v_estado <> 'abierta' then
    return json_build_object('estado', v_estado);
  end if;

  select * into v_local from barberias where id = v_cliente.barberia_id;
  if v_local.estado_cobro = 'suspendido' or not v_local.activo then
    return json_build_object('estado', 'suspendido');
  end if;

  select * into v_config from asistente_config where barberia_id = v_local.id;
  if v_config.barberia_id is not null and not v_config.activo then
    return json_build_object('estado', 'apagado');
  end if;

  -- Próxima cita viva.
  select json_build_object(
           'id', ci.id, 'inicio', ci.inicio, 'estado', ci.estado,
           'servicio', s.nombre, 'silla', si.nombre)
    into v_proxima
    from citas ci
    join servicios s on s.id = ci.servicio_id
    left join sillas si on si.id = ci.silla_id
   where ci.cliente_id = v_cliente.id
     and ci.estado in ('pendiente', 'confirmada')
     and ci.inicio >= now()
   order by ci.inicio
   limit 1;

  -- En la cola ahora mismo (esperando o en el sillón).
  select json_build_object(
           'estado', q.estado,
           'silla', si.nombre,
           'posicion', (select count(*) + 1
                          from cola q2
                         where q2.barberia_id = q.barberia_id
                           and q2.estado = 'esperando'
                           and q2.llegada_en < q.llegada_en))
    into v_cola
    from cola q
    left join sillas si on si.id = q.silla_id
   where q.cliente_id = v_cliente.id
     and q.estado in ('esperando', 'sillon')
   order by q.llegada_en desc
   limit 1;

  -- Fidelización, con la misma cuenta que hace la app.
  v_meta    := greatest(1, v_local.fidelidad_meta);
  v_cortes  := (select count(*) from visitas v where v.cliente_id = v_cliente.id);
  v_disponibles := (select count(*) from recompensas r
                     where r.cliente_id = v_cliente.id and r.estado = 'disponible');
  v_restante := v_cortes % v_meta;
  v_faltan   := case when v_disponibles > 0 then 0 else v_meta - v_restante end;
  v_ultima   := (select max(v.fecha) from visitas v where v.cliente_id = v_cliente.id);

  -- Qué saludo toca, por prioridad. La interfaz solo elige la frase.
  v_variante := case
    when v_cola is not null                 then 'cola'
    when v_proxima is not null              then 'cita'
    when v_disponibles > 0                  then 'premio'
    when coalesce(v_cortes, 0) = 0          then 'nuevo'
    when v_ultima < now() - interval '45 days' then 'ausencia'
    else 'normal'
  end;

  return json_build_object(
    'estado', 'abierta',
    'barberia_id', v_local.id,
    'asistente', json_build_object('nombre', nullif(trim(coalesce(v_config.nombre, '')), '')),
    'local', json_build_object(
      'nombre', v_local.nombre, 'slug', v_local.slug,
      'telefono', v_local.telefono, 'direccion', v_local.direccion),
    'cliente', json_build_object(
      'id', v_cliente.id,
      'nombre', v_cliente.nombre,
      'sellos', json_build_object(
        'en_ciclo', case when v_disponibles > 0 then v_meta else v_restante end,
        'meta', v_meta, 'faltan', v_faltan, 'disponibles', v_disponibles)),
    'variante', v_variante,
    'proxima', v_proxima,
    'cola', v_cola,
    'ultima_visita', v_ultima
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. El cliente propone su ficha
-- ------------------------------------------------------------
-- No toca clientes: crea o actualiza UNA propuesta pendiente. El
-- barbero decide después. Así el cliente no puede reescribir sus
-- notas a espaldas del local.
create or replace function public.proponer_ficha(
  p_token          text,
  p_como_corta     text default '',
  p_preferencias   text default '',
  p_texto_original text default '',
  p_pin            text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
  v_id      uuid;
  v_corta   text := left(coalesce(trim(p_como_corta), ''), 600);
  v_prefs   text := left(coalesce(trim(p_preferencias), ''), 400);
  v_texto   text := left(coalesce(trim(p_texto_original), ''), 1200);
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then
    raise exception 'tarjeta_no_valida';
  end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    raise exception 'tarjeta_protegida';
  end if;

  if v_corta = '' and v_prefs = '' then
    raise exception 'propuesta_vacia';
  end if;

  -- Si ya había una pendiente, se reescribe en vez de acumular.
  select id into v_id from ficha_propuesta
   where cliente_id = v_cliente and estado = 'pendiente'
   order by creada_en desc
   limit 1;

  if v_id is not null then
    update ficha_propuesta
       set como_corta = v_corta, preferencias = v_prefs,
           texto_original = v_texto, creada_en = now()
     where id = v_id;
    return v_id;
  end if;

  insert into ficha_propuesta (barberia_id, cliente_id, como_corta, preferencias, texto_original)
  select barberia_id, id, v_corta, v_prefs, v_texto from clientes where id = v_cliente
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. El barbero acepta o descarta
-- ------------------------------------------------------------
create or replace function public.aceptar_propuesta(p_propuesta uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p ficha_propuesta%rowtype;
begin
  select * into v_p from ficha_propuesta
   where id = p_propuesta and estado = 'pendiente';
  if not found then
    return false;
  end if;
  if v_p.barberia_id <> public.mi_barberia() then
    return false;
  end if;

  update clientes
     set como_corta = coalesce(nullif(trim(v_p.como_corta), ''), como_corta),
         preferencias = coalesce(nullif(trim(v_p.preferencias), ''), preferencias),
         actualizado_en = now()
   where id = v_p.cliente_id;

  update ficha_propuesta
     set estado = 'aceptada', resuelta_en = now()
   where id = p_propuesta;

  return true;
end;
$$;

create or replace function public.descartar_propuesta(p_propuesta uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local uuid;
begin
  select barberia_id into v_local from ficha_propuesta
   where id = p_propuesta and estado = 'pendiente';
  if v_local is null or v_local <> public.mi_barberia() then
    return false;
  end if;

  update ficha_propuesta
     set estado = 'descartada', resuelta_en = now()
   where id = p_propuesta;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 4. Mover una cita sin perder el hueco
-- ------------------------------------------------------------
-- Una transacción: se libera la cita vieja, se busca sillón para la
-- nueva y, si algo falla, la excepción deshace todo. Mismo cerrojo
-- por local que solicitar_cita().
create or replace function public.mover_cita(
  p_token  text,
  p_cita   uuid,
  p_inicio timestamptz,
  p_pin    text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente  uuid;
  v_cita     citas%rowtype;
  v_servicio servicios%rowtype;
  v_fin      timestamptz;
  v_silla    uuid;
  v_nueva    uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then
    raise exception 'tarjeta_no_valida';
  end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    raise exception 'tarjeta_protegida';
  end if;

  select * into v_cita from citas
   where id = p_cita and cliente_id = v_cliente
     and estado in ('pendiente', 'confirmada');
  if not found then
    raise exception 'cita_no_valida';
  end if;

  if v_cita.inicio <= now() + interval '2 hours' then
    raise exception 'demasiado_tarde';
  end if;
  if p_inicio <= now() + interval '30 minutes' then
    raise exception 'hora_pasada';
  end if;

  select * into v_servicio from servicios where id = v_cita.servicio_id;
  if not found then
    raise exception 'servicio_no_valido';
  end if;

  v_fin := p_inicio + make_interval(mins => v_servicio.minutos);

  perform pg_advisory_xact_lock(hashtext(v_cita.barberia_id::text));

  -- Primero se libera el hueco viejo; si el nuevo no vale, la
  -- excepción devuelve la cita a donde estaba.
  update citas set estado = 'cancelada' where id = p_cita;

  v_silla := public.silla_libre(v_cita.barberia_id, p_inicio, v_fin);
  if v_silla is null then
    raise exception 'horario_ocupado';
  end if;

  if exists (
    select 1 from bloqueos_agenda b
     where b.barberia_id = v_cita.barberia_id
       and tstzrange(b.desde, b.hasta, '[)') && tstzrange(p_inicio, v_fin, '[)')
  ) then
    raise exception 'horario_bloqueado';
  end if;

  insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado, origen, silla_id)
  values (v_cita.barberia_id, v_cliente, v_cita.servicio_id, p_inicio, 'confirmada', 'asistente', v_silla)
  returning id into v_nueva;

  return v_nueva;
end;
$$;

-- ------------------------------------------------------------
-- 5. Consumo y limpieza
-- ------------------------------------------------------------
-- El barbero ve cuántas conversaciones lleva este mes (tope de 300).
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
     and abierta_en >= date_trunc('month', now());

  return json_build_object(
    'conversaciones', v_n,
    'limite', 300,
    'porcentaje', round(coalesce(v_n, 0) * 100.0 / 300)
  );
end;
$$;

-- Las conversaciones caducan a los 90 días. Las propuestas se quedan:
-- son historial de la ficha, no chat.
create or replace function public.limpiar_asistente()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  delete from asistente_conversacion
   where abierta_en < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- 6. Permisos
-- ------------------------------------------------------------
revoke all on function public.asistente_publico(text, text) from public;
revoke all on function public.proponer_ficha(text, text, text, text, text) from public;
revoke all on function public.mover_cita(text, uuid, timestamptz, text) from public;
revoke all on function public.aceptar_propuesta(uuid) from public;
revoke all on function public.descartar_propuesta(uuid) from public;
revoke all on function public.asistente_consumo(uuid) from public;
revoke all on function public.limpiar_asistente() from public;

grant execute on function public.asistente_publico(text, text) to anon, authenticated;
grant execute on function public.proponer_ficha(text, text, text, text, text) to anon, authenticated;
grant execute on function public.mover_cita(text, uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.aceptar_propuesta(uuid) to authenticated;
grant execute on function public.descartar_propuesta(uuid) to authenticated;
grant execute on function public.asistente_consumo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. Limpieza diaria, si el plan deja usar pg_cron
-- ------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('limpiar-asistente', '30 3 * * *', 'select public.limpiar_asistente()');
exception
  when others then
    raise notice 'pg_cron no disponible: limpiar_asistente() se lanza a mano';
end $$;

-- ---------- 0026_asistente_huecos.sql ----------

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

-- ---------- 0027_huecos_zona.sql ----------

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

-- ---------- 0028_asistente_topes.sql ----------

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

-- ---------- 0029_stripe_eventos.sql ----------

-- ============================================================
-- JULEX · idempotencia del webhook de Stripe
--
-- Stripe reintenta los avisos y puede entregar el mismo evento dos
-- veces. Sin registro, dos entregas simultáneas del alta podían crear
-- dos suscripciones. Cada evento se apunta una vez; si ya está
-- procesado, se responde 200 y no se vuelve a tocar nada.
-- ============================================================

create table if not exists stripe_eventos (
  id         text primary key,
  tipo       text not null default '',
  procesado  boolean not null default false,
  creado_en  timestamptz not null default now()
);

create index if not exists stripe_eventos_fecha on stripe_eventos (creado_en desc);

-- Sin políticas a propósito: solo lo toca la función con clave de servicio.
alter table stripe_eventos enable row level security;

create or replace function public.limpiar_stripe_eventos()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  delete from stripe_eventos where creado_en < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.limpiar_stripe_eventos() from public;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('limpiar-stripe-eventos', '15 4 * * *', 'select public.limpiar_stripe_eventos()');
exception
  when others then
    raise notice 'pg_cron no disponible: limpiar_stripe_eventos() se lanza a mano';
end $$;

-- ---------- 0030_pin_cerrojo.sql ----------

-- ============================================================
-- JULEX · el PIN se comprueba de uno en uno
--
-- El contador de fallos leía el valor, lo sumaba y lo escribía
-- después. Con dos intentos simultáneos, los dos leían el mismo
-- número y cada uno escribía el suyo: el contador se quedaba en 1
-- y el bloqueo de la quinta vez no saltaba nunca. Una tarjeta con
-- un PIN de cuatro cifras se podía abrir probando en paralelo.
--
-- `for update` bloquea la fila del PIN al empezar. El segundo
-- intento espera a que el primero confirme y ya lee el valor
-- sumado, así que cinco fallos seguidos bloquean de verdad, vengan
-- de uno en uno o los cinco a la vez.
--
-- A cambio, los intentos de una misma tarjeta hacen cola. Es lo
-- que se busca: el ataque se frena y el cliente que se equivoca no
-- nota nada. La firma no cambia, así que no hay que tocar ninguna
-- de las funciones que llaman a esta.
-- ============================================================

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
   where cliente_id = p_cliente
     for update;

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

-- ---------- 0031_whatsapp.sql ----------

-- ============================================================
-- JULEX · recepción por WhatsApp (1/3): datos
--
-- El recepcionista virtual de cada local: su línea de WhatsApp, el
-- vínculo con la ficha del cliente, los mensajes, la lista de espera,
-- los recordatorios y las aprobaciones del dueño.
--
-- Regla de la casa: el navegador no lee estas tablas salvo lo que el
-- dueño tiene que ver (sus ajustes, su actividad, su lista de espera).
-- Todo lo que decide se hace por funciones security definer.
-- ============================================================

-- ---------- 1. El asistente gana identidad y funciones ----------
-- «tono» pasa a llamarse «personalidad» y admite un cuarto carácter:
-- elegante y discreto, que es como hablan las peluquerías de señoras.
alter table asistente_config rename column tono to personalidad;
alter table asistente_config drop constraint if exists asistente_config_tono_check;
alter table asistente_config
  add constraint asistente_config_personalidad_check
  check (personalidad in ('cercano', 'formal', 'divertido', 'elegante'));

alter table asistente_config
  -- Avatar generado: un identificador del catálogo, no una imagen subida.
  -- Así el mismo local siempre tiene la misma cara y no hay ficheros que
  -- limpiar ni imágenes de terceros que licenciar.
  add column if not exists avatar_id text not null default ''
    check (length(avatar_id) <= 40),
  -- Lo primero que lee el cliente en WhatsApp. Vacío = saludo por defecto.
  add column if not exists bienvenida text not null default ''
    check (length(bienvenida) <= 300),
  -- Qué puede hacer. Si una función está apagada, la herramienta ni
  -- siquiera se le ofrece al modelo: no depende del prompt.
  add column if not exists funciones jsonb not null default '{
    "reservar": true, "mover": true, "cancelar": true, "precios": true,
    "lista_espera": true, "recordatorios": true, "fidelidad": true,
    "recomendaciones": true, "derivar": true, "aprobacion": false
  }'::jsonb,
  -- El canal de WhatsApp, aparte del asistente del llavero: se pueden
  -- encender por separado y se cobran por separado.
  add column if not exists canal_whatsapp boolean not null default false;

-- ---------- 2. La línea de WhatsApp de cada local ----------
-- Un local, un número. El número es de la recepción, no el personal del
-- dueño: así no hay que migrar nada ni se pierde ningún historial.
create table wa_linea (
  barberia_id      uuid primary key references barberias (id) on delete cascade,
  -- Como lo da Meta: solo dígitos, con prefijo y sin «+».
  telefono         text not null default '' check (telefono ~ '^[0-9]{6,15}$' or telefono = ''),
  -- Como se lo enseñamos al dueño: «+34 600 00 00 00».
  telefono_visible text not null default '' check (length(telefono_visible) <= 30),
  estado           text not null default 'pendiente'
    check (estado in ('pendiente', 'activa', 'pausa')),
  -- En prueba, el agente solo contesta a los teléfonos autorizados y no
  -- manda nada a nadie más. Es el modo con el que se enseña sin riesgo.
  modo             text not null default 'prueba' check (modo in ('prueba', 'real')),
  waba_id          text not null default '',
  phone_number_id  text not null default '',
  -- Teléfonos que pueden hablar en modo prueba además del dueño.
  autorizados      text[] not null default '{}',
  conectada_en     timestamptz,
  ultimo_error     text not null default '',
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- Un número de WhatsApp no puede estar en dos locales a la vez.
create unique index wa_linea_telefono on wa_linea (telefono) where telefono <> '';
create index wa_linea_phone_id on wa_linea (phone_number_id) where phone_number_id <> '';

-- El token de Meta no vive con los datos del local: va aparte, sin
-- permisos para nadie, y solo lo lee el servicio (service_role).
create table wa_secreto (
  barberia_id uuid primary key references barberias (id) on delete cascade,
  token       text not null default '',
  actualizado_en timestamptz not null default now()
);

-- ---------- 3. Quién es quién por teléfono ----------
-- El vínculo es la ficha vista desde WhatsApp. No sustituye a la ficha:
-- apunta a ella. Si el cliente cambia de número, se revoca y se vuelve a
-- vincular sin tocar su historial.
create table wa_vinculo (
  id            uuid primary key default gen_random_uuid(),
  barberia_id   uuid not null references barberias (id) on delete cascade,
  -- Últimos 9 dígitos. Es la llave de búsqueda, no el número que se enseña.
  telefono      text not null check (telefono ~ '^[0-9]{9}$'),
  -- El identificador que usa Meta (E.164 sin «+»).
  wa_id         text not null default '',
  cliente_id    uuid references clientes (id) on delete cascade,
  -- Cómo se demostró que el teléfono es suyo:
  --   telefono = el número ya estaba en su ficha (lo da WhatsApp, no el cliente)
  --   codigo   = se comprobó con un código de 6 cifras
  --   manual   = lo vinculó el dueño desde el panel
  metodo        text not null default 'telefono'
    check (metodo in ('telefono', 'codigo', 'manual')),
  estado        text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'revocado')),
  confirmado_en timestamptz,
  ultimo_uso    timestamptz,
  creado_en     timestamptz not null default now(),
  unique (barberia_id, telefono)
);
create index wa_vinculo_cliente on wa_vinculo (cliente_id);

-- ---------- 4. Códigos de comprobación ----------
-- Se guarda el hash, nunca el código. Caduca en 10 minutos y admite
-- cinco intentos: suficiente para una persona, inútil para una máquina.
create table wa_codigo (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  telefono    text not null check (telefono ~ '^[0-9]{9}$'),
  cliente_id  uuid references clientes (id) on delete cascade,
  hash        text not null,
  caduca      timestamptz not null,
  intentos    int not null default 0 check (intentos >= 0),
  usado_en    timestamptz,
  creado_en   timestamptz not null default now()
);
create index wa_codigo_busca on wa_codigo (barberia_id, telefono, creado_en desc);

-- ---------- 5. Todo lo que entra y sale ----------
-- Doble uso: depurar y auditar. El identificador de Meta es único, así
-- que un reintento de su webhook no se contesta dos veces.
create table wa_mensaje (
  id            uuid primary key default gen_random_uuid(),
  barberia_id   uuid not null references barberias (id) on delete cascade,
  direccion     text not null check (direccion in ('entrante', 'saliente')),
  wa_id         text not null default '',
  wa_message_id text unique,
  tipo          text not null default 'text' check (length(tipo) <= 20),
  texto         text not null default '' check (length(texto) <= 4000),
  estado        text not null default 'recibido'
    check (estado in ('recibido', 'enviado', 'entregado', 'leido', 'fallo', 'ignorado')),
  error         text not null default '',
  coste         numeric(10, 6) not null default 0 check (coste >= 0),
  creado_en     timestamptz not null default now()
);
create index wa_mensaje_local on wa_mensaje (barberia_id, creado_en desc);
create index wa_mensaje_wa_id on wa_mensaje (wa_id, creado_en desc);

-- ---------- 6. Lista de espera ----------
-- El cliente que no encuentra hueco no se va: se queda apuntado. Cuando
-- alguien cancela, el agente le ofrece el hueco por WhatsApp.
create table lista_espera (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid references clientes (id) on delete set null,
  telefono    text not null default '' check (telefono ~ '^[0-9]{9}$' or telefono = ''),
  nombre      text not null default '' check (length(nombre) <= 80),
  servicio_id uuid references servicios (id) on delete set null,
  -- Ventana en la que le vale. Sin fechas, cualquier día a partir de hoy.
  desde       date not null default current_date,
  hasta       date,
  preferencia text not null default 'cualquiera'
    check (preferencia in ('manana', 'tarde', 'cualquiera')),
  estado      text not null default 'esperando'
    check (estado in ('esperando', 'ofrecido', 'resuelto', 'caducado')),
  creado_en   timestamptz not null default now(),
  resuelto_en timestamptz,
  constraint espera_ventana check (hasta is null or hasta >= desde)
);
create index lista_espera_viva on lista_espera (barberia_id, estado, creado_en);

-- Cada hueco liberado que se ofrece. Una oferta caduca: el hueco no
-- puede quedarse colgado esperando a que alguien conteste.
create table lista_espera_oferta (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references barberias (id) on delete cascade,
  espera_id    uuid not null references lista_espera (id) on delete cascade,
  inicio       timestamptz not null,
  servicio_id  uuid references servicios (id) on delete set null,
  estado       text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'aceptada', 'rechazada', 'caducada')),
  caduca       timestamptz not null default now() + interval '45 minutes',
  creada_en    timestamptz not null default now(),
  resuelta_en  timestamptz
);
create index lista_espera_oferta_pendiente on lista_espera_oferta (estado, caduca);
create index lista_espera_oferta_espera on lista_espera_oferta (espera_id, creada_en desc);

-- ---------- 7. Recordatorios ----------
-- Una fila por cita: si ya está, no se manda dos veces.
create table recordatorio (
  cita_id     uuid primary key references citas (id) on delete cascade,
  barberia_id uuid not null references barberias (id) on delete cascade,
  telefono    text not null default '',
  estado      text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'fallo', 'cancelado')),
  plantilla   text not null default 'recordatorio_cita',
  error       text not null default '',
  enviado_en  timestamptz,
  creado_en   timestamptz not null default now()
);
create index recordatorio_pendiente on recordatorio (estado, creado_en);

-- ---------- 8. Aprobaciones del dueño ----------
-- En modo estreno, la cita nace igual (el hueco queda bloqueado, no hay
-- dobles reservas) pero el dueño decide si se confirma. Un toque desde
-- el móvil o desde el panel.
create table wa_aprobacion (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  tipo        text not null default 'cita' check (tipo in ('cita', 'ficha')),
  -- La cita o la propuesta a la que se refiere.
  referencia  uuid,
  -- Lo que se le enseña al dueño, ya escrito.
  texto       text not null default '' check (length(texto) <= 600),
  estado      text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'descartada')),
  creada_en   timestamptz not null default now(),
  resuelta_en timestamptz,
  constraint aprobacion_resuelta check (estado = 'pendiente' or resuelta_en is not null)
);
create index wa_aprobacion_pendiente on wa_aprobacion (barberia_id, estado, creada_en desc);

-- ---------- 9. Vínculos con lo que ya existe ----------
-- La conversación sabe si viene del llavero o de WhatsApp: sirve para
-- medir cada canal por separado y para no mezclar el coste de la IA.
alter table asistente_conversacion drop constraint if exists asistente_conversacion_canal_check;
alter table asistente_conversacion
  add constraint asistente_conversacion_canal_check
  check (canal in ('llavero', 'enlace', 'whatsapp'));

-- ---------- 10. Trigger: una cancelación ofrece el hueco ----------
-- No se ofrece a todo el mundo: solo a quien espera ese servicio o
-- cualquier servicio, dentro de su ventana y por preferencia horaria.
create or replace function public.al_liberar_cita()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espera lista_espera%rowtype;
  v_hora   int;
begin
  if new.estado <> 'cancelada' or old.estado = 'cancelada' then
    return new;
  end if;
  if new.inicio <= now() then
    return new;
  end if;

  v_hora := extract(hour from new.inicio at time zone 'Europe/Madrid');

  for v_espera in
    select * from lista_espera e
     where e.barberia_id = new.barberia_id
       and e.estado = 'esperando'
       and (e.servicio_id is null or e.servicio_id = new.servicio_id)
       and new.inicio::date between e.desde and coalesce(e.hasta, new.inicio::date)
       and (e.preferencia = 'cualquiera'
            or (e.preferencia = 'manana' and v_hora < 15)
            or (e.preferencia = 'tarde' and v_hora >= 15))
     order by e.creado_en
     limit 1
  loop
    insert into lista_espera_oferta (barberia_id, espera_id, inicio, servicio_id)
    values (new.barberia_id, v_espera.id, new.inicio, new.servicio_id);

    update lista_espera set estado = 'ofrecido' where id = v_espera.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists citas_liberar on citas;
create trigger citas_liberar
  after update of estado on citas
  for each row execute function public.al_liberar_cita();

-- ---------- 11. RLS ----------
alter table wa_linea          enable row level security;
alter table wa_secreto        enable row level security;
alter table wa_vinculo        enable row level security;
alter table wa_codigo         enable row level security;
alter table wa_mensaje        enable row level security;
alter table lista_espera      enable row level security;
alter table lista_espera_oferta enable row level security;
alter table recordatorio      enable row level security;
alter table wa_aprobacion     enable row level security;

-- El dueño ve y pausa su línea, pero no la inventa.
create policy "su linea" on wa_linea
  for select to authenticated using (barberia_id = public.mi_barberia());
create policy "pausar su linea" on wa_linea
  for update to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

-- Los clientes vinculados: el dueño los ve, no los escribe.
create policy "sus vinculos" on wa_vinculo
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "su conversacion" on wa_mensaje
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "su lista de espera" on lista_espera
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

create policy "sus ofertas" on lista_espera_oferta
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "sus recordatorios" on recordatorio
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "sus aprobaciones" on wa_aprobacion
  for select to authenticated using (barberia_id = public.mi_barberia());

-- wa_secreto y wa_codigo se quedan sin políticas a propósito: RLS
-- encendida y nadie pasa. Solo el servicio, que va con service_role.

grant select, update on wa_linea to authenticated;
grant select on wa_vinculo, wa_mensaje, lista_espera_oferta, recordatorio, wa_aprobacion
  to authenticated;
grant select, insert, update, delete on lista_espera to authenticated;

create trigger wa_linea_actualizado before update on wa_linea
  for each row execute function public.set_actualizado_en();

-- ---------- 0032_whatsapp_funciones.sql ----------

-- ============================================================
-- JULEX · recepción por WhatsApp (2/3): funciones
--
-- Aquí se decide. El webhook de Meta solo transporta: quién es el
-- cliente, qué puede hacer y qué se guarda se resuelve en estas
-- funciones, con las mismas reglas que la tarjeta y la agenda.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Utilidades
-- ------------------------------------------------------------

-- El teléfono es la llave. Se comparan los últimos 9 dígitos: el
-- cliente escribe «+34 600 11 22 33», la ficha guarda «600112233» y
-- Meta manda «34600112233». Los tres son el mismo.
create or replace function public.normalizar_telefono(p_telefono text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9);
$$;

-- ¿Está el local abierto en ese instante? Se usa para saber si el
-- agente trabajó fuera de horario (y poder enseñarlo).
create or replace function public.local_abierto(p_barberia uuid, p_instante timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce((
    select (p_instante at time zone 'Europe/Madrid')::time >= h.abre
       and (p_instante at time zone 'Europe/Madrid')::time < h.cierra
       and not (h.descanso_desde is not null and h.descanso_hasta is not null
                and (p_instante at time zone 'Europe/Madrid')::time >= h.descanso_desde
                and (p_instante at time zone 'Europe/Madrid')::time < h.descanso_hasta)
      from horarios h
     where h.barberia_id = p_barberia
       and h.dia_semana = extract(dow from p_instante at time zone 'Europe/Madrid')::int
  ), false);
$$;

-- La parte pública de la ficha: lo mismo que calcula asistente_publico
-- para el llavero. Se repite aquí porque el llavero comprueba el PIN
-- antes de llegar a este punto y WhatsApp no: el teléfono ya es la
-- prueba. Si cambia la cuenta de sellos, hay que cambiar las dos.
create or replace function public.cliente_publico_json(p_cliente uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente     clientes%rowtype;
  v_local       barberias%rowtype;
  v_meta        int;
  v_visitas     int;
  v_disponibles int;
  v_restante    int;
  v_faltan      int;
  v_proxima     json;
  v_ultima      timestamptz;
begin
  select * into v_cliente from clientes where id = p_cliente;
  if not found then return null; end if;
  select * into v_local from barberias where id = v_cliente.barberia_id;

  v_meta        := greatest(1, v_local.fidelidad_meta);
  v_visitas     := (select count(*) from visitas v where v.cliente_id = v_cliente.id);
  v_disponibles := (select count(*) from recompensas r
                     where r.cliente_id = v_cliente.id and r.estado = 'disponible');
  v_restante    := v_visitas % v_meta;
  v_faltan      := case when v_disponibles > 0 then 0 else v_meta - v_restante end;
  v_ultima      := (select max(v.fecha) from visitas v where v.cliente_id = v_cliente.id);

  select json_build_object(
           'id', ci.id, 'inicio', ci.inicio, 'estado', ci.estado,
           'servicio', s.nombre, 'silla', si.nombre)
    into v_proxima
    from citas ci
    join servicios s on s.id = ci.servicio_id
    left join sillas si on si.id = ci.silla_id
   where ci.cliente_id = v_cliente.id
     and ci.estado in ('pendiente', 'confirmada')
     and ci.inicio >= now()
   order by ci.inicio limit 1;

  return json_build_object(
    'id', v_cliente.id,
    'nombre', v_cliente.nombre,
    'telefono', v_cliente.telefono,
    'token', v_cliente.token_publico,
    'avisos', v_cliente.cons_avisos,
    'sellos', json_build_object(
      'en_ciclo', case when v_disponibles > 0 then v_meta else v_restante end,
      'meta', v_meta, 'faltan', v_faltan, 'disponibles', v_disponibles),
    'proxima', v_proxima,
    'ultima_visita', v_ultima
  );
end;
$$;

-- ------------------------------------------------------------
-- 1. Quién habla: el teléfono manda
-- ------------------------------------------------------------
-- Devuelve la ficha del cliente que escribe, o null. No pide PIN: en
-- WhatsApp la prueba es controlar el número, y a eso no se le puede
-- mentir desde fuera. Quien quiera más detalle, tiene la tarjeta.
create or replace function public.wa_publico(p_barberia uuid, p_telefono text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local   barberias%rowtype;
  v_config  asistente_config%rowtype;
  v_linea   wa_linea%rowtype;
  v_cliente uuid;
  v_nueve   text := public.normalizar_telefono(p_telefono);
begin
  select * into v_local from barberias where id = p_barberia;
  if not found or not v_local.activo then return json_build_object('estado', 'no_existe'); end if;
  if v_local.estado_cobro = 'suspendido' then return json_build_object('estado', 'suspendido'); end if;

  select * into v_config from asistente_config where barberia_id = p_barberia;
  if v_config.barberia_id is null or not v_config.canal_whatsapp then
    return json_build_object('estado', 'apagado');
  end if;

  select * into v_linea from wa_linea where barberia_id = p_barberia;
  if v_linea.barberia_id is null or v_linea.estado <> 'activa' then
    return json_build_object('estado', 'sin_linea');
  end if;

  select v.cliente_id into v_cliente
    from wa_vinculo v
   where v.barberia_id = p_barberia
     and v.telefono = v_nueve
     and v.estado = 'confirmado'
     and v.cliente_id is not null;

  -- Sin vínculo: es un cliente nuevo o alguien que escribe desde otro
  -- número. Se atiende igual, pero sin historial.
  if v_cliente is null then
    return json_build_object(
      'estado', 'nuevo',
      'barberia_id', p_barberia,
      'local', json_build_object(
        'nombre', v_local.nombre, 'slug', v_local.slug,
        'telefono', v_local.telefono, 'direccion', v_local.direccion),
      'asistente', json_build_object(
        'nombre', nullif(trim(coalesce(v_config.nombre, '')), ''),
        'avatar_id', coalesce(v_config.avatar_id, ''),
        'bienvenida', coalesce(v_config.bienvenida, '')),
      'cliente', null,
      'telefono', v_nueve
    );
  end if;

  return json_build_object(
    'estado', 'abierta',
    'barberia_id', p_barberia,
    'local', json_build_object(
      'nombre', v_local.nombre, 'slug', v_local.slug,
      'telefono', v_local.telefono, 'direccion', v_local.direccion),
    'asistente', json_build_object(
      'nombre', nullif(trim(coalesce(v_config.nombre, '')), ''),
      'avatar_id', coalesce(v_config.avatar_id, ''),
      'bienvenida', coalesce(v_config.bienvenida, '')),
    'cliente', public.cliente_publico_json(v_cliente),
    'telefono', v_nueve
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. Vínculo automático por número
-- ------------------------------------------------------------
-- Si el número que escribe ya está en una ficha del local, no hay nada
-- que preguntar: se vincula. Si no, el cliente sigue sin ficha y el
-- agente le pedirá el código cuando él quiera ver sus cosas.
create or replace function public.wa_vincular_auto(
  p_barberia uuid, p_telefono text, p_wa_id text default ''
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_cliente uuid;
begin
  if length(coalesce(v_nueve, '')) <> 9 then
    return json_build_object('vinculado', false, 'motivo', 'telefono');
  end if;

  select id into v_cliente
    from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve
     and cons_datos
   order by creado_en
   limit 1;

  if v_cliente is null then
    return json_build_object('vinculado', false, 'motivo', 'sin_ficha');
  end if;

  insert into wa_vinculo (barberia_id, telefono, wa_id, cliente_id, metodo, estado,
                          confirmado_en, ultimo_uso)
  values (p_barberia, v_nueve, coalesce(p_wa_id, ''), v_cliente, 'telefono', 'confirmado',
          now(), now())
  on conflict (barberia_id, telefono) do update
    set cliente_id    = excluded.cliente_id,
        wa_id         = excluded.wa_id,
        estado        = 'confirmado',
        confirmado_en = coalesce(wa_vinculo.confirmado_en, now()),
        ultimo_uso    = now();

  return json_build_object('vinculado', true, 'cliente_id', v_cliente);
end;
$$;

-- ------------------------------------------------------------
-- 3. Código de comprobación
-- ------------------------------------------------------------
-- Para el cliente que no tiene ficha pero quiere que el agente le
-- enseñe su historial: se le manda un código al WhatsApp y lo teclea.
-- Se guarda el hash, no el código.
create or replace function public.wa_codigo_pedir(p_barberia uuid, p_telefono text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_codigo  text;
  v_cliente uuid;
begin
  if length(coalesce(v_nueve, '')) <> 9 then
    return json_build_object('error', 'telefono');
  end if;

  -- Un código cada dos minutos y por teléfono: ni spam ni fuerza bruta.
  if exists (select 1 from wa_codigo
              where barberia_id = p_barberia and telefono = v_nueve
                and creado_en > now() - interval '2 minutes') then
    return json_build_object('error', 'demasiado_pronto');
  end if;

  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve
   limit 1;

  v_codigo := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');

  insert into wa_codigo (barberia_id, telefono, cliente_id, hash, caduca)
  values (p_barberia, v_nueve, v_cliente,
          encode(extensions.digest(v_codigo || v_nueve || p_barberia::text, 'sha256'), 'hex'),
          now() + interval '10 minutes');

  return json_build_object('codigo', v_codigo, 'cliente_id', v_cliente);
end;
$$;

create or replace function public.wa_codigo_comprobar(
  p_barberia uuid, p_telefono text, p_codigo text
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_fila    wa_codigo%rowtype;
  v_hash    text;
  v_cliente uuid;
begin
  select * into v_fila from wa_codigo
   where barberia_id = p_barberia and telefono = v_nueve and usado_en is null
   order by creado_en desc limit 1;

  if not found then return json_build_object('ok', false, 'motivo', 'sin_codigo'); end if;
  if v_fila.caduca < now() then return json_build_object('ok', false, 'motivo', 'caducado'); end if;
  if v_fila.intentos >= 5 then return json_build_object('ok', false, 'motivo', 'bloqueado'); end if;

  v_hash := encode(extensions.digest(coalesce(p_codigo, '') || v_nueve || p_barberia::text, 'sha256'), 'hex');

  if v_hash <> v_fila.hash then
    update wa_codigo set intentos = intentos + 1 where id = v_fila.id;
    return json_build_object('ok', false, 'motivo', 'no_coincide');
  end if;

  update wa_codigo set usado_en = now() where id = v_fila.id;

  -- El código demuestra que controla el número. Si había ficha con ese
  -- teléfono, se usa; si no, la crea el alta normal cuando reserve.
  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve
   limit 1;

  if v_cliente is not null then
    insert into wa_vinculo (barberia_id, telefono, cliente_id, metodo, estado,
                            confirmado_en, ultimo_uso)
    values (p_barberia, v_nueve, v_cliente, 'codigo', 'confirmado', now(), now())
    on conflict (barberia_id, telefono) do update
      set cliente_id    = excluded.cliente_id,
          estado        = 'confirmado',
          metodo        = 'codigo',
          confirmado_en = coalesce(wa_vinculo.confirmado_en, now()),
          ultimo_uso    = now();
  end if;

  return json_build_object(
    'ok', true,
    'cliente_id', v_cliente,
    'nombre', (select nombre from clientes where id = v_cliente)
  );
end;
$$;

create or replace function public.wa_token_de(p_barberia uuid, p_telefono text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono)
   limit 1;

  return json_build_object(
    'cliente_id', v_cliente,
    'token', (select token_publico from clientes where id = v_cliente),
    'nombre', (select nombre from clientes where id = v_cliente)
  );
end;
$$;

-- Un móvil cambia de dueño: el vínculo se revoca y la ficha deja de
-- estar detrás de ese número.
create or replace function public.wa_desvincular(p_barberia uuid, p_telefono text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update wa_vinculo
     set estado = 'revocado', cliente_id = null
   where barberia_id = p_barberia
     and telefono = public.normalizar_telefono(p_telefono);
  return found;
end;
$$;

-- ------------------------------------------------------------
-- 4. Registro de mensajes
-- ------------------------------------------------------------
-- Devuelve true la primera vez que se ve ese mensaje. Meta reintenta
-- sus webhooks: sin esto, un «sí» acabaría reservando dos veces.
create or replace function public.wa_mensaje_entrante(
  p_barberia uuid, p_wa_id text, p_message_id text, p_tipo text, p_texto text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into wa_mensaje (barberia_id, direccion, wa_id, wa_message_id, tipo, texto, estado)
  values (p_barberia, 'entrante', coalesce(p_wa_id, ''), p_message_id,
          left(coalesce(p_tipo, 'text'), 20), left(coalesce(p_texto, ''), 4000), 'recibido')
  on conflict (wa_message_id) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

-- Se llama al terminar de contestar: el mensaje saliente queda atado al
-- turno y con su coste. Si falla, no se pierde la respuesta.
create or replace function public.wa_mensaje_saliente(
  p_barberia uuid, p_wa_id text, p_message_id text, p_tipo text, p_texto text,
  p_estado text default 'enviado', p_error text default '', p_coste numeric default 0
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into wa_mensaje (barberia_id, direccion, wa_id, wa_message_id, tipo, texto,
                          estado, error, coste)
  values (p_barberia, 'saliente', coalesce(p_wa_id, ''), p_message_id,
          left(coalesce(p_tipo, 'text'), 20), left(coalesce(p_texto, ''), 4000),
          case when p_estado in ('enviado','entregado','leido','fallo','ignorado')
               then p_estado else 'enviado' end,
          left(coalesce(p_error, ''), 500), greatest(coalesce(p_coste, 0), 0))
  on conflict (wa_message_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Lista de espera
-- ------------------------------------------------------------
create or replace function public.wa_espera_apuntar(
  p_barberia uuid, p_telefono text, p_nombre text default '',
  p_servicio uuid default null, p_desde date default current_date,
  p_hasta date default null, p_preferencia text default 'cualquiera'
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nueve   text := public.normalizar_telefono(p_telefono);
  v_cliente uuid;
  v_id      uuid;
  v_puesto  int;
begin
  select id into v_cliente from clientes
   where barberia_id = p_barberia
     and public.normalizar_telefono(telefono) = v_nueve limit 1;

  -- Si ya estaba esperando, no se duplica: se actualiza su ventana.
  select id into v_id from lista_espera
   where barberia_id = p_barberia and telefono = v_nueve
     and estado in ('esperando', 'ofrecido')
   limit 1;

  if v_id is not null then
    update lista_espera
       set servicio_id = coalesce(p_servicio, servicio_id),
           desde = p_desde, hasta = p_hasta,
           preferencia = coalesce(nullif(p_preferencia, ''), preferencia),
           nombre = coalesce(nullif(trim(p_nombre), ''), nombre)
     where id = v_id;
  else
    insert into lista_espera (barberia_id, cliente_id, telefono, nombre, servicio_id,
                              desde, hasta, preferencia)
    values (p_barberia, v_cliente, v_nueve, left(coalesce(trim(p_nombre), ''), 80),
            p_servicio, p_desde, p_hasta,
            case when p_preferencia in ('manana','tarde','cualquiera')
                 then p_preferencia else 'cualquiera' end)
    returning id into v_id;
  end if;

  select count(*) + 1 into v_puesto
    from lista_espera
   where barberia_id = p_barberia and estado = 'esperando'
     and creado_en < (select creado_en from lista_espera where id = v_id);

  return json_build_object('apuntado', true, 'espera_id', v_id, 'puesto', v_puesto);
end;
$$;

create or replace function public.wa_espera_mia(p_barberia uuid, p_telefono text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_nueve  text := public.normalizar_telefono(p_telefono);
  v_espera lista_espera%rowtype;
  v_oferta json;
begin
  select * into v_espera from lista_espera
   where barberia_id = p_barberia and telefono = v_nueve
     and estado in ('esperando', 'ofrecido')
   order by creado_en desc limit 1;

  if not found then return null; end if;

  select json_build_object(
           'id', o.id, 'inicio', o.inicio,
           'servicio', (select nombre from servicios where id = o.servicio_id),
           'caduca', o.caduca)
    into v_oferta
    from lista_espera_oferta o
   where o.espera_id = v_espera.id
     and o.estado in ('pendiente', 'enviada')
     and o.caduca > now()
   order by o.creada_en desc limit 1;

  return json_build_object(
    'espera_id', v_espera.id,
    'estado', v_espera.estado,
    'desde', v_espera.desde,
    'hasta', v_espera.hasta,
    'preferencia', v_espera.preferencia,
    'puesto', (select count(*) + 1 from lista_espera e2
                where e2.barberia_id = p_barberia and e2.estado = 'esperando'
                  and e2.creado_en < v_espera.creado_en),
    'oferta', v_oferta
  );
end;
$$;

create or replace function public.wa_espera_soltar(p_barberia uuid, p_telefono text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update lista_espera
     set estado = 'caducado', resuelto_en = now()
   where barberia_id = p_barberia
     and telefono = public.normalizar_telefono(p_telefono)
     and estado in ('esperando', 'ofrecido');
  return found;
end;
$$;

-- El agente acepta o rechaza la oferta dentro de la conversación. Se
-- vuelve a comprobar el hueco: entre el aviso y el «sí» puede haber
-- pasado cualquier cosa.
create or replace function public.wa_oferta_resolver(
  p_oferta uuid, p_aceptada boolean
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_oferta lista_espera_oferta%rowtype;
begin
  select * into v_oferta from lista_espera_oferta where id = p_oferta;
  if not found then return json_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if v_oferta.estado in ('aceptada', 'rechazada', 'caducada') then
    return json_build_object('ok', false, 'motivo', 'ya_resuelta');
  end if;
  if v_oferta.caduca < now() then
    update lista_espera_oferta set estado = 'caducada', resuelta_en = now()
     where id = p_oferta;
    return json_build_object('ok', false, 'motivo', 'caducada');
  end if;

  update lista_espera_oferta
     set estado = case when p_aceptada then 'aceptada' else 'rechazada' end,
         resuelta_en = now()
   where id = p_oferta;

  update lista_espera
     set estado = case when p_aceptada then 'resuelto' else 'esperando' end,
         resuelto_en = case when p_aceptada then now() else null end
   where id = v_oferta.espera_id;

  return json_build_object('ok', true, 'inicio', v_oferta.inicio);
end;
$$;

-- ------------------------------------------------------------
-- 6. Recordatorios
-- ------------------------------------------------------------
-- Reclama las citas de las próximas 18–26 horas que aún no tienen
-- recordatorio. Deja la fila creada en el mismo paso: si el envío
-- falla, no se reintenta en bucle, queda en 'fallo' y se ve.
create or replace function public.wa_recordatorios_reclamar(p_limite int default 50)
returns json language sql security definer set search_path = public, pg_temp as $$
  with candidatas as (
    select ci.id, ci.barberia_id, public.normalizar_telefono(cl.telefono) as tel
      from citas ci
      join clientes cl on cl.id = ci.cliente_id
      join barberias b on b.id = ci.barberia_id
      join wa_linea w on w.barberia_id = ci.barberia_id
     where ci.estado in ('pendiente', 'confirmada')
       and ci.inicio between now() + interval '18 hours' and now() + interval '26 hours'
       and cl.cons_avisos
       and length(public.normalizar_telefono(cl.telefono)) = 9
       and w.estado = 'activa'
       and w.modo = 'real'
       and not exists (select 1 from recordatorio r where r.cita_id = ci.id)
     order by ci.inicio
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  ), creadas as (
    insert into recordatorio (cita_id, barberia_id, telefono, estado)
    select id, barberia_id, tel, 'pendiente' from candidatas
    on conflict (cita_id) do nothing
    returning cita_id, barberia_id, telefono
  )
  select coalesce(json_agg(json_build_object(
           'cita_id', cr.cita_id, 'barberia_id', cr.barberia_id,
           'telefono', cr.telefono, 'nombre', cl.nombre,
           'inicio', ci.inicio, 'servicio', s.nombre,
           'local', b.nombre)), '[]'::json)
    from creadas cr
    join citas ci on ci.id = cr.cita_id
    join clientes cl on cl.id = ci.cliente_id
    join servicios s on s.id = ci.servicio_id
    join barberias b on b.id = cr.barberia_id;
$$;

create or replace function public.wa_recordatorio_resultado(
  p_cita uuid, p_ok boolean, p_error text default ''
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update recordatorio
     set estado = case when p_ok then 'enviado' else 'fallo' end,
         enviado_en = now(),
         error = left(coalesce(p_error, ''), 500)
   where cita_id = p_cita;
  return found;
end;
$$;

-- ------------------------------------------------------------
-- 7. Ofertas de hueco a la lista de espera
-- ------------------------------------------------------------
-- Marca como enviadas las que toca mandar y devuelve lo necesario para
-- escribir el mensaje. Caducar primero evita ofrecer huecos muertos.
create or replace function public.wa_ofertas_reclamar(p_limite int default 20)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_json json;
begin
  update lista_espera_oferta
     set estado = 'caducada', resuelta_en = now()
   where estado in ('pendiente', 'enviada') and caduca < now();

  update lista_espera e
     set estado = 'esperando'
   where e.estado = 'ofrecido'
     and not exists (select 1 from lista_espera_oferta o
                      where o.espera_id = e.id
                        and o.estado in ('pendiente', 'enviada'));

  with candidatas as (
    select o.id
      from lista_espera_oferta o
      join lista_espera e on e.id = o.espera_id
      join barberias b on b.id = o.barberia_id
      join wa_linea w on w.barberia_id = o.barberia_id
     where o.estado = 'pendiente'
       and o.caduca > now()
       and w.estado = 'activa'
       and w.modo = 'real'
     order by o.inicio
     limit greatest(1, least(coalesce(p_limite, 20), 100))
     for update of o skip locked
  ), marcadas as (
    update lista_espera_oferta o
       set estado = 'enviada'
      from candidatas c
     where o.id = c.id
     returning o.*
  )
  select coalesce(json_agg(json_build_object(
           'oferta_id', m.id, 'espera_id', m.espera_id, 'barberia_id', m.barberia_id,
           'telefono', e.telefono, 'nombre', e.nombre,
           'inicio', m.inicio,
           'servicio', (select nombre from servicios where id = m.servicio_id),
           'local', (select nombre from barberias where id = m.barberia_id))), '[]'::json)
    into v_json
    from marcadas m join lista_espera e on e.id = m.espera_id;

  return v_json;
end;
$$;

-- ------------------------------------------------------------
-- 8. Aprobaciones del dueño
-- ------------------------------------------------------------
create or replace function public.wa_aprobacion_crear(
  p_barberia uuid, p_tipo text, p_referencia uuid, p_texto text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into wa_aprobacion (barberia_id, tipo, referencia, texto)
  values (p_barberia,
          case when p_tipo in ('cita','ficha') then p_tipo else 'cita' end,
          p_referencia, left(coalesce(p_texto, ''), 600))
  returning id into v_id;
  return v_id;
end;
$$;

-- Aprobar confirma la cita; descartar la cancela y deja el hueco libre.
-- El hueco estaba bloqueado desde el primer momento: no hay dobles.
create or replace function public.recepcion_aprobar(p_id uuid, p_aprobar boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ap wa_aprobacion%rowtype;
begin
  select * into v_ap from wa_aprobacion
   where id = p_id and barberia_id = public.mi_barberia() and estado = 'pendiente';
  if not found then return false; end if;

  update wa_aprobacion
     set estado = case when p_aprobar then 'aprobada' else 'descartada' end,
         resuelta_en = now()
   where id = p_id;

  if v_ap.tipo = 'cita' and v_ap.referencia is not null then
    update citas
       set estado = case when p_aprobar then 'confirmada'::estado_cita
                         else 'cancelada'::estado_cita end
     where id = v_ap.referencia
       and estado = 'pendiente';
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 9. El panel del dueño
-- ------------------------------------------------------------
create or replace function public.recepcion_panel(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid')
                              at time zone 'Europe/Madrid';
  v_json json;
begin
  -- `is distinct from` y no `<>`: sin sesión mi_barberia() es null, y
  -- null <> uuid no es verdadero, así que el `if` no cortaría nada.
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select json_build_object(
    'linea', (select json_build_object(
                'telefono', w.telefono_visible, 'estado', w.estado, 'modo', w.modo,
                'autorizados', coalesce(to_jsonb(w.autorizados), '[]'::jsonb))
                from wa_linea w where w.barberia_id = p_barberia),
    'metricas', json_build_object(
      'conversaciones', (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.abierta_en > now() - interval '30 days'),
      'citas',          (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.resultado = 'cita'
                            and c.abierta_en > now() - interval '30 days'),
      'fuera_horario',  (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.abierta_en > now() - interval '30 days'
                            and not public.local_abierto(p_barberia, c.abierta_en)),
      'derivadas',      (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.estado = 'derivada'
                            and c.abierta_en > now() - interval '30 days'),
      'recordatorios',  (select count(*) from recordatorio r
                          where r.barberia_id = p_barberia and r.estado = 'enviado'
                            and r.enviado_en > now() - interval '30 days'),
      'espera',         (select count(*) from lista_espera e
                          where e.barberia_id = p_barberia and e.estado in ('esperando','ofrecido')),
      'premios',        (select count(*) from recompensas r
                           join clientes cl on cl.id = r.cliente_id
                          where cl.barberia_id = p_barberia and r.estado = 'disponible')),
    'pendientes', coalesce((select json_agg(json_build_object(
             'id', a.id, 'tipo', a.tipo, 'texto', a.texto, 'creado_en', a.creada_en)
             order by a.creada_en desc)
           from wa_aprobacion a
          where a.barberia_id = p_barberia and a.estado = 'pendiente'), '[]'::json),
    'espera', coalesce((select json_agg(json_build_object(
             'id', e.id, 'nombre', coalesce(nullif(e.nombre, ''), 'Sin nombre'),
             'servicio', (select nombre from servicios where id = e.servicio_id),
             'desde', e.creado_en)
             order by e.creado_en)
           from lista_espera e
          where e.barberia_id = p_barberia and e.estado in ('esperando','ofrecido')), '[]'::json),
    'topes', json_build_object(
      'conversaciones', 300,
      'usadas', (select count(*) from asistente_conversacion c
                  where c.barberia_id = p_barberia and c.abierta_en >= v_inicio_mes),
      'mensajes', 1500,
      'usados', (select count(*) from asistente_mensaje m
                   join asistente_conversacion c on c.id = m.conversacion_id
                  where c.barberia_id = p_barberia and m.creado_en >= v_inicio_mes))
  ) into v_json;

  return v_json;
end;
$$;

-- Desconectar es una acción del dueño, no del servicio: apaga el canal
-- y deja la fila para volver a conectar sin perder el número.
create or replace function public.wa_desconectar(p_barberia uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_barberia is distinct from public.mi_barberia() then return false; end if;

  update wa_linea set estado = 'pausa', modo = 'prueba' where barberia_id = p_barberia;
  update asistente_config set canal_whatsapp = false where barberia_id = p_barberia;
  delete from wa_secreto where barberia_id = p_barberia;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 10. Permisos
-- ------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array[
    'normalizar_telefono(text)', 'local_abierto(uuid, timestamptz)',
    'cliente_publico_json(uuid)', 'wa_publico(uuid, text)',
    'wa_vincular_auto(uuid, text, text)', 'wa_codigo_pedir(uuid, text)',
    'wa_codigo_comprobar(uuid, text, text)', 'wa_token_de(uuid, text)',
    'wa_desvincular(uuid, text)', 'wa_mensaje_entrante(uuid, text, text, text, text)',
    'wa_mensaje_saliente(uuid, text, text, text, text, text, text, numeric)',
    'wa_espera_apuntar(uuid, text, text, uuid, date, date, text)',
    'wa_espera_mia(uuid, text)', 'wa_espera_soltar(uuid, text)',
    'wa_oferta_resolver(uuid, boolean)',
    'wa_recordatorios_reclamar(int)', 'wa_recordatorio_resultado(uuid, boolean, text)',
    'wa_ofertas_reclamar(int)', 'wa_aprobacion_crear(uuid, text, uuid, text)',
    'recepcion_aprobar(uuid, boolean)', 'recepcion_panel(uuid)',
    'wa_desconectar(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', r);
    execute format('grant execute on function public.%s to service_role', r);
  end loop;
end;
$$;

-- El dueño necesita estas tres desde el navegador con su sesión.
grant execute on function public.recepcion_panel(uuid)      to authenticated;
grant execute on function public.recepcion_aprobar(uuid, boolean) to authenticated;
grant execute on function public.wa_desconectar(uuid)       to authenticated;

-- ---------- 0033_whatsapp_conversacion.sql ----------

-- ============================================================
-- JULEX · recepción por WhatsApp (3/3): la conversación sin ficha
--
-- Hasta ahora toda conversación colgaba de un cliente con ficha: la
-- abría un llavero. En WhatsApp escribe cualquiera, también quien no
-- tiene ficha todavía. La conversación tiene que existir igual, porque
-- es donde se mide el gasto de la IA y donde se corta el mes.
-- ============================================================

alter table asistente_conversacion alter column cliente_id drop not null;

-- Por qué número vino, aunque no haya ficha. Es lo que permite contar
-- «cuánta gente nueva me ha escrito» sin crear fichas de prueba.
alter table asistente_conversacion
  add column if not exists telefono text not null default ''
    check (telefono = '' or telefono ~ '^[0-9]{9}$');

create index if not exists asistente_conversacion_telefono
  on asistente_conversacion (barberia_id, telefono, abierta_en desc);

-- El saludo del canal: JULEX manda un primer mensaje cuando alguien
-- escribe por primera vez, para que el cliente sepa con quién habla.
-- Queda registrado como un mensaje más, no como un turno de IA.
comment on column asistente_config.bienvenida is
  'Primer mensaje del recepcionista en WhatsApp. Vacío = saludo por defecto.';

-- ---------- 0034_recomendaciones.sql ----------

-- ============================================================
-- JULEX · fidelización y recomendaciones para el recepcionista
--
-- Dos lecturas del mismo historial: los sellos que lleva el cliente y
-- qué le puede venir bien la próxima vez. Las dos van por token, igual
-- que la tarjeta: el agente no maneja identificadores que no ve.
-- ============================================================

create or replace function public.mis_sellos(p_token text, p_pin text default null)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente     uuid;
  v_meta        int;
  v_visitas     int;
  v_disponibles int;
  v_restante    int;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return null; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    return json_build_object('estado', 'protegida');
  end if;

  select greatest(1, b.fidelidad_meta) into v_meta
    from clientes c join barberias b on b.id = c.barberia_id
   where c.id = v_cliente;

  v_visitas     := (select count(*) from visitas where cliente_id = v_cliente);
  v_disponibles := (select count(*) from recompensas
                     where cliente_id = v_cliente and estado = 'disponible');
  v_restante    := v_visitas % v_meta;

  return json_build_object(
    'en_ciclo', case when v_disponibles > 0 then v_meta else v_restante end,
    'meta', v_meta,
    'faltan', case when v_disponibles > 0 then 0 else v_meta - v_restante end,
    'disponibles', v_disponibles,
    'premio', case when v_disponibles > 0 then 'uno gratis' else null end
  );
end;
$$;

-- Qué le viene bien: lo que más repite, lo que no ha probado nunca y
-- cuánto tiempo lleva sin venir. Todo con datos del local, nada inventado.
create or replace function public.recomendar_cliente(p_token text, p_pin text default null)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente   uuid;
  v_barberia  uuid;
  v_habitual  json;
  v_nuevos    json;
  v_dias      int;
  v_visitas   int;
begin
  select id, barberia_id into v_cliente, v_barberia
    from clientes where token_publico = p_token;
  if v_cliente is null then return null; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    return json_build_object('estado', 'protegida');
  end if;

  v_visitas := (select count(*) from visitas where cliente_id = v_cliente);
  if v_visitas = 0 then
    return json_build_object('sin_historial', true);
  end if;

  v_dias := (select extract(day from now() - max(fecha))::int
               from visitas where cliente_id = v_cliente);

  -- El servicio que más ha repetido. Si nunca se apuntó el servicio en
  -- la visita, no se inventa: se queda vacío.
  select json_build_object('nombre', s.nombre, 'veces', count(*))
    into v_habitual
    from visitas v join servicios s on s.id = v.servicio_id
   where v.cliente_id = v_cliente
   group by s.nombre
   order by count(*) desc, s.nombre
   limit 1;

  -- Servicios activos que nunca ha tenido. Como mucho tres: es una
  -- sugerencia, no un catálogo.
  select coalesce(json_agg(t.nombre order by t.orden), '[]'::json) into v_nuevos
    from (
      select s.nombre, s.orden
        from servicios s
       where s.barberia_id = v_barberia
         and s.activo
         and not exists (
           select 1 from visitas v
            where v.cliente_id = v_cliente and v.servicio_id = s.id)
       order by s.orden
       limit 3
    ) t;

  return json_build_object(
    'habitual', v_habitual,
    'no_probados', v_nuevos,
    'dias_sin_venir', v_dias,
    'visitas', v_visitas
  );
end;
$$;

revoke all on function public.mis_sellos(text, text) from public;
revoke all on function public.recomendar_cliente(text, text) from public;

grant execute on function public.mis_sellos(text, text) to anon, authenticated;
grant execute on function public.recomendar_cliente(text, text) to anon, authenticated;

-- ---------- 0035_aprobaciones.sql ----------

-- ============================================================
-- JULEX · aprobar desde el móvil del dueño
--
-- El dueño pulsa un botón en WhatsApp. El webhook llega con la clave
-- del servicio, que no tiene sesión: `mi_barberia()` no vale ahí. Se
-- separa la comprobación (dueño con sesión) de la ejecución (servicio,
-- que ya sabe de qué local es la línea).
-- ============================================================

create or replace function public.aprobar_interno(
  p_aprobacion uuid, p_aprobar boolean, p_barberia uuid
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ap wa_aprobacion%rowtype;
begin
  select * into v_ap from wa_aprobacion
   where id = p_aprobacion and barberia_id = p_barberia and estado = 'pendiente';
  if not found then return false; end if;

  update wa_aprobacion
     set estado = case when p_aprobar then 'aprobada' else 'descartada' end,
         resuelta_en = now()
   where id = p_aprobacion;

  if v_ap.tipo = 'cita' and v_ap.referencia is not null then
    update citas
       set estado = case when p_aprobar then 'confirmada'::estado_cita
                         else 'cancelada'::estado_cita end
     where id = v_ap.referencia
       and estado = 'pendiente';
  end if;

  return true;
end;
$$;

-- El panel del dueño: exige sesión y que sea su local.
create or replace function public.recepcion_aprobar(p_id uuid, p_aprobar boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.aprobar_interno(p_id, p_aprobar, public.mi_barberia());
end;
$$;

-- El webhook: ya viene autenticado por la firma de Meta y la línea.
create or replace function public.wa_aprobar(
  p_aprobacion uuid, p_aprobar boolean, p_barberia uuid
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.aprobar_interno(p_aprobacion, p_aprobar, p_barberia);
end;
$$;

revoke all on function public.aprobar_interno(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.wa_aprobar(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.wa_aprobar(uuid, boolean, uuid) to service_role;

-- recepcion_aprobar ya estaba concedida a authenticated en 0032: se
-- vuelve a conceder porque `create or replace` no cambia los permisos.
grant execute on function public.recepcion_aprobar(uuid, boolean) to authenticated;

-- ---------- 0036_cron_whatsapp.sql ----------

-- ============================================================
-- JULEX · recordatorios y lista de espera, cada cinco minutos
--
-- pg_cron despierta a la función `wa-cron`, que es la que habla con
-- Meta. La dirección y el secreto viven en una tabla aparte, sin
-- permisos para nadie, para no dejarlos escritos en el SQL.
-- ============================================================

create table if not exists config_secreta (
  clave  text primary key,
  valor  text not null default '',
  nota   text not null default ''
);

alter table config_secreta enable row level security;
-- Sin políticas: RLS encendida y nadie pasa. Solo el servicio y el
-- propio pg_cron, que corre como superusuario.

comment on table config_secreta is
  'Ajustes de infraestructura que no pinta nada en el navegador: URL y secreto del cron de WhatsApp.';

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_cron o pg_net no disponibles: el cron de WhatsApp se lanza a mano';
end $$;

/**
 * Lo que tiene que decir el dueño una sola vez, en el editor SQL:
 *
 *   insert into config_secreta (clave, valor) values
 *     ('wa_cron_url', 'https://<proyecto>.supabase.co/functions/v1/wa-cron'),
 *     ('wa_cron_secreto', '<el mismo CRON_SECRET de la función>')
 *   on conflict (clave) do update set valor = excluded.valor;
 */
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from config_secreta where clave = 'wa_cron_url' and valor <> '')
  then
    perform cron.schedule(
      'julex-whatsapp',
      '*/5 * * * *',
      $cron$
        select net.http_post(
          url     := (select valor from public.config_secreta where clave = 'wa_cron_url'),
          headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'x-julex-cron', (select valor from public.config_secreta where clave = 'wa_cron_secreto')),
          body    := '{}'::jsonb,
          timeout_milliseconds := 20000
        );
      $cron$
    );
    raise notice 'Cron de WhatsApp programado cada cinco minutos';
  else
    raise notice 'Cron de WhatsApp sin programar: faltan la URL, el secreto o las extensiones';
  end if;
exception when others then
  raise notice 'Cron de WhatsApp sin programar: %', sqlerrm;
end $$;

-- Los códigos caducados y los mensajes viejos tampoco se guardan para
-- siempre: la conversación se borra a los 90 días, y el código a la hora.
create or replace function public.limpiar_whatsapp()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from wa_codigo   where caduca < now() - interval '1 day';
  delete from wa_mensaje  where creado_en < now() - interval '90 days';
  delete from lista_espera
   where estado in ('resuelto', 'caducado') and creado_en < now() - interval '60 days';
  delete from wa_aprobacion
   where estado <> 'pendiente' and resuelta_en < now() - interval '60 days';
end;
$$;

revoke all on function public.limpiar_whatsapp() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpiar-whatsapp', '45 3 * * *', 'select public.limpiar_whatsapp()');
  end if;
exception when others then
  raise notice 'limpiar_whatsapp() se lanza a mano: %', sqlerrm;
end $$;

-- ---------- 0037_whatsapp_cobro.sql ----------

-- ============================================================
-- JULEX · la recepción y el cobro van juntos
--
-- Si el local no paga, no puede haber un WhatsApp contestando a sus
-- clientes con su nombre. Hasta ahora el canal se activaba igual y el
-- cliente se quedaba sin respuesta (silencio); y los recordatorios
-- seguían saliendo, gastando dinero de un local suspendido.
--
-- Regla: la línea vive y muere con el cobro.
--   suspendido            → la línea se pausa y no sale ni un mensaje
--   al_dia/pendiente/lectura → vuelve a activa, si el dueño la tenía puesta
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sincronizar la línea con el estado de cobro
-- ------------------------------------------------------------
create or replace function public.wa_sincronizar_cobro()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.estado_cobro = 'suspendido' and old.estado_cobro is distinct from 'suspendido' then
    update wa_linea
       set estado = 'pausa',
           ultimo_error = 'local_suspendido'
     where barberia_id = new.id and estado = 'activa';

  elsif new.estado_cobro <> 'suspendido' and old.estado_cobro = 'suspendido' then
    -- Solo revive si el dueño no la había desconectado a mano: si apagó el
    -- canal (canal_whatsapp = false), pagar no se lo vuelve a encender.
    update wa_linea w
       set estado = 'activa',
           ultimo_error = ''
      from asistente_config c
     where w.barberia_id = new.id
       and c.barberia_id = w.barberia_id
       and c.canal_whatsapp
       and w.estado = 'pausa'
       and w.phone_number_id <> ''
       and w.ultimo_error = 'local_suspendido';
  end if;

  return new;
end;
$$;

drop trigger if exists barberias_wa_cobro on barberias;
create trigger barberias_wa_cobro
  after update of estado_cobro on barberias
  for each row execute function public.wa_sincronizar_cobro();

-- ------------------------------------------------------------
-- 2. Los recordatorios y las ofertas no salen de un local suspendido
-- ------------------------------------------------------------
create or replace function public.wa_recordatorios_reclamar(p_limite int default 50)
returns json language sql security definer set search_path = public, pg_temp as $$
  with candidatas as (
    select ci.id, ci.barberia_id, public.normalizar_telefono(cl.telefono) as tel
      from citas ci
      join clientes cl on cl.id = ci.cliente_id
      join barberias b on b.id = ci.barberia_id
      join wa_linea w on w.barberia_id = ci.barberia_id
     where ci.estado in ('pendiente', 'confirmada')
       and ci.inicio between now() + interval '18 hours' and now() + interval '26 hours'
       and cl.cons_avisos
       and length(public.normalizar_telefono(cl.telefono)) = 9
       and w.estado = 'activa'
       and w.modo = 'real'
       and b.estado_cobro <> 'suspendido'
       and not exists (select 1 from recordatorio r where r.cita_id = ci.id)
     order by ci.inicio
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  ), creadas as (
    insert into recordatorio (cita_id, barberia_id, telefono, estado)
    select id, barberia_id, tel, 'pendiente' from candidatas
    on conflict (cita_id) do nothing
    returning cita_id, barberia_id, telefono
  )
  select coalesce(json_agg(json_build_object(
           'cita_id', cr.cita_id, 'barberia_id', cr.barberia_id,
           'telefono', cr.telefono, 'nombre', cl.nombre,
           'inicio', ci.inicio, 'servicio', s.nombre,
           'local', b.nombre)), '[]'::json)
    from creadas cr
    join citas ci on ci.id = cr.cita_id
    join clientes cl on cl.id = ci.cliente_id
    join servicios s on s.id = ci.servicio_id
    join barberias b on b.id = cr.barberia_id;
$$;

create or replace function public.wa_ofertas_reclamar(p_limite int default 20)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_json json;
begin
  update lista_espera_oferta
     set estado = 'caducada', resuelta_en = now()
   where estado in ('pendiente', 'enviada') and caduca < now();

  update lista_espera e
     set estado = 'esperando'
   where e.estado = 'ofrecido'
     and not exists (select 1 from lista_espera_oferta o
                      where o.espera_id = e.id
                        and o.estado in ('pendiente', 'enviada'));

  with candidatas as (
    select o.id
      from lista_espera_oferta o
      join lista_espera e on e.id = o.espera_id
      join barberias b on b.id = o.barberia_id
      join wa_linea w on w.barberia_id = o.barberia_id
     where o.estado = 'pendiente'
       and o.caduca > now()
       and w.estado = 'activa'
       and w.modo = 'real'
       and b.estado_cobro <> 'suspendido'
     order by o.inicio
     limit greatest(1, least(coalesce(p_limite, 20), 100))
     for update of o skip locked
  ), marcadas as (
    update lista_espera_oferta o
       set estado = 'enviada'
      from candidatas c
     where o.id = c.id
     returning o.*
  )
  select coalesce(json_agg(json_build_object(
           'oferta_id', m.id, 'espera_id', m.espera_id, 'barberia_id', m.barberia_id,
           'telefono', e.telefono, 'nombre', e.nombre,
           'inicio', m.inicio,
           'servicio', (select nombre from servicios where id = m.servicio_id),
           'local', (select nombre from barberias where id = m.barberia_id))), '[]'::json)
    into v_json
    from marcadas m join lista_espera e on e.id = m.espera_id;

  return v_json;
end;
$$;

revoke all on function public.wa_recordatorios_reclamar(int) from public, anon, authenticated;
revoke all on function public.wa_ofertas_reclamar(int) from public, anon, authenticated;
grant execute on function public.wa_recordatorios_reclamar(int) to service_role;
grant execute on function public.wa_ofertas_reclamar(int) to service_role;

-- ------------------------------------------------------------
-- 3. El panel dice por qué está parada
-- ------------------------------------------------------------
create or replace function public.recepcion_panel(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid')
                              at time zone 'Europe/Madrid';
  v_json json;
begin
  -- `is distinct from` y no `<>`: sin sesión mi_barberia() es null, y
  -- null <> uuid no es verdadero, así que el `if` no cortaría nada.
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select json_build_object(
    'linea', (select json_build_object(
                'telefono', w.telefono_visible, 'estado', w.estado, 'modo', w.modo,
                'autorizados', coalesce(to_jsonb(w.autorizados), '[]'::jsonb))
                from wa_linea w where w.barberia_id = p_barberia),
    'cobro', (select json_build_object(
                'estado', b.estado_cobro,
                -- La línea se pausa sola cuando el local se suspende.
                'pausa_por_cobro', (select w.ultimo_error = 'local_suspendido'
                                      from wa_linea w where w.barberia_id = p_barberia))
                from barberias b where b.id = p_barberia),
    'metricas', json_build_object(
      'conversaciones', (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.abierta_en > now() - interval '30 days'),
      'citas',          (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.resultado = 'cita'
                            and c.abierta_en > now() - interval '30 days'),
      'fuera_horario',  (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.abierta_en > now() - interval '30 days'
                            and not public.local_abierto(p_barberia, c.abierta_en)),
      'derivadas',      (select count(*) from asistente_conversacion c
                          where c.barberia_id = p_barberia and c.canal = 'whatsapp'
                            and c.estado = 'derivada'
                            and c.abierta_en > now() - interval '30 days'),
      'recordatorios',  (select count(*) from recordatorio r
                          where r.barberia_id = p_barberia and r.estado = 'enviado'
                            and r.enviado_en > now() - interval '30 days'),
      'espera',         (select count(*) from lista_espera e
                          where e.barberia_id = p_barberia and e.estado in ('esperando','ofrecido')),
      'premios',        (select count(*) from recompensas r
                           join clientes cl on cl.id = r.cliente_id
                          where cl.barberia_id = p_barberia and r.estado = 'disponible')),
    'pendientes', coalesce((select json_agg(json_build_object(
             'id', a.id, 'tipo', a.tipo, 'texto', a.texto, 'creado_en', a.creada_en)
             order by a.creada_en desc)
           from wa_aprobacion a
          where a.barberia_id = p_barberia and a.estado = 'pendiente'), '[]'::json),
    'espera', coalesce((select json_agg(json_build_object(
             'id', e.id, 'nombre', coalesce(nullif(e.nombre, ''), 'Sin nombre'),
             'servicio', (select nombre from servicios where id = e.servicio_id),
             'desde', e.creado_en)
             order by e.creado_en)
           from lista_espera e
          where e.barberia_id = p_barberia and e.estado in ('esperando','ofrecido')), '[]'::json),
    'topes', json_build_object(
      'conversaciones', 300,
      'usadas', (select count(*) from asistente_conversacion c
                  where c.barberia_id = p_barberia and c.abierta_en >= v_inicio_mes),
      'mensajes', 1500,
      'usados', (select count(*) from asistente_mensaje m
                   join asistente_conversacion c on c.id = m.conversacion_id
                  where c.barberia_id = p_barberia and m.creado_en >= v_inicio_mes))
  ) into v_json;

  return v_json;
end;
$$;

grant execute on function public.recepcion_panel(uuid) to authenticated;

-- ---------- 0038_recepcion_requisitos.sql ----------

-- ============================================================
-- JULEX · la recepción se gana con llaveros
--
-- Regla de negocio: el agente de WhatsApp solo se puede activar cuando
-- el local tiene 40 llaveros activos, que es el techo de la cuota. Antes
-- de eso, el panel le dice cuántos le faltan en vez de dejarle conectar
-- un número que se quedaría a medias.
-- ============================================================

create or replace function public.recepcion_requisitos(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_minimo   int := 40;
  v_activos  int;
  v_cobro    text;
  v_activo   boolean;
  v_linea    wa_linea%rowtype;
begin
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select count(*) into v_activos
    from llaveros
   where barberia_id = p_barberia and estado = 'activo';

  select estado_cobro, activo into v_cobro, v_activo
    from barberias where id = p_barberia;

  select * into v_linea from wa_linea where barberia_id = p_barberia;

  return json_build_object(
    'llaveros_activos', v_activos,
    'minimo', v_minimo,
    'faltan', greatest(0, v_minimo - v_activos),
    'cobro', coalesce(v_cobro, 'al_dia'),
    'local_activo', coalesce(v_activo, false),
    'pausa_por_cobro', coalesce(v_linea.ultimo_error = 'local_suspendido', false),
    -- La cuenta puede activar la recepción: 40 llaveros y el cobro al día.
    'puede', v_activos >= v_minimo
             and coalesce(v_activo, false)
             and coalesce(v_cobro, 'al_dia') <> 'suspendido'
  );
end;
$$;

revoke all on function public.recepcion_requisitos(uuid) from public, anon;
grant execute on function public.recepcion_requisitos(uuid) to authenticated, service_role;

-- ---------- 0039_recepcion_cobro.sql ----------

-- ============================================================
-- JULEX · el complemento de recepción se cobra en Stripe
--
-- El complemento es un ítem más en la suscripción del local: 10 €/mes
-- que entran en la misma factura. Aquí solo se guarda si está puesto;
-- la verdad la tiene Stripe y el webhook la sincroniza.
-- ============================================================

alter table barberias
  add column if not exists recepcion_activa boolean not null default false,
  add column if not exists recepcion_desde  timestamptz;

comment on column barberias.recepcion_activa is
  'El local paga el complemento de recepción (10 €/mes). Lo enciende el webhook de Stripe al ver el ítem en la suscripción.';

-- El local que paga el complemento puede desconectarlo a mano; el cobro
-- sigue. Esta función es la que usa el webhook (servicio, sin sesión).
create or replace function public.wa_recepcion_pagada(
  p_barberia uuid, p_activa boolean
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update barberias
     set recepcion_activa = coalesce(p_activa, false),
         recepcion_desde  = case
                              when coalesce(p_activa, false) then coalesce(recepcion_desde, now())
                              else null
                            end
   where id = p_barberia;
  return found;
end;
$$;

revoke all on function public.wa_recepcion_pagada(uuid, boolean) from public, anon, authenticated;
grant execute on function public.wa_recepcion_pagada(uuid, boolean) to service_role;

-- El panel necesita saber si el complemento está pagado para enseñar el
-- botón correcto (activar y pagar, o conectar).
create or replace function public.recepcion_requisitos(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_minimo   int := 40;
  v_activos  int;
  v_cobro    text;
  v_activo   boolean;
  v_pagada   boolean;
  v_linea    wa_linea%rowtype;
begin
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select count(*) into v_activos
    from llaveros where barberia_id = p_barberia and estado = 'activo';

  select estado_cobro, activo, recepcion_activa into v_cobro, v_activo, v_pagada
    from barberias where id = p_barberia;

  select * into v_linea from wa_linea where barberia_id = p_barberia;

  return json_build_object(
    'llaveros_activos', v_activos,
    'minimo', v_minimo,
    'faltan', greatest(0, v_minimo - v_activos),
    'cobro', coalesce(v_cobro, 'al_dia'),
    'local_activo', coalesce(v_activo, false),
    'pagada', coalesce(v_pagada, false),
    'pausa_por_cobro', coalesce(v_linea.ultimo_error = 'local_suspendido', false),
    'puede', v_activos >= v_minimo
             and coalesce(v_activo, false)
             and coalesce(v_cobro, 'al_dia') <> 'suspendido'
             and coalesce(v_pagada, false)
  );
end;
$$;

revoke all on function public.recepcion_requisitos(uuid) from public, anon;
grant execute on function public.recepcion_requisitos(uuid) to authenticated, service_role;

-- ---------- 0040_horario_editable.sql ----------

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

-- ---------- 0041_tipos_negocio.sql ----------

-- ============================================================
-- JULEX · diez oficios
--
-- El tipo de negocio pasa de cuatro valores a diez. No toca
-- ninguna tabla ni ninguna fila: los locales que ya existen
-- siguen como están y el valor por defecto continúa siendo
-- `barberia`.
--
-- Lo que cambia es el vocabulario de la app
-- (`src/lib/vocabulario.ts`) y con qué nace un local: el nombre
-- de su primer puesto y sus tres servicios de partida.
--
-- Detalle de Postgres: `alter type ... add value` no permite usar
-- el valor nuevo dentro de la misma transacción. Por eso la
-- función compara `p_tipo::text` y no el enum: así este archivo se
-- puede pegar entero en el SQL Editor, que lo ejecuta de una vez.
-- ============================================================

alter type tipo_negocio add value if not exists 'estetica';
alter type tipo_negocio add value if not exists 'depilacion';
alter type tipo_negocio add value if not exists 'canina';
alter type tipo_negocio add value if not exists 'masaje';
alter type tipo_negocio add value if not exists 'auto';
alter type tipo_negocio add value if not exists 'otro';

-- ------------------------------------------------------------
-- Cómo nace un local de cada oficio
-- ------------------------------------------------------------

/*
 * Primer puesto y tres servicios de partida, según el oficio. Son valores
 * iniciales: el local los cambia en Ajustes sin ninguna restricción.
 *
 * Los servicios son una sola lista con el oficio en la primera columna, no
 * un bloque por oficio: añadir uno nuevo son tres filas más aquí, su bloque
 * de vocabulario y un valor en el enum.
 */
create or replace function public.sembrar_local(
  p_barberia uuid,
  p_tipo     tipo_negocio
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into sillas (barberia_id, nombre, orden)
  values (p_barberia,
          (case p_tipo::text
             when 'peluqueria' then 'Puesto 1'
             when 'unas'       then 'Mesa 1'
             when 'tatuaje'    then 'Estación 1'
             when 'estetica'   then 'Cabina 1'
             when 'depilacion' then 'Cabina 1'
             when 'canina'     then 'Mesa 1'
             when 'masaje'     then 'Camilla 1'
             when 'auto'       then 'Bahía 1'
             when 'otro'       then 'Puesto 1'
             else 'Silla 1'
           end), 1);

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      -- barbería
      ('barberia',   'Corte',             15,  30, 1),
      ('barberia',   'Corte + barba',     22,  45, 2),
      ('barberia',   'Niño',              10,  20, 3),
      -- peluquería
      ('peluqueria', 'Corte',             18,  40, 1),
      ('peluqueria', 'Color',             45,  90, 2),
      ('peluqueria', 'Peinado',           15,  30, 3),
      -- salón de uñas
      ('unas',       'Manicura',          20,  45, 1),
      ('unas',       'Pedicura',          25,  50, 2),
      ('unas',       'Semipermanente',    25,  60, 3),
      -- estudio de tatuaje
      ('tatuaje',    'Sesión pequeña',    60,  60, 1),
      ('tatuaje',    'Sesión media',     120, 120, 2),
      ('tatuaje',    'Retoque',           30,  30, 3),
      -- centro de estética
      ('estetica',   'Limpieza facial',   35,  45, 1),
      ('estetica',   'Cejas',             12,  20, 2),
      ('estetica',   'Cera',              15,  30, 3),
      -- centro de depilación
      ('depilacion', 'Zona pequeña',      15,  15, 1),
      ('depilacion', 'Zona media',        30,  30, 2),
      ('depilacion', 'Zona completa',     55,  60, 3),
      -- peluquería canina
      ('canina',     'Baño',              20,  45, 1),
      ('canina',     'Corte',             30,  60, 2),
      ('canina',     'Baño y corte',      45,  90, 3),
      -- centro de bienestar
      ('masaje',     'Masaje relajante',  40,  50, 1),
      ('masaje',     'Descontracturante', 50,  50, 2),
      ('masaje',     'Piedras calientes', 55,  60, 3),
      -- lavado y estética del auto
      ('auto',       'Lavado',            12,  20, 1),
      ('auto',       'Lavado + aspirado', 18,  30, 2),
      ('auto',       'Detailing',         90, 180, 3),
      -- otros servicios
      ('otro',       'Servicio básico',   20,  30, 1),
      ('otro',       'Servicio completo', 40,  60, 2),
      ('otro',       'Extra',             10,  15, 3)
    ) as x(tipo, nombre, precio, minutos, orden)
   where x.tipo = p_tipo::text;
end;
$$;

revoke all on function public.sembrar_local(uuid, tipo_negocio) from public;
revoke all on function public.sembrar_local(uuid, tipo_negocio) from anon, authenticated;

-- ---------- 0042_spa_y_taller.sql ----------

-- ============================================================
-- JULEX · spa y taller mecánico
--
-- «Centro de bienestar» pasa a llamarse «Spa», que es como se
-- vende, y entra el taller mecánico. El enum queda en once.
--
-- El valor `masaje` se renombra, no se borra: si algún local lo
-- tuviera, sigue apuntando a lo mismo. La función se sustituye
-- para que nazca con los nombres nuevos.
-- ============================================================

do $$
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
              where t.typname = 'tipo_negocio' and e.enumlabel = 'masaje')
     and not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                      where t.typname = 'tipo_negocio' and e.enumlabel = 'spa')
  then
    execute 'alter type tipo_negocio rename value ''masaje'' to ''spa''';
  end if;
end $$;

alter type tipo_negocio add value if not exists 'taller';

-- ------------------------------------------------------------
-- Cómo nace un local de cada oficio
-- ------------------------------------------------------------

/*
 * Primer puesto y tres servicios de partida, según el oficio. Son valores
 * iniciales: el local los cambia en Ajustes sin ninguna restricción.
 *
 * Los servicios son una sola lista con el oficio en la primera columna, no
 * un bloque por oficio: añadir uno nuevo son tres filas más aquí, su bloque
 * de vocabulario y un valor en el enum.
 *
 * Se compara `p_tipo::text` a propósito: así este archivo se puede pegar
 * entero en el SQL Editor aunque acabe de añadir un valor al enum.
 */
create or replace function public.sembrar_local(
  p_barberia uuid,
  p_tipo     tipo_negocio
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into sillas (barberia_id, nombre, orden)
  values (p_barberia,
          (case p_tipo::text
             when 'peluqueria' then 'Puesto 1'
             when 'unas'       then 'Mesa 1'
             when 'tatuaje'    then 'Estación 1'
             when 'estetica'   then 'Cabina 1'
             when 'depilacion' then 'Cabina 1'
             when 'canina'     then 'Mesa 1'
             when 'spa'        then 'Camilla 1'
             when 'auto'       then 'Bahía 1'
             when 'taller'     then 'Box 1'
             when 'otro'       then 'Puesto 1'
             else 'Silla 1'
           end), 1);

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      -- barbería
      ('barberia',   'Corte',             15,  30, 1),
      ('barberia',   'Corte + barba',     22,  45, 2),
      ('barberia',   'Niño',              10,  20, 3),
      -- peluquería
      ('peluqueria', 'Corte',             18,  40, 1),
      ('peluqueria', 'Color',             45,  90, 2),
      ('peluqueria', 'Peinado',           15,  30, 3),
      -- salón de uñas
      ('unas',       'Manicura',          20,  45, 1),
      ('unas',       'Pedicura',          25,  50, 2),
      ('unas',       'Semipermanente',    25,  60, 3),
      -- estudio de tatuaje
      ('tatuaje',    'Sesión pequeña',    60,  60, 1),
      ('tatuaje',    'Sesión media',     120, 120, 2),
      ('tatuaje',    'Retoque',           30,  30, 3),
      -- centro de estética
      ('estetica',   'Limpieza facial',   35,  45, 1),
      ('estetica',   'Cejas',             12,  20, 2),
      ('estetica',   'Cera',              15,  30, 3),
      -- centro de depilación
      ('depilacion', 'Zona pequeña',      15,  15, 1),
      ('depilacion', 'Zona media',        30,  30, 2),
      ('depilacion', 'Zona completa',     55,  60, 3),
      -- peluquería canina
      ('canina',     'Baño',              20,  45, 1),
      ('canina',     'Corte',             30,  60, 2),
      ('canina',     'Baño y corte',      45,  90, 3),
      -- spa
      ('spa',        'Masaje relajante',  40,  50, 1),
      ('spa',        'Descontracturante', 50,  50, 2),
      ('spa',        'Piedras calientes', 55,  60, 3),
      -- lavado y estética del auto
      ('auto',       'Lavado',            12,  20, 1),
      ('auto',       'Lavado + aspirado', 18,  30, 2),
      ('auto',       'Detailing',         90, 180, 3),
      -- taller mecánico
      ('taller',     'Cambio de aceite',  45,  45, 1),
      ('taller',     'Revisión',          60,  90, 2),
      ('taller',     'Frenos',           120, 120, 3),
      -- otros servicios
      ('otro',       'Servicio básico',   20,  30, 1),
      ('otro',       'Servicio completo', 40,  60, 2),
      ('otro',       'Extra',             10,  15, 3)
    ) as x(tipo, nombre, precio, minutos, orden)
   where x.tipo = p_tipo::text;
end;
$$;

revoke all on function public.sembrar_local(uuid, tipo_negocio) from public;
revoke all on function public.sembrar_local(uuid, tipo_negocio) from anon, authenticated;
