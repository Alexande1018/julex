-- ============================================================
-- JULEX · la recepción se gana con llaveros
--
-- Regla de negocio: el agente de WhatsApp solo se puede activar cuando
-- el local tiene 40 llaveros activos, que es el techo de la cuota. Antes
-- de eso, el panel le dice cuántos le faltan en vez de dejarle conectar
-- un número que se quedaría a medias.
-- ============================================================

create or replace function public.recepcion_requisitos(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_minimo   int := 40;
  v_activos  int;
  v_cobro    text;
  v_activo   boolean;
  v_linea    wa_linea%rowtype;
begin
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select count(*) into v_activos
    from llaveros
   where barberia_id = p_barberia and estado = 'activo';

  select estado_cobro, activo into v_cobro, v_activo
    from barberias where id = p_barberia;

  select * into v_linea from wa_linea where barberia_id = p_barberia;

  return json_build_object(
    'llaveros_activos', v_activos,
    'minimo', v_minimo,
    'faltan', greatest(0, v_minimo - v_activos),
    'cobro', coalesce(v_cobro, 'al_dia'),
    'local_activo', coalesce(v_activo, false),
    'pausa_por_cobro', coalesce(v_linea.ultimo_error = 'local_suspendido', false),
    -- La cuenta puede activar la recepción: 40 llaveros y el cobro al día.
    'puede', v_activos >= v_minimo
             and coalesce(v_activo, false)
             and coalesce(v_cobro, 'al_dia') <> 'suspendido'
  );
end;
$$;

revoke all on function public.recepcion_requisitos(uuid) from public, anon;
grant execute on function public.recepcion_requisitos(uuid) to authenticated, service_role;
