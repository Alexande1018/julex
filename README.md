# JULEX

Herramienta para negocios con llavero NFC: la cola o la agenda del día, la ficha de cada cliente y su
tarjeta de socio. Sirve igual para una barbería, una peluquería, un salón de uñas o un estudio de
tatuaje, y cambia su vocabulario según el tipo de local.
**Estado: Fase 1 terminada y funcionando.** Datos de demostración, persistencia local y ninguna integración externa conectada.

- Alta: **30 €** una vez, con 15 llaveros.
- Cuota: **15 €/mes mínimo**; **1 € por llavero activo** a partir del decimoquinto, desde el segundo mes.
- Sin planes, sin módulos, sin letra pequeña.

---

## Producción

```
App        https://julex.pages.dev                (Cloudflare Pages)
Panel      https://julex.pages.dev/admin
Supabase   proyecto lgcaqzraqhecyzxkgujh (Frankfurt)
Netlify    https://julex-379.netlify.app          (versión anterior, sin créditos)
```

El sitio está en **Cloudflare Pages** desde el 11 de noviembre de 2026, que no cobra por despliegue.
Netlify sigue sirviendo la versión anterior y ya **no acepta despliegues**: cada uno cuesta 15
créditos y el plan gratis da 300 al mes, gastados; la API responde `403 Account credit usage
exceeded`. Es facturación, no código.

Las variables viven en `.env.local` (ignorado por git); sin ellas la app arranca en modo local con
datos de ejemplo.

## Conectar Supabase (modo real)

Sin variables de entorno la app funciona en **modo local** (datos en el navegador): es lo que se usa
para desarrollar y para las capturas. Con un proyecto configurado, la app arranca en **modo real**:
cuentas de verdad, Postgres y almacenamiento.

