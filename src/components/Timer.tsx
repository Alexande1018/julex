import { useEffect, useState } from 'react';
import { Scissors } from 'lucide-react';
import { cn } from './ui';
import { cronometro } from '../lib/format';

/** Cronómetro en vivo. Se actualiza cada segundo y no recalcula nada más. */
export function Cronometro({ desde, className }: { desde: string; className?: string }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  return <span className={cn('num tabular-nums', className)}>{cronometro(desde)}</span>;
}

/** Tarjeta de sellos: se ve de un vistazo cuántos cortes llevas. */
export function Sellos({
  meta,
  llenos,
  tono = 'claro',
}: {
  meta: number;
  llenos: number;
  tono?: 'claro' | 'oscuro';
}) {
  const total = Math.min(Math.max(meta, 1), 20);
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${total > 10 ? 10 : total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => {
        const lleno = i < llenos;
        return (
          <span
            key={i}
            className={cn(
              'flex aspect-square items-center justify-center rounded-[2px] border',
              lleno
                ? 'border-transparent bg-[var(--brand)] text-ivory'
                : tono === 'oscuro'
                  ? 'border-ivory/25 text-transparent'
                  : 'border-line bg-transparent text-transparent',
            )}
          >
            {lleno && <Scissors size={11} strokeWidth={2.4} />}
          </span>
        );
      })}
    </div>
  );
}
