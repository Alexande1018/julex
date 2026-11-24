// JULEX · un turno de conversación
//
// Esto es lo que comparten el llavero y el WhatsApp: los topes, el
// prompt, el bucle con el modelo y el registro del gasto. La diferencia
// está solo en cómo se sabe quién habla, y eso se resuelve antes de
// entrar aquí.
//
// Si algún día hay un tercer canal (Telegram, web), no se toca esto.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  conversar,
  calcularCoste,
  inicioDeMesMadrid,
  LimiteDeTurnos,
  type Mensaje,
  type Proveedor,
  type Uso,
  type Json,
} from './engine.ts';
import { construirSistema, type DatosCliente, type DatosLocal } from './prompt.ts';
import { crearHerramientas, type Espera, type Funciones, type ServicioLocal } from './herramientas.ts';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const HISTORIAL = 10;

/** Un contador que llega de la base de datos nunca es de fiar: podría ser null. */
function cuenta(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
const MAX_MENSAJES_CONVERSACION = 30;

function numero(nombre: string, porDefecto: number): number {
  const valor = Number(Deno.env.get(nombre));
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

export const TOPES = {
  conversaciones: () => numero('ASISTENTE_TOPE_CONVERSACIONES', 300),
  mensajesMes: () => numero('ASISTENTE_TOPE_MENSAJES_MES', 1500),
  mensajes24h: () => numero('ASISTENTE_TOPE_MENSAJES_24H', 60),
  mensajesDia: () => numero('ASISTENTE_TOPE_MENSAJES_DIA', 3000),
  precioEntrada: () => numero('ASISTENTE_PRECIO_ENTRADA', 0.3),
  precioSalida: () => numero('ASISTENTE_PRECIO_SALIDA', 1.2),
};

export interface EntradaTurno {
  admin: SupabaseClient;
  /** El cliente con el que se ejecutan las herramientas: va con la clave pública. */
  anon: SupabaseClient;
  barberiaId: string;
  slug: string;
  canal: 'llavero' | 'whatsapp' | 'demo';
  telefono: string;
  token: string;
  pin: string | null;
  clienteId: string | null;
  mensaje: string;
  conversacionId: string | null;
  local: DatosLocal;
  cliente: DatosCliente;
  funciones: Funciones;
  espera?: Espera | null;
  proveedor: Proveedor;
  /** Modo prueba: no escribe en la agenda ni en las métricas. */
  simulado?: boolean;
  sinRegistro?: boolean;
  /** Conversación de prueba: sin base de datos, el historial llega de fuera. */
  historial?: Mensaje[];
}

export interface SalidaTurno {
  estado: 'abierta' | 'tope' | 'derivado' | 'sin_servicio';
  respuesta: string;
  conversacionId: string | null;
  llamadas: string[];
  /** Lo que devolvió cada herramienta: lo usa el canal para actuar después. */
  salidas: { nombre: string; salida: unknown }[];
  uso: Uso;
  coste: number;
}

export async function ejecutarTurno(entrada: EntradaTurno): Promise<SalidaTurno> {
  const { admin, anon, barberiaId, token, pin, mensaje } = entrada;
  const vacio: SalidaTurno = {
    estado: 'abierta',
    respuesta: '',
    conversacionId: null,
    llamadas: [],
    salidas: [],
    uso: { entrada: 0, salida: 0 },
    coste: 0,
  };

  /* 1. La conversación que manda el navegador solo vale si es suya. */
  let conversacionId: string | null = null;
  let historial: Mensaje[] = (entrada.historial ?? []).slice(-HISTORIAL);

  if (entrada.conversacionId) {
    const { data: suya } = await admin
      .from('asistente_conversacion')
      .select('id, cliente_id, barberia_id, telefono')
      .eq('id', entrada.conversacionId)
      .maybeSingle();

    const esSuya =
      suya &&
      suya.barberia_id === barberiaId &&
      (entrada.clienteId
        ? suya.cliente_id === entrada.clienteId
        : !suya.cliente_id && suya.telefono === entrada.telefono);

    if (esSuya) conversacionId = suya.id;
  }

  // En WhatsApp no hay identificador de conversación: se reengancha a la
  // que esté abierta con ese número en las últimas 24 horas. Sin esto el
  // agente saludaría de cero en cada mensaje y el tope mensual de
  // conversaciones se agotaría a la tercera frase.
  if (!conversacionId && entrada.canal === 'whatsapp' && entrada.telefono) {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: viva } = await admin
      .from('asistente_conversacion')
      .select('id')
      .eq('barberia_id', barberiaId)
      .eq('canal', 'whatsapp')
      .eq('telefono', entrada.telefono)
      .eq('estado', 'abierta')
      .gte('abierta_en', desde)
      .order('abierta_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (viva) conversacionId = viva.id;
  }

  /* 2. Topes. Primero los de la conversación, luego los del mes. */
  if (conversacionId) {
    const { count } = await admin
      .from('asistente_mensaje')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conversacionId);
    if ((count ?? 0) >= MAX_MENSAJES_CONVERSACION) {
      return { ...vacio, estado: 'tope', conversacionId };
    }

    const { data: previos } = await admin
      .from('asistente_mensaje')
      .select('papel, texto')
      .eq('conversacion_id', conversacionId)
      .in('papel', ['cliente', 'asistente'])
      .order('creado_en', { ascending: false })
      .limit(HISTORIAL);

    historial = ((previos ?? []) as { papel: string; texto: string }[])
      .reverse()
      .map((m) => ({ papel: m.papel as 'cliente' | 'asistente', texto: m.texto.slice(0, 800) }));
  }

  const [{ data: en24h }, { data: enMes }, { data: hoy }] = await Promise.all([
    entrada.clienteId
      ? admin.rpc('asistente_mensajes_24h', { p_cliente: entrada.clienteId })
      : Promise.resolve({ data: 0 }),
    admin.rpc('asistente_mensajes_mes', { p_barberia: barberiaId }),
    admin.rpc('asistente_mensajes_hoy'),
  ]);

  if (cuenta(en24h) >= TOPES.mensajes24h()) return { ...vacio, estado: 'tope', conversacionId };
  if (cuenta(enMes) >= TOPES.mensajesMes()) return { ...vacio, estado: 'tope', conversacionId };
  if (cuenta(hoy) >= TOPES.mensajesDia()) return { ...vacio, estado: 'sin_servicio', conversacionId };

  const { count: conversaciones } = await admin
    .from('asistente_conversacion')
    .select('id', { count: 'exact', head: true })
    .eq('barberia_id', barberiaId)
    .gte('abierta_en', inicioDeMesMadrid());
  if ((conversaciones ?? 0) >= TOPES.conversaciones()) {
    return { ...vacio, estado: 'tope', conversacionId };
  }

  /* 3. Lo que el modelo necesita del local: servicios y horarios reales. */
  const [{ data: servicios }, { data: horarios }] = await Promise.all([
    admin
      .from('servicios')
      .select('id, nombre, precio, minutos')
      .eq('barberia_id', barberiaId)
      .eq('activo', true)
      .order('orden'),
    admin
      .from('horarios')
      .select('dia_semana, abre, cierra, descanso_desde, descanso_hasta')
      .eq('barberia_id', barberiaId)
      .order('dia_semana'),
  ]);

  const catalogo: ServicioLocal[] = (servicios ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    minutos: s.minutos,
    precio: Number(s.precio),
  }));

  const sistema = construirSistema(
    {
      ...entrada.local,
      canal: entrada.canal === 'llavero' ? 'llavero' : 'whatsapp',
      funciones: entrada.funciones,
      servicios: (servicios ?? []).map((s) => ({
        nombre: s.nombre,
        precio: Number(s.precio),
        minutos: s.minutos,
      })),
      horarios: (horarios ?? []).map((h) => ({
        dia: DIAS[h.dia_semana] ?? String(h.dia_semana),
        abre: String(h.abre).slice(0, 5),
        cierra: String(h.cierra).slice(0, 5),
        descanso_desde: h.descanso_desde ? String(h.descanso_desde).slice(0, 5) : null,
        descanso_hasta: h.descanso_hasta ? String(h.descanso_hasta).slice(0, 5) : null,
      })),
    },
    { ...entrada.cliente, primer: historial.length === 0 },
  );

  /* 4. El bucle. */
  const salidas: { nombre: string; salida: unknown }[] = [];
  let resultado;
  try {
    resultado = await conversar({
      proveedor: entrada.proveedor,
      sistema,
      mensajes: [...historial, { papel: 'cliente', texto: mensaje }],
      herramientas: crearHerramientas({
        token,
        pin,
        slug: entrada.slug,
        barberiaId,
        telefono: entrada.telefono,
        clienteId: entrada.clienteId,
        funciones: entrada.funciones,
        simulado: entrada.simulado,
        espera: entrada.espera ?? null,
        servicios: catalogo,
        rpc: (funcion: string, argumentos: Json) => anon.rpc(funcion, argumentos),
      }),
      alLlamar: (nombre, _argumentos, salida) => {
        salidas.push({ nombre, salida });
      },
    });
  } catch (error) {
    if (error instanceof LimiteDeTurnos) {
      return {
        ...vacio,
        estado: 'derivado',
        respuesta: 'Mejor te lo cuenta una persona del local.',
        conversacionId,
      };
    }
    throw error;
  }

  const coste = calcularCoste(resultado.uso, TOPES.precioEntrada(), TOPES.precioSalida());

  /* 5. Registrar el turno. Si falla el registro, la respuesta no se pierde. */
  if (!entrada.sinRegistro) {
    try {
      if (!conversacionId) {
        const { data: creada } = await admin
          .from('asistente_conversacion')
          .insert({
            barberia_id: barberiaId,
            cliente_id: entrada.clienteId,
            canal: entrada.canal === 'llavero' ? 'llavero' : 'whatsapp',
            telefono: entrada.canal === 'whatsapp' ? entrada.telefono : '',
          })
          .select('id')
          .single();
        conversacionId = creada?.id ?? null;
      }

      if (conversacionId) {
        await admin.from('asistente_mensaje').insert([
          { conversacion_id: conversacionId, papel: 'cliente', texto: mensaje },
          { conversacion_id: conversacionId, papel: 'asistente', texto: resultado.texto },
        ]);

        const derivo = resultado.llamadas.includes('pasar_al_barbero');
        const resultadoConversacion = resultado.llamadas.includes('reservar')
          ? 'cita'
          : resultado.llamadas.includes('proponer_ficha')
            ? 'ficha'
            : derivo
              ? 'ninguno'
              : 'consulta';

        await admin.rpc('asistente_registrar_turno', {
          p_conversacion: conversacionId,
          p_entrada: resultado.uso.entrada,
          p_salida: resultado.uso.salida,
          p_coste: coste,
          p_resultado: resultadoConversacion,
          p_derivada: derivo,
        });

        if (derivo) {
          await admin
            .from('asistente_conversacion')
            .update({ estado: 'derivada' })
            .eq('id', conversacionId);
        }
      }
    } catch (error) {
      console.error('registro', error);
    }
  }

  return {
    estado: 'abierta',
    respuesta: resultado.texto,
    conversacionId,
    llamadas: resultado.llamadas,
    salidas,
    uso: resultado.uso,
    coste,
  };
}
