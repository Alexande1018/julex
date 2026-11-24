-- ============================================================
-- JULEX · fidelización y recomendaciones para el recepcionista
--
-- Dos lecturas del mismo historial: los sellos que lleva el cliente y
-- qué le puede venir bien la próxima vez. Las dos van por token, igual
-- que la tarjeta: el agente no maneja identificadores que no ve.
-- ============================================================

create or replace function public.mis_sellos(p_token text, p_pin text default null)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente     uuid;
  v_meta        int;
  v_visitas     int;
  v_disponibles int;
  v_restante    int;
begin
  select id into v_cliente from clientes where token_publico = p_token;
  if v_cliente is null then return null; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    return json_build_object('estado', 'protegida');
  end if;

  select greatest(1, b.fidelidad_meta) into v_meta
    from clientes c join barberias b on b.id = c.barberia_id
   where c.id = v_cliente;

  v_visitas     := (select count(*) from visitas where cliente_id = v_cliente);
  v_disponibles := (select count(*) from recompensas
                     where cliente_id = v_cliente and estado = 'disponible');
  v_restante    := v_visitas % v_meta;

  return json_build_object(
    'en_ciclo', case when v_disponibles > 0 then v_meta else v_restante end,
    'meta', v_meta,
    'faltan', case when v_disponibles > 0 then 0 else v_meta - v_restante end,
    'disponibles', v_disponibles,
    'premio', case when v_disponibles > 0 then 'uno gratis' else null end
  );
end;
$$;

-- Qué le viene bien: lo que más repite, lo que no ha probado nunca y
-- cuánto tiempo lleva sin venir. Todo con datos del local, nada inventado.
create or replace function public.recomendar_cliente(p_token text, p_pin text default null)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cliente   uuid;
  v_barberia  uuid;
  v_habitual  json;
  v_nuevos    json;
  v_dias      int;
  v_visitas   int;
begin
  select id, barberia_id into v_cliente, v_barberia
    from clientes where token_publico = p_token;
  if v_cliente is null then return null; end if;
  if public.pin_comprobar(v_cliente, p_pin) <> 'abierta' then
    return json_build_object('estado', 'protegida');
  end if;

  v_visitas := (select count(*) from visitas where cliente_id = v_cliente);
  if v_visitas = 0 then
    return json_build_object('sin_historial', true);
  end if;

  v_dias := (select extract(day from now() - max(fecha))::int
               from visitas where cliente_id = v_cliente);

  -- El servicio que más ha repetido. Si nunca se apuntó el servicio en
  -- la visita, no se inventa: se queda vacío.
  select json_build_object('nombre', s.nombre, 'veces', count(*))
    into v_habitual
    from visitas v join servicios s on s.id = v.servicio_id
   where v.cliente_id = v_cliente
   group by s.nombre
   order by count(*) desc, s.nombre
   limit 1;

  -- Servicios activos que nunca ha tenido. Como mucho tres: es una
  -- sugerencia, no un catálogo.
  select coalesce(json_agg(t.nombre order by t.orden), '[]'::json) into v_nuevos
    from (
      select s.nombre, s.orden
        from servicios s
       where s.barberia_id = v_barberia
         and s.activo
         and not exists (
           select 1 from visitas v
            where v.cliente_id = v_cliente and v.servicio_id = s.id)
       order by s.orden
       limit 3
    ) t;

  return json_build_object(
    'habitual', v_habitual,
    'no_probados', v_nuevos,
    'dias_sin_venir', v_dias,
    'visitas', v_visitas
  );
end;
$$;

revoke all on function public.mis_sellos(text, text) from public;
revoke all on function public.recomendar_cliente(text, text) from public;

grant execute on function public.mis_sellos(text, text) to anon, authenticated;
grant execute on function public.recomendar_cliente(text, text) to anon, authenticated;
