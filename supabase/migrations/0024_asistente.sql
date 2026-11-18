-- ============================================================
-- JULEX · asistente del llavero (1/2): datos
--
-- El recuadro que aparece al tocar el llavero guarda aquí su
-- configuración, sus conversaciones y las propuestas de ficha que
-- el cliente deja al barbero.
--
-- Nada de esto lo lee el navegador: el público solo entra por
-- funciones security definer, como en el resto del esquema.
-- ============================================================

-- Una cita pedida hablando se distingue de las demás en la agenda,
-- en el panel y en las métricas.
alter type origen_cita add value if not exists 'asistente';

-- ---------- configuración del asistente ----------
-- No nace con el local: si no hay fila, se usan los valores por
-- defecto (sin nombre propio, tono cercano, encendido). El barbero
-- la crea o la edita desde Ajustes.
create table asistente_config (
  barberia_id    uuid primary key references barberias (id) on delete cascade,
  nombre         text not null default '' check (length(nombre) <= 40),
  tono           text not null default 'cercano' check (tono in ('cercano','formal','divertido')),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------- conversaciones ----------
-- coste y tokens se guardan desde el primer turno: la factura de la
-- IA se mide, no se estima.
create table asistente_conversacion (
  id             uuid primary key default gen_random_uuid(),
  barberia_id    uuid not null references barberias (id) on delete cascade,
  cliente_id     uuid not null references clientes (id) on delete cascade,
  canal          text not null default 'llavero' check (canal in ('llavero','enlace')),
  estado         text not null default 'abierta' check (estado in ('abierta','cerrada','derivada')),
  resultado      text check (resultado in ('cita','ficha','consulta','ninguno')),
  tokens_entrada int not null default 0 check (tokens_entrada >= 0),
  tokens_salida  int not null default 0 check (tokens_salida >= 0),
  coste          numeric(10,6) not null default 0 check (coste >= 0),
  abierta_en     timestamptz not null default now(),
  cerrada_en     timestamptz
);
create index asistente_conversacion_local on asistente_conversacion (barberia_id, abierta_en desc);
create index asistente_conversacion_cliente on asistente_conversacion (cliente_id, abierta_en desc);

create table asistente_mensaje (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references asistente_conversacion (id) on delete cascade,
  papel           text not null check (papel in ('cliente','asistente','sistema')),
  texto           text not null check (length(texto) between 1 and 4000),
  tokens          int not null default 0 check (tokens >= 0),
  creado_en       timestamptz not null default now()
);
create index asistente_mensaje_conversacion on asistente_mensaje (conversacion_id, creado_en);

-- ---------- propuestas de ficha ----------
-- El cliente no escribe en su ficha: propone. El barbero acepta o
-- descarta. Se guardan sus palabras exactas y el resumen.
create table ficha_propuesta (
  id              uuid primary key default gen_random_uuid(),
  barberia_id     uuid not null references barberias (id) on delete cascade,
  cliente_id      uuid not null references clientes (id) on delete cascade,
  conversacion_id uuid references asistente_conversacion (id) on delete set null,
  como_corta      text not null default '' check (length(como_corta) <= 600),
  preferencias    text not null default '' check (length(preferencias) <= 400),
  texto_original  text not null default '' check (length(texto_original) <= 1200),
  estado          text not null default 'pendiente' check (estado in ('pendiente','aceptada','descartada')),
  creada_en       timestamptz not null default now(),
  resuelta_en     timestamptz,
  -- una propuesta resuelta siempre dice cuándo se resolvió
  constraint propuesta_resuelta check (estado = 'pendiente' or resuelta_en is not null),
  -- y una propuesta no puede estar vacía
  constraint propuesta_con_algo check (
    length(trim(como_corta)) > 0 or length(trim(preferencias)) > 0
  )
);
create index ficha_propuesta_pendiente on ficha_propuesta (barberia_id, estado, creada_en desc);

-- ---------- RLS ----------
alter table asistente_config       enable row level security;
alter table asistente_conversacion enable row level security;
alter table asistente_mensaje      enable row level security;
alter table ficha_propuesta        enable row level security;

create policy "solo su local" on asistente_config
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

create policy "solo su local" on asistente_conversacion
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

create policy "solo su local" on ficha_propuesta
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

-- asistente_mensaje se queda sin políticas a propósito: RLS encendida
-- y nadie pasa. Solo lo tocan las funciones security definer y el
-- servicio que habla con la IA (service_role).

grant select, insert, update, delete on asistente_config, asistente_conversacion, ficha_propuesta
  to authenticated;

create trigger asistente_config_actualizado before update on asistente_config
  for each row execute function public.set_actualizado_en();
