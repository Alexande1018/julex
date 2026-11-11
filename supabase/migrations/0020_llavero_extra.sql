-- ============================================================
-- JULEX · el llavero extra se cobra desde el 16.º
--
-- El alta incluye 15 llaveros. A partir de ahí, cada llavero que
-- se da de alta cuesta 1 € UNA VEZ (el material), aparte de su
-- euro mensual mientras esté activo.
--
-- Antes se cobraba solo a partir del 41, que era un error.
--
-- Se hace por sentencia y no por fila: en un alta se insertan 15 o
-- 30 llaveros de golpe, y un disparador por fila los ve todos ya
-- insertados, así que cobraba de más. El recuento por `row_number`
-- sobre el total del local es exacto e idempotente.
-- ============================================================

create or replace function public.llaveros_incluidos_alta()
returns int language sql immutable as $$
  select 15;
$$;

create or replace function public.reconciliar_cargos_llaveros()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into cargos_llavero (barberia_id, llavero_id, importe, nota)
  select t.barberia_id, t.id, public.precio_llavero_extra(),
         'Llavero adicional a los 15 del alta'
    from (
      select l.id, l.barberia_id,
             row_number() over (partition by l.barberia_id order by l.creado_en, l.id) as rn
        from llaveros l
    ) t
   where t.rn > public.llaveros_incluidos_alta()
     and not exists (select 1 from cargos_llavero c where c.llavero_id = t.id)
  on conflict do nothing;
end;
$$;

create or replace function public.cargo_llaveros_por_sentencia()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.reconciliar_cargos_llaveros();
  return null;
end;
$$;

drop trigger if exists cargo_llavero on llaveros;
drop trigger if exists cargo_llaveros_stmt on llaveros;

create trigger cargo_llaveros_stmt
  after insert on llaveros
  for each statement execute function public.cargo_llaveros_por_sentencia();

revoke all on function public.llaveros_incluidos_alta() from public;
revoke all on function public.reconciliar_cargos_llaveros() from public;
revoke all on function public.cargo_llaveros_por_sentencia() from public;

grant execute on function public.llaveros_incluidos_alta() to anon, authenticated;
