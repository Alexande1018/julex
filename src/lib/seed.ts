import type {
  Barberia,
  Barbero,
  Cita,
  Cliente,
  ColaItem,
  Db,
  Llavero,
  Mensaje,
  Movimiento,
  Recompensa,
  Servicio,
  Visita,
} from './types';
import { addDays, addMinutes, startOfDay } from './format';

/** Súbelo cuando cambie la forma del seed: invalida el almacenamiento viejo. */
export const SEED_VERSION = 8;

const BARBERIA = 'b_pablo';
const BARBERO = 'u_pablo';

export const TOKENS_DEMO = [
  'k7m2q9x1p3va',
  'n4t8r6w2y5bz',
  'q3v7m1k9s4dc',
  'x8p2n5t7r1fe',
  't6r9k3m8v2gh',
  'm1v4q7x9n3jk',
  'r5n8t2k6m1lp',
  'v9k3m5q8x2nq',
  'p2x6v9n4t7rs',
  'k4m8q2x6v9tu',
  'n7t1r5k9m3vw',
  'q9v3m7x1n5yz',
  'x1p5n9t3r7ab',
  't3r7k1m5v9cd',
  'm5v9q3x7n1ef',
];

export const TOKENS_CLIENTE = [
  'c4k9m2x7pq',
  'r8t3v6n1ws',
  'm2q7x4k9zt',
  'v6n1r8t3ky',
  'q9x2m7v4np',
  't3k8q1x6rm',
];

const CODIGOS_LLAvero = [
  'PBL-7K4Q',
  'PBL-2M9T',
  'PBL-5R1V',
  'PBL-8X3N',
  'PBL-4Q6P',
  'PBL-9T2K',
  'PBL-1V7M',
  'PBL-6N4R',
  'PBL-3P8X',
  'PBL-7Q1T',
  'PBL-2R5K',
  'PBL-8T9V',
  'PBL-5K3N',
  'PBL-1N6Q',
  'PBL-4V2M',
];

