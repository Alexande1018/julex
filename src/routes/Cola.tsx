import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Plus } from 'lucide-react';
import { useDb } from '../lib/store';
import {
  aplicarRecompensa,
  atender,
  marcarNoVino,
  pasarASillon,
  type ResultadoAtendido,
} from '../lib/actions';
import {
  barberiaActiva,
  clienteDe,
  colaDelDia,
  fidelidadDe,
  servicioDe,
} from '../lib/derive';
import { fmtFecha, fmtHora, fmtDuracion, haceCuanto } from '../lib/format';
import { Shell } from '../components/Shell';
import { Foto } from '../components/Foto';
import { Cronometro } from '../components/Timer';
import {
  Btn,
  Confirmar,
  Eyebrow,
  Pill,
  Rule,
  Sheet,
  btnClases,
  toast,
} from '../components/ui';

export default function Cola() {
  const db = useDb();
  const navegar = useNavigate();
  const barberia = barberiaActiva(db);
  const cola = colaDelDia(db, barberia.id);

  const [noVino, setNoVino] = useState<string | null>(null);
  const [premio, setPremio] = useState<{ clienteId: string; nombre: string; resultado: ResultadoAtendido } | null>(
    null,
  );

  const sillón = cola.sillon;
  const clienteSillon = sillón ? clienteDe(db, sillón.clienteId) : undefined;
  const servicioSillon = sillón ? servicioDe(db, sillón.servicioId) : undefined;

  const terminar = async () => {
    if (!sillón || !clienteSillon) return;
    const r = await atender(sillón.id, sillón.servicioId);
    if (!r) return;
    if (r.recompensaGanada) {
      setPremio({ clienteId: clienteSillon.id, nombre: clienteSillon.nombre, resultado: r });
    } else {
      toast(`${clienteSillon.nombre}: ${r.cortesTotales} cortes registrados`, 'ok');
    }
  };

  return (
    <Shell barberia={barberia} activo="/barbero/cola">
      <div className="pt-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow>
              {new Date()
                .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Eyebrow>
            <h1 className="display mt-2 text-[32px] leading-none text-ink">La cola</h1>
            <p className="mt-2 hidden text-[12px] text-muted lg:block">
              {cola.esperando.length === 0
                ? 'Nadie esperando ahora mismo'
                : cola.esperando.length === 1
                  ? '1 persona esperando'
                  : `${cola.esperando.length} personas esperando`}
            </p>
          </div>
          <div className="text-right lg:hidden">
            <span className="num font-serif text-[27px] leading-none text-ink">{cola.esperando.length}</span>
            <p className="eyebrow mt-1.5">esperando</p>
          </div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-x-10">
        <div>
      {/* EN SILLÓN */}
      {sillón && clienteSillon ? (
        <section className="mt-4 overflow-hidden rounded-[4px] bg-ink text-ivory">
          <div className="flex items-center justify-between border-b border-ivory/12 px-4 py-2.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ivory/55">
              En sillón
            </span>
            <span className="num text-[11.5px] text-ivory/60">
              desde las {fmtHora(sillón.inicioEn ?? sillón.llegadaEn)}
            </span>
          </div>

          <div className="px-4 pb-4 pt-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link
                  to={`/barbero/clientes/${clienteSillon.id}`}
                  className="block truncate font-serif text-[23px] leading-tight text-ivory decoration-ivory/30 underline-offset-4 hover:underline"
                >
                  {clienteSillon.nombre}
                </Link>
                <p className="mt-1 text-[11.5px] text-ivory/55">
                  {servicioSillon?.nombre ?? 'Sin servicio'} · {servicioSillon ? fmtDuracion(servicioSillon.minutos) : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Cronometro desde={sillón.inicioEn ?? sillón.llegadaEn} className="text-[25px] leading-none text-ivory" />
                <p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ivory/40">
                  En curso
                </p>
              </div>
            </div>

            {clienteSillon.comoCorta && (
              <p className="mt-3.5 line-clamp-3 border-l-2 border-ivory/25 pl-3 font-serif text-[13.5px] italic leading-relaxed text-ivory/85">
                {clienteSillon.comoCorta}
              </p>
            )}

            <Btn
              t="lg"
              className="mt-4 w-full bg-ivory text-ink hover:bg-white"
              onClick={() => void terminar()}
            >
              Terminar
            </Btn>
          </div>
        </section>
      ) : cola.esperando.length > 0 ? (
        <div className="mt-4 rounded-[4px] border border-dashed border-line px-4 py-6 text-center">
          <p className="font-serif text-[16px] text-ink">El sillón está libre</p>
          <p className="mx-auto mt-1.5 max-w-[36ch] text-[12px] leading-relaxed text-muted">
            Pasa al siguiente cuando estés listo.
          </p>
        </div>
      ) : null}

        </div>

        <div>
      {/* EN ESPERA */}
      <section className="mt-7 lg:mt-4">
        {cola.esperando.length > 0 && (
          <div className="flex items-baseline justify-between">
            <Eyebrow>En espera</Eyebrow>
            <span className="num text-[11px] text-faint lg:hidden">
              {cola.esperando.length === 1 ? '1 persona' : `${cola.esperando.length} personas`}
            </span>
          </div>
        )}

        {cola.esperando.length === 0 ? (
          <div className="mt-2 overflow-hidden rounded-[4px] border border-line bg-paper">
            <div className="aspect-[16/5] overflow-hidden bg-paper-2">
              <Foto src="/img/tienda.webp" alt="" posicion="center 42%" className="opacity-95" />
            </div>
            <div className="px-4 pb-3.5 pt-3">
              <p className="font-serif text-[16px] leading-tight text-ink">No hay nadie esperando</p>
              <p className="mt-1 max-w-[38ch] text-[11.5px] leading-relaxed text-muted">
                Cuando llegue un cliente, acércalo al llavero o dalo de alta en menos de un minuto.
              </p>
              <button
                onClick={() => navegar('/barbero/alta')}
                className="mt-2.5 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                <Plus size={12} /> Nuevo cliente
              </button>
            </div>
          </div>
        ) : (
          <ul className="mt-1">
            {cola.esperando.map((q, i) => {
              const c = clienteDe(db, q.clienteId);
              const s = servicioDe(db, q.servicioId);
              if (!c) return null;
              const primero = i === 0;
              return (
                <li key={q.id} className="border-b border-line-soft last:border-0">
                  <div className="flex items-center gap-3 py-3">
                    <span className="num w-6 shrink-0 font-serif text-[16px] leading-none text-faint">
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <Link to={`/barbero/clientes/${c.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold leading-tight text-ink">
                        {c.nombre}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
                        <Clock size={10.5} />
                        {haceCuanto(q.llegadaEn)}
                        {s && <span className="text-faint">· {s.nombre}</span>}
                        {q.origen === 'llavero' && (
                          <span className="ml-0.5 rounded-[2px] border border-line px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.08em] text-faint">
                            llavero
                          </span>
                        )}
                      </span>
                    </Link>

                    {primero && !sillón ? (
                      <button
                        className={btnClases(
                          'primary',
                          'sm',
                          'shrink-0 px-3 text-[10px] uppercase tracking-[0.12em]',
                        )}
                        onClick={() => pasarASillon(q.id)}
                      >
                        Siguiente
                      </button>
                    ) : !primero ? (
                      <button
                        onClick={() => setNoVino(q.id)}
                        className="shrink-0 text-[10.5px] font-medium text-faint underline decoration-line underline-offset-4 transition-colors hover:text-clay"
                      >
                        No vino
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {cola.esperando.length > 0 && (
          <Btn
            v="outline"
            className="mt-3 w-full border-dashed"
            onClick={() => navegar('/barbero/alta')}
          >
            <Plus size={14} /> Nuevo cliente
          </Btn>
        )}

        {sillón && cola.esperando.length > 0 && (
          <p className="mt-2 text-center text-[10.5px] text-faint">
            Termina el corte actual para pasar al siguiente.
          </p>
        )}
      </section>

      {/* TERMINADOS Y AUSENCIAS */}
      {(cola.terminados.length > 0 || cola.noVino.length > 0) && (
        <section className="mt-8">
          <Rule />
          <div className="flex items-baseline justify-between pt-3">
            <Eyebrow>Cerrados hoy</Eyebrow>
            <span className="num text-[11px] text-faint">
              {cola.terminados.length + cola.noVino.length}
            </span>
          </div>

          <ul className="mt-1">
            {cola.terminados.map((q) => {
              const c = clienteDe(db, q.clienteId);
              const s = servicioDe(db, q.servicioId);
              if (!c) return null;
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link
                      to={`/barbero/clientes/${c.id}`}
                      className="truncate text-[12.5px] text-ink-soft hover:text-ink hover:underline"
                    >
                      {c.nombre}
                    </Link>
                    {s && <span className="shrink-0 text-[11px] text-faint">{s.nombre}</span>}
                  </span>
                  <span className="num shrink-0 text-[11px] text-faint">
                    {q.finEn ? fmtHora(q.finEn) : '—'}
                  </span>
                </li>
              );
            })}
            {cola.noVino.map((q) => {
              const c = clienteDe(db, q.clienteId);
              if (!c) return null;
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
                  <span className="truncate text-[12.5px] text-muted">{c.nombre}</span>
                  <Pill tono="danger">No vino</Pill>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Confirmar
        open={!!noVino}
        titulo="¿Marcar que no vino?"
        texto="Saldrá de la cola de hoy. Su ficha y su historial no cambian."
        etiquetaConfirmar="Sí, no vino"
        peligro
        onClose={() => setNoVino(null)}
        onConfirm={() => {
          if (!noVino) return;
          const q = db.cola.find((x) => x.id === noVino);
          const c = q ? clienteDe(db, q.clienteId) : undefined;
          marcarNoVino(noVino);
          toast(c ? `${c.nombre} marcado como ausente` : 'Marcado como ausente', 'info');
        }}
      />

      <Sheet
        open={!!premio}
        onClose={() => setPremio(null)}
        titulo="Corte gratis conseguido"
        descripcion={
          premio
            ? `${premio.nombre} ha llegado a ${premio.resultado.cortesTotales} cortes. Es el momento de decírselo.`
            : ''
        }
        pie={
          premio ? (
            <div className="flex gap-2">
              <Btn
                v="outline"
                className="flex-1"
                onClick={() => {
                  toast('Recompensa guardada para la próxima visita', 'info');
                  setPremio(null);
                }}
              >
                No aplicar todavía
              </Btn>
              <Btn
                className="flex-1"
                onClick={() => {
                  aplicarRecompensa(premio.clienteId);
                  toast('Recompensa aplicada en el corte de hoy', 'ok');
                  setPremio(null);
                }}
              >
                Aplicar recompensa
              </Btn>
            </div>
          ) : undefined
        }
      >
        {premio && (
          <div className="space-y-4">
            <p className="border-l-2 border-[var(--brand)] pl-3.5 font-serif text-[16px] italic leading-relaxed text-ink">
              «Este cliente ha conseguido su próximo corte gratis.»
            </p>
            <div className="rounded-[4px] border border-line bg-paper px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Servicio registrado</span>
                <span className="num text-[12.5px] text-ink">{premio.resultado.servicio}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="eyebrow">Cortes totales</span>
                <span className="num text-[12.5px] text-ink">{premio.resultado.cortesTotales}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="eyebrow">Meta de la casa</span>
                <span className="num text-[12.5px] text-ink">
                  {barberia.fidelidadMeta} + 1
                </span>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {/* Atajo para la demo: la ficha del que está en el sillón */}
      {clienteSillon && (
        <button
          onClick={() => navegar(`/barbero/clientes/${clienteSillon.id}`)}
          className="mx-auto mt-6 flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-ink-soft"
        >
          Ver ficha completa <ArrowRight size={11} />
        </button>
      )}
        </div>
      </div>
    </Shell>
  );
}
