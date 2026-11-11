import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Eyebrow, Rule, Wordmark } from './ui';

/**
 * Marco común de las páginas legales.
 *
 * Todas cuelgan de aquí para que se lean igual y para que el pie lleve
 * siempre el contacto del titular y el enlace al resto de documentos.
 */
export function MarcoLegal({
  ceja,
  titulo,
  intro,
  volver = '/legal',
  volverTexto = 'Todos los textos legales',
  children,
}: {
  ceja: string;
  titulo: string;
  intro?: ReactNode;
  volver?: string;
  volverTexto?: string;
  children: ReactNode;
}) {
  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6">
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          <Link
            to={volver}
            className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> {volverTexto}
          </Link>
        </div>

        <header className="mt-9">
          <Eyebrow>{ceja}</Eyebrow>
          <h1 className="mt-2 font-serif text-[30px] leading-[1.1] text-ink">{titulo}</h1>
          {intro && <div className="mt-3 text-[13px] leading-relaxed text-ink-soft">{intro}</div>}
        </header>

        <Rule className="my-8" />

        <div className="space-y-8">{children}</div>

        <Rule className="my-8" />

        <footer className="pb-4 text-[10.5px] leading-relaxed text-faint">
          <p>
            JULEX · Alexander Acero · NIF 18508170R · Alicante, España ·{' '}
            <a href="mailto:gestionjulex@gmail.com" className="underline decoration-line underline-offset-2">
              gestionjulex@gmail.com
            </a>
          </p>
          <p className="mt-2">
            Estos textos son la base del servicio y no constituyen un dictamen jurídico. Se revisan
            cuando cambian el producto, los proveedores o la normativa.
          </p>
        </footer>
      </div>
    </div>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] leading-snug text-ink">{titulo}</h2>
      <div className="mt-2 space-y-2.5 text-[13px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-4">
      {items.map((x, i) => (
        <li key={i} className="list-disc marker:text-line">
          {x}
        </li>
      ))}
    </ul>
  );
}

export function Tabla({ filas, cabecera }: { filas: ReactNode[][]; cabecera: string[] }) {
  return (
    <div className="overflow-x-auto rounded-[3px] border border-line">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-paper text-left">
            {cabecera.map((c) => (
              <th key={c} className="border-b border-line px-3 py-2 font-semibold text-ink">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className={i % 2 ? 'bg-paper/40' : ''}>
              {f.map((c, j) => (
                <td key={j} className="border-b border-line-soft px-3 py-2 align-top text-ink-soft">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
