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
