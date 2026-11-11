-- ============================================================
-- JULEX · el llavero abre dos puertas
--
-- El chip lleva una sola URL: /nfc/<token>. Quien la abre con la
-- sesión de la barbería ve la ficha; quien la abre sin sesión (el
-- móvil del propio cliente) acaba en su tarjeta.
--
-- Para eso hace falta una única puerta pública que traduzca el
-- token del llavero al de la tarjeta. Devuelve **solo eso**: un
-- texto opaco. Ni nombre, ni teléfono, ni historial; la tarjeta,
-- con su PIN si lo tiene, es la que decide qué se enseña después.
-- ============================================================

create or replace function public.llavero_tarjeta(p_token text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.token_publico
    from llaveros l
    join clientes c on c.id = l.cliente_id
   where l.token = p_token
     and l.estado = 'activo';
$$;

-- Un llavero en blanco, retirado o inventado devuelve null: la app
-- enseña la pantalla neutra y no distingue entre esos casos.
revoke all on function public.llavero_tarjeta(text) from public;
grant execute on function public.llavero_tarjeta(text) to anon, authenticated;
