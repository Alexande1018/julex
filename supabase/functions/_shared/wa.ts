// JULEX · lo que comparten todas las funciones de WhatsApp
//
// Aquí está el trato con Meta: firmar, verificar, mandar y no fiarse de
// nada de lo que llega. Si algo de esto se cambia, se cambia en un solo
// sitio.
//
// Se usa desde wa-webhook, wa-cron y wa-onboarding con la ruta
// `../_shared/wa.ts`.

export const VERSION_API = 'v21.0';
export const GRAPH = `https://graph.facebook.com/${VERSION_API}`;

/* ------------------------------------------------------------------ */
/* Firmas                                                             */
/* ------------------------------------------------------------------ */

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 en hexadecimal. Web Crypto: no hay dependencias. */
export async function hmac(cuerpo: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  return hex(firma);
}

/**
 * Lo que Meta manda en `x-hub-signature-256: sha256=...`. Sin esto,
 * cualquiera que sepa la URL de la función podría inventarse mensajes.
 */
export async function firmaValida(
  cuerpo: string,
  cabecera: string | null,
  secreto: string,
): Promise<boolean> {
  if (!cabecera || !secreto) return false;
  const esperada = cabecera.startsWith('sha256=') ? cabecera.slice(7) : cabecera;
  const calculada = await hmac(cuerpo, secreto);

  // Comparación en tiempo constante: no se filtra por dónde falla.
  if (esperada.length !== calculada.length) return false;
  let iguales = 0;
  for (let i = 0; i < esperada.length; i++) {
    iguales |= esperada.charCodeAt(i) ^ calculada.charCodeAt(i);
  }
  return iguales === 0;
}

/* ------------------------------------------------------------------ */
/* Mensajes                                                           */
/* ------------------------------------------------------------------ */

export interface Envio {
  phoneNumberId: string;
  token: string;
  para: string;
  texto: string;
}

export interface ResultadoEnvio {
  id: string | null;
  error: string;
}

async function publicar(phoneNumberId: string, token: string, cuerpo: unknown) {
  const respuesta = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15_000),
  });

  const datos = (await respuesta.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string; error_user_msg?: string; code?: number };
  };

  if (!respuesta.ok) {
    return {
      id: null,
      error:
        datos.error?.error_user_msg ??
        datos.error?.message ??
        `meta_${respuesta.status}`,
    } satisfies ResultadoEnvio;
  }

  return { id: datos.messages?.[0]?.id ?? null, error: '' } satisfies ResultadoEnvio;
}

export async function enviarTexto(envio: Envio): Promise<ResultadoEnvio> {
  return publicar(envio.phoneNumberId, envio.token, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: envio.para,
    type: 'text',
    text: { preview_url: false, body: envio.texto.slice(0, 4096) },
  });
}

