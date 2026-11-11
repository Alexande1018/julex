import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Nfc, Plus, Search } from 'lucide-react';
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
  inputClases,
  toast,
} from '../components/ui';

type Filtro = 'todos' | 'activos' | 'libres' | 'retirados';

export default function Admin() {
  const db = useDb();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState(false);

  const cuotas = db.barberias.map((b) => ({ b, ...cuotaMensual(db, b.id) }));
  const facturacion = cuotas.reduce((s, c) => s + c.cuota, 0);
  const activos = db.llaveros.filter((l) => l.estado === 'activo');
  const libres = db.llaveros.filter((l) => l.estado === 'sin_asignar');
  const retirados = db.llaveros.filter((l) => l.estado === 'retirado');

  const nombreCliente = (id: string | null) =>
    id ? db.clientes.find((c) => c.id === id)?.nombre ?? '—' : null;

  const lista = useMemo(() => {
    const base =
      filtro === 'activos'
        ? activos
        : filtro === 'libres'
          ? libres
          : filtro === 'retirados'
            ? retirados
            : db.llaveros;
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((l) => {
      const dueno = nombreCliente(l.clienteId) ?? '';
      return `${l.codigoCorto} ${l.lote} ${dueno}`.toLowerCase().includes(t);
    });
  }, [db.llaveros, db.clientes, filtro, q]);

  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/nfc/${token}`);
      toast('URL del chip copiada', 'ok');
    } catch {
      toast('No se pudo copiar', 'aviso');
    }
  };

  const generar = async () => {
    const b = db.barberias[0];
    if (!b || creando) return;
    setCreando(true);
    const lote = `L-${String(db.llaveros.length + 1).padStart(3, '0')}`;
    try {
      const nuevos = await crearLote(15, b.id, lote);
      if (nuevos.length === 15) toast(`Lote ${lote}: 15 llaveros creados`, 'ok');
      else if (nuevos.length > 0) toast(`Lote ${lote}: ${nuevos.length} llaveros`, 'ok');
      else toast('No se pudo crear el lote', 'aviso');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="grain min-h-dvh bg-ivory">
      <header className="bg-ink px-5 pb-6 pt-5 text-ivory">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-ivory/80">
              Julex
            </span>
            {!haySupabase && <Pill tono="warn">Demo</Pill>}
          </div>
          <h1 className="mt-6 font-serif text-[26px] leading-tight text-ivory">
            Panel del administrador
          </h1>
          <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-ivory/55">
            Locales, inventario de llaveros y facturación. Aquí se ve cada llavero y de quién es.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat valor={db.barberias.length} etiqueta="Locales" />
          <Stat valor={activos.length} etiqueta="Llaveros activos" nota={`de ${db.llaveros.length}`} />
          <Stat valor={libres.length} etiqueta="Sin asignar" />
          <Stat valor={fmtEuros(facturacion)} etiqueta="Cuota mensual" nota="Suma de mínimos" />
        </section>

        <Rule className="my-7" />

        {/* LOCALES */}
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
                    <p className="num text-[13px] font-semibold text-ink">{fmtEuros(cuota)}</p>
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
            <Eyebrow>Llaveros</Eyebrow>
            <span className="num text-[11px] text-faint">
              {activos.length} activos · {libres.length} libres · {retirados.length} retirados
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(
              [
                ['todos', 'Todos', db.llaveros.length],
                ['activos', 'Con dueño', activos.length],
                ['libres', 'Sin asignar', libres.length],
                ['retirados', 'Retirados', retirados.length],
              ] as [Filtro, string, number][]
            ).map(([id, etiqueta, n]) => (
              <button
                key={id}
                onClick={() => setFiltro(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors',
                  filtro === id
                    ? 'border-ink bg-ink text-ivory'
                    : 'border-line text-muted hover:border-ink/30 hover:text-ink',
                )}
              >
                {etiqueta}
                <span className={cn('num', filtro === id ? 'text-ivory/60' : 'text-faint')}>{n}</span>
              </button>
            ))}
          </div>

          <div className="relative mt-2.5">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código, lote o cliente"
              className={cn(inputClases, 'pl-9')}
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-[4px] border border-line">
            {lista.slice(0, 80).map((l) => {
              const dueno = nombreCliente(l.clienteId);
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-3 border-b border-line-soft bg-paper px-3 py-2.5 last:border-0"
                >
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-line bg-ivory text-[var(--brand)]">
                    <Nfc size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="num text-[12px] font-semibold text-ink">{l.codigoCorto}</p>
                      <Pill
                        tono={l.estado === 'activo' ? 'ok' : l.estado === 'retirado' ? 'danger' : 'neutral'}
                      >
                        {l.estado === 'activo' ? 'activo' : l.estado === 'retirado' ? 'retirado' : 'libre'}
                      </Pill>
                    </div>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted">
                      {dueno ? (
                        <>
                          <span className="font-semibold text-ink-soft">{dueno}</span>
                          <span className="text-faint"> · lote {l.lote}</span>
                        </>
                      ) : (
                        <span className="text-faint">sin asignar · lote {l.lote}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => copiar(l.token)}
                      aria-label={`Copiar URL de ${l.codigoCorto}`}
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
                      Abrir
                    </a>
                  </div>
                </div>
              );
            })}
            {lista.length === 0 && (
              <p className="bg-paper px-3 py-4 text-[12px] text-muted">
                Nada con ese filtro.
              </p>
            )}
          </div>
          {lista.length > 80 && (
            <p className="mt-1.5 text-[10.5px] text-faint">
              Mostrando 80 de {lista.length}. Afina con el buscador.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Btn v="outline" t="md" onClick={() => void generar()} disabled={creando}>
              <Plus size={13} /> {creando ? 'Generando…' : 'Generar lote de 15'}
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
            <Eyebrow>Mensajes</Eyebrow>
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
                        {m.tipo} · {m.canal}
                      </p>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <div className="mt-8 rounded-[4px] border border-line bg-paper px-4 py-3.5">
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
