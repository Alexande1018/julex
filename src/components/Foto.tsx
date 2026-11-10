import { cn } from './ui';

/** Fotografía ya revelada en duotono (los archivos vienen tratados de /img). */
export function Foto({
  src,
  alt,
  className,
  prioridad,
  posicion = 'center',
}: {
  src: string;
  alt: string;
  className?: string;
  prioridad?: boolean;
  posicion?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading={prioridad ? 'eager' : 'lazy'}
      decoding="async"
      style={{ objectPosition: posicion }}
      className={cn('block h-full w-full object-cover', className)}
    />
  );
}

/** Pie de foto: crédito breve, como en una revista. */
export function PieFoto({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('pie-foto', className)}>{children}</p>;
}
