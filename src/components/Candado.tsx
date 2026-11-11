import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { cargarFicha } from '../lib/publico';
import { Btn, cn, inputClases } from './ui';

/**
 * Pantalla de la tarjeta protegida con PIN.
 *
 * No sabe nada del cliente a propósito: hasta que el PIN es correcto, aquí no
 * hay nombre, ni teléfono, ni barbería. Lo único que se enseña es que la
 * tarjeta está cerrada.
 */
export function Candado({
  token,
  estado,
  onAbierto,
}: {
  token: string;
  estado: 'denegada' | 'bloqueada';
  onAbierto: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [bloqueada, setBloqueada] = useState(estado === 'bloqueada');

  const abrir = async () => {
    if (probando || !/^[0-9]{4,6}$/.test(pin)) return;
    setProbando(true);
    setError(null);
    try {
      const f = await cargarFicha(token, pin);
      if (!f) {
        setError('Esta tarjeta no existe.');
        return;
      }
      if (f.estado === 'abierta') {
        onAbierto(pin);
        return;
      }
      if (f.estado === 'bloqueada') {
        setBloqueada(true);
        return;
      }
      setError('Ese PIN no es.');
      setPin('');
    } catch {
      setError('No se ha podido comprobar el PIN. Inténtalo otra vez.');
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="grain flex min-h-dvh flex-col items-center justify-center bg-ivory px-6 text-center">
      <span className="eyebrow">JULEX</span>

      <div className="mt-5 inline-flex size-11 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
        <Lock size={17} />
      </div>

      <h1 className="mt-4 font-serif text-[26px] leading-tight text-ink">Tarjeta protegida</h1>

      {bloqueada ? (
        <>
          <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-muted">
            Demasiados intentos seguidos. Espera quince minutos, o pide en la barbería que te
            quiten el PIN y vuelve a ponerlo.
          </p>
          <Link
            to="/"
            className="mt-6 text-[12px] font-semibold text-ink underline underline-offset-4"
          >
            Volver al inicio
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-muted">
            Esta tarjeta pide un PIN para abrirse. Sin él no se ve nada de su dueño.
          </p>

          <div className="mt-6 w-full max-w-[240px]">
            <input
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void abrir();
              }}
              className={cn(inputClases, 'num text-center text-[22px] tracking-[0.34em]')}
              inputMode="numeric"
              autoComplete="off"
              aria-label="PIN de la tarjeta"
              placeholder="••••"
              autoFocus
            />

            {error && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-clay" role="alert">
                {error}
              </p>
            )}

            <Btn
              t="lg"
              className="mt-3 w-full"
              onClick={() => void abrir()}
              disabled={!/^[0-9]{4,6}$/.test(pin) || probando}
            >
              {probando ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Un momento…
                </>
              ) : (
                'Abrir tarjeta'
              )}
            </Btn>
          </div>

          <Link
            to="/"
            className="mt-6 text-[12px] font-semibold text-ink underline underline-offset-4"
          >
            Volver al inicio
          </Link>

          <p className="mt-8 max-w-[32ch] text-[10.5px] leading-relaxed text-faint">
            ¿No te acuerdas? En la barbería pueden quitártelo; no pueden leerlo.
          </p>
        </>
      )}
    </div>
  );
}
