import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { haySupabase } from './supabase';
import { cargarTodo } from './repo';
import { store } from './store';

/**
 * En modo real, la app trabaja sobre una copia del local que se carga al
 * entrar. Si el cliente reserva desde su móvil, la barbería no lo ve hasta
 * recargar. Esto vuelve a leer la base al cambiar de pantalla y al volver a
 * la pestaña, que son los dos momentos en los que el barbero espera ver lo
 * último.
 */
export function useRefresco(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!haySupabase) return;
    let vivo = true;
    const traer = async () => {
      try {
        const db = await cargarTodo();
        if (vivo && db) store.hidratar(db);
      } catch {
        // Sin red o sin sesión: se sigue con lo que ya había.
      }
    };
    void traer();
    const alVolver = () => {
      if (document.visibilityState === 'visible') void traer();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [pathname]);
}
