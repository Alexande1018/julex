-- ============================================================
-- JULEX · cara pública del cliente
-- Lo que puede hacer alguien sin cuenta, con el token de su tarjeta.
-- ============================================================

-- La ficha incluye ahora lo gastado y el total de visitas, para que la
-- tarjeta no tenga que recalcular desde una lista recortada.
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

-- Cancelar su propia cita. Con dos horas de margen: menos es cosa de la barbería.
create or replace function public.cancelar_cita(p_token text, p_cita uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;

  update citas
     set estado = 'cancelada'
   where id = p_cita
     and cliente_id = v_cliente
     and estado in ('pendiente', 'confirmada')
     and inicio > now() + interval '2 hours';

  return found;
end;
$$;

-- Sus datos: teléfono, preferencias y los consentimientos opcionales.
-- El consentimiento de datos no se toca desde aquí: sin él no hay tarjeta.
create or replace function public.actualizar_mis_datos(
  p_token        text,
  p_telefono     text default null,
  p_preferencias text default null,
  p_avisos       boolean default null,
  p_marketing    boolean default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return false; end if;

  update clientes set
    telefono       = coalesce(nullif(trim(p_telefono), ''), telefono),
    preferencias   = coalesce(p_preferencias, preferencias),
    cons_avisos    = coalesce(p_avisos, cons_avisos),
    cons_marketing = coalesce(p_marketing, cons_marketing)
  where id = v_cliente;

  return true;
end;
$$;

-- Baja: se apagan los consentimientos opcionales y queda constancia para el local.
create or replace function public.solicitar_baja(p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente  uuid;
  v_barberia uuid;
begin
  select id, barberia_id into v_cliente, v_barberia
    from clientes where token_publico = p_token;

  if v_cliente is null then return false; end if;

  update clientes set cons_avisos = false, cons_marketing = false where id = v_cliente;

  insert into mensajes_log (barberia_id, cliente_id, tipo, canal, texto)
  values (v_barberia, v_cliente, 'confirmacion', 'whatsapp',
          'SOLICITUD DE BAJA recibida desde la tarjeta del cliente');

  return true;
end;
$$;

revoke all on function public.cancelar_cita(text, uuid) from public;
revoke all on function public.actualizar_mis_datos(text, text, text, boolean, boolean) from public;
revoke all on function public.solicitar_baja(text) from public;

grant execute on function public.cancelar_cita(text, uuid) to anon, authenticated;
grant execute on function public.actualizar_mis_datos(text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.solicitar_baja(text) to anon, authenticated;
