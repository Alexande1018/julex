-- ============================================================
-- JULEX · recepción por WhatsApp (1/3): datos
--
-- El recepcionista virtual de cada local: su línea de WhatsApp, el
-- vínculo con la ficha del cliente, los mensajes, la lista de espera,
-- los recordatorios y las aprobaciones del dueño.
--
-- Regla de la casa: el navegador no lee estas tablas salvo lo que el
-- dueño tiene que ver (sus ajustes, su actividad, su lista de espera).
-- Todo lo que decide se hace por funciones security definer.
-- ============================================================

-- ---------- 1. El asistente gana identidad y funciones ----------
-- «tono» pasa a llamarse «personalidad» y admite un cuarto carácter:
-- elegante y discreto, que es como hablan las peluquerías de señoras.
alter table asistente_config rename column tono to personalidad;
alter table asistente_config drop constraint if exists asistente_config_tono_check;
alter table asistente_config
  add constraint asistente_config_personalidad_check
  check (personalidad in ('cercano', 'formal', 'divertido', 'elegante'));

alter table asistente_config
  -- Avatar generado: un identificador del catálogo, no una imagen subida.
  -- Así el mismo local siempre tiene la misma cara y no hay ficheros que
  -- limpiar ni imágenes de terceros que licenciar.
  add column if not exists avatar_id text not null default ''
    check (length(avatar_id) <= 40),
  -- Lo primero que lee el cliente en WhatsApp. Vacío = saludo por defecto.
  add column if not exists bienvenida text not null default ''
    check (length(bienvenida) <= 300),
  -- Qué puede hacer. Si una función está apagada, la herramienta ni
  -- siquiera se le ofrece al modelo: no depende del prompt.
  add column if not exists funciones jsonb not null default '{
    "reservar": true, "mover": true, "cancelar": true, "precios": true,
    "lista_espera": true, "recordatorios": true, "fidelidad": true,
    "recomendaciones": true, "derivar": true, "aprobacion": false
  }'::jsonb,
  -- El canal de WhatsApp, aparte del asistente del llavero: se pueden
  -- encender por separado y se cobran por separado.
  add column if not exists canal_whatsapp boolean not null default false;

-- ---------- 2. La línea de WhatsApp de cada local ----------
-- Un local, un número. El número es de la recepción, no el personal del
-- dueño: así no hay que migrar nada ni se pierde ningún historial.
create table wa_linea (
  barberia_id      uuid primary key references barberias (id) on delete cascade,
  -- Como lo da Meta: solo dígitos, con prefijo y sin «+».
  telefono         text not null default '' check (telefono ~ '^[0-9]{6,15}$' or telefono = ''),
  -- Como se lo enseñamos al dueño: «+34 600 00 00 00».
  telefono_visible text not null default '' check (length(telefono_visible) <= 30),
  estado           text not null default 'pendiente'
    check (estado in ('pendiente', 'activa', 'pausa')),
  -- En prueba, el agente solo contesta a los teléfonos autorizados y no
  -- manda nada a nadie más. Es el modo con el que se enseña sin riesgo.
  modo             text not null default 'prueba' check (modo in ('prueba', 'real')),
  waba_id          text not null default '',
  phone_number_id  text not null default '',
  -- Teléfonos que pueden hablar en modo prueba además del dueño.
  autorizados      text[] not null default '{}',
  conectada_en     timestamptz,
  ultimo_error     text not null default '',
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- Un número de WhatsApp no puede estar en dos locales a la vez.
create unique index wa_linea_telefono on wa_linea (telefono) where telefono <> '';
create index wa_linea_phone_id on wa_linea (phone_number_id) where phone_number_id <> '';

-- El token de Meta no vive con los datos del local: va aparte, sin
-- permisos para nadie, y solo lo lee el servicio (service_role).
create table wa_secreto (
  barberia_id uuid primary key references barberias (id) on delete cascade,
  token       text not null default '',
  actualizado_en timestamptz not null default now()
);

-- ---------- 3. Quién es quién por teléfono ----------
-- El vínculo es la ficha vista desde WhatsApp. No sustituye a la ficha:
-- apunta a ella. Si el cliente cambia de número, se revoca y se vuelve a
-- vincular sin tocar su historial.
create table wa_vinculo (
  id            uuid primary key default gen_random_uuid(),
  barberia_id   uuid not null references barberias (id) on delete cascade,
  -- Últimos 9 dígitos. Es la llave de búsqueda, no el número que se enseña.
  telefono      text not null check (telefono ~ '^[0-9]{9}$'),
  -- El identificador que usa Meta (E.164 sin «+»).
  wa_id         text not null default '',
  cliente_id    uuid references clientes (id) on delete cascade,
  -- Cómo se demostró que el teléfono es suyo:
  --   telefono = el número ya estaba en su ficha (lo da WhatsApp, no el cliente)
  --   codigo   = se comprobó con un código de 6 cifras
  --   manual   = lo vinculó el dueño desde el panel
  metodo        text not null default 'telefono'
    check (metodo in ('telefono', 'codigo', 'manual')),
  estado        text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'revocado')),
  confirmado_en timestamptz,
  ultimo_uso    timestamptz,
  creado_en     timestamptz not null default now(),
  unique (barberia_id, telefono)
);
create index wa_vinculo_cliente on wa_vinculo (cliente_id);

