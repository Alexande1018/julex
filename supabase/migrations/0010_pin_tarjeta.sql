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
