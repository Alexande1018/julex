import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

/** Une clases resolviendo conflictos de Tailwind (bg-ink + bg-ivory → gana la última). */
export function cn(...p: Array<string | false | null | undefined>): string {
  return twMerge(p.filter(Boolean).join(' '));
}

/* ------------------------------------------------------------------ */
/* Botones                                                             */
/* ------------------------------------------------------------------ */

type Variante = 'primary' | 'brand' | 'outline' | 'quiet' | 'ghost' | 'danger';
type Tamano = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-[3px] font-semibold transition-[background-color,color,border-color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-35';

const VARIANTES: Record<Variante, string> = {
  primary: 'bg-ink text-ivory hover:bg-[#111210]',
  brand: 'bg-[var(--brand)] text-ivory hover:opacity-90',
  outline: 'border border-line text-ink hover:border-ink/35 hover:bg-paper',
  quiet: 'text-ink-soft hover:bg-paper-2 hover:text-ink',
  ghost: 'bg-paper-2 text-ink hover:bg-line-soft',
  danger: 'border border-clay/35 text-clay hover:bg-clay/5',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-2.5 text-[12px]',
  md: 'h-10 px-3.5 text-[13px]',
  lg: 'h-[52px] px-5 text-[11.5px] uppercase tracking-[0.15em]',
};

export function btnClases(v: Variante = 'primary', t: Tamano = 'md', extra = ''): string {
  return cn(BASE, VARIANTES[v], TAMANOS[t], extra);
}

export function Btn({
  v = 'primary',
  t = 'md',
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: Variante; t?: Tamano }) {
  return (
    <button className={btnClases(v, t, className)} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Marca                                                              */
/* ------------------------------------------------------------------ */

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span className="text-[12.5px] font-extrabold uppercase leading-none tracking-[0.3em] text-ink">
        Julex
      </span>
      <span className="mb-0.5 inline-block size-[5px] rounded-full bg-[var(--brand)]" />
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('eyebrow', className)}>{children}</span>;
}

export function Rule({ className }: { className?: string }) {
  return <hr className={cn('hairline my-0', className)} />;
}

/* ------------------------------------------------------------------ */
/* Formularios                                                        */
/* ------------------------------------------------------------------ */

export const inputClases =
  'w-full rounded-[3px] border border-line bg-paper px-3 py-2.5 text-[14px] leading-snug text-ink transition-colors placeholder:text-faint focus:border-ink/45 focus:outline-none';

export function Field({
  label,
  hint,
  requerido,
  children,
}: {
  label: string;
  hint?: string;
  requerido?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">
          {label}
          {requerido && <span className="ml-1 text-clay">*</span>}
        </span>
        {hint && <span className="text-[11px] font-medium text-faint">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export function Check({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 py-2.5 text-[13px] leading-relaxed text-ink-soft',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[15px] shrink-0 accent-[var(--brand)]"
      />
      <span>{children}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas de lectura                                                   */
/* ------------------------------------------------------------------ */

type Tono = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';

const TONOS: Record<Tono, string> = {
  neutral: 'border-line bg-paper-2 text-ink-soft',
  ok: 'border-sage/40 bg-sage/10 text-olive',
  warn: 'border-bronze/30 bg-bronze/10 text-bronze',
  danger: 'border-clay/30 bg-clay/10 text-clay',
  brand: 'border-transparent bg-[var(--brand)] text-ivory',
};

export function Pill({ tono = 'neutral', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.09em]',
        TONOS[tono],
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  valor,
  etiqueta,
  nota,
  grande,
}: {
  valor: ReactNode;
  etiqueta: string;
  nota?: string;
  grande?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          'num font-serif leading-none tracking-[-0.02em] text-ink',
          grande ? 'text-[38px]' : 'text-[25px]',
        )}
      >
        {valor}
      </div>
      <div className="eyebrow mt-2">{etiqueta}</div>
      {nota && <div className="mt-1 text-[11px] leading-snug text-faint">{nota}</div>}
    </div>
  );
}

export function Avatar({ nombre, size = 36 }: { nombre: string; size?: number }) {
  const ini = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] bg-paper-2 font-semibold tracking-wide text-[var(--brand)]"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

export function EmptyState({
  titulo,
  texto,
  accion,
}: {
  titulo: string;
  texto: string;
  accion?: ReactNode;
}) {
  return (
    <div className="rounded-[4px] border border-dashed border-line px-5 py-8 text-center">
      <p className="font-serif text-[17px] leading-snug text-ink">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] leading-relaxed text-muted">{texto}</p>
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hoja / diálogo                                                      */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  titulo,
  descripcion,
  children,
  pie,
}: {
  open: boolean;
  onClose: () => void;
  titulo?: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="fade absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo ?? 'Diálogo'}
        className="rise relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[10px] border border-line bg-ivory shadow-[0_-10px_50px_rgba(32,33,31,0.22)] sm:max-w-lg sm:rounded-[6px] sm:shadow-[0_24px_70px_rgba(32,33,31,0.28)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            {titulo && <h2 className="text-[19px] leading-tight text-ink">{titulo}</h2>}
            {descripcion && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{descripcion}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 -mt-1 rounded-[3px] p-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pie && (
          <div className="border-t border-line-soft bg-paper/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}

export function Confirmar({
  open,
  titulo,
  texto,
  etiquetaConfirmar = 'Confirmar',
  peligro,
  nota = 'Esta acción queda registrada en el historial de la barbería.',
  onConfirm,
  onClose,
}: {
  open: boolean;
  titulo: string;
  texto: string;
  etiquetaConfirmar?: string;
  peligro?: boolean;
  /** Texto pequeño bajo la descripción. Con `null` no se pinta nada. */
  nota?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      titulo={titulo}
      descripcion={texto}
      pie={
        <div className="flex gap-2">
          <Btn v="outline" t="md" className="flex-1" onClick={onClose}>
            Volver
          </Btn>
          <Btn
            v={peligro ? 'danger' : 'primary'}
            t="md"
            className="flex-1"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {etiquetaConfirmar}
          </Btn>
        </div>
      }
    >
      {nota && <p className="text-[13px] leading-relaxed text-ink-soft">{nota}</p>}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Avisos                                                              */
/* ------------------------------------------------------------------ */

interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'info' | 'aviso';
}

let secuencia = 0;
const oyentes = new Set<(a: Aviso) => void>();

export function toast(texto: string, tipo: Aviso['tipo'] = 'ok'): void {
  const aviso = { id: ++secuencia, texto, tipo };
  oyentes.forEach((fn) => fn(aviso));
}

export function Toaster() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    const recibir = (a: Aviso) => {
      setAvisos((prev) => [...prev, a]);
      window.setTimeout(() => {
        setAvisos((prev) => prev.filter((x) => x.id !== a.id));
      }, 3600);
    };
    oyentes.add(recibir);
    return () => {
      oyentes.delete(recibir);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[86px] z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {avisos.map((a) => (
        <div
          key={a.id}
          role="status"
          className="rise pointer-events-auto flex max-w-md items-center gap-2.5 rounded-[3px] bg-ink px-3.5 py-2.5 text-[12.5px] font-medium text-ivory shadow-[0_8px_28px_rgba(0,0,0,0.24)]"
        >
          <span
            className={cn(
              'inline-block size-1.5 shrink-0 rounded-full',
              a.tipo === 'ok' ? 'bg-sage' : a.tipo === 'aviso' ? 'bg-bronze' : 'bg-ivory/60',
            )}
          />
          {a.texto}
        </div>
      ))}
    </div>
  );
}
