import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageCircle, TrendingUp } from 'lucide-react';
import { useDb } from '../lib/store';
import { registrarMensaje } from '../lib/actions';
import {
  actividadSemanal,
  barberiaActiva,
  clientesActivos,
  clientesInactivos,
  ingresosDelMes,
  llaverosActivos,
  resumenLlaveros,
} from '../lib/derive';
import { fmtEuros, primerNombre, telefonoBonito } from '../lib/format';
import { Shell } from '../components/Shell';
import {
  Btn,
  Eyebrow,
  Pill,
  Rule,
  Sheet,
  Stat,
  cn,
  inputClases,
  toast,
} from '../components/ui';

export default function Panel() {
  const db = useDb();
  const barberia = barberiaActiva(db);
  const [recordar, setRecordar] = useState<string | null>(null);

  const clientes = db.clientes.filter((c) => c.barberiaId === barberia.id);
  const activos = clientesActivos(db, barberia.id, 30);
  const llaveros = resumenLlaveros(db, barberia.id);
  const activosLlavero = llaverosActivos(db, barberia.id);
  const semanas = actividadSemanal(db, barberia.id, 8);
  const inactivos = clientesInactivos(db, barberia.id, 30);
  const ingresos = ingresosDelMes(db, barberia.id);

  const ahora = new Date();
  const citasMes = db.citas.filter((c) => {
    if (c.barberiaId !== barberia.id) return false;
    const d = new Date(c.inicio);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  });
  const porOrigen = (origen: string) => citasMes.filter((c) => c.origen === origen).length;

  const maxSemana = Math.max(1, ...semanas.map((s) => s.visitas));
  const totalSemanas = semanas.reduce((s, w) => s + w.visitas, 0);

  const clienteRecordar = recordar ? clientes.find((c) => c.id === recordar) : undefined;

  return (
    <Shell barberia={barberia} activo="/barbero/panel">
      <div className="pt-5">
        <Eyebrow>Panel</Eyebrow>
        <h1 className="mt-1.5 font-serif text-[27px] leading-none tracking-tight text-ink">
          Tu barbería en números
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Todo sale de las visitas y citas registradas en JULEX. Nada estimado a ojo.
        </p>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        <Stat valor={clientes.length} etiqueta="Clientes" nota={`${activos.length} activos en 30 días`} />
        <Stat
          valor={llaveros.activos}
          etiqueta="Llaveros activos"
          nota={`${llaveros.sinAsignar} sin asignar`}
        />
        <Stat valor={citasMes.length} etiqueta="Citas del mes" nota={`${porOrigen('qr')} por QR`} />
        <Stat
          valor={fmtEuros(ingresos)}
          etiqueta="Ingresos del mes"
          nota="A precio de tarifa"
          grande={false}
        />
      </section>

      <Rule className="my-6" />

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Actividad · 8 semanas</Eyebrow>
          <span className="num text-[11px] text-muted">{totalSemanas} visitas</span>
        </div>

        <div className="mt-4 flex items-end gap-1.5">
          {semanas.map((s, i) => {
            const alto = Math.max(3, Math.round((s.visitas / maxSemana) * 78));
            const ultima = i === semanas.length - 1;
            return (
              <div key={s.etiqueta} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="num text-[9.5px] leading-none text-faint">{s.visitas || ''}</span>
                <div
                  className={cn(
                    'w-full rounded-t-[1px] transition-[height] duration-300',
                    s.visitas === 0 ? 'bg-line' : ultima ? 'bg-[var(--brand)]' : 'bg-ink/35',
                  )}
                  style={{ height: `${alto}px` }}
                  title={`${s.etiqueta}: ${s.visitas} visitas`}
                />
                <span className="num text-[8.5px] leading-none text-faint">{s.etiqueta}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-faint">
          Cada barra es una semana. La última, la que termina hoy.
        </p>
      </section>

      <Rule className="my-6" />

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Sin venir más de 30 días</Eyebrow>
          <span className="num text-[11px] text-faint">{inactivos.length}</span>
        </div>

        {inactivos.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            No hay nadie perdido ahora mismo. Es buena señal.
          </p>
        ) : (
          <ul className="mt-1">
            {inactivos.map(({ cliente, dias }) => {
              const consentimiento = cliente.consentimientos.marketing;
              return (
                <li
                  key={cliente.id}
                  className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0"
                >
                  <span className="num w-9 shrink-0 font-serif text-[14px] text-clay">{dias} d</span>
                  <Link
                    to={`/barbero/clientes/${cliente.id}`}
                    className="min-w-0 flex-1 truncate text-[13px] text-ink hover:underline"
                  >
                    {cliente.nombre}
                  </Link>
                  <button
                    onClick={() => setRecordar(cliente.id)}
                    disabled={!consentimiento}
                    title={consentimiento ? 'Escribir recordatorio' : 'Sin consentimiento para avisos'}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[2px] border border-line px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-soft transition-colors enabled:hover:border-ink/30 enabled:hover:text-ink disabled:opacity-35"
                  >
                    <MessageCircle size={10} /> Recordar
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          Solo aparecen clientes con consentimiento de avisos. Los mensajes de la demo se registran
          como simulados: no se envía nada.
        </p>
      </section>

      <Rule className="my-6" />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
          <Eyebrow>Origen de las citas</Eyebrow>
          <div className="mt-2.5 flex gap-4">
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">{porOrigen('qr')}</p>
              <p className="eyebrow mt-1">QR</p>
            </div>
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">{porOrigen('llavero')}</p>
              <p className="eyebrow mt-1">Llavero</p>
            </div>
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">
                {porOrigen('manual') + porOrigen('web')}
              </p>
              <p className="eyebrow mt-1">Otros</p>
            </div>
          </div>
        </div>

        <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
          <Eyebrow>Llaveros</Eyebrow>
          <div className="mt-2.5 flex items-center justify-between">
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">{llaveros.activos}</p>
              <p className="eyebrow mt-1">activos de {llaveros.total}</p>
            </div>
            <Link
              to="/barbero/clientes"
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted hover:text-ink"
            >
              Asignar <ArrowUpRight size={11} />
            </Link>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${(llaveros.activos / Math.max(1, llaveros.total)) * 100}%` }}
            />
          </div>
        </div>
      </section>

      <p className="mt-4 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
        <TrendingUp size={12} className="mt-0.5 shrink-0" />
        Los ingresos se calculan con las visitas registradas a precio de tarifa. La caja real —efectivo,
        tarjeta, bonos— llega en la siguiente entrega.
      </p>

      <Sheet
        open={!!recordar}
        onClose={() => setRecordar(null)}
        titulo="Recordatorio de visita"
        descripcion={
          clienteRecordar
            ? `${clienteRecordar.nombre} · ${telefonoBonito(clienteRecordar.telefono)}`
            : ''
        }
        pie={
          <div className="flex gap-2">
            <Btn
              v="outline"
              className="flex-1"
              onClick={() => setRecordar(null)}
            >
              Cancelar
            </Btn>
            <Btn
              className="flex-1"
              onClick={() => {
                if (!clienteRecordar) return;
                registrarMensaje({
                  clienteId: clienteRecordar.id,
                  tipo: 'reactivacion',
                  canal: 'whatsapp',
                  texto: `Hola ${primerNombre(clienteRecordar.nombre)}, hace unas semanas que no te veo. ¿Te guardo hueco esta semana? — ${barberia.nombre}`,
                });
                setRecordar(null);
                toast('Recordatorio registrado como simulado', 'info');
              }}
            >
              Registrar envío
            </Btn>
          </div>
        }
      >
        {clienteRecordar && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Pill tono="ok">Con consentimiento</Pill>
              <span className="text-[11px] text-muted">Avisos aceptados</span>
            </div>
            <p className="rounded-[3px] border border-line bg-paper px-3.5 py-3 font-serif text-[14px] italic leading-relaxed text-ink">
              Hola {primerNombre(clienteRecordar.nombre)}, hace unas semanas que no te veo. ¿Te guardo
              hueco esta semana? — {barberia.nombre}
            </p>
            <p className="text-[11px] leading-relaxed text-faint">
              En demo solo se registra el mensaje en el historial. En producción saldrá por WhatsApp
              Business o SMS, con baja incluida.
            </p>
          </div>
        )}
      </Sheet>
    </Shell>
  );
}
