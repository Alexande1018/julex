-- ============================================================
-- JULEX · idempotencia del webhook de Stripe
--
-- Stripe reintenta los avisos y puede entregar el mismo evento dos
-- veces. Sin registro, dos entregas simultáneas del alta podían crear
-- dos suscripciones. Cada evento se apunta una vez; si ya está
-- procesado, se responde 200 y no se vuelve a tocar nada.
-- ============================================================

create table if not exists stripe_eventos (
  id         text primary key,
  tipo       text not null default '',
  procesado  boolean not null default false,
  creado_en  timestamptz not null default now()
);

create index if not exists stripe_eventos_fecha on stripe_eventos (creado_en desc);

-- Sin políticas a propósito: solo lo toca la función con clave de servicio.
alter table stripe_eventos enable row level security;

create or replace function public.limpiar_stripe_eventos()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  delete from stripe_eventos where creado_en < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.limpiar_stripe_eventos() from public;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('limpiar-stripe-eventos', '15 4 * * *', 'select public.limpiar_stripe_eventos()');
exception
  when others then
    raise notice 'pg_cron no disponible: limpiar_stripe_eventos() se lanza a mano';
end $$;
