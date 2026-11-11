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
