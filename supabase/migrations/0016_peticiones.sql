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