-- ---------- 4. Códigos de comprobación ----------
-- Se guarda el hash, nunca el código. Caduca en 10 minutos y admite
-- cinco intentos: suficiente para una persona, inútil para una máquina.
create table wa_codigo (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  telefono    text not null check (telefono ~ '^[0-9]{9}$'),
  cliente_id  uuid references clientes (id) on delete cascade,
  hash        text not null,
  caduca      timestamptz not null,
  intentos    int not null default 0 check (intentos >= 0),
  usado_en    timestamptz,
  creado_en   timestamptz not null default now()
);
create index wa_codigo_busca on wa_codigo (barberia_id, telefono, creado_en desc);

-- ---------- 5. Todo lo que entra y sale ----------
-- Doble uso: depurar y auditar. El identificador de Meta es único, así
-- que un reintento de su webhook no se contesta dos veces.
create table wa_mensaje (
  id            uuid primary key default gen_random_uuid(),
  barberia_id   uuid not null references barberias (id) on delete cascade,
  direccion     text not null check (direccion in ('entrante', 'saliente')),
  wa_id         text not null default '',
  wa_message_id text unique,
  tipo          text not null default 'text' check (length(tipo) <= 20),
  texto         text not null default '' check (length(texto) <= 4000),
  estado        text not null default 'recibido'
    check (estado in ('recibido', 'enviado', 'entregado', 'leido', 'fallo', 'ignorado')),
  error         text not null default '',
  coste         numeric(10, 6) not null default 0 check (coste >= 0),
  creado_en     timestamptz not null default now()
);
create index wa_mensaje_local on wa_mensaje (barberia_id, creado_en desc);
create index wa_mensaje_wa_id on wa_mensaje (wa_id, creado_en desc);

-- ---------- 6. Lista de espera ----------
-- El cliente que no encuentra hueco no se va: se queda apuntado. Cuando
-- alguien cancela, el agente le ofrece el hueco por WhatsApp.
create table lista_espera (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  cliente_id  uuid references clientes (id) on delete set null,
  telefono    text not null default '' check (telefono ~ '^[0-9]{9}$' or telefono = ''),
  nombre      text not null default '' check (length(nombre) <= 80),
  servicio_id uuid references servicios (id) on delete set null,
  -- Ventana en la que le vale. Sin fechas, cualquier día a partir de hoy.
  desde       date not null default current_date,
  hasta       date,
  preferencia text not null default 'cualquiera'
    check (preferencia in ('manana', 'tarde', 'cualquiera')),
  estado      text not null default 'esperando'
    check (estado in ('esperando', 'ofrecido', 'resuelto', 'caducado')),
  creado_en   timestamptz not null default now(),
  resuelto_en timestamptz,
  constraint espera_ventana check (hasta is null or hasta >= desde)
);
create index lista_espera_viva on lista_espera (barberia_id, estado, creado_en);

-- Cada hueco liberado que se ofrece. Una oferta caduca: el hueco no
-- puede quedarse colgado esperando a que alguien conteste.
create table lista_espera_oferta (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references barberias (id) on delete cascade,
  espera_id    uuid not null references lista_espera (id) on delete cascade,
  inicio       timestamptz not null,
  servicio_id  uuid references servicios (id) on delete set null,
  estado       text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'aceptada', 'rechazada', 'caducada')),
  caduca       timestamptz not null default now() + interval '45 minutes',
  creada_en    timestamptz not null default now(),
  resuelta_en  timestamptz
);
create index lista_espera_oferta_pendiente on lista_espera_oferta (estado, caduca);
create index lista_espera_oferta_espera on lista_espera_oferta (espera_id, creada_en desc);

-- ---------- 7. Recordatorios ----------
-- Una fila por cita: si ya está, no se manda dos veces.
create table recordatorio (
  cita_id     uuid primary key references citas (id) on delete cascade,
  barberia_id uuid not null references barberias (id) on delete cascade,
  telefono    text not null default '',
  estado      text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'fallo', 'cancelado')),
  plantilla   text not null default 'recordatorio_cita',
  error       text not null default '',
  enviado_en  timestamptz,
  creado_en   timestamptz not null default now()
);
create index recordatorio_pendiente on recordatorio (estado, creado_en);

