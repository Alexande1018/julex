// JULEX · lo que pasa sin que nadie escriba
//
// Dos trabajos, cada cinco minutos:
//   1. Recordatorios de las citas de mañana (plantilla de utilidad).
//   2. Huecos que se han liberado, ofrecidos a quien espera.
//
// Se llama desde pg_cron con la cabecera `x-julex-cron`. Si el secreto
// no cuadra, no se hace nada: esto manda mensajes de verdad.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { enviarPlantilla, enviarTexto, normalizarTelefono, paraMeta, recortar } from '../_shared/wa.ts';

const SECRETO = Deno.env.get('CRON_SECRET') ?? '';
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

interface Linea {
  phone_number_id: string;
  token: string;
}

/** La línea y su token, una vez por local y por pasada. */
async function lineas(): Promise<Map<string, Linea>> {
  const mapa = new Map<string, Linea>();

  const [{ data: filas }, { data: secretos }] = await Promise.all([
    admin
      .from('wa_linea')
      .select('barberia_id, phone_number_id')
      .eq('estado', 'activa')
      .eq('modo', 'real'),
    admin.from('wa_secreto').select('barberia_id, token'),
  ]);

  const tokens = new Map((secretos ?? []).map((s) => [s.barberia_id, String(s.token ?? '')]));

  for (const fila of filas ?? []) {
    const token = tokens.get(fila.barberia_id) ?? '';
    if (token && fila.phone_number_id) {
      mapa.set(fila.barberia_id, { phone_number_id: fila.phone_number_id, token });
    }
  }
  return mapa;
}

const fechaHora = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function cuando(iso: string): string {
  try {
    return fechaHora.format(new Date(iso));
  } catch {
    return iso;
  }
}

interface Cita {
  cita_id: string;
  barberia_id: string;
  telefono: string;
  nombre: string;
  inicio: string;
  servicio: string;
  local: string;
}

interface Oferta {
  oferta_id: string;
  espera_id: string;
  barberia_id: string;
  telefono: string;
  nombre: string;
  inicio: string;
  servicio: string | null;
  local: string;
}

async function recordatorios(mapa: Map<string, Linea>) {
  const { data } = await admin.rpc('wa_recordatorios_reclamar', { p_limite: 50 });
  const citas = (data ?? []) as Cita[];

  let enviados = 0;
  let fallos = 0;

  for (const cita of citas) {
    const linea = mapa.get(cita.barberia_id);
    if (!linea) continue;

    const envio = await enviarPlantilla({
      phoneNumberId: linea.phone_number_id,
      token: linea.token,
      para: paraMeta(cita.telefono),
      plantilla: 'recordatorio_cita',
      idioma: 'es',
      variables: [
        String(cita.nombre ?? '').split(' ')[0] || 'hola',
        String(cita.servicio ?? 'tu cita'),
        cuando(cita.inicio),
        String(cita.local ?? ''),
      ],
    });

    await admin.rpc('wa_recordatorio_resultado', {
      p_cita: cita.cita_id,
      p_ok: !envio.error,
      p_error: envio.error ?? '',
    });

    if (envio.error) fallos++;
    else enviados++;
  }

  return { enviados, fallos };
}

async function ofertas(mapa: Map<string, Linea>) {
  const { data } = await admin.rpc('wa_ofertas_reclamar', { p_limite: 20 });
  const lista = (data ?? []) as Oferta[];

  let enviadas = 0;

  for (const oferta of lista) {
    const linea = mapa.get(oferta.barberia_id);
    if (!linea) continue;

    const texto = `¡Buenas${
      oferta.nombre ? `, ${String(oferta.nombre).split(' ')[0]}` : ''
    }! Se ha liberado un hueco en ${oferta.local}: ${cuando(oferta.inicio)}${
      oferta.servicio ? ` (${oferta.servicio})` : ''
    }. Si te viene bien, respóndeme que sí y te lo guardo.`;

    const envio = await enviarTexto({
      phoneNumberId: linea.phone_number_id,
      token: linea.token,
      para: paraMeta(oferta.telefono),
      texto: recortar(texto),
    });

    await admin.rpc('wa_mensaje_saliente', {
      p_barberia: oferta.barberia_id,
      p_wa_id: normalizarTelefono(oferta.telefono),
      p_message_id: envio.id,
      p_tipo: 'text',
      p_texto: texto,
      p_estado: envio.error ? 'fallo' : 'enviado',
      p_error: envio.error,
      p_coste: 0,
    });

    if (!envio.error) enviadas++;
  }

  return { ofrecidas: enviadas };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('no', { status: 405 });
  if (!SECRETO || req.headers.get('x-julex-cron') !== SECRETO) {
    return new Response('no', { status: 401 });
  }

  const mapa = await lineas();
  const resultado = { lineas: mapa.size, ...(await recordatorios(mapa)), ...(await ofertas(mapa)) };

  return new Response(JSON.stringify(resultado), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
