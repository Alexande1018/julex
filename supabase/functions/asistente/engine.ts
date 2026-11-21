// JULEX · motor del asistente
//
// Lógica pura, sin Deno ni Supabase: se puede probar con Node.
// El bucle es corto a propósito —un modelo, tres herramientas y un
// tope de turnos— porque todo lo que decide está en la base de datos,
// no en el prompt.

export type Json = Record<string, unknown>;

export type Papel = 'cliente' | 'asistente' | 'herramienta';

export interface Mensaje {
  papel: Papel;
  texto: string;
  /** Solo en los mensajes de herramienta: a qué llamada responde. */
  idHerramienta?: string;
  nombreHerramienta?: string;
  /** Solo en el mensaje del asistente que pidió herramientas. */
  llamadas?: Llamada[];
}

export interface Llamada {
  id: string;
  nombre: string;
  argumentos: Json;
}

export interface HerramientaDef {
  nombre: string;
  descripcion: string;
  /** JSON Schema del objeto de argumentos. */
  parametros: Json;
}

export interface Herramienta extends HerramientaDef {
  ejecutar(argumentos: Json): Promise<unknown>;
}

export interface RespuestaModelo {
  texto?: string;
  llamadas?: Llamada[];
  uso?: { entrada: number; salida: number };
}

export interface PeticionModelo {
  sistema: string;
  mensajes: Mensaje[];
  herramientas: HerramientaDef[];
}

export interface Proveedor {
  responder(peticion: PeticionModelo): Promise<RespuestaModelo>;
}

export interface Uso {
  entrada: number;
  salida: number;
}

export interface ResultadoConversacion {
  texto: string;
  turnos: number;
  llamadas: string[];
  uso: Uso;
}

export class ErrorDeArgumentos extends Error {}
export class LimiteDeTurnos extends Error {}

/* ------------------------------------------------------------------ */
/* Validación de los argumentos que propone el modelo                  */
/* ------------------------------------------------------------------ */

/**
 * El modelo propone; el servidor decide. Si los argumentos no encajan
 * con el esquema, la herramienta no se ejecuta: se le devuelve el
 * error al modelo para que lo corrija o pida ayuda.
 */
export function validarArgumentos(esquema: Json, argumentos: unknown): Json {
  if (typeof argumentos !== 'object' || argumentos === null || Array.isArray(argumentos)) {
    throw new ErrorDeArgumentos('no_es_un_objeto');
  }

  const propiedades = (esquema.properties ?? {}) as Record<string, Json>;
  const requeridos = (esquema.required ?? []) as string[];
  const entrada = argumentos as Json;
  const salida: Json = {};

  for (const campo of requeridos) {
    if (!(campo in entrada) || entrada[campo] === null || entrada[campo] === '') {
      throw new ErrorDeArgumentos(`falta_${campo}`);
    }
  }

  for (const [campo, valor] of Object.entries(entrada)) {
    const def = propiedades[campo];
    if (!def) throw new ErrorDeArgumentos(`desconocido_${campo}`);

    const tipo = def.type as string;
    if (tipo === 'string') {
      if (typeof valor !== 'string') throw new ErrorDeArgumentos(`tipo_${campo}`);
      const max = def.maxLength as number | undefined;
      if (typeof max === 'number' && valor.length > max) throw new ErrorDeArgumentos(`largo_${campo}`);
      const patron = def.pattern as string | undefined;
      if (patron && !new RegExp(patron).test(valor)) throw new ErrorDeArgumentos(`formato_${campo}`);
    } else if (tipo === 'integer') {
      if (!Number.isInteger(valor)) throw new ErrorDeArgumentos(`tipo_${campo}`);
      const min = def.minimum as number | undefined;
      const max = def.maximum as number | undefined;
      if (typeof min === 'number' && (valor as number) < min) throw new ErrorDeArgumentos(`minimo_${campo}`);
      if (typeof max === 'number' && (valor as number) > max) throw new ErrorDeArgumentos(`maximo_${campo}`);
    } else if (tipo === 'boolean') {
      if (typeof valor !== 'boolean') throw new ErrorDeArgumentos(`tipo_${campo}`);
    } else if (tipo === 'array') {
      if (!Array.isArray(valor)) throw new ErrorDeArgumentos(`tipo_${campo}`);
    }

    salida[campo] = valor;
  }

  return salida;
}

/* ------------------------------------------------------------------ */
/* El bucle                                                           */
/* ------------------------------------------------------------------ */

export interface OpcionesConversacion {
  proveedor: Proveedor;
  sistema: string;
  mensajes: Mensaje[];
  herramientas: Herramienta[];
  maxTurnos?: number;
  /** Para depurar y para el registro: qué se llamó y qué devolvió. */
  alLlamar?: (nombre: string, argumentos: Json, salida: unknown) => void;
}