-- ---------- 8. Aprobaciones del dueño ----------
-- En modo estreno, la cita nace igual (el hueco queda bloqueado, no hay
-- dobles reservas) pero el dueño decide si se confirma. Un toque desde
-- el móvil o desde el panel.
create table wa_aprobacion (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias (id) on delete cascade,
  tipo        text not null default 'cita' check (tipo in ('cita', 'ficha')),
  -- La cita o la propuesta a la que se refiere.
  referencia  uuid,
  -- Lo que se le enseña al dueño, ya escrito.
  texto       text not null default '' check (length(texto) <= 600),
  estado      text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'descartada')),
  creada_en   timestamptz not null default now(),
  resuelta_en timestamptz,
  constraint aprobacion_resuelta check (estado = 'pendiente' or resuelta_en is not null)
);
create index wa_aprobacion_pendiente on wa_aprobacion (barberia_id, estado, creada_en desc);

-- ---------- 9. Vínculos con lo que ya existe ----------
-- La conversación sabe si viene del llavero o de WhatsApp: sirve para
-- medir cada canal por separado y para no mezclar el coste de la IA.
alter table asistente_conversacion drop constraint if exists asistente_conversacion_canal_check;
alter table asistente_conversacion
  add constraint asistente_conversacion_canal_check
  check (canal in ('llavero', 'enlace', 'whatsapp'));

-- ---------- 10. Trigger: una cancelación ofrece el hueco ----------
-- No se ofrece a todo el mundo: solo a quien espera ese servicio o
-- cualquier servicio, dentro de su ventana y por preferencia horaria.
create or replace function public.al_liberar_cita()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espera lista_espera%rowtype;
  v_hora   int;
begin
  if new.estado <> 'cancelada' or old.estado = 'cancelada' then
    return new;
  end if;
  if new.inicio <= now() then
    return new;
  end if;

  v_hora := extract(hour from new.inicio at time zone 'Europe/Madrid');

  for v_espera in
    select * from lista_espera e
     where e.barberia_id = new.barberia_id
       and e.estado = 'esperando'
       and (e.servicio_id is null or e.servicio_id = new.servicio_id)
       and new.inicio::date between e.desde and coalesce(e.hasta, new.inicio::date)
       and (e.preferencia = 'cualquiera'
            or (e.preferencia = 'manana' and v_hora < 15)
            or (e.preferencia = 'tarde' and v_hora >= 15))
     order by e.creado_en
     limit 1
  loop
    insert into lista_espera_oferta (barberia_id, espera_id, inicio, servicio_id)
    values (new.barberia_id, v_espera.id, new.inicio, new.servicio_id);

    update lista_espera set estado = 'ofrecido' where id = v_espera.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists citas_liberar on citas;
create trigger citas_liberar
  after update of estado on citas
  for each row execute function public.al_liberar_cita();

-- ---------- 11. RLS ----------
alter table wa_linea          enable row level security;
alter table wa_secreto        enable row level security;
alter table wa_vinculo        enable row level security;
alter table wa_codigo         enable row level security;
alter table wa_mensaje        enable row level security;
alter table lista_espera      enable row level security;
alter table lista_espera_oferta enable row level security;
alter table recordatorio      enable row level security;
alter table wa_aprobacion     enable row level security;

-- El dueño ve y pausa su línea, pero no la inventa.
create policy "su linea" on wa_linea
  for select to authenticated using (barberia_id = public.mi_barberia());
create policy "pausar su linea" on wa_linea
  for update to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

-- Los clientes vinculados: el dueño los ve, no los escribe.
create policy "sus vinculos" on wa_vinculo
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "su conversacion" on wa_mensaje
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "su lista de espera" on lista_espera
  for all to authenticated
  using (barberia_id = public.mi_barberia())
  with check (barberia_id = public.mi_barberia());

create policy "sus ofertas" on lista_espera_oferta
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "sus recordatorios" on recordatorio
  for select to authenticated using (barberia_id = public.mi_barberia());

create policy "sus aprobaciones" on wa_aprobacion
  for select to authenticated using (barberia_id = public.mi_barberia());

-- wa_secreto y wa_codigo se quedan sin políticas a propósito: RLS
-- encendida y nadie pasa. Solo el servicio, que va con service_role.

grant select, update on wa_linea to authenticated;
grant select on wa_vinculo, wa_mensaje, lista_espera_oferta, recordatorio, wa_aprobacion
  to authenticated;
grant select, insert, update, delete on lista_espera to authenticated;

create trigger wa_linea_actualizado before update on wa_linea
  for each row execute function public.set_actualizado_en();
