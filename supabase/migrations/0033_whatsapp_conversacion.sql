-- ============================================================
-- JULEX · recepción por WhatsApp (3/3): la conversación sin ficha
--
-- Hasta ahora toda conversación colgaba de un cliente con ficha: la
-- abría un llavero. En WhatsApp escribe cualquiera, también quien no
-- tiene ficha todavía. La conversación tiene que existir igual, porque
-- es donde se mide el gasto de la IA y donde se corta el mes.
-- ============================================================

alter table asistente_conversacion alter column cliente_id drop not null;

-- Por qué número vino, aunque no haya ficha. Es lo que permite contar
-- «cuánta gente nueva me ha escrito» sin crear fichas de prueba.
alter table asistente_conversacion
  add column if not exists telefono text not null default ''
    check (telefono = '' or telefono ~ '^[0-9]{9}$');

create index if not exists asistente_conversacion_telefono
  on asistente_conversacion (barberia_id, telefono, abierta_en desc);

-- El saludo del canal: JULEX manda un primer mensaje cuando alguien
-- escribe por primera vez, para que el cliente sepa con quién habla.
-- Queda registrado como un mensaje más, no como un turno de IA.
comment on column asistente_config.bienvenida is
  'Primer mensaje del recepcionista en WhatsApp. Vacío = saludo por defecto.';