function fecha(dias: number, hora: number, minuto = 0): string {
  const d = addDays(startOfDay(new Date()), dias);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

function haceMinutos(min: number): string {
  return addMinutes(new Date(), -min).toISOString();
}

function servicioCiclo(i: number): string {
  const orden = ['s_corte', 's_corte', 's_corte_barba', 's_corte', 's_nino', 's_corte'];
  return orden[i % orden.length];
}

interface Ficha {
  codigo: string;
  nombre: string;
  telefono: string;
  comoCorta: string;
  notas: string;
  preferencias: string;
  cortes: number;
  diasUltima: number;
  consentimientos: { datos: boolean; avisos: boolean; marketing: boolean };
}

const FICHAS: Ficha[] = [
  {
    codigo: 'P-0001',
    nombre: 'Marco Ruiz',
    telefono: '611 224 883',
    comoCorta:
      'Máquina 1 a los lados con degradado a media altura. Arriba unos 3 cm, peinado hacia atrás con cera mate.',
    notas: 'Viene siempre de camino al trabajo. Nunca pide lavado.',
    preferencias: 'Mañanas antes de las 10.',
    cortes: 3,
    diasUltima: 0,
    consentimientos: { datos: true, avisos: true, marketing: true },
  },
  {
    codigo: 'P-0002',
    nombre: 'Luis Ferrer',
    telefono: '622 118 902',
    comoCorta: 'Clásico con raya al lado, tijera arriba. Rabillo corto y limpio en la nuca.',
    notas: 'Trabaja en obra, quiere el corte corto de verdad. No le gusta esperar.',
    preferencias: 'Sábado por la mañana.',
    cortes: 7,
    diasUltima: 26,
    consentimientos: { datos: true, avisos: false, marketing: false },
  },
  {
    codigo: 'P-0003',
    nombre: 'Andrés Soto',
    telefono: '633 776 145',
    comoCorta: 'Fade medio y barba perfilada con navaja. Bigote recortado, nunca afeitado del todo.',
    notas: 'Le gusta el after shave sin alcohol.',
    preferencias: 'Después de las 18:00.',
    cortes: 12,
    diasUltima: 40,
    consentimientos: { datos: true, avisos: false, marketing: true },
  },
  {
    codigo: 'P-0004',
    nombre: 'Pablo Martínez',
    telefono: '644 902 331',
    comoCorta:
      'Degradado bajo, laterales al 0,5, arriba con tijera. No tocar demasiado el flequillo.',
    notas: 'Prefiere venir los sábados.',
    preferencias: 'Le gusta reservar por la tarde.',
    cortes: 23,
    diasUltima: 18,
    consentimientos: { datos: true, avisos: true, marketing: true },
  },
  {
    codigo: 'P-0005',
    nombre: 'Hugo Vidal',
    telefono: '655 340 118',
    comoCorta: 'Solo laterales y nuca con máquina 2. Arriba no tocar nada.',
    notas: 'Vino una vez con su padre. Es el sobrino de Luis.',
    preferencias: '',
    cortes: 1,
    diasUltima: 9,
    consentimientos: { datos: true, avisos: false, marketing: false },
  },
  {
    codigo: 'P-0006',
    nombre: 'Javier Ortega',
    telefono: '666 118 774',
    comoCorta:
      'Fade alto con línea marcada. Barba corta a máquina 1, perfilada en el cuello.',
    notas: 'Le recomendó Andrés. Le gusta el café mientras espera.',
    preferencias: 'Jueves por la tarde.',
    cortes: 9,
    diasUltima: 62,
    consentimientos: { datos: true, avisos: true, marketing: true },
  },
];

export function buildSeed(): Db {
  const barberia: Barberia = {
    id: BARBERIA,
    nombre: 'Barbería Pablo',
    slug: 'barberia-pablo',
    color: '#3E4A35',
    telefono: '600 123 456',
    direccion: 'Calle Mayor 14, 28013 Madrid',
    logo: null,
    fidelidadMeta: 10,
    tipo: 'barberia',
    domicilioLegal: 'Madrid',
    correoLegal: '',
    altaEn: fecha(-215, 10),
  };

  const barbero: Barbero = { id: BARBERO, barberiaId: BARBERIA, nombre: 'Pablo Serrano', rol: 'dueno' };

  const servicios: Servicio[] = [
    { id: 's_corte', barberiaId: BARBERIA, nombre: 'Corte', precio: 15, minutos: 30, activo: true },
    {
      id: 's_corte_barba',
      barberiaId: BARBERIA,
      nombre: 'Corte + barba',
      precio: 22,
      minutos: 45,
      activo: true,
    },
    { id: 's_nino', barberiaId: BARBERIA, nombre: 'Niño', precio: 10, minutos: 20, activo: true },
  ];

  const clientes: Cliente[] = [];
  const visitas: Visita[] = [];
  const movimientos: Movimiento[] = [];
  const recompensas: Recompensa[] = [];

  FICHAS.forEach((f, idx) => {
    const id = `c_${f.codigo.toLowerCase().replace('-', '')}`;
    clientes.push({
      id,
      barberiaId: BARBERIA,
      codigo: f.codigo,
      tokenPublico: TOKENS_CLIENTE[idx],
      nombre: f.nombre,
      telefono: f.telefono,
      comoCorta: f.comoCorta,
      notas: f.notas,
      preferencias: f.preferencias,
      consentimientos: {
        datos: true,
        avisos: f.consentimientos.avisos,
        marketing: f.consentimientos.marketing,
        fidelidad: true,
        preferencias: f.consentimientos.avisos,
        promociones: f.consentimientos.marketing,
      },
      privacidad: 'activo',
      creadoEn: fecha(-(60 + idx * 37), 11),
    });

    // Historial: la última visita en `diasUltima` y las anteriores cada 3-4 semanas.
    let dias = f.diasUltima;
    for (let i = 0; i < f.cortes; i++) {
      const servicioId = servicioCiclo(i + idx);
      const base = servicios.find((s) => s.id === servicioId)!;
      const cuando =
        i === 0
          ? dias === 0
            ? haceMinutos(35)
            : fecha(-dias, 10 + ((idx * 2 + i) % 8), (i * 17) % 60)
          : fecha(-dias, 10 + ((idx + i) % 8), (i * 23) % 60);

      visitas.push({
        id: `v_${f.codigo}_${i}`,
        barberiaId: BARBERIA,
        clienteId: id,
        servicioId,
        fecha: cuando,
        precio: base.precio,
        pagado: true,
        metodo: i % 3 === 0 ? 'tarjeta' : 'efectivo',
      });

      movimientos.push({
        id: `m_${f.codigo}_${i}`,
        barberiaId: BARBERIA,
        clienteId: id,
        tipo: 'corte',
        fecha: cuando,
        nota: base.nombre,
      });

      dias += 27 + ((i * 5) % 9);
    }

    // Recompensas ya ganadas y canjeadas en el pasado (coherentes con el total).
    const ganadas = Math.floor(f.cortes / 10);
    for (let r = 0; r < ganadas; r++) {
      const en = fecha(-(f.diasUltima + (ganadas - r) * 30), 19);
      movimientos.push({
        id: `m_${f.codigo}_r${r}`,
        barberiaId: BARBERIA,
        clienteId: id,
        tipo: 'recompensa_ganada',
        fecha: en,
        nota: 'Corte gratis nº ' + (r + 1),
      });
      movimientos.push({
        id: `m_${f.codigo}_c${r}`,
        barberiaId: BARBERIA,
        clienteId: id,
        tipo: 'recompensa_canjeada',
        fecha: addDays(new Date(en), 3).toISOString(),
        nota: 'Canjeado en barbería',
      });
      recompensas.push({
        id: `rw_${f.codigo}_${r}`,
        barberiaId: BARBERIA,
        clienteId: id,
        estado: 'aplicada',
        creadaEn: en,
        aplicadaEn: addDays(new Date(en), 3).toISOString(),
      });
    }
  });

  const llaveros: Llavero[] = TOKENS_DEMO.map((token, i) => {
    const clienteId = i < 6 ? clientes[i].id : null;
    const retirado = i === 14;
    return {
      id: `ll_${i + 1}`,
      barberiaId: BARBERIA,
      token,
      codigoCorto: CODIGOS_LLAvero[i],
      lote: 'L-001',
      estado: retirado ? 'retirado' : clienteId ? 'activo' : 'sin_asignar',
      clienteId,
      creadoEn: fecha(-215, 10),
      asignadoEn: clienteId ? fecha(-(150 - i * 22), 10) : null,
      retiradoEn: retirado ? fecha(-20, 10) : null,
    };
  });

  const c1 = clientes[0].id;
  const c2 = clientes[1].id;
  const c3 = clientes[2].id;
  const c4 = clientes[3].id;
  const c5 = clientes[4].id;

  const citas: Cita[] = [
    {
      id: 'ap_1',
      barberiaId: BARBERIA,
      clienteId: c1,
      servicioId: 's_corte',
      inicio: haceMinutos(70),
      estado: 'atendida',
      origen: 'manual',
      nota: '',
    },
    {
      id: 'ap_2',
      barberiaId: BARBERIA,
      clienteId: c2,
      servicioId: 's_corte',
      inicio: addMinutes(new Date(), 5).toISOString(),
      estado: 'confirmada',
      origen: 'llavero',
      nota: '',
    },
    {
      id: 'ap_3',
      barberiaId: BARBERIA,
      clienteId: c5,
      servicioId: 's_corte',
      inicio: addMinutes(new Date(), 35).toISOString(),
      estado: 'pendiente',
      origen: 'qr',
      nota: '',
    },
    {
      id: 'ap_4',
      barberiaId: BARBERIA,
      clienteId: c3,
      servicioId: 's_corte_barba',
      inicio: fecha(1, 10, 30),
      estado: 'confirmada',
      origen: 'qr',
      nota: '',
    },
    {
      id: 'ap_5',
      barberiaId: BARBERIA,
      clienteId: c4,
      servicioId: 's_corte',
      inicio: fecha(1, 12, 0),
      estado: 'confirmada',
      origen: 'llavero',
      nota: '',
    },
    {
      id: 'ap_6',
      barberiaId: BARBERIA,
      clienteId: c1,
      servicioId: 's_corte',
      inicio: fecha(1, 17, 30),
      estado: 'pendiente',
      origen: 'web',
      nota: '',
    },
  ];

  const cola: ColaItem[] = [
    {
      id: 'q_1',
      barberiaId: BARBERIA,
      clienteId: c1,
      servicioId: 's_corte',
      estado: 'terminado',
      llegadaEn: haceMinutos(78),
      inicioEn: haceMinutos(66),
      finEn: haceMinutos(36),
      origen: 'mostrador',
    },
    {
      id: 'q_2',
      barberiaId: BARBERIA,
      clienteId: c4,
      servicioId: 's_corte',
      estado: 'sillon',
      sillaId: 'silla-1',
      llegadaEn: haceMinutos(41),
      inicioEn: haceMinutos(14),
      finEn: null,
      origen: 'llavero',
    },
    {
      id: 'q_3',
      barberiaId: BARBERIA,
      clienteId: c2,
      servicioId: 's_corte',
      estado: 'esperando',
      llegadaEn: haceMinutos(12),
      inicioEn: null,
      finEn: null,
      origen: 'llavero',
    },
    {
      id: 'q_4',
      barberiaId: BARBERIA,
      clienteId: c5,
      servicioId: 's_corte',
      estado: 'esperando',
      llegadaEn: haceMinutos(4),
      inicioEn: null,
      finEn: null,
      origen: 'mostrador',
    },
  ];

  const mensajes: Mensaje[] = [
    {
      id: 'msg_1',
      barberiaId: BARBERIA,
      clienteId: c3,
      tipo: 'reactivacion',
      canal: 'whatsapp',
      estado: 'simulado',
      fecha: fecha(-6, 19, 10),
      texto:
        'Andrés, hace seis semanas que no te veo. ¿Te guardo el jueves a las 18:30? — Barbería Pablo',
    },
    {
      id: 'msg_2',
      barberiaId: BARBERIA,
      clienteId: c4,
      tipo: 'resena',
      canal: 'whatsapp',
      estado: 'simulado',
      fecha: fecha(-18, 17, 42),
      texto: 'Pablo, si el corte te ha quedado bien, ¿nos dejas una reseña? — Barbería Pablo',
    },
  ];

  return {
    version: SEED_VERSION,
    barberias: [barberia],
    barberos: [barbero],
    sillas: [
      { id: 'silla-1', barberiaId: barberia.id, nombre: 'Silla 1', orden: 1, activa: true },
      { id: 'silla-2', barberiaId: barberia.id, nombre: 'Silla 2', orden: 2, activa: true },
    ],
    servicios,
    clientes,
    llaveros,
    citas,
    cola,
    visitas,
    movimientos,
    recompensas,
    mensajes,
    eventos: [],
    sesion: null,
  };
}
