// JULEX · la puerta de WhatsApp
//
// Recibe lo que Meta manda, comprueba la firma, decide quién habla y le
// pasa el turno al mismo motor que atiende el llavero.
//
// Dos cosas que no se negocian:
//   1. Se contesta 200 en menos de cinco segundos. Si no, Meta reintenta
//      y acabas contestando tres veces al mismo cliente. El trabajo va
//      detrás, con waitUntil.
//   2. Cada mensaje se registra antes de procesarlo. El identificador de
//      Meta es único: el reintento no vuelve a reservar.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  enviarBotones,
  enviarTexto,
  firmaValida,
  leerEntrantes,
  marcarLeido,
  normalizarTelefono,
  paraMeta,
  recortar,
  type Entrante,
} from '../_shared/wa.ts';
import { ejecutarTurno } from '../asistente/turno.ts';
import { proveedorOpenAI, proveedorGuion, type Proveedor } from '../asistente/engine.ts';

const SECRETO_FIRMA = Deno.env.get('WA_APP_SECRET') ?? '';
const VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN') ?? '';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false },
});

function proveedor(): Proveedor {
  const llmUrl = Deno.env.get('ASISTENTE_LLM_URL');
  const llmClave = Deno.env.get('ASISTENTE_LLM_KEY');
  if (!llmUrl || !llmClave) {
    return proveedorGuion([
      { texto: 'Ahora mismo no puedo atenderte. Escríbeme en un rato o llámanos al local.' },
    ]);
  }
  return proveedorOpenAI({
    url: llmUrl,
    clave: llmClave,
    modelo: Deno.env.get('ASISTENTE_LLM_MODEL') ?? 'deepseek-flash',
  });
}

/* ------------------------------------------------------------------ */
/* Contexto de la línea                                               */
/* ------------------------------------------------------------------ */

interface Linea {
  barberia_id: string;
  estado: string;
  modo: string;
  autorizados: string[] | null;
  telefono: string;
  phone_number_id: string;
  nombre: string;
  slug: string;
  telefono_local: string;
  direccion: string;
}

async function lineaDe(phoneNumberId: string): Promise<Linea | null> {
  const { data } = await admin
    .from('wa_linea')
    .select('barberia_id, estado, modo, autorizados, telefono, phone_number_id, barberias (nombre, slug, telefono, direccion)')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (!data) return null;
  const local = (data as unknown as { barberias: { nombre: string; slug: string; telefono: string; direccion: string } })
    .barberias;

  return {
    barberia_id: data.barberia_id,
    estado: data.estado,
    modo: data.modo,
    autorizados: (data.autorizados ?? []) as string[],
    telefono: data.telefono ?? '',
    phone_number_id: data.phone_number_id ?? '',
    nombre: local?.nombre ?? '',
    slug: local?.slug ?? '',
    telefono_local: local?.telefono ?? '',
    direccion: local?.direccion ?? '',
  };
}

async function tokenDe(barberiaId: string): Promise<string> {
  const { data } = await admin
    .from('wa_secreto')
    .select('token')
    .eq('barberia_id', barberiaId)
    .maybeSingle();
  return data?.token ?? '';
}

/** En modo prueba solo hablan el dueño y los números autorizados. */
function puedeHablar(linea: Linea, waId: string): boolean {
  if (linea.modo === 'real') return true;
  const quien = normalizarTelefono(waId);
  if (quien && quien === normalizarTelefono(linea.telefono_local)) return true;
  return (linea.autorizados ?? []).some((t) => normalizarTelefono(t) === quien);
}

/* ------------------------------------------------------------------ */
/* Envío                                                             */
/* ------------------------------------------------------------------ */

