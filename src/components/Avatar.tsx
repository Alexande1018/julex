import { useId } from 'react';
import { avatarSvg, type AvatarSpec } from '../lib/avatares';
import { cn } from './ui';

/**
 * El mismo dibujo que devuelve `avatarSvg`, montado en React. Sin HTML
 * inyectado y sin imágenes: se puede escalar a cualquier tamaño sin
 * descargar nada.
 */
export function Avatar({
  id,
  size = 64,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const spec = avatarSvg(id);
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const fondoId = `avatar-fondo-${uid}`;
  const luzId = `avatar-luz-${uid}`;
  const recorteId = `avatar-recorte-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={fondoId} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={spec.fondo[0]} />
          <stop offset="1" stopColor={spec.fondo[1]} />
        </linearGradient>
        <radialGradient id={luzId} cx="28%" cy="16%" r="88%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.68" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={recorteId}>
          <circle cx="48" cy="48" r="48" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${recorteId})`}>
        <rect width="96" height="96" fill={`url(#${fondoId})`} />
        <rect width="96" height="96" fill={`url(#${luzId})`} />
        <circle cx="78" cy="16" r="21" fill="#ffffff" opacity="0.06" />
        <circle cx="13" cy="86" r="27" fill="#000000" opacity="0.05" />

        {/* Cuello y hombros: van primero para que la cara quede delante. */}
        <rect x="42" y="51" width="12" height="28" rx="6" fill={spec.piel} />
        <path d="M8 96c2.4-16.8 17-25.5 40-25.5s37.6 8.7 40 25.5z" fill={spec.ropa} />
        <path d="M41 71.5 48 81.5 55 71.5Z" fill="#000000" opacity="0.14" />
        <path
          d="M42 72c2 4 3.8 5.8 6 5.8s4-1.8 6-5.8"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.18"
          strokeWidth="1.5"
        />

        <circle cx="31.4" cy="45.5" r="3.6" fill={spec.piel} />
        <circle cx="64.6" cy="45.5" r="3.6" fill={spec.piel} />
        <ellipse cx="48" cy="42" rx="17.1" ry="19.6" fill={spec.piel} />

        <Cabello spec={spec} />

        {spec.barba && (
          <g fill={spec.pelo}>
            <path
              d="M33.3 44.7c.7 10.8 6.4 17.8 14.7 17.8s14-7 14.7-17.8c-2.4 7.4-7.3 11.1-14.7 11.1s-12.3-3.7-14.7-11.1z"
              opacity="0.92"
            />
            <path d="M43.1 50.1c1.6-1 3.1-1 4.9 0 1.8-1 3.3-1 4.9 0-1.6 2-3.3 2.7-4.9 2.7s-3.3-.7-4.9-2.7z" />
          </g>
        )}

        <g>
          <path
            d="M37.6 38.7c1.6-1 3.4-1 5 .1"
            fill="none"
            stroke="#000000"
            strokeOpacity="0.22"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M53.4 38.8c1.6-1.1 3.4-1.1 5-.1"
            fill="none"
            stroke="#000000"
            strokeOpacity="0.22"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <ellipse cx="41.4" cy="43.5" rx="1.35" ry="1.7" fill="#2a241f" />
          <ellipse cx="54.6" cy="43.5" rx="1.35" ry="1.7" fill="#2a241f" />
          <circle cx="41.85" cy="42.9" r="0.45" fill="#ffffff" opacity="0.75" />
          <circle cx="55.05" cy="42.9" r="0.45" fill="#ffffff" opacity="0.75" />
          <path
            d="M48 45.9c-.8 2.2-.7 3.4.2 4.1.7.5 1.5.4 2.1-.2"
            fill="none"
            stroke="#7a4a36"
            strokeOpacity="0.55"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <circle cx="35.7" cy="49.4" r="3" fill="#c25b45" opacity="0.12" />
          <circle cx="60.3" cy="49.4" r="3" fill="#c25b45" opacity="0.12" />
          <path
            d="M44.1 52.3c1.1 1.6 2.5 2.4 3.9 2.4s2.8-.8 3.9-2.4"
            fill="none"
            stroke="#8a4f3b"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>

        {spec.gafas && (
          <g fill="none" stroke="#26231f" strokeWidth="1.6" strokeOpacity="0.8">
            <circle cx="41.4" cy="43.5" r="5.1" />
            <circle cx="54.6" cy="43.5" r="5.1" />
            <path d="M46.5 43.3c.9-.4 1.9-.4 2.8 0" />
            <path d="M36.3 43.1l-3.2-.9" />
            <path d="M59.7 43.1l3.2-.9" />
          </g>
        )}

        {spec.aretes && (
          <g fill="#c7a15a" stroke="#8a6a46" strokeWidth="0.5">
            <circle cx="31.2" cy="50.4" r="1.6" />
            <circle cx="64.8" cy="50.4" r="1.6" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** Cuatro peinados. El resto de rasgos cambia; el peinado da la silueta. */
function Cabello({ spec }: { spec: AvatarSpec }) {
  const color = spec.pelo;

  if (spec.corte === 1) {
    return (
      <g fill={color}>
        <path d="M30.8 44.2c-1.6-13.2 6-21.6 17.4-21.6 8 0 13.9 4.1 16.4 10.8 1.2 3.2 1.2 7.1.2 10.6-.9-6.2-3.8-10-8.7-11.8-2.2 3.4-7.8 6.3-15.9 7.5-4.4.7-7.2 1.7-9.4 4.5z" />
      </g>
    );
  }

  if (spec.corte === 2) {
    return (
      <g fill={color}>
        <path d="M31.5 36c0-7 7.4-12 16.5-12s16.5 5 16.5 12z" />
        <circle cx="34" cy="32.5" r="7.2" />
        <circle cx="42" cy="26.5" r="8.2" />
        <circle cx="51" cy="25.5" r="8.4" />
        <circle cx="59.5" cy="29.5" r="7.4" />
        <circle cx="64" cy="37" r="6.2" />
      </g>
    );
  }

  if (spec.corte === 3) {
    return (
      <g fill={color}>
        <path d="M31 36.5c0-8 7.2-14.2 17-14.2s17 6.2 17 14.2v1H31z" />
        <path d="M30 38.5c-1.2 6.4-1.2 13.2 0 19.8 1 5.2 3.8 8.4 7.2 8.4l-1.3-10.8c-.8-5.8-.8-11 0-16.2z" />
        <path d="M66 38.5c1.2 6.4 1.2 13.2 0 19.8-1 5.2-3.8 8.4-7.2 8.4l1.3-10.8c.8-5.8.8-11 0-16.2z" />
      </g>
    );
  }

  return (
    <path
      d="M31.6 43.2c-.8-12.8 6.2-20.4 16.4-20.4 10.4 0 17.4 7.6 16.4 20.4-2.5-7.4-7.2-11.2-16.4-11.2s-13.9 3.8-16.4 11.2z"
      fill={color}
    />
  );
}
