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
