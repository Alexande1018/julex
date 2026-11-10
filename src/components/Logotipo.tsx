import { cn } from './ui';
import { iniciales } from '../lib/format';

/**
 * Marca del local. Si no hay logo, dibuja un monograma con las iniciales,
 * para que la maqueta no baile cuando el local aún no ha subido nada.
 */
export function Logotipo({
  nombre,
  logo,
  tamano = 28,
  tono = 'claro',
  className,
}: {
  nombre: string;
  logo: string | null;
  tamano?: number;
  tono?: 'claro' | 'oscuro';
  className?: string;
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={`Logo de ${nombre}`}
        style={{ width: tamano, height: tamano }}
        className={cn('shrink-0 object-contain', tono === 'oscuro' && 'brightness-0 invert', className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[2px] border font-serif leading-none',
        tono === 'oscuro' ? 'border-ivory/30 text-ivory/75' : 'border-line text-ink-soft',
        className,
      )}
      style={{ width: tamano, height: tamano, fontSize: Math.max(9, tamano * 0.4) }}
    >
      {iniciales(nombre)}
    </span>
  );
}
