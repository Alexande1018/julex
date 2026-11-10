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
