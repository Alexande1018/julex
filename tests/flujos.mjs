/**
 * Pruebas de humo de JULEX contra el build de producción.
 *
 *   npm run build
 *   npm run preview          (en otra terminal, o deja que el script arranque)
 *   npm run test:e2e
 *
 * Usa el Chrome del sistema (`channel: 'chrome'`), así que no descarga nada.
 * Cada ejecución arranca un navegador limpio: sin sesión y sin datos previos.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';

const resultados = [];
let fallos = 0;

function ok(condicion, titulo, detalle = '') {
  resultados.push({ ok: Boolean(condicion), titulo, detalle });
  if (!condicion) fallos++;
  const marca = condicion ? '  ok  ' : ' FALLO';
  console.log(`${marca} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await contexto.newPage();

const errores = [];
page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errores.push(`console: ${m.text()}`);
});

const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('julex.demo.v1') || '{}'));

/** Espera a que un elemento sea visible de verdad (isVisible no espera). */
async function visible(locador, ms = 6000) {
  try {
    await locador.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/** Espera a que el estado cumpla una condición, en vez de dormir a ciegas. */
async function esperarEstado(condicion, ms = 4000) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    if (condicion(await db())) return true;
    await page.waitForTimeout(80);
  }
  return false;
}

try {
  /* 1. Portada */
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  ok((await page.title()).includes('JULEX'), 'La portada carga con su título');
  ok(await visible(page.getByRole('heading', { level: 1 })), 'Hay un titular visible');

  /* 2. Ruta protegida y acceso */
  await page.goto(`${BASE}/barbero/cola`, { waitUntil: 'networkidle' });
  ok(page.url().includes('/barbero/login'), 'Sin sesión, la cola redirige al acceso');
  await page.getByRole('button', { name: /entrar/i }).first().click();
  await page.waitForURL('**/barbero/cola');
  ok(page.url().includes('/barbero/cola'), 'Tras entrar se vuelve a la cola');
  ok(await visible(page.getByText('La cola')), 'La cola se pinta');

  /* 3. Cerrar un servicio */
  const antes = (await db()).visitas.length;
  const terminar = page.getByRole('button', { name: /^Terminar$/i });
  if (await terminar.count()) {
    await terminar.first().click();
    const subio = await esperarEstado((d) => d.visitas.length === antes + 1);
    const despues = (await db()).visitas.length;
    ok(subio, 'Terminar registra la visita', `${antes} → ${despues}`);
    ok((await db()).cola.every((q) => q.estado !== 'sillon'), 'El sillón queda libre');
  } else {
    ok(false, 'Terminar: no hay nadie en el sillón para probar');
  }

  /* 4. Alta rápida */
  await page.goto(`${BASE}/barbero/alta`, { waitUntil: 'networkidle' });
  await page.locator('input[placeholder="Pablo Martínez"]').fill('Prueba Automática');
  await page
    .locator('textarea[placeholder^="Degradado bajo"]')
    .fill('Degradado medio, laterales a 1. Prueba automática de la suite.');
  await page.getByRole('button', { name: /crear cliente/i }).click();
  const creadoOk = await esperarEstado((d) => (d.clientes ?? []).some((c) => c.nombre === 'Prueba Automática'));
  ok(creadoOk && (await visible(page.getByText('ya está en la barbería'))), 'El alta confirma la creación');
  const creado = (await db()).clientes.find((c) => c.nombre === 'Prueba Automática');
  ok(!!creado && /^P-\d{4}$/.test(creado.codigo), 'El cliente recibe código', creado?.codigo);
  ok(/^[a-z0-9]{8,}$/.test(creado?.tokenPublico ?? ''), 'Y un token público aleatorio');

  /* 5. Tarjeta del cliente por token */
  const pablo = (await db()).clientes.find((c) => c.codigo === 'P-0004');
  await page.goto(`${BASE}/c/${pablo.tokenPublico}`, { waitUntil: 'networkidle' });
  ok(await visible(page.getByText('Hola, Pablo.')), 'La tarjeta saluda al cliente');
  ok(await visible(page.getByText('P-0004')), 'Enseña su código interno');

  /* 5b. El cliente edita sus datos desde la tarjeta */
  await page.getByRole('button', { name: /mis datos/i }).click();
  await page.locator('input[inputmode="tel"]').first().fill('699111222');
  await page.getByRole('button', { name: /guardar cambios/i }).click();
  const editado = await esperarEstado(
    (d) => (d.clientes ?? []).find((c) => c.codigo === 'P-0004')?.telefono === '699111222',
  );
  ok(editado, 'El cliente edita su teléfono');

  /* 5c. Y cancela su cita */
  const antesCancelar = (await db()).citas.filter((c) => c.estado === 'cancelada').length;
  await page.getByRole('button', { name: /cancelar esta cita/i }).click();
  await page.getByRole('button', { name: /sí, cancelar/i }).click();
  const cancelada = await esperarEstado(
    (d) => (d.citas ?? []).filter((c) => c.estado === 'cancelada').length === antesCancelar + 1,
  );
  ok(cancelada, 'El cliente cancela su cita');

  /* 6. El código enumerable ya no abre la tarjeta */
  await page.goto(`${BASE}/c/P-0004`, { waitUntil: 'networkidle' });
  ok(
    await visible(page.getByText('Esta tarjeta no existe')),
    'El código interno no sirve como enlace público',
  );

  /* 7. Reserva */
  await page.goto(`${BASE}/c/${pablo.tokenPublico}/cita`, { waitUntil: 'networkidle' });
  const hueco = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first();
  ok((await hueco.count()) > 0, 'Hay huecos disponibles');
  await hueco.click();
  const citasAntes = (await db()).citas.length;
  await page.getByRole('button', { name: /solicitar cita/i }).click();
  const reservada = await esperarEstado((d) => (d.citas ?? []).length === citasAntes + 1);
  ok(reservada && (await visible(page.getByText('Cita solicitada.'))), 'La reserva se confirma');
  ok(await visible(page.getByText('DÓNDE')), 'El resumen enseña dónde es');

  /* 7b. Reserva de un cliente nuevo, por el enlace del local */
  await page.goto(`${BASE}/cita/barberia-pablo`, { waitUntil: 'networkidle' });
  ok(await visible(page.getByText('Barbería Pablo')), 'La reserva pública por slug carga');
  ok(
    (await page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).count()) > 0,
    'Y ofrece huecos sin conocer al cliente',
  );

  /* 8. PWA */
  const pwa = await page.evaluate(async () => {
    const registros = await navigator.serviceWorker.getRegistrations();
    const manifest = await fetch('/manifest.webmanifest').then((r) => (r.ok ? r.json() : null));
    return { registros: registros.length, manifest: manifest?.display ?? null, iconos: manifest?.icons?.length ?? 0 };
  });
  ok(pwa.registros > 0, 'El service worker está registrado');
  ok(pwa.manifest === 'standalone', 'El manifest es instalable', pwa.manifest ?? '' );
  ok(pwa.iconos >= 2, 'El manifest trae iconos', `${pwa.iconos} iconos`);

  /* 8b. Salir desde la ventana del local: pide permiso, cierra sesión y vuelve al inicio */
  await page.goto(`${BASE}/barbero/cola`, { waitUntil: 'networkidle' });
  const salirMovil = page.getByRole('button', { name: 'Salir' }).filter({ visible: true });
  await salirMovil.first().click();
  const hojaSalir = page.getByRole('dialog', { name: '¿Salir?' });
  ok(await visible(hojaSalir), 'Salir pide confirmación antes de cerrar');
  await hojaSalir.getByRole('button', { name: 'Salir' }).click();
  const volvioAlInicio = await page
    .waitForFunction(() => location.pathname === '/', null, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  ok(volvioAlInicio, 'Salir vuelve al inicio');
  ok(await esperarEstado((d) => !d.sesion), 'Salir cierra la sesión del local');

  await page.goto(`${BASE}/barbero/cola`, { waitUntil: 'networkidle' });
  ok(page.url().includes('/barbero/login'), 'Después de salir, la cola vuelve a pedir acceso');

  /* 8c. La tarjeta del cliente sale sin desconectar el navegador del barbero */
  await page.getByRole('button', { name: /entrar/i }).first().click();
  await page.waitForURL('**/barbero/cola');
  await page.goto(`${BASE}/c/${pablo.tokenPublico}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).filter({ visible: true }).first().click();
  const salioDeLaTarjeta = await page
    .waitForFunction(() => location.pathname === '/', null, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  ok(salioDeLaTarjeta && Boolean((await db()).sesion), 'La tarjeta sale sin cerrar la sesión');

  /* 9. Consola limpia */
  ok(errores.length === 0, 'Sin errores en consola', errores.slice(0, 3).join(' | '));
} catch (e) {
  fallos++;
  console.log(`\n FALLO inesperado: ${e.message}`);
} finally {
  await browser.close();
}

const total = resultados.length;
console.log(`\n${total - fallos}/${total} comprobaciones correctas`);
process.exit(fallos === 0 ? 0 : 1);
