import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ListOrdered, Settings, Users, BarChart3 } from 'lucide-react';
import type { Barberia } from '../lib/types';
import { cn, Wordmark } from './ui';
import { Logotipo } from './Logotipo';
import { Salir } from './Salir';

const NAV = [
  { to: '/barbero/cola', label: 'Cola', Icon: ListOrdered },
  { to: '/barbero/agenda', label: 'Agenda', Icon: Calendar },
  { to: '/barbero/clientes', label: 'Clientes', Icon: Users },
  { to: '/barbero/panel', label: 'Panel', Icon: BarChart3 },
  { to: '/barbero/ajustes', label: 'Ajustes', Icon: Settings },
];

export function Shell({
  barberia,
  activo,
  children,
}: {
  barberia: Barberia;
  activo: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="grain min-h-dvh bg-ivory" style={{ ['--brand' as string]: barberia.color }}>
      <header
        className={cn(
          'sticky top-0 z-40 border-b bg-ivory/90 backdrop-blur transition-colors duration-200',
          scrolled ? 'border-line' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 lg:max-w-4xl">
          <Wordmark />
          <div className="flex items-center gap-2.5">
            <Logotipo nombre={barberia.nombre} logo={barberia.logo} tamano={18} />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {barberia.nombre}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-sage/40 bg-sage/10 px-1.5 py-[3px]">
              <span className="live-dot inline-block size-[5px] rounded-full bg-sage" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-olive">
                En vivo
              </span>
            </span>
          </div>
        </div>

        {/* Navegación de escritorio */}
        <nav className="mx-auto hidden w-full max-w-4xl items-center gap-6 border-t border-line-soft px-4 lg:flex">
          {NAV.map(({ to, label, Icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={cn(
                'relative flex items-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
                activo === to ? 'text-ink' : 'text-muted hover:text-ink-soft',
              )}
            >
              <Icon size={13} strokeWidth={2.2} />
              {label}
              {activo === to && (
                <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--brand)]" />
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center">
            <Salir a="/" />
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-1 lg:max-w-4xl lg:pb-14">
        {children}
      </main>

      {/* Navegación inferior: se usa con el pulgar, mientras se trabaja */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-6 pb-[env(safe-area-inset-bottom)]">
          {NAV.map(({ to, label, Icon }) => {
            const on = activo === to;
            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 pb-2 pt-2.5 transition-colors',
                  on ? 'text-ink' : 'text-muted',
                )}
              >
                {on && (
                  <span className="absolute left-1/2 top-[5px] size-[3px] -translate-x-1/2 rounded-full bg-[var(--brand)]" />
                )}
                <Icon size={19} strokeWidth={on ? 2.3 : 1.8} />
                <span
                  className={cn(
                    'text-[9.5px] font-bold uppercase tracking-[0.09em]',
                    on ? 'text-ink' : 'text-faint',
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
          <Salir a="/" variante="celda" />
        </div>
      </nav>
    </div>
  );
}
