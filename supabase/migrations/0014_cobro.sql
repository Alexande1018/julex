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
