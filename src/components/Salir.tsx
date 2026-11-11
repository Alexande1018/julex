import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { salir } from '../lib/actions';
import { Confirmar, cn } from './ui';

/**
 * Salida comun de las tres ventanas: cliente, local (barbero) y admin.
 *
 * - `cerrarSesion` (por defecto): cierra la sesion del barbero/admin y vuelve a `a`.
 *   En la ventana del cliente no hay sesion que cerrar: se pasa en `false` y solo
 *   navega, para no dejar fuera al barbero que abrio la tarjeta en el mismo navegador.
 * - `variante`: `texto` para cabeceras y `celda` para la barra inferior del movil.
 * - `icono`: la puerta con flecha (`salida`, la de cerrar sesion) o una X (`cerrar`,
 *   la de las paginas publicas, donde solo se vuelve).
 */
export function Salir({
  a = '/',
  tono = 'claro',
  etiqueta = 'Salir',
  cerrarSesion = true,
  variante = 'texto',
  icono = 'salida',
  className,
}: {
  a?: string;
  tono?: 'claro' | 'oscuro';
  etiqueta?: string;
  cerrarSesion?: boolean;
  variante?: 'texto' | 'celda';
  icono?: 'salida' | 'cerrar';
  className?: string;
}) {
  const navegar = useNavigate();
  const [pregunta, setPregunta] = useState(false);

  const fuera = () => {
    if (!cerrarSesion) {
      navegar(a, { replace: true });
      return;
    }
    void salir().finally(() => navegar(a, { replace: true }));
  };

  const pedir = () => {
    if (!cerrarSesion) {
      fuera();
      return;
    }
    setPregunta(true);
  };

  const color = tono === 'oscuro' ? 'text-ivory/60 hover:text-ivory' : 'text-muted hover:text-ink';

  return (
    <>
      <button
        type="button"
        onClick={pedir}
        aria-label={etiqueta}
        className={cn(
          'transition-colors',
          variante === 'texto'
            ? cn(
                'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]',
                color,
              )
            : cn('flex flex-col items-center gap-1 pb-2 pt-2.5', color),
          className,
        )}
      >
        {icono === 'cerrar' ? (
          <X size={variante === 'texto' ? 12 : 19} strokeWidth={variante === 'texto' ? 2 : 1.8} />
        ) : (
          <LogOut size={variante === 'texto' ? 12 : 19} strokeWidth={variante === 'texto' ? 2 : 1.8} />
        )}
        <span
          className={cn(
            variante === 'texto'
              ? ''
              : 'text-[9.5px] font-bold uppercase tracking-[0.09em]',
          )}
        >
          {etiqueta}
        </span>
      </button>

      <Confirmar
        open={pregunta}
        titulo="¿Salir?"
        texto="Se cierra la sesión en este navegador: la cola y las fichas volverán a pedir acceso."
        etiquetaConfirmar="Salir"
        nota={null}
        onClose={() => setPregunta(false)}
        onConfirm={() => {
          setPregunta(false);
          fuera();
        }}
      />
    </>
  );
}
