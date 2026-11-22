-- Definición de pin_comprobar en producción ANTES de 0030 (copia de seguridad).
-- Para revertir: ejecutar este fichero entero.

CREATE OR REPLACE FUNCTION public.pin_comprobar(p_cliente uuid, p_pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

