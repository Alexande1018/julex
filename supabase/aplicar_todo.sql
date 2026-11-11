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
