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