1. Crea un proyecto en [supabase.com](https://supabase.com) (región `eu-west-3` o `eu-central-1`).
2. Copia `.env.example` a `.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
3. Aplica el esquema. Dos caminos:

**Sin compartir contraseñas (recomendado).** Abre el **SQL Editor** del proyecto, pega el contenido
de `supabase/aplicar_todo.sql` y ejecútalo. Crea tipos, las 14 tablas, la RLS, el bucket de logos y
las 12 funciones de una vez.

**Con la CLI.** Si prefieres versionar las migraciones:

```bash
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push          # pide la contraseña de la base de datos
```

> `aplicar_todo.sql` se genera juntando `supabase/migrations/*.sql`. Está verificado: aplicado en un
> PostgreSQL limpio deja 14 tablas y 12 funciones.

4. Comprueba que todo ha entrado bien:

```bash
npm run preflight      # proyecto, tablas, funciones y bucket de logos
```

5. `npm run dev` y entra en `/barbero/login`. La primera vez eliges **crear mi local**: se crea la
   cuenta, el local, sus servicios base y su horario.

### Qué hace el esquema

- `0001_esquema_inicial.sql`: 14 tablas, enums, índices, restricciones de coherencia y **RLS por
  local** en todas. El público anónimo no puede leer ninguna tabla: la tarjeta del cliente y la
  reserva pasan por funciones `security definer` que devuelven solo los campos necesarios.
- `0002_alta_local.sql`: `crear_local()`, la única puerta para insertar un local (crea también el
  barbero dueño, los servicios base y el horario).
- `0003_mostrador.sql`: `atender_cola()` cierra una visita en **una transacción** (cola, visita,
  movimiento de fidelización, recompensa si toca, cita atendida y evento) y `aplicar_recompensa()`.
- `0005_disponibilidad.sql`: `huecos_publicos()` calcula los huecos en el servidor (horario real,
  descansos, citas cogidas y bloqueos de agenda) y `solicitar_cita()` **rechaza el solapamiento** con
  un cerrojo por local: si dos clientes pulsan a la vez, el segundo recibe `horario_ocupado` en vez de
  una cita duplicada.
- `0004_cara_publica.sql`: lo que puede hacer un cliente sin cuenta con el token de su tarjeta:
  ver su ficha (`ficha_publica`), **cancelar su cita** con dos horas de margen y sin poder tocar
  citas ajenas (`cancelar_cita`), **editar teléfono, preferencias y consentimientos opcionales**
  (`actualizar_mis_datos`, que nunca toca el consentimiento de datos) y **pedir la baja**
  (`solicitar_baja`, que deja constancia al local).

### Privacidad del enlace del cliente

La tarjeta **no** usa el código interno (`P-0004`, secuencial y enumerable) sino `token_publico`, un
valor aleatorio por cliente. La ruta pública es `/c/<token>` y la reserva `/c/<token>/cita`. El código
numérico se queda como referencia interna de la barbería. Probado: `/c/P-0004` responde «esta tarjeta
no existe». Los enlaces se generan desde `cliente.tokenPublico`.

### El PIN de la tarjeta

El enlace de la tarjeta la abre sin pedir nada: quien lo tenga ve el nombre, el teléfono, las visitas
y la próxima cita. Si el cliente no quiere eso, desde **Mis datos → Poner un PIN** la protege con 4 a
6 cifras. A partir de ahí el enlace solo dice «tarjeta protegida»; ni el nombre, ni el teléfono, ni el
historial salen del servidor hasta que el PIN es correcto.

- **Cómo se guarda.** Nunca en claro: `clientes_pin.hash` es un bcrypt de `pgcrypto`. La tabla tiene
  RLS encendida y **sin políticas**, así que ni el barbero la lee; solo la tocan las funciones
  `security definer`. En el modo demo, que no tiene servidor, el PIN vive en el navegador y sirve
  para probar el flujo, no para proteger nada.
- **Intentos.** Cinco fallos seguidos bloquean la tarjeta quince minutos, y el bloqueo aguanta aunque
  después se acierte. Sin ese límite un PIN de cuatro cifras se rompe por fuerza bruta desde la
  consola del navegador: el bloqueo no es un extra, es lo que hace que el PIN sirva.
- **Acciones.** No solo la ficha: cancelar la cita, cambiar teléfono y preferencias, pedir la baja y
  reservar desde el enlace piden el mismo PIN.
- **Olvido.** El cliente no puede recuperarlo, y el barbero tampoco puede leerlo: desde la ficha del
  cliente se lo quita y vuelve a entrar con el enlace.
- **Alcance.** Es opcional por tarjeta y protege el enlace, no el móvil del barbero: con sesión
  abierta en el local, el llavero sigue abriendo la ficha sin PIN. El PIN se recuerda solo en la
  pestaña donde se escribió (`sessionStorage`).
- **Para que exista en el proyecto real** hay que aplicar `supabase/migrations/0010_pin_tarjeta.sql`
  (SQL Editor o `npx supabase db push`). Se puede aplicar antes de desplegar la app: las funciones
  nuevas llevan el PIN con valor por defecto, así que la versión anterior sigue funcionando mientras
  tanto.

---

## Pruebas

Suite de humo con navegador real contra el build de producción:

```bash
npm run build:demo     # modo local, sin Supabase: es contra lo que prueban los tests
npm run preview:demo   # en otra terminal (http://127.0.0.1:4173)
npm run test:e2e
```

Si tienes `.env.local`, `npm run build` compila en **modo real** y la suite, que da por hechos los
datos de demostración, no sirve: usa `build:demo`/`preview:demo` para probar.

Treinta y siete comprobaciones sobre los flujos que importan: portada, ruta protegida, acceso, cierre de un
servicio (con el contador de visitas), alta de cliente, tarjeta por token, el código enumerable
rechazado, reserva, el PIN de la tarjeta (ponerlo, cerrarla, negarlo, abrirla y quitarlo), salida con
y sin sesión, service worker, manifest y consola limpia. Cada
ejecución abre un navegador nuevo (sin sesión y sin datos), así que no toca tu navegador de trabajo.

Usa el Chrome del sistema (`channel: 'chrome'`): no descarga navegadores. Si prefieres los de
Playwright, `npx playwright install chromium` y cambia el `channel` en `tests/flujos.mjs`.

### El esquema, contra Postgres de verdad

```bash
npm run test:esquema
```

Levanta un **PostgreSQL 18 real en WASM** (PGlite), crea los roles y los esquemas `auth`/`storage`
que Supabase ya trae, aplica las migraciones tal cual y comprueba las reglas del negocio:
69 comprobaciones sobre el alta del local, las sillas, la coherencia de los llaveros, `atender_cola()` en
transacción, la recompensa que salta exactamente en la meta, el canje que no borra historial, la
ficha pública, la disponibilidad real (horario, descansos y bloqueos), la reserva sin dobles, la
cancelación con sus reglas, la baja del cliente y el PIN de la tarjeta (hash, intentos y bloqueo).

Es la forma de saber que el SQL es válido **antes** de tocar el proyecto real. Única adaptación: el
test quita la línea de `pgcrypto` porque en PG 18 `gen_random_uuid()` es nativo; en Supabase la
extensión se queda.

---

## Publicar

```bash
npm run build     # dist/
```

Cualquier hosting estático sirve: la app es un `index.html`, un par de ficheros y unos assets con
hash. No hay servidor propio.

### Cloudflare Pages (la casa)

Netlify dejó de publicar por créditos agotados: **cada despliegue de producción cuesta 15** y el plan
gratis da 300 al mes. Cloudflare Pages no cobra por despliegue ni por tráfico estático, así que es a
donde va el proyecto.

**Por la interfaz.** En el panel de Cloudflare → Workers & Pages → Create → Pages → Connect to Git,
elige `Alexande1018/julex` y rellena:

| Ajuste | Valor |
|---|---|
| Framework preset | `Vite` (o None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variable `VITE_SUPABASE_URL` | la del `.env.local` |
| Variable `VITE_SUPABASE_ANON_KEY` | la clave publicable del `.env.local` |
| Variable `NODE_VERSION` | `22` |

Las variables van en **Build → Variables and secrets** y son de compilación: sin ellas el sitio se
publica en modo local, con datos de ejemplo y sin Supabase. A partir de ahí, cada `git push` a `main`
publica solo.

**Sin conectar nada**, la vía más rápida: `npm run build` en esta máquina (las variables ya están en
`.env.local`, así que `dist/` sale en modo real) y en el panel, Workers & Pages → Upload assets,
arrastras la carpeta `dist`. Queda publicado al momento; la pega es que cada actualización hay que
volver a arrastrarla. Así se publicó la primera versión, el 11 de noviembre de 2026.

**Por línea de comandos**, si prefieres subir `dist/` ya compilado:

```bash
npx wrangler pages deploy dist --project-name julex
# necesita CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en el entorno
```

Lo que hace que funcione tal cual, sin tocar código:

- `public/_redirects` (`/* /index.html 200`) deja que las rutas profundas (`/c/<token>`,
  `/barbero/cola`, `/admin`) carguen la app en vez de dar 404.
- `public/_headers` pone el manifest con su tipo MIME, deja `sw.js` sin caché (para que entre una
  versión nueva del service worker) y marca `assets/*` como inmutable.

### Otros

- **Netlify**: la configuración sigue en `public/_redirects` y `.netlify/`; el mismo `dist/` vale.
  Con créditos, `npx netlify-cli deploy --prod --dir=dist`.
- **Vercel**: `vercel.json` con el mismo rewrite y las dos cabeceras que importan.

En cualquier hosting hay que declarar las mismas variables que en `.env.local`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Sin ellas la app arranca en modo local.

Al publicar una versión nueva, sube `CACHE` en `public/sw.js` (`julex-v1` → `julex-v2`): es lo que
tira la caché vieja del móvil.

**Dominio.** El chip NFC se graba con la URL definitiva y no se cambia después: elige el dominio antes
de la primera etiqueta. El nombre del proyecto en Cloudflare decide `https://<proyecto>.pages.dev`, y
**ese es el que queda grabado**; si vas a vender, compra el dominio antes de escribir el primer llavero
y añádelo como dominio personalizado.

---

## Dirección de arte

La identidad no son tarjetas: es **fotografía tratada + tipografía editorial**.

- **Duotono horneado.** Las imágenes vienen ya reveladas desde `public/img` en dos tonos (carbón
  `#1A1B17` → papel `#EFE9DB`), con grano. Así una foto de archivo de 1938 y una foto actual
  pertenecen a la misma casa.
- **Papel, no pantalla.** Fondo marfil, filetes de un píxel, sombras casi inexistentes, grano sutil
  sobre todo el documento.
- **Tipografía con eje óptico.** Fraunces se carga completa (`full.css`), no solo el peso: los
  titulares usan `opsz 144` con peso 355, que es lo que hace que la serif parezca dibujada para ese
  tamaño en vez de escalada. Manrope para la interfaz. Etiquetas en mayúsculas con tracking amplio.
- **Ritmo, no acumulación.** Portada en tres tiempos: marfil, banda de tinta y fotografía a sangre.
  Las cifras grandes (precio, meses) van en serif óptico; el texto pequeño, en sans.
- **La foto aparece donde hay emoción, no donde hay trabajo.** Portada, acceso del barbero, cabecera
  de la tarjeta del cliente y estado vacío de la cola. La cola del día, la ficha y el panel se quedan
  en texto: ahí la velocidad manda.

Créditos de las dos fotografías en [`public/img/creditos.md`](public/img/creditos.md) y en `/legal`.
Antes de vender el producto se sustituirán por fotografía propia o con licencia de banco.

---

## Arrancar

```bash
cd julex
npm install
npm run dev          # http://localhost:5173  (y http://TU-IP:5173 en el móvil)
npm run build        # build de producción en dist/
npm run typecheck    # TypeScript sin emitir
```

Requiere Node 20+ (probado con Node 24.22.1).

Para probar desde el móvil en la misma wifi, `npm run dev` ya escucha en toda la red: abre `http://192.168.x.x:5173`.

---

## Las superficies

| Ruta | Quién | Qué hace |
|---|---|---|
| `/barbero/*` | Barbero | Cola, ficha, clientes, agenda, panel, ajustes. Protegido: sin sesión redirige a `/barbero/login`. |
| `/nfc/:token` | El llavero | Si está en blanco, pide a quién se lo das. Si ya es de alguien, abre su ficha. Si está retirado, página neutra. |
| `/c/:codigo` · `/c/:codigo/cita` · `/cita/:slug` | Cliente | Su tarjeta, su fidelización, pedir cita. Sin cuenta. |
| `/admin` | El administrador | Lista de locales, alta de local con su barbero, cuotas. Solo cuentas de la tabla `admins`; a un barbero lo devuelve a su cola. Sin sesión, lleva a la puerta del administrador (`/barbero/login?rol=admin&next=/admin`) y vuelve aquí al entrar. |
| `/admin/local/:id` | El administrador | Ficha de un local: su cuenta (correo, contraseña, bloquear), sus llaveros y sus lotes. |

Además: `/` (portada con el simulador de llavero) y `/legal` (textos de consentimiento).

---

## Tipo de negocio

La entidad `barberias` es el **local**, sea del sector que sea. Cada local guarda su `tipo`, y la app
usa ese dato para llamar a las cosas por su nombre. **El administrador lo elige al crear el local**;
después puede cambiarlo él desde la ficha del local, o el propio local desde Ajustes.

| Tipo | Pantalla | Puesto | Ficha del cliente |
|---|---|---|---|
| `barberia` | La cola | Sillón | Cómo corta |
| `peluqueria` | La agenda | Puesto | Preferencias de estilo |
| `unas` | Citas | Mesa | Diseño y preferencias |
| `tatuaje` | Citas | Estación | Diseño y notas del proyecto |

El tipo también decide **con qué nace el local**: el nombre de su primer puesto y sus tres servicios
de partida. Una barbería arranca con Corte, Corte + barba y Niño; un salón de uñas, con Manicura,
Pedicura y Semipermanente; un estudio de tatuaje, con tres tamaños de sesión.

Lo que **no** cambia: los servicios, precios, duraciones y puestos son datos de cada local y se
editan en Ajustes. Una peluquería puede trabajar con cola y un estudio puede renombrar sus mesas.
El tipo solo cambia el vocabulario y los valores iniciales.

Está en `barberias.tipo` (enumerado `tipo_negocio`), en `src/lib/vocabulario.ts` —el único sitio con
las etiquetas— y en `sembrar_local()`, que siembra el puesto y los servicios de partida.

---

## Qué funciona de verdad

Todo esto se ejecuta, muta datos y **sobrevive a recargar** (localStorage `julex.demo.v1`):

**Cola del día**
- Cliente en sillón con cronómetro en vivo, servicio y su «cómo corta».
- Terminar → registra la visita, sube el contador, actualiza última visita, comprueba la promoción y avisa si ha ganado un corte gratis.
- Pasar al sillón, marcar «no vino» (con confirmación), ver cerrados del día.
- Nuevo cliente desde la propia cola.

**Ficha del cliente**
- «Cómo corta» como bloque principal, editable en línea.
- Notas y preferencias editables; última visita, cortes y gastado.
- Llavero: código, fecha, copiar enlace y retirar (irreversible).
- Fidelización con sellos y recompensas aplicables.
- Historial completo de visitas.

**Alta rápida**
- Nombre, teléfono, cómo corta, notas y preferencias.
- Tres consentimientos separados (datos / avisos / recordatorios) con enlaces legales.
- Al guardar: código único, opción de vincular un llavero del lote y añadir a la cola.

**Llavero NFC (sin botón de leer)**
- `/nfc/:token` resuelve el chip y abre **dos puertas con la misma URL**: con la sesión de la
  barbería abre la ficha (vincular, ver, poner en cola); sin sesión —el móvil del propio cliente—
  le lleva a **su tarjeta**, con sus sellos y su reserva ya personalizada.
- El puente es una única función pública, `llavero_tarjeta(token)`, que devuelve **solo** el token
  opaco de la tarjeta: ni nombre, ni teléfono, ni historial. Lo que se ve después lo decide la
  tarjeta, con su PIN si lo tiene. La pantalla de la tarjeta, cuando llega desde un llavero, invita
  a poner PIN y ofrece al barbero volver a entrar con `?next=/nfc/...`.
- Funciona con la aplicación cerrada porque es una URL normal, como hará el sistema operativo.
- El llavero retirado muere para siempre: `llavero_tarjeta()` devuelve vacío y no revela a quién
  perteneció.
- Por eso **el llavero no necesita QR personal**: en su cara B basta el código corto (`PBL-7K4Q`)
  para el inventario. El QR del local (`/cita/<slug>`) es aparte, para quien entra sin llavero.

**Tarjeta del cliente**
- Cabecera de socio con el color de la barbería, saludo, próxima cita (con cancelación), sellos, historial.
- «Mis datos»: teléfono, preferencias, consentimientos, descarga en JSON y solicitud de baja.

**Reservas**
- Servicio → día → hora → confirmación, en una sola pantalla.
- Huecos reales: 10:00–20:00 cada 30 min, sin solapar con citas existentes, respetando la duración del servicio y sin horas pasadas.
- Elige por defecto el primer día con hueco. La cita nace **pendiente** y con su origen (`qr`, `web`, `llavero`, `manual`).

**Agenda, panel y ajustes**
- Agenda por día con estados y acciones (confirmar, no vino, cancelar, nueva cita manual).
- Panel: clientes, llaveros activos, citas del mes, ingresos, gráfico de 8 semanas, origen de citas e inactivos +30 días con recordatorio.
- Ajustes: **logo del local** (subida, recorte automático a 512 px y borrado), nombre, teléfono, dirección, color de marca, meta de fidelización, precios y duraciones, cuota calculada, exportación, reinicio de demo y cierre de sesión.

**Consola del creador**
- Barberías con su cuota, inventario de llaveros (copiar URL del chip, probar), generación de lotes y registro de mensajes.

**Salida**
- **Salir** en la barra del local (a la derecha en escritorio, sexta celda en la barra inferior del móvil) y en el panel del administrador; **Cerrar** en la tarjeta del cliente y en la reserva.
- En el local y en el panel pide confirmación, cierra la sesión (Supabase o local) y vuelve a la portada; desde ahí, la cola vuelve a pedir acceso.
- En la tarjeta del cliente y en la reserva **no** cierra sesión: el barbero que abre la tarjeta que le enseña un cliente vuelve a la portada sin tener que entrar otra vez.

---

## Cumplimiento

Lo que está implantado y lo que no.

**Datos y permisos.** La casilla obligatoria del alta ya no es un consentimiento: es la constancia
de que se entregó la información de privacidad. Los permisos son tres, separados y desmarcados
—fidelización, preferencias y promociones—, y se pueden retirar desde la tarjeta. Los avisos de
turno son parte del servicio.

**Baja.** El cliente pide la baja desde su tarjeta: se apagan sus comunicaciones al momento y se crea
una **solicitud** que entra en la bandeja del local (Ajustes → Solicitudes de baja), con un mes de
plazo. El local elige **anonimizar** (se borran nombre, teléfono, notas y preferencias y se retira el
llavero; las visitas quedan sin datos personales) o **bloquear** (la ficha se conserva pero ni la
tarjeta ni el llavero vuelven a abrirla).

**Tarjeta.** El PIN es opcional, pero cuando la tarjeta llega desde un llavero la app invita a
ponerlo. Los clientes bloqueados o anonimizados no tienen tarjeta pública.

**Datos sensibles.** Las notas y las preferencias avisan de que no se guarden datos de salud, y el
formulario rechaza los términos inequívocos (alergias, medicación, diagnósticos…). «Cómo corta» ya
no es obligatorio.

**Textos.** `/legal` es el índice; cada documento vive en su ruta: `/aviso-legal`, `/privacidad`,
`/cookies`, `/condiciones`, `/encargo-tratamiento`, `/creditos`, `/accesibilidad`. Cada local tiene
las suyas: `/local/<slug>/legal`, `/privacidad`, `/reservas` y `/fidelizacion`, con su domicilio y su
correo legales (se piden al crear el local y se editan en Ajustes).

**Precio publicado.** Alta 30 € + IVA con 15 llaveros, que incluye el primer mes; cuota 15 €/mes +
IVA desde el día 1 del mes siguiente; 1 € + IVA por cada llavero activo a partir del decimosexto, con
el recuento tomado el día 1 de cada mes.

**Cobro.** Cada local tiene `proximo_pago` y un `estado_cobro` que avanza solo:
`al_dia` → `pendiente` (venció hace menos de 8 días, todo sigue) → `lectura` (hasta 15 días: el local
no puede escribir, sus clientes sí reservar y usar su tarjeta) → `suspendido` (no entra, páginas
públicas ocultas y llaveros que dejan de abrir). `revisar_cobros()` aplica la escalera y corre a
diario con pg_cron (6:00); también se puede lanzar a mano desde el panel. El llavero no se retira:
se marca `suspendido` y vuelve al pagar. Desde la ficha del local, el administrador marca el mes
pagado (`marcar_pagado`) o suspende a mano con una nota (`suspender_local`). La suspensión manual no
la revierte el barrido.

**Pendiente, y no es código:** aceptar y conservar los DPA de Supabase y Cloudflare, revisar los
textos con un abogado antes de cobrar a un local real, y cerrar o redirigir el dominio antiguo de
Netlify. La retención aprobada (un año tras la última visita, seis meses las reservas no atendidas,
cinco años la facturación, noventa días los registros, treinta las copias) está escrita en
`/privacidad`, pero no hay todavía un proceso automático que la ejecute.

## Qué es real y qué falta

Real, sobre Supabase: cuentas con correo y contraseña, RLS por local, sillas con capacidad,
reservas sin dobles, cola con reparto automático, tarjeta del cliente por token, llaveros con
vinculación permanente y el panel de administrador con sus locales.

| Cosa | Estado |
|---|---|
| Lectura NFC | La hace el móvil del cliente al acercar el chip: abre `/nfc/:token`. La app no lee chips. |
| WhatsApp / SMS | **Próximamente.** Los avisos quedan registrados; el envío automático llega después. |
| Cobro de la cuota | Se **calcula** (máximo entre 15 € y llaveros activos), no se factura. |
| Reseñas, bonos, club, caja | No construidos. |

Los ingresos se calculan **a precio de tarifa** a partir de visitas registradas; la caja real
(efectivo, tarjeta, bonos) no existe todavía.

## Grabar un llavero de verdad

El chip **no conoce al cliente**. Se graba en blanco, en el taller, y nunca se vuelve a escribir.

1. En `/admin`, pulsa **Generar lote de 15**. Cada llavero recibe un token aleatorio y un código legible (`PBL-7K4Q`).
2. En la ficha del local, cada fila del inventario tiene un botón para **copiar la URL del chip**:
   `https://julex.pages.dev/nfc/<token>`. Hazlo desde el móvil con el que vas a grabar.
3. Graba esa URL en un **NTAG213/215/216** con una app de escritura NDEF (por ejemplo NFC Tools):
   URL en texto plano, no un enlace de app ni un acortador. Copiar, pegar, acercar la etiqueta.
4. Etiqueta cada llavero con **su** código corto, para poder encontrarlo en el inventario.
5. Comprueba tocándolo con el móvil **sin sesión**: debe decir «Este llavero aún no tiene tarjeta».
6. En la barbería: el barbero lo acerca a su móvil → la app pide a quién se lo da → vinculado. Desde
   entonces, ese mismo llavero abre la ficha con el barbero y la tarjeta con el cliente.

**No lleva QR personal.** Desde la migración 0011 el chip basta para las dos puertas, así que en la
cara B solo va el código corto. El QR del local (`/cita/<slug>`) es otra cosa: se imprime desde
Ajustes y sirve para quien entra sin llavero.

Bloquear el chip como **solo lectura** (NFC Tools lo permite) evita que lo reescriban en la barbería,
pero es irreversible: hazlo solo cuando el dominio sea definitivo.

**Enlaces universales (pendiente de Fase 4).** Para que abra la PWA instalada en vez del navegador hacen falta:

- Un dominio propio con HTTPS.
- `apple-app-site-association` servido en `/.well-known/` y el entitlement `associated-domains` en la app iOS.
- `assetlinks.json` en `/.well-known/` con la huella SHA-256 del certificado Android.
- La PWA empaquetada (o una app nativa) para ambas tiendas.

Mientras eso no exista, la URL abre el navegador y funciona igual: es una consecuencia del diseño, no un fallo.

---

## Arquitectura

```
src/
  lib/
    types.ts     modelo de datos (barberías, clientes, llaveros, citas, cola, visitas, fidelización…)
    seed.ts      datos de demostración coherentes, con fechas relativas a hoy
    store.ts     estado único + localStorage + useSyncExternalStore
    actions.ts   todas las mutaciones del dominio (atender, vincular, reservar…)
    derive.ts    selectores y cálculos (cola del día, fidelidad, cuota, métricas)
    publico.ts   tarjeta y reserva sin sesión: misma forma de datos desde el almacén o desde las RPC
                 (ficha_publica, local_publico, huecos_publicos, solicitar_cita, cancelar_cita…)
    format.ts    fechas, dinero, duraciones, cronómetro
    ids.ts       identificadores y tokens
  components/    ui.tsx (botones, hojas, campos, avisos), Shell, Timer
  routes/        una pantalla por fichero
```

**Conectar Supabase** no obliga a rehacer la interfaz: `actions.ts` es la única puerta de escritura y `derive.ts` la única de lectura. Sustituir el store por consultas y las acciones por llamadas a Supabase mantiene las pantallas intactas.

Tablas previstas: `barberias`, `barberos`, `clientes`, `servicios`, `llaveros`, `citas`, `cola`, `visitas`,
`movimientos_fidelizacion`, `recompensas`, `mensajes_log`, `eventos`, `consentimientos`, `horarios`, `bloqueos_agenda`, `pagos`.

**El local.** La entidad `barberias` es en realidad el **local**: nombre, logo, teléfono, dirección, color de
marca y meta de fidelización. Está pensada para servir igual a una barbería, una peluquería o un salón de
uñas sin cambiar el modelo: el tipo del local (`barberias.tipo`) decide el vocabulario y los valores con
los que nace, y la portada habla de cualquier negocio que atienda con cita o cola.

**Logo.** En modo local se guarda como data URL WebP (máx. 512 px, ~7 KB). Con Supabase configurado se
sube a Storage (`logos/<barberia>/logo.webp`) y la tabla guarda solo la URL pública, con marca de
tiempo para que el móvil no siga enseñando el logo viejo. El recorte se hace en el navegador antes de
subir, así que nunca viaja una foto de 3 MB.

Notas para el paso a producción:

- Todas las entidades llevan `barberiaId`: RLS por barbería en cada tabla.
- La tarjeta del cliente y la reserva pública no deben leer la tabla `clientes` entera: vistas o funciones `security definer` por código/token.
- El rol del creador solo ve logística: nada de `comoCorta`, `notas`, `visitas` ni importes de la barbería.
- Los tokens de llavero son opacos y revocables; el token retirado no se reutiliza nunca.

---

## Reglas de producto ya cerradas

- **El llavero muere con el cliente.** Un llavero retirado no se reasigna: su token y su QR quedan muertos para siempre.
- **Sin planes.** Todo lo construido va incluido; no hay botones bloqueados ni mejoras de plan.
- **Cuota = `max(15, llaveros activos)`.** Con cero activos se siguen cobrando 15 €: es una cuota fija de hecho, y se dice tal cual.
- **Demo aislada.** Clave `julex.demo.v1`, versión de seed en `SEED_VERSION`. Nada toca datos reales.

Datos de demostración: Barbería Pablo, 3 servicios (15 €/30 min, 22 €/45 min, 10 €/20 min), 6 clientes (P-0001…P-0006, con 3, 7, 12, 23, 1 y 9 cortes), 15 llaveros (uno retirado), 3 citas hoy y 3 mañana, dos clientes esperando, uno en el sillón y una promoción 10+1.

---

## Pruebas hechas (Chrome real, Playwright)

- Portada y simulador de llavero.
- Ruta protegida: `/barbero/cola` sin sesión → login → vuelta a la cola.
- Terminar un corte: visita registrada, contador a 24, toast, sillón libre, cliente en «cerrados».
- Pasar al siguiente: cronómetro arranca, cola se reordena.
- Ficha: lectura de todos los bloques, edición de «cómo corta», retirada de llavero con confirmación.
- Llavero en blanco → vinculación a un cliente → la misma pantalla pasa a ficha con su estado de cola.
- Llavero activo → añadir a la cola desde el toque.
- Alta rápida completa (P-0007), vinculación de llavero y persistencia tras recargar.
- Tarjeta del cliente, sellos, historial, próxima cita.
- Reserva: huecos reales, día por defecto con hueco, cita creada como pendiente y visible en la agenda.
- Panel con gráfico y cliente inactivo con recordatorio simulado.
- Consola del creador con inventario y cuota.
- `npm run typecheck` y `npm run build` en verde.

Pendiente de probar en hardware: lectura de un chip físico y enlaces universales.

---

## Lo que falta (y en qué orden)

1. **Supabase real**: auth, tablas, RLS y sustituir el store. La demo y los datos falsos se quedan como modo aparte.
2. **PWA instalable**: manifest, iconos, service worker y estrategia offline.
3. **Enlaces universales** y dominio.
4. **Mensajería real**: WhatsApp Business o SMS con cola de envíos, cron y registro de bajas.
5. **Caja**: cobros en efectivo, tarjeta y bonos, para separar ingresos reales de estimados.
6. **Bonos, club y reseñas**, cuando haya barberías usándolo y digan cuál les falta.
7. **Multi-barbero y permisos**.

---

## Capturas

En `shots/`, generadas con el navegador real durante el desarrollo: portada en móvil y escritorio,
cola del día, ficha, tarjeta del cliente, reserva, panel, consola y el estado vacío de la cola.
