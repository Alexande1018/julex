export type ID = string;
export type Iso = string;

export interface Servicio {
  id: ID;
  barberiaId: ID;
  nombre: string;
  precio: number;
  minutos: number;
  activo: boolean;
}

export interface Barberia {
  id: ID;
  nombre: string;
  slug: string;
  color: string;
  telefono: string;
  direccion: string;
  /** Data URL del logo (se guarda en el navegador, ya reducido). */
  logo: string | null;
  fidelidadMeta: number;
  altaEn: Iso;
}

export interface Barbero {
  id: ID;
  barberiaId: ID;
  nombre: string;
  rol: 'dueno' | 'barbero';
}

export interface Consentimientos {
  datos: boolean;
  avisos: boolean;
  marketing: boolean;
}

export interface Cliente {
  id: ID;
  barberiaId: ID;
  /** Código interno y legible (P-0004). No se usa en enlaces públicos. */
  codigo: string;
  /** Token aleatorio del enlace de su tarjeta. */
  tokenPublico: string;
  nombre: string;
  telefono: string;
  comoCorta: string;
  notas: string;
  preferencias: string;
  consentimientos: Consentimientos;
  creadoEn: Iso;
}

export type EstadoLlavero = 'sin_asignar' | 'activo' | 'retirado';

export interface Llavero {
  id: ID;
  barberiaId: ID;
  token: string;
  codigoCorto: string;
  lote: string;
  estado: EstadoLlavero;
  clienteId: ID | null;
  creadoEn: Iso;
  asignadoEn: Iso | null;
  retiradoEn: Iso | null;
}

export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'no_vino' | 'cancelada';
export type OrigenCita = 'qr' | 'llavero' | 'manual' | 'web';

export interface Silla {
  id: ID;
  barberiaId: ID;
  nombre: string;
  orden: number;
  activa: boolean;
}

export interface Cita {
  id: ID;
  barberiaId: ID;
  clienteId: ID;
  servicioId: ID;
  /** Silla que la atiende. Puede quedar vacía en citas antiguas. */
  sillaId?: ID | null;
  inicio: Iso;
  estado: EstadoCita;
  origen: OrigenCita;
  nota: string;
}

export type EstadoCola = 'esperando' | 'sillon' | 'terminado' | 'no_vino';

export interface ColaItem {
  id: ID;
  barberiaId: ID;
  clienteId: ID;
  sillaId?: ID | null;
  servicioId: ID | null;
  estado: EstadoCola;
  llegadaEn: Iso;
  inicioEn: Iso | null;
  finEn: Iso | null;
  origen: OrigenCita | 'mostrador';
}

export interface Visita {
  id: ID;
  barberiaId: ID;
  clienteId: ID;
  servicioId: ID;
  fecha: Iso;
  precio: number;
  pagado: boolean;
  metodo: 'efectivo' | 'tarjeta' | 'bono' | null;
}

export type TipoMovimiento = 'corte' | 'recompensa_ganada' | 'recompensa_canjeada';

export interface Movimiento {
  id: ID;
  barberiaId: ID;
  clienteId: ID;
  tipo: TipoMovimiento;
  fecha: Iso;
  nota: string;
}

export interface Recompensa {
  id: ID;
  barberiaId: ID;
  clienteId: ID;
  estado: 'disponible' | 'aplicada';
  creadaEn: Iso;
  aplicadaEn: Iso | null;
}

export type TipoMensaje = 'aviso_turno' | 'reactivacion' | 'resena' | 'confirmacion';

export interface Mensaje {
  id: ID;
  barberiaId: ID;
  clienteId: ID;
  tipo: TipoMensaje;
  canal: 'whatsapp' | 'sms';
  /** En demo nunca sale de la app: queda registrado como simulado. */
  estado: 'simulado';
  fecha: Iso;
  texto: string;
}

export interface Evento {
  id: ID;
  barberiaId: ID;
  tipo:
    | 'cliente_identificado_nfc'
    | 'cliente_añadido_cola'
    | 'cliente_sillon'
    | 'servicio_terminado'
    | 'cita_solicitada'
    | 'cita_confirmada'
    | 'recompensa_obtenida'
    | 'llavero_activado'
    | 'llavero_retirado'
    | 'mensaje_simulado';
  clienteId?: ID;
  fecha: Iso;
  meta?: Record<string, string | number | boolean>;
}

export interface Sesion {
  barberoId: ID;
  barberiaId: ID;
}

export interface Db {
  version: number;
  barberias: Barberia[];
  barberos: Barbero[];
  sillas: Silla[];
  servicios: Servicio[];
  clientes: Cliente[];
  llaveros: Llavero[];
  citas: Cita[];
  cola: ColaItem[];
  visitas: Visita[];
  movimientos: Movimiento[];
  recompensas: Recompensa[];
  mensajes: Mensaje[];
  eventos: Evento[];
  sesion: Sesion | null;
}
