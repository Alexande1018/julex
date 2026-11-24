-- ============================================================
-- JULEX · aprobar desde el móvil del dueño
--
-- El dueño pulsa un botón en WhatsApp. El webhook llega con la clave
-- del servicio, que no tiene sesión: `mi_barberia()` no vale ahí. Se
-- separa la comprobación (dueño con sesión) de la ejecución (servicio,
-- que ya sabe de qué local es la línea).
-- ============================================================

create or replace function public.aprobar_interno(
  p_aprobacion uuid, p_aprobar boolean, p_barberia uuid
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ap wa_aprobacion%rowtype;
begin
  select * into v_ap from wa_aprobacion
   where id = p_aprobacion and barberia_id = p_barberia and estado = 'pendiente';
  if not found then return false; end if;

  update wa_aprobacion
     set estado = case when p_aprobar then 'aprobada' else 'descartada' end,
         resuelta_en = now()
   where id = p_aprobacion;

  if v_ap.tipo = 'cita' and v_ap.referencia is not null then
    update citas
       set estado = case when p_aprobar then 'confirmada'::estado_cita
                         else 'cancelada'::estado_cita end
     where id = v_ap.referencia
       and estado = 'pendiente';
  end if;

  return true;
end;
$$;

-- El panel del dueño: exige sesión y que sea su local.
create or replace function public.recepcion_aprobar(p_id uuid, p_aprobar boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.aprobar_interno(p_id, p_aprobar, public.mi_barberia());
end;
$$;

-- El webhook: ya viene autenticado por la firma de Meta y la línea.
create or replace function public.wa_aprobar(
  p_aprobacion uuid, p_aprobar boolean, p_barberia uuid
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.aprobar_interno(p_aprobacion, p_aprobar, p_barberia);
end;
$$;

revoke all on function public.aprobar_interno(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.wa_aprobar(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.wa_aprobar(uuid, boolean, uuid) to service_role;

-- recepcion_aprobar ya estaba concedida a authenticated en 0032: se
-- vuelve a conceder porque `create or replace` no cambia los permisos.
grant execute on function public.recepcion_aprobar(uuid, boolean) to authenticated;
