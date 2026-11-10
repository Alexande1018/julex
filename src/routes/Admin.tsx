import { Link } from 'react-router-dom';
import { Copy, Nfc, Plus } from 'lucide-react';
import { useDb } from '../lib/store';
import { haySupabase } from '../lib/supabase';
import { crearLote } from '../lib/actions';
import { cuotaMensual, resumenLlaveros } from '../lib/derive';
import { fmtEuros, fmtFechaCorta } from '../lib/format';
import {
  Btn,
  Eyebrow,
  Pill,
  Rule,
  Stat,
  btnClases,
  cn,
  toast,
} from '../components/ui';

export default function Admin() {
  const db = useDb();

  const cuotas = db.barberias.map((b) => ({ b, ...cuotaMensual(db, b.id) }));
  const facturacion = cuotas.reduce((s, c) => s + c.cuota, 0);
  const llaverosTotales = db.llaveros.length;
  const activos = db.llaveros.filter((l) => l.estado === 'activo').length;
  const sinAsignar = db.llaveros.filter((l) => l.estado === 'sin_asignar');
  const retirados = db.llaveros.filter((l) => l.estado === 'retirado');

  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/nfc/${token}`);
      toast('URL del chip copiada', 'ok');
    } catch {
      toast('No se pudo copiar', 'aviso');
    }
  };

  return (
    <div className="grain min-h-dvh bg-ivory">
      {/* Cabecera oscura: es la trastienda, no la barbería */}
      <header className="bg-ink px-5 pb-6 pt-5 text-ivory">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-ivory/80">
              Julex
            </span>
            {!haySupabase && <Pill tono="warn">Demo</Pill>}
          </div>
          <h1 className="mt-6 font-serif text-[26px] leading-tight text-ivory">
            Consola del creador
          </h1>
          <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-ivory/55">
            Locales, inventario de llaveros y lo que se factura. Sin datos privados de los clientes.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat valor={db.barberias.length} etiqueta="Locales" />
          <Stat valor={activos} etiqueta="Llaveros activos" nota={`de ${llaverosTotales}`} />
          <Stat valor={sinAsignar.length} etiqueta="Sin asignar" />
          <Stat valor={fmtEuros(facturacion)} etiqueta="Cuota mensual" nota="Suma de mínimos" />
        </section>

        <Rule className="my-7" />

        {/* BARBERÍAS */}
        <section>
          <Eyebrow>Locales</Eyebrow>
          <div className="mt-2">
            {cuotas.map(({ b, activos: n, cuota, minimo }) => {
              const resumen = resumenLlaveros(db, b.id);
              const clientes = db.clientes.filter((c) => c.barberiaId === b.id).length;
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-[16px] leading-tight text-ink">{b.nombre}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      /{b.slug} · {clientes} clientes · {resumen.total} llaveros
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[13px] font-semibold text-ink">{fracciona(cuota)}</p>
                    <p className="text-[10px] text-faint">
                      {minimo ? `mínimo (${n} activos)` : `${n} activos`}
                    </p>
                  </div>
                  <Link
                    to={`/cita/${b.slug}`}
                    className="text-[10.5px] font-semibold text-muted underline decoration-line underline-offset-4 hover:text-ink"
                  >
                    Ver reservas
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        <Rule className="my-7" />

        {/* INVENTARIO */}
        <section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Inventario</Eyebrow>
            <span className="num text-[11px] text-faint">
              {sinAsignar.length} sin asignar · {retirados.length} retirados
            </span>
          </div>

          <p className="mt-2 max-w-[62ch] text-[12px] leading-relaxed text-muted">
            Los chips se graban en blanco antes de salir del taller: cada uno lleva su URL fija. El
            barbero lo vincula al cliente con el primer toque, y ya no se regraba nunca.
          </p>

          <div className="mt-3 overflow-hidden rounded-[4px] border border-line">
            {sinAsignar.slice(0, 8).map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 border-b border-line-soft bg-paper px-3 py-2.5 last:border-0"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-line bg-ivory text-[var(--brand)]">
                  <Nfc size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="num text-[12px] font-semibold text-ink">{l.codigoCorto}</p>
                  <p className="truncate text-[10px] text-faint">
                    /nfc/{l.token.slice(0, 10)}… · lote {l.lote}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => copiar(l.token)}
                    aria-label="Copiar URL"
                    className="rounded-[2px] p-1.5 text-muted hover:bg-paper-2 hover:text-ink"
                  >
                    <Copy size={12} />
                  </button>
                  <a
                    href={`/nfc/${l.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[2px] px-1.5 py-1 text-[10px] font-semibold text-muted hover:text-ink"
                  >
                    Probar
                  </a>
                </div>
              </div>
            ))}
            {sinAsignar.length === 0 && (
              <p className="bg-paper px-3 py-4 text-[12px] text-muted">
                No quedan llaveros sin asignar en ninguna barbería.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Btn
              v="outline"
              t="md"
              onClick={() => {
                const b = db.barberias[0];
                crearLote(15, b.id, `L-${String(db.llaveros.length).padStart(3, '0')}`);
                toast('Lote de 15 llaveros generado', 'ok');
              }}
            >
              <Plus size={13} /> Generar lote de 15
            </Btn>
            <Link to="/" className={btnClases('quiet', 'md')}>
              Volver al inicio
            </Link>
          </div>
        </section>

        <Rule className="my-7" />

        {/* MENSAJES */}
        <section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Mensajes simulados</Eyebrow>
            <span className="num text-[11px] text-faint">{db.mensajes.length}</span>
          </div>

          {db.mensajes.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted">Todavía no se ha registrado ninguno.</p>
          ) : (
            <ul className="mt-2">
              {db.mensajes
                .slice()
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                .slice(0, 6)
                .map((m) => {
                  const c = db.clientes.find((x) => x.id === m.clienteId);
                  return (
                    <li key={m.id} className="border-b border-line-soft py-2.5 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[12.5px] text-ink">{c?.nombre ?? 'Cliente'}</span>
                        <span className="num shrink-0 text-[10.5px] text-faint">
                          {fmtFechaCorta(m.fecha)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10.5px] text-muted">
                        {m.tipo} · {m.canal} · <span className="text-bronze">simulado</span>
                      </p>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <div className={cn('mt-8 rounded-[4px] border border-line bg-paper px-4 py-3.5')}>
          <Eyebrow>Límite de privacidad</Eyebrow>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Esta consola no muestra «cómo corta», notas, historial de visitas, teléfonos completos ni
            ingresos de la barbería. Es logística y facturación: el contenido de las fichas pertenece a
            la barbería y a sus clientes.
          </p>
        </div>
      </div>
    </div>
  );
}

function fracciona(n: number): string {
  return fmtEuros(n);
}
