import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useDb } from '../lib/store';
import { cambiarEstadoCita, crearCita } from '../lib/actions';
import {
  ETIQUETA_CITA,
  ETIQUETA_ORIGEN,
  barberiaActiva,
  citasDelDia,
  clienteDe,
  servicioDe,
  serviciosDe,
  sillaDe,
  sillasDe,
} from '../lib/derive';
import { addDays, etiquetaDia, fmtDuracion, fmtEuros, fmtHora } from '../lib/format';
import { Shell } from '../components/Shell';
import {
  Btn,
  EmptyState,
  Eyebrow,
  Field,
  Pill,
  Sheet,
  cn,
  inputClases,
  toast,
} from '../components/ui';

const TONO: Record<string, 'neutral' | 'ok' | 'warn' | 'danger'> = {
  pendiente: 'warn',
  confirmada: 'ok',
  atendida: 'neutral',
  no_vino: 'danger',
  cancelada: 'danger',
};

export default function Agenda() {
  const db = useDb();
  const barberia = barberiaActiva(db);
  const [offset, setOffset] = useState(0);
  const [nueva, setNueva] = useState(false);
  const [filtro, setFiltro] = useState<string>('todas');

  const dia = useMemo(() => addDays(new Date(), offset), [offset]);
  const citas = citasDelDia(db, barberia.id, dia);
  const servicios = serviciosDe(db, barberia.id);
  const sillas = sillasDe(db, barberia.id);
  const activas = sillas.filter((s) => s.activa);
  const visibles = filtro === 'todas' ? citas : citas.filter((c) => c.sillaId === filtro);

  /** Citas y minutos que come cada silla ese día. */
  const cuenta = activas.map((silla) => {
    const suyas = citas.filter((c) => c.sillaId === silla.id);
    const minutos = suyas.reduce((t, c) => t + (servicioDe(db, c.servicioId)?.minutos ?? 0), 0);
    return { silla, citas: suyas.length, minutos };
  });
  const sinSilla = citas.filter((c) => !c.sillaId).length;

  const copiar = async () => {
    const url = `${window.location.origin}/cita/${barberia.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace de reservas copiado', 'ok');
    } catch {
      toast('No se pudo copiar en este navegador', 'aviso');
    }
  };

  return (
    <Shell barberia={barberia} activo="/barbero/agenda">
      <div className="pt-5">
        <Eyebrow>Agenda</Eyebrow>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <h1 className="font-serif text-[27px] leading-none tracking-tight text-ink">
            {etiquetaDia(dia)}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset((v) => v - 1)}
              aria-label="Día anterior"
              className="rounded-[3px] border border-line p-1.5 text-muted hover:bg-paper-2 hover:text-ink"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setOffset(0)}
              disabled={offset === 0}
              className="rounded-[3px] border border-line px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-40"
            >
              Hoy
            </button>
            <button
              onClick={() => setOffset((v) => v + 1)}
              aria-label="Día siguiente"
              className="rounded-[3px] border border-line p-1.5 text-muted hover:bg-paper-2 hover:text-ink"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="num text-[11px] text-faint">
            {citas.length} {citas.length === 1 ? 'cita' : 'citas'}
          </span>
          <button
            onClick={copiar}
            className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <Copy size={11} /> Enlace de reservas
          </button>
        </div>

        <div className="mt-1">
          <Btn
            v="outline"
            t="sm"
            className="mt-2 w-full border-dashed"
            onClick={() => setNueva(true)}
          >
            Nueva cita
          </Btn>
        </div>
      </div>

      {/* REPARTO POR SILLA */}
      {activas.length > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {cuenta.map(({ silla, citas: n, minutos }) => (
            <button
              key={silla.id}
              onClick={() => setFiltro(filtro === silla.id ? 'todas' : silla.id)}
              className={cn(
                'rounded-[4px] border px-3 py-2.5 text-left transition-colors',
                filtro === silla.id
                  ? 'border-[var(--brand)] bg-paper'
                  : 'border-line bg-paper hover:border-ink/25',
              )}
            >
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                {silla.nombre}
              </p>
              <p className="num mt-1 font-serif text-[22px] leading-none text-ink">{n}</p>
              <p className="mt-1 text-[10.5px] text-muted">
                {n === 0 ? 'libre todo el día' : fmtDuracion(minutos) + ' de trabajo'}
              </p>
            </button>
          ))}
        </div>
      )}

      {filtro !== 'todas' && (
        <button
          onClick={() => setFiltro('todas')}
          className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          Ver todas las sillas
        </button>
      )}

      {visibles.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            titulo="Día sin citas"
            texto={`Comparte el enlace de reservas y las citas llegarán aquí como pendientes de confirmar.`}
            accion={
              <Btn v="ghost" t="sm" onClick={copiar}>
                <Copy size={12} /> Copiar enlace
              </Btn>
            }
          />
        </div>
      ) : (
        <ul className="mt-3">
          {visibles.map((c) => {
            const cliente = clienteDe(db, c.clienteId);
            const silla = sillaDe(db, c.sillaId);
            const servicio = servicioDe(db, c.servicioId);
            if (!cliente) return null;
            const abierta = c.estado === 'pendiente' || c.estado === 'confirmada';
            const pasada = new Date(c.inicio).getTime() < Date.now();

            return (
              <li key={c.id} className="border-b border-line-soft py-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-14 shrink-0">
                    <span
                      className={cn(
                        'num block font-serif text-[21px] leading-none tracking-tight',
                        pasada && abierta ? 'text-clay' : 'text-ink',
                      )}
                    >
                      {fmtHora(c.inicio)}
                    </span>
                    <span className="mt-1 block text-[9.5px] uppercase tracking-[0.1em] text-faint">
                      {silla ? silla.nombre : 'sin silla'}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/barbero/clientes/${cliente.id}`}
                        className="truncate text-[15px] font-semibold leading-tight text-ink hover:underline"
                      >
                        {cliente.nombre}
                      </Link>
                      <Pill tono={TONO[c.estado]}>{ETIQUETA_CITA[c.estado]}</Pill>
                    </div>

                    <p className="mt-1 text-[12.5px] text-muted">
                      {servicio?.nombre ?? 'Servicio'} · {servicio ? fmtDuracion(servicio.minutos) : ''}
                      {servicio ? ` · ${fmtEuros(servicio.precio)}` : ''}{' '}
                      <span className="text-faint">· {ETIQUETA_ORIGEN[c.origen]}</span>
                    </p>

                    {abierta && (
                      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
                        {c.estado === 'pendiente' && (
                          <Accion
                            onClick={() => {
                              cambiarEstadoCita(c.id, 'confirmada');
                              toast('Cita confirmada', 'ok');
                            }}
                          >
                            Confirmar
                          </Accion>
                        )}
                        <Accion
                          onClick={() => {
                            cambiarEstadoCita(c.id, 'no_vino');
                            toast('Marcada como no vino', 'info');
                          }}
                        >
                          No vino
                        </Accion>
                        <Accion
                          onClick={() => {
                            cambiarEstadoCita(c.id, 'cancelada');
                            toast('Cita cancelada', 'info');
                          }}
                        >
                          Cancelar
                        </Accion>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NuevaCita
        open={nueva}
        onClose={() => setNueva(false)}
        dia={dia}
        servicios={servicios}
        clientes={db.clientes.filter((c) => c.barberiaId === barberia.id)}
        onCrear={(clienteId, servicioId, hora) => {
          const [h, m] = hora.split(':').map(Number);
          const inicio = new Date(dia);
          inicio.setHours(h, m, 0, 0);
          crearCita({ clienteId, servicioId, inicio: inicio.toISOString(), origen: 'manual' });
          setNueva(false);
          toast('Cita creada', 'ok');
        }}
      />
    </Shell>
  );
}

function Accion({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}

function NuevaCita({
  open,
  onClose,
  dia,
  servicios,
  clientes,
  onCrear,
}: {
  open: boolean;
  onClose: () => void;
  dia: Date;
  servicios: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
  onCrear: (clienteId: string, servicioId: string, hora: string) => void;
}) {
  const [clienteId, setClienteId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [hora, setHora] = useState('10:00');

  const valido = !!clienteId && !!servicioId && /^\d{2}:\d{2}$/.test(hora);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      titulo="Nueva cita"
      descripcion={`Para el ${dia.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`}
      pie={
        <Btn
          className="w-full"
          disabled={!valido}
          onClick={() => onCrear(clienteId, servicioId, hora)}
        >
          Crear cita
        </Btn>
      }
    >
      <div className="space-y-4">
        <Field label="Cliente" requerido>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className={inputClases}
          >
            <option value="">Elige un cliente…</option>
            {clientes
              .slice()
              .sort((a, b) => a.nombre.localeCompare(b.nombre))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Servicio" requerido>
          <select
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            className={inputClases}
          >
            <option value="">Elige un servicio…</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Hora" requerido>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            step={300}
            className={inputClases}
          />
        </Field>
      </div>
    </Sheet>
  );
}
