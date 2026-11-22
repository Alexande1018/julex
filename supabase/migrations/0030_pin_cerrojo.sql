-- ============================================================
-- JULEX · el PIN se comprueba de uno en uno
--
-- El contador de fallos leía el valor, lo sumaba y lo escribía
-- después. Con dos intentos simultáneos, los dos leían el mismo
-- número y cada uno escribía el suyo: el contador se quedaba en 1
-- y el bloqueo de la quinta vez no saltaba nunca. Una tarjeta con
-- un PIN de cuatro cifras se podía abrir probando en paralelo.
--
-- `for update` bloquea la fila del PIN al empezar. El segundo
-- intento espera a que el primero confirme y ya lee el valor
-- sumado, así que cinco fallos seguidos bloquean de verdad, vengan
-- de uno en uno o los cinco a la vez.
--
-- A cambio, los intentos de una misma tarjeta hacen cola. Es lo
-- que se busca: el ataque se frena y el cliente que se equivoca no
-- nota nada. La firma no cambia, así que no hay que tocar ninguna
-- de las funciones que llaman a esta.
-- ============================================================

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
   where cliente_id = p_cliente
     for update;

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