/** Hasta tres botones. Meta no admite más, y tampoco hacen falta. */
export async function enviarBotones(
  envio: Envio & { botones: { id: string; titulo: string }[] },
): Promise<ResultadoEnvio> {
  return publicar(envio.phoneNumberId, envio.token, {
    messaging_product: 'whatsapp',
    to: envio.para,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: envio.texto.slice(0, 1024) },
      action: {
        buttons: envio.botones.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id.slice(0, 256), title: b.titulo.slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Plantilla de utilidad: la única forma de escribir a alguien que no ha
 * escrito en las últimas 24 horas. Los recordatorios van por aquí.
 */
export async function enviarPlantilla(
  envio: Omit<Envio, 'texto'> & { plantilla: string; idioma?: string; variables: string[] },
): Promise<ResultadoEnvio> {
  return publicar(envio.phoneNumberId, envio.token, {
    messaging_product: 'whatsapp',
    to: envio.para,
    type: 'template',
    template: {
      name: envio.plantilla,
      language: { code: envio.idioma ?? 'es' },
      components: envio.variables.length
        ? [
            {
              type: 'body',
              parameters: envio.variables.map((v) => ({ type: 'text', text: String(v).slice(0, 200) })),
            },
          ]
        : [],
    },
  });
}

/** El doble check azul del dueño: sabe que le has leído. */
export async function marcarLeido(phoneNumberId: string, token: string, mensajeId: string) {
  await publicar(phoneNumberId, token, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: mensajeId,
  }).catch(() => null);
}

/* ------------------------------------------------------------------ */
/* Lectura de lo que llega                                            */
/* ------------------------------------------------------------------ */

export interface Entrante {
  messageId: string;
  waId: string;
  nombrePerfil: string;
  tipo: string;
  texto: string;
  /** Si el cliente ha pulsado un botón, su identificador. */
  botonId: string;
  phoneNumberId: string;
}

/**
 * Un webhook de Meta trae un sobre con entries y changes. Esto lo
 * aplana y se queda solo con los mensajes de texto o de botón. Los
 * audios se reconocen como tipo 'audio' y se contestan pidiendo que lo
 * escriban (en la fase 2 se transcriben).
 */
export function leerEntrantes(cuerpo: unknown): Entrante[] {
  const salida: Entrante[] = [];
  try {
    const datos = cuerpo as {
      entry?: { changes?: { value?: Record<string, unknown> }[] }[];
    };
    for (const entry of datos.entry ?? []) {
      for (const cambio of entry.changes ?? []) {
        const valor = cambio.value ?? {};
        const metadatos = (valor.metadata ?? {}) as { phone_number_id?: string };
        const mensajes = (valor.messages ?? []) as Record<string, unknown>[];
        const contactos = (valor.contacts ?? []) as { profile?: { name?: string } }[];
        const perfil = contactos[0]?.profile?.name ?? '';

        for (const m of mensajes) {
          const tipo = String(m.type ?? 'desconocido');
          let texto = '';
          let botonId = '';

          if (tipo === 'text') {
            texto = String((m.text as { body?: string } | undefined)?.body ?? '');
          } else if (tipo === 'button') {
            const b = m.button as { text?: string; payload?: string } | undefined;
            texto = String(b?.text ?? '');
            botonId = String(b?.payload ?? '');
          } else if (tipo === 'interactive') {
            const i = m.interactive as
              | { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }
              | undefined;
            texto = String(i?.button_reply?.title ?? i?.list_reply?.title ?? '');
            botonId = String(i?.button_reply?.id ?? i?.list_reply?.id ?? '');
          }

          salida.push({
            messageId: String(m.id ?? ''),
            waId: String(m.from ?? ''),
            nombrePerfil: perfil,
            tipo,
            texto,
            botonId,
            phoneNumberId: String(metadatos.phone_number_id ?? ''),
          });
        }
      }
    }
  } catch {
    /* Un sobre roto no puede tumbar el webhook: se ignora. */
  }
  return salida;
}

/* ------------------------------------------------------------------ */
/* Teléfonos                                                          */
/* ------------------------------------------------------------------ */

/** Los 9 dígitos que usa JULEX, venga el número como venga. */
export function normalizarTelefono(telefono: string | null | undefined): string {
  return String(telefono ?? '').replace(/\D/g, '').slice(-9);
}

/**
 * El destinatario que espera Meta: solo dígitos y con prefijo. Nuestras
 * fichas guardan nueve cifras; Meta necesita 34600112233.
 */
export function paraMeta(telefono: string | null | undefined): string {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  if (digitos.startsWith('0034')) return digitos.slice(2);
  if (digitos.length === 9) return `34${digitos}`;
  return digitos;
}

/** «+34 600 11 22 33» para enseñar. */
export function telefonoVisible(telefono: string): string {
  const nueve = normalizarTelefono(telefono);
  if (nueve.length !== 9) return telefono;
  return `+34 ${nueve.slice(0, 3)} ${nueve.slice(3, 5)} ${nueve.slice(5, 7)} ${nueve.slice(7, 9)}`;
}

/** Un saludo con botones no cabe en una sola respuesta: se recorta. */
export function recortar(texto: string, maximo = 900): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo);
  const punto = corte.lastIndexOf('. ');
  return punto > maximo * 0.6 ? corte.slice(0, punto + 1) : `${corte}…`;
}
