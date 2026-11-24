-- ============================================================
-- JULEX · recordatorios y lista de espera, cada cinco minutos
--
-- pg_cron despierta a la función `wa-cron`, que es la que habla con
-- Meta. La dirección y el secreto viven en una tabla aparte, sin
-- permisos para nadie, para no dejarlos escritos en el SQL.
-- ============================================================

create table if not exists config_secreta (
  clave  text primary key,
  valor  text not null default '',
  nota   text not null default ''
);

alter table config_secreta enable row level security;
-- Sin políticas: RLS encendida y nadie pasa. Solo el servicio y el
-- propio pg_cron, que corre como superusuario.

comment on table config_secreta is
  'Ajustes de infraestructura que no pinta nada en el navegador: URL y secreto del cron de WhatsApp.';

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_cron o pg_net no disponibles: el cron de WhatsApp se lanza a mano';
end $$;

/**
 * Lo que tiene que decir el dueño una sola vez, en el editor SQL:
 *
 *   insert into config_secreta (clave, valor) values
 *     ('wa_cron_url', 'https://<proyecto>.supabase.co/functions/v1/wa-cron'),
 *     ('wa_cron_secreto', '<el mismo CRON_SECRET de la función>')
 *   on conflict (clave) do update set valor = excluded.valor;
 */
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from config_secreta where clave = 'wa_cron_url' and valor <> '')
  then
    perform cron.schedule(
      'julex-whatsapp',
      '*/5 * * * *',
      $cron$
        select net.http_post(
          url     := (select valor from public.config_secreta where clave = 'wa_cron_url'),
          headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'x-julex-cron', (select valor from public.config_secreta where clave = 'wa_cron_secreto')),
          body    := '{}'::jsonb,
          timeout_milliseconds := 20000
        );
      $cron$
    );
    raise notice 'Cron de WhatsApp programado cada cinco minutos';
  else
    raise notice 'Cron de WhatsApp sin programar: faltan la URL, el secreto o las extensiones';
  end if;
exception when others then
  raise notice 'Cron de WhatsApp sin programar: %', sqlerrm;
end $$;

-- Los códigos caducados y los mensajes viejos tampoco se guardan para
-- siempre: la conversación se borra a los 90 días, y el código a la hora.
create or replace function public.limpiar_whatsapp()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from wa_codigo   where caduca < now() - interval '1 day';
  delete from wa_mensaje  where creado_en < now() - interval '90 days';
  delete from lista_espera
   where estado in ('resuelto', 'caducado') and creado_en < now() - interval '60 days';
  delete from wa_aprobacion
   where estado <> 'pendiente' and resuelta_en < now() - interval '60 days';
end;
$$;

revoke all on function public.limpiar_whatsapp() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpiar-whatsapp', '45 3 * * *', 'select public.limpiar_whatsapp()');
  end if;
exception when others then
  raise notice 'limpiar_whatsapp() se lanza a mano: %', sqlerrm;
end $$;
