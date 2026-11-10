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