export async function conversar(opciones: OpcionesConversacion): Promise<ResultadoConversacion> {
  const { proveedor, sistema, herramientas, maxTurnos = 6, alLlamar } = opciones;
  const mensajes: Mensaje[] = [...opciones.mensajes];
  const porNombre = new Map(herramientas.map((h) => [h.nombre, h]));
  const llamadas: string[] = [];
  const uso: Uso = { entrada: 0, salida: 0 };

  for (let turno = 0; turno < maxTurnos; turno++) {
    const respuesta = await proveedor.responder({
      sistema,
      mensajes,
      herramientas: herramientas.map((h) => ({
        nombre: h.nombre,
        descripcion: h.descripcion,
        parametros: h.parametros,
      })),
    });

    if (respuesta.uso) {
      uso.entrada += respuesta.uso.entrada;
      uso.salida += respuesta.uso.salida;
    }

    if (respuesta.llamadas && respuesta.llamadas.length > 0) {
      mensajes.push({
        papel: 'asistente',
        texto: respuesta.texto ?? '',
        llamadas: respuesta.llamadas,
      });

      for (const llamada of respuesta.llamadas) {
        const herramienta = porNombre.get(llamada.nombre);
        let salida: unknown;

        if (!herramienta) {
          salida = { error: 'herramienta_desconocida' };
        } else {
          try {
            const argumentos = validarArgumentos(herramienta.parametros, llamada.argumentos);
            salida = await herramienta.ejecutar(argumentos);
            llamadas.push(llamada.nombre);
          } catch (error) {
            salida = { error: error instanceof Error ? error.message : 'error' };
          }
        }

        alLlamar?.(llamada.nombre, llamada.argumentos, salida);
        mensajes.push({
          papel: 'herramienta',
          idHerramienta: llamada.id,
          nombreHerramienta: llamada.nombre,
          texto: JSON.stringify(salida),
        });
      }

      continue;
    }

    if (respuesta.texto && respuesta.texto.trim()) {
      return { texto: respuesta.texto.trim(), turnos: turno + 1, llamadas, uso };
    }
  }

  throw new LimiteDeTurnos('demasiados_turnos');
}

/* ------------------------------------------------------------------ */
/* Proveedores                                                        */
/* ------------------------------------------------------------------ */

/** Responde un guion fijo. Es el que usan las pruebas. */
export function proveedorGuion(respuestas: RespuestaModelo[]): Proveedor {
  let i = 0;
  return {
    async responder() {
      const respuesta = respuestas[Math.min(i, respuestas.length - 1)];
      i++;
      return respuesta;
    },
  };
}

export interface OpcionesOpenAI {
  url: string;
  clave: string;
  modelo: string;
  temperatura?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

/** API compatible con OpenAI (DeepSeek, Gemini en modo compatible, etc.). */
export function proveedorOpenAI(opciones: OpcionesOpenAI): Proveedor {
  const {
    url,
    clave,
    modelo,
    temperatura = 0.2,
    maxTokens = 300,
    fetchImpl = fetch,
  } = opciones;

  return {
    async responder(peticion) {
      const cuerpo = {
        model: modelo,
        temperature: temperatura,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: peticion.sistema },
          ...peticion.mensajes.map((m) => {
            if (m.papel === 'herramienta') {
              return { role: 'tool', tool_call_id: m.idHerramienta, content: m.texto };
            }
            if (m.papel === 'asistente' && m.llamadas?.length) {
              return {
                role: 'assistant',
                content: m.texto || null,
                tool_calls: m.llamadas.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.nombre, arguments: JSON.stringify(c.argumentos) },
                })),
              };
            }
            return { role: m.papel === 'asistente' ? 'assistant' : 'user', content: m.texto };
          }),
        ],
        tools: peticion.herramientas.map((h) => ({
          type: 'function',
          function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
        })),
        tool_choice: 'auto',
      };

      const respuesta = await fetchImpl(`${url.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(20_000),
      });

      if (!respuesta.ok) {
        throw new Error(`llm_${respuesta.status}`);
      }

      const datos = (await respuesta.json()) as {
        choices?: { message?: { content?: string; tool_calls?: unknown[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const mensaje = datos.choices?.[0]?.message ?? {};
      const llamadas = (mensaje.tool_calls ?? []).map((bruta) => {
        const tc = bruta as { id?: string; function?: { name?: string; arguments?: string } };
        let argumentos: Json = {};
        try {
          argumentos = JSON.parse(tc.function?.arguments ?? '{}') as Json;
        } catch {
          argumentos = {};
        }
        return { id: tc.id ?? '', nombre: tc.function?.name ?? '', argumentos };
      });

      return {
        texto: mensaje.content ?? undefined,
        llamadas,
        uso: {
          entrada: datos.usage?.prompt_tokens ?? 0,
          salida: datos.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dinero y calendario                                                */
/* ------------------------------------------------------------------ */

/** Inicio del mes en hora de Madrid, como instante ISO. */
export function inicioDeMesMadrid(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(ahora);
  const anio = Number(partes.find((p) => p.type === 'year')!.value);
  const mes = Number(partes.find((p) => p.type === 'month')!.value);

  // El desfase de Madrid cambia con el horario de verano: se mira el día 1.
  const referencia = new Date(Date.UTC(anio, mes - 1, 1, 12));
  const zona = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    timeZoneName: 'longOffset',
  })
    .formatToParts(referencia)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT+01:00"

  const negativo = zona.includes('-');
  const [horas, minutos] = zona
    .replace('GMT', '')
    .replace('+', '')
    .replace('-', '')
    .split(':')
    .map(Number);
  const desfase = (negativo ? -1 : 1) * (horas * 60 + minutos);

  return new Date(Date.UTC(anio, mes - 1, 1) - desfase * 60_000).toISOString();
}

/** Coste en dólares de un turno, con precios por millón de tokens. */
export function calcularCoste(
  uso: Uso,
  precioEntrada: number,
  precioSalida: number,
): number {
  const coste = (uso.entrada / 1_000_000) * precioEntrada + (uso.salida / 1_000_000) * precioSalida;
  return Math.round(coste * 1_000_000) / 1_000_000;
}
