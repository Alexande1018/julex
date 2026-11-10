# JULEX

Herramienta para barberías con llavero NFC: la cola del día, la ficha de cada cliente y su tarjeta de socio.
**Estado: Fase 1 terminada y funcionando.** Datos de demostración, persistencia local y ninguna integración externa conectada.

- Alta: **30 €** una vez, con 15 llaveros.
- Cuota: **15 €/mes mínimo**; **1 € por llavero activo** a partir del decimoquinto, desde el segundo mes.
- Sin planes, sin módulos, sin letra pequeña.

---

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

---

## Pruebas

Suite de humo con navegador real contra el build de producción:

```bash
npm run build
npm run preview        # en otra terminal (http://127.0.0.1:4173)
npm run test:e2e
```

Veinte comprobaciones sobre los flujos que importan: portada, ruta protegida, acceso, cierre de un
servicio (con el contador de visitas), alta de cliente, tarjeta por token, el código enumerable
rechazado, reserva, service worker, manifest y consola limpia. Cada ejecución abre un navegador
nuevo (sin sesión y sin datos), así que no toca tu navegador de trabajo.

Usa el Chrome del sistema (`channel: 'chrome'`): no descarga navegadores. Si prefieres los de
Playwright, `npx playwright install chromium` y cambia el `channel` en `tests/flujos.mjs`.

### El esquema, contra Postgres de verdad

```bash
npm run test:esquema
```

Levanta un **PostgreSQL 18 real en WASM** (PGlite), crea los roles y los esquemas `auth`/`storage`
que Supabase ya trae, aplica las migraciones tal cual y comprueba las reglas del negocio: 30
48 comprobaciones sobre el alta del local, la coherencia de los llaveros, `atender_cola()` en
transacción, la recompensa que salta exactamente en la meta, el canje que no borra historial, la
ficha pública, la disponibilidad real (horario, descansos y bloqueos), la reserva sin dobles, la
cancelación con sus reglas y la baja del cliente.

Es la forma de saber que el SQL es válido **antes** de tocar el proyecto real. Única adaptación: el
test quita la línea de `pgcrypto` porque en PG 18 `gen_random_uuid()` es nativo; en Supabase la
extensión se queda.

---

## Publicar

```bash
npm run build     # dist/
```

Cualquier hosting estático sirve. Ya hay configuración incluida:

- **Netlify / Cloudflare Pages**: `public/_redirects` deja que las rutas profundas
  (`/c/<token>`, `/barbero/cola`) carguen la app en vez de dar 404.
- **Vercel**: `vercel.json` con el mismo rewrite y dos cabeceras que importan: `sw.js` sin caché (para
  que una versión nueva del service worker entre) y el manifest con su tipo MIME correcto.

En el hosting hay que declarar las mismas variables que en `.env.local`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Sin ellas la app arranca en modo local.

Al publicar una versión nueva, sube `CACHE` en `public/sw.js` (`julex-v1` → `julex-v2`): es lo que
tira la caché vieja del móvil.

**Dominio.** El chip NFC se graba con la URL definitiva y no se cambia después: elige el dominio antes
de la primera etiqueta.

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

## Las cuatro superficies

| Ruta | Quién | Qué hace |
|---|---|---|
| `/barbero/*` | Barbero | Cola, ficha, clientes, agenda, panel, ajustes. Protegido: sin sesión redirige a `/barbero/login`. |
| `/nfc/:token` | El llavero | Si está en blanco, pide a quién se lo das. Si ya es de alguien, abre su ficha. Si está retirado, página neutra. |
| `/c/:codigo` · `/c/:codigo/cita` · `/cita/:slug` | Cliente | Su tarjeta, su fidelización, pedir cita. Sin cuenta. |
| `/admin` | El creador | Barberías, inventario, cuota y mensajes simulados. Sin datos privados. |

Además: `/` (portada con el simulador de llavero) y `/legal` (textos de consentimiento).

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
- `/nfc/:token` resuelve el chip: vincular, abrir ficha o página neutra.
- Funciona con la aplicación cerrada porque es una URL normal, como hará el sistema operativo.
- Si no hay sesión, pide entrar y **vuelve a la operación pendiente** (`?next=/nfc/...`).
- El llavero retirado muere para siempre y no revela a quién perteneció.

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

---

## Qué está simulado (y se dice en pantalla)

| Cosa | Estado |
|---|---|
| Lectura NFC | **Simulada por URL.** No hay Web NFC ni escucha en segundo plano: se abre `/nfc/:token`, igual que hará el móvil. |
| WhatsApp / SMS | **Nada se envía.** Los mensajes se guardan como `simulado` y así se muestra. |
| Cobro de la cuota | Se **calcula**, no se factura ni se pasa ningún cargo. |
| Login | Sin contraseña: botón de demo. En producción lo resuelve Supabase Auth. |
| Base de datos | `localStorage` del navegador. Aislada de cualquier dato real. |
| Reseñas, bonos, club, caja | No construidos (Fase 2/3). |

Los ingresos se calculan **a precio de tarifa** a partir de visitas registradas; la caja real (efectivo, tarjeta, bonos) no existe todavía y el panel lo dice.

---

## Grabar un llavero de verdad

El chip **no conoce al cliente**. Se graba en blanco, en el taller, y nunca se vuelve a escribir.

1. En `/admin`, pulsa **Generar lote de 15**. Cada llavero recibe un token aleatorio y un código legible (`PBL-7K4Q`).
2. Copia la URL de cada chip: `https://TU-DOMINIO/nfc/<token>`.
3. Graba esa URL en un **NTAG213/215/216** con cualquier app de escritura NDEF (por ejemplo NFC Tools). URL en texto plano NDEF, no un enlace de app.
4. Pega el QR del mismo token en la otra cara (una etiqueta QR normal, apuntando a `/nfc/<token>` o a `/q/<token>` cuando exista la ruta de reserva).
5. En la barbería: el cliente acerca el llavero al móvil del barbero → la app pide a quién se lo da → vinculado. A partir de ahí, ese toque abre su ficha.

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
marca y meta de fidelización. Está pensada para servir igual a una barbería, una peluquería o un taller sin
cambiar el modelo; el copy de la portada sí habla de barberías porque es el mercado inicial.

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
