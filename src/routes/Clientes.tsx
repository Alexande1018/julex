import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Nfc, Plus, Search } from 'lucide-react';
import { useDb } from '../lib/store';
import { vocabulario } from '../lib/vocabulario';
import { barberiaActiva, clientesActivos, cortesDe, llaveroDeCliente, ultimaVisita } from '../lib/derive';
import { buscarTexto, diasDesde, ultimaVisitaTexto } from '../lib/format';
import { Shell } from '../components/Shell';
import { Avatar, EmptyState, Eyebrow, btnClases, cn, inputClases, toast } from '../components/ui';

type Filtro = 'todos' | 'activos' | 'inactivos';

export default function Clientes() {
  const db = useDb();
  const barberia = barberiaActiva(db);
  const v = vocabulario(barberia.tipo);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const activos = useMemo(
    () => new Set(clientesActivos(db, barberia.id, 30).map((c) => c.id)),
    [db, barberia.id],
  );

  const lista = db.clientes
    .filter((c) => c.barberiaId === barberia.id)
    .filter((c) => buscarTexto(`${c.nombre} ${c.codigo} ${c.telefono}`, q))
    .filter((c) => {
      if (filtro === 'todos') return true;
      const esActivo = activos.has(c.id);
      return filtro === 'activos' ? esActivo : !esActivo;
    })
    .sort((a, b) => {
      const ua = ultimaVisita(db, a.id);
      const ub = ultimaVisita(db, b.id);
      if (!ua && !ub) return a.nombre.localeCompare(b.nombre);
      if (!ua) return 1;
      if (!ub) return -1;
      return new Date(ub).getTime() - new Date(ua).getTime();
    });

  return (
    <Shell barberia={barberia} activo="/barbero/clientes">
      <div className="pt-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Directorio privado</Eyebrow>
            <h1 className="mt-1.5 font-serif text-[27px] leading-none tracking-tight text-ink">
              Clientes
            </h1>
          </div>
          <span className="num font-serif text-[27px] leading-none text-ink">
            {db.clientes.filter((c) => c.barberiaId === barberia.id).length}
          </span>
        </div>

        <div className="relative mt-5">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className={cn(inputClases, 'pl-9')}
            autoComplete="off"
          />
        </div>

        <div className="mt-3 flex gap-1.5">
          {(
            [
              ['todos', 'Todos'],
              ['activos', 'Activos'],
              ['inactivos', 'Sin venir +30 d'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={cn(
                'rounded-[2px] border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors',
                filtro === valor
                  ? 'border-ink bg-ink text-ivory'
                  : 'border-line text-muted hover:border-ink/25 hover:text-ink',
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            titulo="Ningún cliente con ese filtro"
            texto="Prueba con otra búsqueda o da de alta a alguien nuevo."
            accion={
              <Link to="/barbero/alta" className={btnClases('ghost', 'sm')}>
                <Plus size={13} /> Nuevo cliente
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-4">
          {lista.map((c) => {
            const ultima = ultimaVisita(db, c.id);
            const inactivo = !!ultima && diasDesde(ultima) > 30;
            const llavero = llaveroDeCliente(db, c.id);
            return (
              <li key={c.id} className="border-b border-line-soft last:border-0">
                <Link
                  to={`/barbero/clientes/${c.id}`}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-paper/60"
                >
                  <Avatar nombre={c.nombre} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{c.nombre}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
                      <span>{ultimaVisitaTexto(ultima)}</span>
                      <span className="text-faint">·</span>
                      <span className="num">{cortesDe(db, c.id)} {v.serviciosMin}</span>
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {llavero && (
                      <Nfc size={11} className="text-[var(--brand)]" aria-label="Llavero activo" />
                    )}
                    <span
                      className={cn(
                        'num text-[10.5px] font-semibold',
                        inactivo ? 'text-clay' : 'text-faint',
                      )}
                    >
                      {inactivo ? `${diasDesde(ultima!)} d` : c.codigo}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link to="/barbero/alta" className={btnClases('outline', 'md', 'mt-4 w-full border-dashed')}>
        <Plus size={14} /> Nuevo cliente
      </Link>
    </Shell>
  );
}
