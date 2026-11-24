-- ============================================================
-- JULEX · el complemento de recepción se cobra en Stripe
--
-- El complemento es un ítem más en la suscripción del local: 10 €/mes
-- que entran en la misma factura. Aquí solo se guarda si está puesto;
-- la verdad la tiene Stripe y el webhook la sincroniza.
-- ============================================================

alter table barberias
  add column if not exists recepcion_activa boolean not null default false,
  add column if not exists recepcion_desde  timestamptz;

comment on column barberias.recepcion_activa is
  'El local paga el complemento de recepción (10 €/mes). Lo enciende el webhook de Stripe al ver el ítem en la suscripción.';

-- El local que paga el complemento puede desconectarlo a mano; el cobro
-- sigue. Esta función es la que usa el webhook (servicio, sin sesión).
create or replace function public.wa_recepcion_pagada(
  p_barberia uuid, p_activa boolean
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update barberias
     set recepcion_activa = coalesce(p_activa, false),
         recepcion_desde  = case
                              when coalesce(p_activa, false) then coalesce(recepcion_desde, now())
                              else null
                            end
   where id = p_barberia;
  return found;
end;
$$;

revoke all on function public.wa_recepcion_pagada(uuid, boolean) from public, anon, authenticated;
grant execute on function public.wa_recepcion_pagada(uuid, boolean) to service_role;

-- El panel necesita saber si el complemento está pagado para enseñar el
-- botón correcto (activar y pagar, o conectar).
create or replace function public.recepcion_requisitos(p_barberia uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_minimo   int := 40;
  v_activos  int;
  v_cobro    text;
  v_activo   boolean;
  v_pagada   boolean;
  v_linea    wa_linea%rowtype;
begin
  if p_barberia is distinct from public.mi_barberia() then
    return json_build_object('error', 'sin_permiso');
  end if;

  select count(*) into v_activos
    from llaveros where barberia_id = p_barberia and estado = 'activo';

  select estado_cobro, activo, recepcion_activa into v_cobro, v_activo, v_pagada
    from barberias where id = p_barberia;

  select * into v_linea from wa_linea where barberia_id = p_barberia;

  return json_build_object(
    'llaveros_activos', v_activos,
    'minimo', v_minimo,
    'faltan', greatest(0, v_minimo - v_activos),
    'cobro', coalesce(v_cobro, 'al_dia'),
    'local_activo', coalesce(v_activo, false),
    'pagada', coalesce(v_pagada, false),
    'pausa_por_cobro', coalesce(v_linea.ultimo_error = 'local_suspendido', false),
    'puede', v_activos >= v_minimo
             and coalesce(v_activo, false)
             and coalesce(v_cobro, 'al_dia') <> 'suspendido'
             and coalesce(v_pagada, false)
  );
end;
$$;

revoke all on function public.recepcion_requisitos(uuid) from public, anon;
grant execute on function public.recepcion_requisitos(uuid) to authenticated, service_role;
