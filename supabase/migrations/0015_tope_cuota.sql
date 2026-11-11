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
