/**
 * Pruebas del motor del asistente, sin Deno, sin Supabase y sin clave.
 *
 *   node tests/asistente.mjs
 *
 * Comprueba el bucle de herramientas, la validación de argumentos, el
 * prompt que se construye con datos y el adaptador del proveedor.
 */
import {
  conversar,
  validarArgumentos,
  proveedorGuion,
  proveedorOpenAI,
  LimiteDeTurnos,
  ErrorDeArgumentos,
} from '../supabase/functions/asistente/engine.ts';
import { construirSistema } from '../supabase/functions/asistente/prompt.ts';
import { ESQUEMAS } from '../supabase/functions/asistente/herramientas.ts';

let fallos = 0;
let total = 0;
function ok(condicion, titulo, detalle = '') {
  total++;
  if (!condicion) fallos++;
  console.log(`${condicion ? '  ok  ' : ' FALLO'} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
}

const HERRAMIENTA = {
  nombre: 'huecos',
  descripcion: 'consulta huecos',
  parametros: ESQUEMAS.huecos,
  ejecutar: async (args) => ({ horas: ['10:00'], servicio: args.servicio }),
};

/* 1. Sin herramientas: responde y ya */
{
  const r = await conversar({
    proveedor: proveedorGuion([{ texto: '  Hola, Pablo.  ' }]),
    sistema: 's',
    mensajes: [{ papel: 'cliente', texto: 'hola' }],
    herramientas: [],
  });
  ok(r.texto === 'Hola, Pablo.' && r.llamadas.length === 0, 'Responde y recorta el texto');
}

/* 2. Llama a una herramienta y después contesta */
{
  const r = await conversar({
    proveedor: proveedorGuion([
      { llamadas: [{ id: 'c1', nombre: 'huecos', argumentos: { servicio: 'Corte', desde: '2026-12-01' } }] },
      { texto: 'Tengo las 10:00.' },
    ]),
    sistema: 's',
    mensajes: [{ papel: 'cliente', texto: '¿hueco?' }],
    herramientas: [HERRAMIENTA],
  });
  ok(r.texto === 'Tengo las 10:00.' && r.llamadas[0] === 'huecos', 'Ejecuta la herramienta y sigue');
}

/* 3. Herramienta desconocida: no se ejecuta, se le dice al modelo */
{
  let ejecutada = false;
  const espia = { ...HERRAMIENTA, ejecutar: async () => { ejecutada = true; return {}; } };
  const r = await conversar({
    proveedor: proveedorGuion([
      { llamadas: [{ id: 'c1', nombre: 'borrar_todo', argumentos: {} }] },
      { texto: 'No puedo con eso.' },
    ]),
    sistema: 's',
    mensajes: [{ papel: 'cliente', texto: 'x' }],
    herramientas: [espia],
  });
  ok(!ejecutada && r.texto === 'No puedo con eso.', 'Una herramienta desconocida no se ejecuta');
}

/* 4. Argumentos inválidos: falta un campo o sobra */
{
  let ejecutada = false;
  const espia = { ...HERRAMIENTA, ejecutar: async () => { ejecutada = true; return {}; } };
  const r = await conversar({
    proveedor: proveedorGuion([
      { llamadas: [{ id: 'c1', nombre: 'huecos', argumentos: { servicio: 'Corte' } }] },
      { texto: 'Me faltan datos.' },
    ]),
    sistema: 's',
    mensajes: [{ papel: 'cliente', texto: 'x' }],
    herramientas: [espia],
  });
  ok(!ejecutada && r.texto === 'Me faltan datos.', 'Sin el campo requerido no se ejecuta');

  let otro = false;
  try {
    validarArgumentos(ESQUEMAS.huecos, { servicio: 'Corte', desde: '2026-12-01', inyeccion: true });
  } catch (e) {
    otro = e instanceof ErrorDeArgumentos && e.message === 'desconocido_inyeccion';
  }
  ok(otro, 'Un campo no declarado se rechaza');
}

/* 5. El tope de turnos corta */
{
  let limite = false;
  try {
    await conversar({
      proveedor: proveedorGuion([
        { llamadas: [{ id: 'c1', nombre: 'huecos', argumentos: { servicio: 'Corte', desde: '2026-12-01' } }] },
      ]),
      sistema: 's',
      mensajes: [{ papel: 'cliente', texto: 'x' }],
      herramientas: [HERRAMIENTA],
      maxTurnos: 3,
    });
  } catch (e) {
    limite = e instanceof LimiteDeTurnos;
  }
  ok(limite, 'El bucle se corta a los turnos máximos');
}

/* 6. Validación de tipos y formatos */
{
  const vale = validarArgumentos(ESQUEMAS.huecos, { servicio: 'Corte', desde: '2026-12-01', dias: 3 });
  ok(vale.dias === 3, 'Acepta argumentos válidos');

  let formato = false;
  try {
    validarArgumentos(ESQUEMAS.huecos, { servicio: 'Corte', desde: '01/12/2026' });
  } catch (e) {
    formato = e.message === 'formato_desde';
  }
  ok(formato, 'Rechaza una fecha con formato raro');
}

/* 7. El prompt se construye con datos, no con imaginación */
{
  const sistema = construirSistema(
    {
      nombre: 'Peluquería Ana',
      direccion: 'Calle Mayor 1',
      telefono: '600111222',
      asistente: 'Julia',
      servicios: [
        { nombre: 'Corte', precio: 18, minutos: 30 },
        { nombre: 'Corte + barba', precio: 25, minutos: 45 },
      ],
      horarios: [{ dia: 'lunes', abre: '10:00', cierra: '20:00', descanso_desde: '14:00', descanso_hasta: '15:00' }],
    },
    {
      nombre: 'Pablo',
      sellos: { en_ciclo: 4, meta: 10, faltan: 6, disponibles: 0 },
      proxima: { inicio: '2026-12-04T17:00:00Z', servicio: 'Corte', silla: 'Sillón 1' },
      ultimaVisita: '2026-10-01T10:00:00Z',
    },
  );

  ok(sistema.includes('Julia') && sistema.includes('Peluquería Ana'), 'El prompt lleva el nombre del asistente');
  ok(sistema.includes('Corte + barba') && sistema.includes('25,00'), 'Lleva servicios y precios');
  ok(sistema.includes('lunes') && sistema.includes('14:00'), 'Lleva horarios y descanso');
  ok(sistema.includes('Pablo') && sistema.includes('4 de 10'), 'Lleva el contexto del cliente');
  ok(sistema.includes('nunca los inventes'), 'Lleva la regla de no inventar');
  ok(!sistema.toLowerCase().includes('gastado'), 'No habla de lo que se ha gastado');
}

/* 8. Adaptador del proveedor: petición y respuesta */
{
  let capturado = null;
  const falsoFetch = async (url, init) => {
    capturado = { url, body: JSON.parse(init.body) };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'x1', type: 'function', function: { name: 'huecos', arguments: '{"servicio":"Corte"}' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const proveedor = proveedorOpenAI({
    url: 'https://api.ejemplo.test/v1',
    clave: 'k',
    modelo: 'modelo-x',
    fetchImpl: falsoFetch,
  });

  const r = await proveedor.responder({
    sistema: 'eres un asistente',
    mensajes: [{ papel: 'cliente', texto: 'hola' }],
    herramientas: [{ nombre: 'huecos', descripcion: 'd', parametros: ESQUEMAS.huecos }],
  });

  ok(capturado.url === 'https://api.ejemplo.test/v1/chat/completions', 'Llama al endpoint correcto');
  ok(capturado.body.model === 'modelo-x' && capturado.body.messages[0].role === 'system', 'Manda sistema y modelo');
  ok(capturado.body.tools[0].function.name === 'huecos', 'Manda las herramientas');
  ok(r.llamadas[0].nombre === 'huecos' && r.llamadas[0].argumentos.servicio === 'Corte', 'Lee la llamada');
  ok(r.uso.entrada === 120 && r.uso.salida === 30, 'Lee el consumo');
}

/* 9. Un JSON roto en los argumentos no revienta: se valida y falla */
{
  const falsoFetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          { message: { tool_calls: [{ id: 'x', function: { name: 'huecos', arguments: '{roto' } }] } },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  const proveedor = proveedorOpenAI({ url: 'https://x.test/v1', clave: 'k', modelo: 'm', fetchImpl: falsoFetch });
  const r = await proveedor.responder({ sistema: 's', mensajes: [], herramientas: [] });
  ok(r.llamadas[0].argumentos && typeof r.llamadas[0].argumentos === 'object', 'Un JSON roto no rompe la función');
}

/* 10. Un error del proveedor se propaga como llm_XXX */
{
  const falsoFetch = async () => new Response('{}', { status: 429 });
  const proveedor = proveedorOpenAI({ url: 'https://x.test/v1', clave: 'k', modelo: 'm', fetchImpl: falsoFetch });
  let codigo = '';
  try {
    await proveedor.responder({ sistema: 's', mensajes: [], herramientas: [] });
  } catch (e) {
    codigo = e.message;
  }
  ok(codigo === 'llm_429', 'Un 429 del proveedor se distingue', codigo);
}


/* 11. Herramientas reales contra una RPC de mentira */
{
  const { crearHerramientas, normalizar } = await import(
    '../supabase/functions/asistente/herramientas.ts'
  );

  const llamadas = [];
  const rpc = async (funcion, argumentos) => {
    llamadas.push({ funcion, argumentos });
    if (funcion === 'huecos_asistente') {
      const horas = argumentos.p_dia === '2026-12-01' ? ['2026-12-01T09:00:00.000Z'] : [];
      return { data: horas, error: null };
    }
    if (funcion === 'mis_citas') {
      return { data: { citas: [{ id: 'c1', inicio: '2026-12-01T09:00:00.000Z', servicio_id: 's1', servicio: 'Corte + barba', minutos: 45 }] }, error: null };
    }
    if (funcion === 'cancelar_cita') return { data: true, error: null };
    if (funcion === 'mover_cita') return { data: 'c2', error: null };
    if (funcion === 'solicitar_cita') return { data: 'nueva', error: null };
    if (funcion === 'proponer_ficha') return { data: 'prop', error: null };
    return { data: null, error: null };
  };

  const herramientas = crearHerramientas({
    token: 'tok',
    pin: null,
    slug: 'barberia-paco',
    servicios: [{ id: 's1', nombre: 'Corte + barba', minutos: 45 }],
    rpc,
  });
  const porNombre = (n) => herramientas.find((h) => h.nombre === n);

  ok(normalizar('Corte + Bárba') === 'corte + barba', 'Normaliza acentos y mayúsculas');

  const h = await porNombre('huecos').ejecutar({ servicio: 'corte + BARBA', desde: '2026-12-01', dias: 3 });
  ok(h.por_dia?.length === 1 && h.por_dia[0].horas.length === 1, 'Agrupa los huecos por día');

  const sinConfirmar = await porNombre('reservar').ejecutar({
    servicio: 'Corte + barba',
    inicio: '2026-12-01T09:00:00.000Z',
    confirmado: false,
  });
  ok(sinConfirmar.error === 'sin_confirmacion', 'Sin confirmación no se reserva');

  const malHueco = await porNombre('reservar').ejecutar({
    servicio: 'Corte + barba',
    inicio: '2026-12-02T09:00:00.000Z',
    confirmado: true,
  });
  ok(malHueco.error === 'hueco_no_disponible', 'Un hueco que no está en la lista no se reserva');

  llamadas.length = 0;
  const reserva = await porNombre('reservar').ejecutar({
    servicio: 'Corte + barba',
    inicio: '2026-12-01T09:00:00.000Z',
    confirmado: true,
  });
  const cita = llamadas.find((l) => l.funcion === 'solicitar_cita');
  ok(
    reserva.reservada === true && cita?.argumentos.p_origen === 'asistente' && cita.argumentos.p_token === 'tok',
    'Reserva con origen asistente y el token del cliente',
    JSON.stringify(cita?.argumentos ?? {}),
  );

  const cancelada = await porNombre('cancelar').ejecutar({ inicio: '2026-12-01T09:00:00.000Z' });
  ok(cancelada.cancelada === true, 'Cancela la cita que coincide en el tiempo');

  const noExiste = await porNombre('cancelar').ejecutar({ inicio: '2026-12-09T09:00:00.000Z' });
  ok(noExiste.error === 'cita_no_encontrada', 'Si la hora no coincide, no cancela nada');

  const movida = await porNombre('mover').ejecutar({
    inicio_actual: '2026-12-01T09:00:00.000Z',
    inicio_nuevo: '2026-12-01T09:00:00.000Z',
  });
  ok(movida.movida === true, 'Mueve a un hueco libre');

  const ficha = await porNombre('proponer_ficha').ejecutar({
    como_corta: 'Fade bajo',
    preferencias: '',
    texto_original: 'fade bajo',
  });
  ok(ficha.guardada === true, 'Propone la ficha');

  const derivar = await porNombre('pasar_al_barbero').ejecutar({ motivo: 'quiere hablar' });
  ok(derivar.derivado === true, 'Deriva al barbero');

  let desconocido = '';
  try {
    await porNombre('huecos').ejecutar({ servicio: 'Tatuaje', desde: '2026-12-01' });
  } catch (e) {
    desconocido = e.message;
  }
  ok(desconocido.startsWith('servicio_desconocido'), 'Un servicio que no existe se rechaza con la lista');
}

console.log(`\n${total - fallos}/${total} comprobaciones correctas`);
