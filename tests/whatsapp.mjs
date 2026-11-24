/**
 * Pruebas del canal de WhatsApp, sin Deno, sin Meta y sin clave.
 *
 *   node tests/whatsapp.mjs
 *
 * Lo que se comprueba aquí es lo que puede arruinar el negocio si está
 * mal: que la firma de Meta se valide de verdad, que un webhook repetido
 * no se atienda dos veces, que los mensajes se lean bien y que un
 * interruptor apagado quite la herramienta del modelo.
 */
import { createHmac } from 'node:crypto';

import {
  firmaValida,
  hmac,
  leerEntrantes,
  normalizarTelefono,
  paraMeta,
  telefonoVisible,
  recortar,
} from '../supabase/functions/_shared/wa.ts';
import { crearHerramientas, definiciones } from '../supabase/functions/asistente/herramientas.ts';
import { construirSistema, saludoPorDefecto } from '../supabase/functions/asistente/prompt.ts';

let fallos = 0;
let total = 0;
function ok(condicion, titulo, detalle = '') {
  total++;
  if (!condicion) fallos++;
  console.log(`${condicion ? '  ok  ' : ' FALLO'} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* 1. La firma                                                        */
/* ------------------------------------------------------------------ */

const SECRETO = 'secreto-de-prueba';
const CUERPO = '{"object":"whatsapp_business_account","entry":[]}';

{
  // Se compara contra la implementación de Node: si coinciden, la
  // nuestra está bien. Comprobarse a sí misma no valdría.
  const esperada = createHmac('sha256', SECRETO).update(CUERPO).digest('hex');
  const nuestra = await hmac(CUERPO, SECRETO);

  ok(nuestra === esperada, 'El HMAC coincide con el de Node');
  ok(await firmaValida(CUERPO, `sha256=${esperada}`, SECRETO), 'Acepta la firma buena');
  ok(!(await firmaValida(CUERPO, `sha256=${esperada}`, 'otro')), 'Rechaza la firma con otro secreto');
  ok(!(await firmaValida(`${CUERPO} `, `sha256=${esperada}`, SECRETO)), 'Rechaza un cuerpo cambiado');
  ok(!(await firmaValida(CUERPO, null, SECRETO)), 'Rechaza si no hay cabecera');
  ok(!(await firmaValida(CUERPO, `sha256=${esperada}`, '')), 'Rechaza si no hay secreto configurado');
  ok(
    !(await firmaValida(CUERPO, `sha256=${esperada.slice(0, -2)}`, SECRETO)),
    'Rechaza una firma recortada',
  );
}

/* ------------------------------------------------------------------ */
/* 2. Lo que llega de Meta                                            */
/* ------------------------------------------------------------------ */

const SOBRE = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1234',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '34600111222', phone_number_id: 'PN-1' },
            contacts: [{ profile: { name: 'Carlos Ruiz' }, wa_id: '34600112233' }],
            messages: [
              { from: '34600112233', id: 'wamid.1', timestamp: '1', type: 'text', text: { body: 'Hola' } },
            ],
          },
        },
      ],
    },
  ],
};

{
  const entrantes = leerEntrantes(SOBRE);
  ok(entrantes.length === 1, 'Un mensaje del sobre');
  ok(entrantes[0].messageId === 'wamid.1', 'Saca el identificador de Meta');
  ok(entrantes[0].waId === '34600112233', 'Saca el teléfono que escribe');
  ok(entrantes[0].texto === 'Hola', 'Saca el texto');
  ok(entrantes[0].phoneNumberId === 'PN-1', 'Sabe a qué línea ha llegado');
  ok(entrantes[0].nombrePerfil === 'Carlos Ruiz', 'Saca el nombre del perfil');
}

{
  const boton = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PN-1' },
              messages: [
                {
                  from: '34600111222',
                  id: 'wamid.2',
                  type: 'interactive',
                  interactive: { button_reply: { id: 'ok:abc', title: 'Confirmar' } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const [e] = leerEntrantes(boton);
  ok(e.botonId === 'ok:abc', 'Lee el botón pulsado');
  ok(e.texto === 'Confirmar', 'Y su texto, para el registro');
}

{
  const audio = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PN-1' },
              messages: [
                {
                  from: '34600112233',
                  id: 'wamid.3',
                  type: 'audio',
                  audio: { id: 'MEDIA-1', mime_type: 'audio/ogg; codecs=opus', voice: true },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const [e] = leerEntrantes(audio);
  ok(e.tipo === 'audio' && e.texto === '', 'Un audio se reconoce y no se inventa texto');
}

ok(leerEntrantes(null).length === 0, 'Un sobre roto no revienta');
ok(leerEntrantes({ entry: [{ changes: [] }] }).length === 0, 'Un cambio vacío tampoco');

/* ------------------------------------------------------------------ */
/* 3. Teléfonos y recortes                                            */
/* ------------------------------------------------------------------ */

{
  ok(normalizarTelefono('+34 600 11 22 33') === '600112233', 'Normaliza con espacios y prefijo');
  ok(normalizarTelefono('34600112233') === '600112233', 'Normaliza el que manda Meta');
  ok(normalizarTelefono('600112233') === '600112233', 'El de la ficha se queda igual');
  ok(normalizarTelefono('') === '', 'Vacío se queda vacío');
  ok(
    normalizarTelefono('+34 600 11 22 33') === normalizarTelefono('34600112233'),
    'Los tres formatos son el mismo cliente',
  );
  ok(telefonoVisible('600112233') === '+34 600 11 22 33', 'Se enseña en formato español');
  ok(paraMeta('600112233') === '34600112233', 'A Meta se le manda con prefijo');
  ok(paraMeta('+34 600 11 22 33') === '34600112233', 'Venga como venga');
  ok(paraMeta('34600112233') === '34600112233', 'Y si ya lo trae, no se duplica');

  const largo = 'a'.repeat(2000);
  ok(recortar(largo).length <= 901, 'Un texto larguísimo se recorta');
  ok(recortar('corto') === 'corto', 'Un texto corto no se toca');
}

/* ------------------------------------------------------------------ */
/* 4. Los interruptores quitan herramientas                           */
/* ------------------------------------------------------------------ */

const CONTEXTO = {
  token: 'tok',
  pin: null,
  slug: 'barberia-distrito',
  barberiaId: 'b1',
  telefono: '600112233',
  clienteId: 'c1',
  servicios: [{ id: 's1', nombre: 'Corte', minutos: 30, precio: 15 }],
  rpc: async () => ({ data: null, error: null }),
};

{
  const todas = crearHerramientas({ ...CONTEXTO, funciones: {} }).map((h) => h.nombre);
  ok(todas.length === 12, 'Con todo encendido hay doce herramientas', String(todas.length));
  ok(todas.includes('apuntar_espera') && todas.includes('oferta'), 'Está la lista de espera');
  ok(todas.includes('fidelizacion') && todas.includes('recomendaciones'), 'Están sellos y sugerencias');
  ok(todas.includes('pedir_codigo'), 'Está el enlace por código');
}

{
  const sinEspera = crearHerramientas({
    ...CONTEXTO,
    funciones: { lista_espera: false },
  }).map((h) => h.nombre);
  ok(!sinEspera.includes('apuntar_espera') && !sinEspera.includes('oferta'), 'Apagar la espera la quita');
  ok(sinEspera.includes('reservar'), 'Y no toca lo demás');

  const sinTodo = crearHerramientas({
    ...CONTEXTO,
    funciones: { reservar: false, mover: false, cancelar: false, fidelidad: false, recomendaciones: false },
  }).map((h) => h.nombre);
  ok(!sinTodo.includes('huecos') && !sinTodo.includes('reservar'), 'Sin reservar no hay ni huecos');
  ok(sinTodo.includes('pasar_al_barbero'), 'Pero siempre se puede llamar a una persona');
  ok(sinTodo.includes('proponer_ficha'), 'La ficha no se apaga: es del barbero');
}

ok(definiciones({ lista_espera: false }).every((d) => d.nombre !== 'apuntar_espera'), 'definiciones() respeta los interruptores');

/* ------------------------------------------------------------------ */
/* 5. Modo prueba: nada se escribe                                    */
/* ------------------------------------------------------------------ */

const EXPLOTA = async () => {
  throw new Error('no se debería llamar a la base de datos');
};

{
  const herramientas = crearHerramientas({
    ...CONTEXTO,
    funciones: {},
    simulado: true,
    rpc: async (funcion) => {
      if (funcion === 'huecos_asistente') {
        return { data: ['2026-12-01T17:00:00Z'], error: null };
      }
      throw new Error(`escritura en modo prueba: ${funcion}`);
    },
  });

  const reservar = herramientas.find((h) => h.nombre === 'reservar');
  const r = await reservar.ejecutar({
    servicio: 'Corte',
    inicio: '2026-12-01T17:00:00Z',
    confirmado: true,
  });
  ok(r.simulado === true && r.reservada === true, 'En prueba la reserva es creíble pero no escribe');

  const cancelar = herramientas.find((h) => h.nombre === 'cancelar');
  const c = await cancelar.ejecutar({ inicio: '2026-12-01T17:00:00Z' });
  ok(c.simulado === true, 'En prueba tampoco intenta cancelar');

  const codigo = herramientas.find((h) => h.nombre === 'pedir_codigo');
  const p = await codigo.ejecutar({});
  ok(p.codigo === '123456', 'En prueba el código es fijo y visible');
}

/* ------------------------------------------------------------------ */
/* 6. Cliente nuevo: reserva y se crea su ficha                       */
/* ------------------------------------------------------------------ */

{
  const llamadas = [];
  const herramientas = crearHerramientas({
    ...CONTEXTO,
    token: '', // escribe un número que no está en ninguna ficha
    rpc: async (funcion, args) => {
      llamadas.push({ funcion, args });
      if (funcion === 'huecos_asistente') {
        return { data: ['2026-12-01T10:00:00Z'], error: null };
      }
      return { data: 'cita-nueva', error: null };
    },
  });

  const reservar = herramientas.find((h) => h.nombre === 'reservar');

  const sinNombre = await reservar.ejecutar({
    servicio: 'Corte',
    inicio: '2026-12-01T10:00:00Z',
    confirmado: true,
  });
  ok(sinNombre.error === 'falta_nombre', 'Sin ficha, sin nombre no se reserva');
  ok(
    !llamadas.some((l) => l.funcion === 'solicitar_cita'),
    'Y no se llama a la base de datos a medias',
  );

  const conNombre = await reservar.ejecutar({
    servicio: 'Corte',
    inicio: '2026-12-01T10:00:00Z',
    confirmado: true,
    nombre: 'Marta Gil',
  });
  ok(conNombre.reservada === true, 'Con nombre, sí reserva');

  const cita = llamadas.find((l) => l.funcion === 'solicitar_cita');
  ok(cita.args.p_nombre === 'Marta Gil', 'La ficha nace con su nombre');
  ok(cita.args.p_telefono === '600112233', 'Y con el teléfono del canal, no con uno inventado');
  ok(cita.args.p_token === null, 'Y sin token de llavero');
  ok(cita.args.p_origen === 'asistente', 'La cita se apunta con su origen');
}

{
  const sinFicha = crearHerramientas({ ...CONTEXTO, token: '', funciones: {} });
  const proponer = sinFicha.find((h) => h.nombre === 'proponer_ficha');
  const r = await proponer.ejecutar({ como_corta: 'Fade bajo' });
  ok(r.error === 'sin_ficha', 'Sin ficha no se propone ficha');
}

/* ------------------------------------------------------------------ */
/* 7. Lista de espera y oferta                                        */
/* ------------------------------------------------------------------ */

{
  const llamadas = [];
  const herramientas = crearHerramientas({
    ...CONTEXTO,
    funciones: {},
    rpc: async (funcion, args) => {
      llamadas.push({ funcion, args });
      if (funcion === 'wa_espera_apuntar') {
        return { data: { apuntado: true, puesto: 3 }, error: null };
      }
      if (funcion === 'wa_oferta_resolver') {
        return { data: { ok: true, inicio: '2026-12-01T18:00:00Z' }, error: null };
      }
      return { data: null, error: null };
    },
  });

  const apuntar = herramientas.find((h) => h.nombre === 'apuntar_espera');
  const r = await apuntar.ejecutar({ servicio: 'Corte', preferencia: 'tarde' });
  ok(r.apuntado === true && r.puesto === 3, 'Se apunta y devuelve el puesto');

  const [llamada] = llamadas;
  ok(llamada.args.p_telefono === '600112233', 'La espera va con el teléfono del canal');
  ok(llamada.args.p_servicio === 's1', 'Y con el servicio real, no con su nombre');
  ok(llamada.args.p_preferencia === 'tarde', 'Y con la preferencia');
}

{
  const sinOferta = crearHerramientas({ ...CONTEXTO, funciones: {}, espera: null });
  const oferta = sinOferta.find((h) => h.nombre === 'oferta');
  const r = await oferta.ejecutar({ aceptar: true });
  ok(r.error === 'sin_oferta', 'Sin oferta pendiente no se acepta nada');
}

{
  const llamadas = [];
  const conOferta = crearHerramientas({
    ...CONTEXTO,
    funciones: {},
    espera: {
      espera_id: 'e1',
      puesto: 1,
      estado: 'ofrecido',
      oferta: { id: 'o1', inicio: '2026-12-01T18:00:00Z', servicio: 'Corte' },
    },
    rpc: async (funcion, args) => {
      llamadas.push({ funcion, args });
      return { data: { ok: true }, error: null };
    },
  });
  const oferta = conOferta.find((h) => h.nombre === 'oferta');
  const r = await oferta.ejecutar({ aceptar: true });
  ok(r.aceptada === true && r.inicio === '2026-12-01T18:00:00Z', 'Acepta el hueco ofrecido');
  ok(llamadas[0].args.p_oferta === 'o1', 'Y lo resuelve por su identificador, no por texto del modelo');
}

/* ------------------------------------------------------------------ */
/* 8. El prompt dice la verdad de la configuración                    */
/* ------------------------------------------------------------------ */

const LOCAL = {
  nombre: 'Barbería Distrito',
  direccion: 'Calle Mayor 3',
  asistente: 'Nico',
  personalidad: 'elegante',
  servicios: [{ nombre: 'Corte', precio: 15, minutos: 30 }],
  horarios: [{ dia: 'lunes', abre: '09:00', cierra: '20:00' }],
};

const CLIENTE = {
  nombre: 'Carlos',
  vinculado: true,
  sellos: { en_ciclo: 7, meta: 10, faltan: 3, disponibles: 0 },
  proxima: null,
  ultimaVisita: '2026-11-01T10:00:00Z',
};

{
  const conPrecios = construirSistema({ ...LOCAL, funciones: {} }, CLIENTE);
  ok(conPrecios.includes('15,00'), 'Con precios encendidos, el precio está');
  ok(conPrecios.includes('Nico'), 'Se llama por su nombre');
  ok(conPrecios.includes('elegante') || conPrecios.includes('discreto'), 'Habla con el tono elegido');
  ok(conPrecios.includes('le faltan 3'), 'Sabe cuántos sellos le faltan');
  ok(conPrecios.includes('apuntar_espera'), 'Sabe que puede apuntar en la lista de espera');

  const sinPrecios = construirSistema({ ...LOCAL, funciones: { precios: false } }, CLIENTE);
  ok(!sinPrecios.includes('15,00'), 'Sin precios, el precio no aparece');
  ok(sinPrecios.includes('se dicen en el local'), 'Y se dice por qué');

  const sinEspera = construirSistema({ ...LOCAL, funciones: { lista_espera: false } }, CLIENTE);
  ok(!sinEspera.includes('apuntar_espera'), 'Sin lista de espera, no la ofrece');
  ok(sinEspera.includes('No puedes cancelar') === false, 'Y no dice que no puede cancelar si sí puede');

  const sinCancelar = construirSistema({ ...LOCAL, funciones: { cancelar: false } }, CLIENTE);
  ok(sinCancelar.includes('No puedes cancelar citas'), 'Sin cancelar, lo dice y deriva');
}

{
  const nuevo = construirSistema({ ...LOCAL, funciones: {} }, { nombre: '', vinculado: false });
  ok(nuevo.includes('NO ESTÁ EN NINGUNA FICHA'), 'Con un número nuevo lo dice claro');
  ok(!nuevo.includes('le faltan 3'), 'Y no le atribuye sellos de otro');
  ok(nuevo.includes('pedir_codigo'), 'Y le ofrece enlazar su ficha');
}

{
  const conOferta = construirSistema(
    { ...LOCAL, funciones: {} },
    {
      ...CLIENTE,
      espera: {
        estado: 'ofrecido',
        puesto: 1,
        oferta: { inicio: '2026-12-01T18:00:00Z', servicio: 'Corte' },
      },
    },
  );
  ok(conOferta.includes('HUECO OFRECIDO'), 'Si hay hueco ofrecido, lo tiene delante');
  ok(conOferta.includes('herramienta oferta'), 'Y sabe con qué cerrarlo');
}

{
  const bienvenida = 'Hola, soy Nico. ¿Te ayudo con tu cita?';
  const primera = construirSistema(
    { ...LOCAL, funciones: {}, bienvenida },
    { ...CLIENTE, primer: true },
  );
  ok(primera.includes(bienvenida), 'El saludo del dueño se usa tal cual la primera vez');
  ok(primera.includes('palabra por palabra'), 'Y se le dice al modelo que no lo cambie');

  const segunda = construirSistema(
    { ...LOCAL, funciones: {}, bienvenida },
    { ...CLIENTE, primer: false },
  );
  ok(!segunda.includes(bienvenida), 'En el segundo mensaje ya no se repite el saludo');
}

{
  const whatsapp = construirSistema({ ...LOCAL, funciones: {}, canal: 'whatsapp' }, CLIENTE);
  ok(whatsapp.includes('WhatsApp'), 'Sabe por qué canal habla');
  const llavero = construirSistema({ ...LOCAL, funciones: {}, canal: 'llavero' }, CLIENTE);
  ok(!llavero.includes('Es WhatsApp'), 'Y en el llavero no lo menciona');
}

ok(
  saludoPorDefecto({ nombre: 'Barbería Distrito', asistente: 'Nico' }).includes('Nico'),
  'El saludo por defecto usa el nombre del asistente',
);

/* ------------------------------------------------------------------ */

console.log(`\n${total - fallos}/${total} comprobaciones del canal de WhatsApp`);
if (fallos > 0) {
  console.error(`${fallos} fallo(s)`);
  process.exit(1);
}