async function responder(linea: Linea, para: string, texto: string) {
  const token = await tokenDe(linea.barberia_id);
  if (!token || !linea.phone_number_id) return;

  const envio = await enviarTexto({
    phoneNumberId: linea.phone_number_id,
    token,
    para: paraMeta(para),
    texto: recortar(texto),
  });

  await admin.rpc('wa_mensaje_saliente', {
    p_barberia: linea.barberia_id,
    p_wa_id: para,
    p_message_id: envio.id,
    p_tipo: 'text',
    p_texto: texto,
    p_estado: envio.error ? 'fallo' : 'enviado',
    p_error: envio.error,
    p_coste: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Aprobaciones                                                       */
/* ------------------------------------------------------------------ */

/** Avisa al dueño de que el agente quiere cerrar algo. Un toque decide. */
async function avisarAlDueno(linea: Linea, texto: string, aprobacionId: string) {
  const token = await tokenDe(linea.barberia_id);
  const dueno = normalizarTelefono(linea.telefono_local);
  if (!token || dueno.length !== 9) return;

  await enviarBotones({
    phoneNumberId: linea.phone_number_id,
    token,
    para: paraMeta(dueno),
    texto,
    botones: [
      { id: `ok:${aprobacionId}`, titulo: 'Confirmar' },
      { id: `no:${aprobacionId}`, titulo: 'No puede ser' },
    ],
  });
}

/** El dueño ha pulsado un botón. Se confirma o se cancela, y se avisa al cliente. */
async function resolverBoton(linea: Linea, botonId: string, waId: string) {
  const [que, id] = botonId.split(':');
  if (!id || (que !== 'ok' && que !== 'no')) return false;

  const { data: aprobacion } = await admin
    .from('wa_aprobacion')
    .select('id, tipo, referencia, texto')
    .eq('id', id)
    .eq('barberia_id', linea.barberia_id)
    .maybeSingle();
  if (!aprobacion) return false;

  const aprobar = que === 'ok';
  const { data: ok } = await admin.rpc('wa_aprobar', {
    p_aprobacion: id,
    p_aprobar: aprobar,
    p_barberia: linea.barberia_id,
  });
  if (!ok) return false;

  // Al cliente se le dice lo que ha pasado, con la hora delante.
  if (aprobacion.referencia) {
    const { data: cita } = await admin
      .from('citas')
      .select('inicio, clientes (nombre, telefono), servicios (nombre)')
      .eq('id', aprobacion.referencia)
      .maybeSingle();

    const c = cita as unknown as
      | { inicio: string; clientes: { nombre: string; telefono: string }; servicios: { nombre: string } }
      | null;

    if (c?.clientes?.telefono) {
      const cuando = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(c.inicio));

      await responder(
        linea,
        normalizarTelefono(c.clientes.telefono),
        aprobar
          ? `¡Confirmado! Te espero ${cuando} para ${c.servicios?.nombre ?? 'tu cita'}.`
          : `Finalmente no puedo con ese hueco, lo siento. ¿Te busco otro día?`,
      );
    }
  }

  // Y al dueño se le cierra el círculo, para que sepa que se hizo.
  await responder(linea, waId, aprobar ? 'Hecho: avisado el cliente.' : 'Descartada: el cliente ya lo sabe.');
  return true;
}

/* ------------------------------------------------------------------ */
/* Código de enlace                                                   */
/* ------------------------------------------------------------------ */

const SEIS_CIFRAS = /^\d{6}$/;

async function probarCodigo(linea: Linea, waId: string, codigo: string): Promise<boolean> {
  const { data } = await admin.rpc('wa_codigo_comprobar', {
    p_barberia: linea.barberia_id,
    p_telefono: waId,
    p_codigo: codigo,
  });

  const r = (data ?? {}) as { ok?: boolean; nombre?: string; motivo?: string };
  if (!r.ok) {
    return false;
  }

  await responder(
    linea,
    waId,
    `Listo${r.nombre ? `, ${r.nombre.split(' ')[0]}` : ''}. Ya puedo ver tu ficha en este WhatsApp: tus citas, tus sellos y lo que te apuntó el local. ¿Qué necesitas?`,
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Un mensaje, de principio a fin                                     */
/* ------------------------------------------------------------------ */

async function atender(mensaje: Entrante) {
  if (!mensaje.messageId || !mensaje.phoneNumberId || !mensaje.waId) return;

  const linea = await lineaDe(mensaje.phoneNumberId);
  if (!linea || linea.estado !== 'activa') return;
  if (!puedeHablar(linea, mensaje.waId)) return;

  // Se registra antes de hacer nada: es lo que corta los duplicados.
  const { data: nuevo } = await admin.rpc('wa_mensaje_entrante', {
    p_barberia: linea.barberia_id,
    p_wa_id: mensaje.waId,
    p_message_id: mensaje.messageId,
    p_tipo: mensaje.tipo,
    p_texto: mensaje.texto,
  });
  if (!nuevo) return;

  const token = await tokenDe(linea.barberia_id);
  if (token) await marcarLeido(linea.phone_number_id, token, mensaje.messageId);

  // 1. ¿Ha pulsado un botón de aprobación? Eso no pasa por la IA.
  if (mensaje.botonId && (await resolverBoton(linea, mensaje.botonId, mensaje.waId))) return;

  const texto = mensaje.texto.trim();

  // 2. Un código de 6 cifras es un código, no una frase. Tampoco pasa por la IA.
  if (SEIS_CIFRAS.test(texto)) {
    if (await probarCodigo(linea, mensaje.waId, texto)) return;
    await responder(
      linea,
      mensaje.waId,
      'Ese código no me cuadra. Puede que haya caducado: dime que te mande otro y lo hago.',
    );
    return;
  }

  // 3. Lo que no es texto se contesta con honestidad.
  if (!texto) {
    if (mensaje.tipo === 'audio') {
      await responder(linea, mensaje.waId, 'Los audios no los entiendo. ¿Me lo escribes?');
    } else if (mensaje.tipo !== 'text' && !mensaje.botonId) {
      await responder(linea, mensaje.waId, 'Eso no lo puedo abrir. ¿Me lo escribes con palabras?');
    }
    return;
  }

  // 4. ¿Quién es?
  let { data: ficha } = await admin.rpc('wa_publico', {
    p_barberia: linea.barberia_id,
    p_telefono: mensaje.waId,
  });

  if (!ficha) return;
  if ((ficha as { estado?: string }).estado === 'nuevo') {
    await admin.rpc('wa_vincular_auto', {
      p_barberia: linea.barberia_id,
      p_telefono: mensaje.waId,
      p_wa_id: mensaje.waId,
    });
    const { data: otra } = await admin.rpc('wa_publico', {
      p_barberia: linea.barberia_id,
      p_telefono: mensaje.waId,
    });
    ficha = otra ?? ficha;
  }

  const f = ficha as {
    estado: string;
    barberia_id?: string;
    local?: { nombre: string; slug: string; telefono?: string; direccion?: string };
    cliente?: {
      id: string;
      nombre: string;
      token: string;
      sellos?: { en_ciclo: number; meta: number; faltan: number; disponibles: number };
      proxima?: { inicio: string; servicio: string; silla?: string | null } | null;
      ultima_visita?: string | null;
    } | null;
  };

  if (f.estado !== 'abierta' && f.estado !== 'nuevo') return; // apagado, suspendido o sin línea

  const { data: config } = await admin
    .from('asistente_config')
    .select('nombre, personalidad, bienvenida, funciones')
    .eq('barberia_id', linea.barberia_id)
    .maybeSingle();

  const funciones = (config?.funciones ?? {}) as Record<string, boolean>;

  // 5. ¿Tiene algo en la lista de espera? El prompt se lo cuenta.
  let espera = null;
  if (f.cliente?.id) {
    const { data: e } = await admin.rpc('wa_espera_mia', {
      p_barberia: linea.barberia_id,
      p_telefono: mensaje.waId,
    });
    espera = e ?? null;
  }

  // 6. El turno.
  const turno = await ejecutarTurno({
    admin,
    anon,
    barberiaId: linea.barberia_id,
    slug: linea.slug,
    canal: 'whatsapp',
    telefono: normalizarTelefono(mensaje.waId),
    token: f.cliente?.token ?? '',
    pin: null,
    clienteId: f.cliente?.id ?? null,
    mensaje: texto,
    conversacionId: null,
    local: {
      nombre: linea.nombre,
      direccion: linea.direccion,
      telefono: linea.telefono_local,
      asistente: config?.nombre ?? null,
      personalidad: config?.personalidad ?? 'cercano',
      bienvenida: config?.bienvenida ?? '',
      funciones,
      servicios: [],
      horarios: [],
    },
    cliente: {
      nombre: f.cliente?.nombre ?? mensaje.nombrePerfil ?? '',
      vinculado: Boolean(f.cliente),
      sellos: f.cliente?.sellos,
      proxima: f.cliente?.proxima ?? null,
      ultimaVisita: f.cliente?.ultima_visita ?? null,
      espera: espera as { estado: string; puesto: number } | null,
    },
    funciones,
    espera: (espera as { oferta?: { id: string; inicio: string; servicio: string | null } } | null)
      ? {
          espera_id: '',
          puesto: 0,
          estado: 'esperando',
          oferta: (espera as { oferta?: { id: string; inicio: string; servicio: string | null } }).oferta ?? null,
        }
      : null,
    proveedor: proveedor(),
  });

  // 6.b Si ha reservado alguien sin ficha, la ficha acaba de nacer con su
  // número: se vincula para que el próximo mensaje ya sepa quién es.
  if (!f.cliente && turno.llamadas.includes('reservar')) {
    await admin.rpc('wa_vincular_auto', {
      p_barberia: linea.barberia_id,
      p_telefono: mensaje.waId,
      p_wa_id: mensaje.waId,
    });
  }

  // 7. Lo que el agente ha pedido fuera de la conversación.
  const codigo = turno.salidas.find(
    (s) => s.nombre === 'pedir_codigo' && (s.salida as { codigo?: string })?.codigo,
  );
  if (codigo) {
    const valor = String((codigo.salida as { codigo?: string }).codigo);
    await responder(
      linea,
      mensaje.waId,
      `Tu código es ${valor}. Lo puedes usar una vez y caduca en 10 minutos.`,
    );
  }

  // 8. Modo estreno: la cita existe, pero el dueño decide.
  const reserva = turno.salidas.find(
    (s) => s.nombre === 'reservar' && (s.salida as { pendiente_de_confirmar?: boolean })?.pendiente_de_confirmar,
  );
  if (reserva) {
    const citaId = (reserva.salida as { cita?: string }).cita ?? null;

    if (citaId) {
      const { data: cita } = await admin
        .from('citas')
        .select('inicio, clientes (nombre), servicios (nombre)')
        .eq('id', citaId)
        .maybeSingle();

      const c = cita as unknown as
        | { inicio: string; clientes: { nombre: string }; servicios: { nombre: string } }
        | null;

      if (c) {
        const cuando = new Intl.DateTimeFormat('es-ES', {
          timeZone: 'Europe/Madrid',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(c.inicio));

        const { data: aprobacion } = await admin.rpc('wa_aprobacion_crear', {
          p_barberia: linea.barberia_id,
          p_tipo: 'cita',
          p_referencia: citaId,
          p_texto: `${c.clientes?.nombre ?? 'Un cliente'} quiere ${c.servicios?.nombre ?? 'cita'}: ${cuando}.`,
        });

        if (aprobacion) {
          await avisarAlDueno(
            linea,
            `${c.clientes?.nombre ?? 'Un cliente'} quiere cita: ${c.servicios?.nombre ?? ''} ${cuando}.`,
            String(aprobacion),
          );
        }
      }
    }
  }

  // 9. La respuesta.
  if (turno.respuesta) {
    await responder(linea, mensaje.waId, turno.respuesta);
  }
}

/* ------------------------------------------------------------------ */
/* Servidor                                                           */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  // Verificación del webhook: Meta llama una vez, con un token nuestro.
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    if (
      params.get('hub.mode') === 'subscribe' &&
      VERIFY_TOKEN &&
      params.get('hub.verify_token') === VERIFY_TOKEN
    ) {
      return new Response(params.get('hub.challenge') ?? '', { status: 200 });
    }
    return new Response('no', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('no', { status: 405 });

  const crudo = await req.text();

  if (SECRETO_FIRMA) {
    const firma = req.headers.get('x-hub-signature-256');
    if (!(await firmaValida(crudo, firma, SECRETO_FIRMA))) {
      return new Response('firma', { status: 401 });
    }
  }

  let cuerpo: unknown = {};
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return new Response('ok', { status: 200 });
  }

  // Se contesta ya. El trabajo sigue por detrás.
  const trabajo = (async () => {
    for (const mensaje of leerEntrantes(cuerpo)) {
      try {
        await atender(mensaje);
      } catch (error) {
        console.error('wa', mensaje.messageId, error);
      }
    }
  })();

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(trabajo);
  } else {
    await trabajo;
  }

  return new Response('ok', { status: 200 });
});
