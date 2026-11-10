import { exigirCliente, haySupabase } from './supabase';
import { cargarTodo } from './repo';
import { store } from './store';

/** Hay un proyecto real configurado. */
export { haySupabase };

export interface DatosAcceso {
  email: string;
  password: string;
}

export async function crearCuentaLocal(datos: DatosAcceso & { local: string; slug: string }): Promise<void> {
  const sb = exigirCliente();
  const { data, error } = await sb.auth.signUp({
    email: datos.email,
    password: datos.password,
  });
  if (error) throw new Error(traducir(error.message));
  if (!data.session) {
    // El proyecto exige confirmar el correo: no hay sesión todavía.
    throw new Error('Te hemos enviado un correo para confirmar la cuenta. Ábrelo y vuelve a entrar.');
  }
  const { error: errorLocal } = await sb.rpc('crear_local', {
    p_nombre: datos.local,
    p_slug: datos.slug,
  });
  if (errorLocal) throw new Error(traducir(errorLocal.message));
  await recargar();
}

export async function entrar(datos: DatosAcceso): Promise<'dentro' | 'sin_local'> {
  const sb = exigirCliente();
  const { error } = await sb.auth.signInWithPassword({
    email: datos.email,
    password: datos.password,
  });
  if (error) throw new Error(traducir(error.message));

  const db = await cargarTodo();
  if (!db) return 'sin_local';
  store.hidratar(db);
  return 'dentro';
}

/** Cuenta que ya existe pero se quedó a medias en el alta del local. */
export async function crearLocalEstandoDentro(datos: { local: string; slug: string }): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.rpc('crear_local', { p_nombre: datos.local, p_slug: datos.slug });
  if (error) throw new Error(traducir(error.message));
  await recargar();
}

export async function salirRemoto(): Promise<void> {
  const sb = exigirCliente();
  await sb.auth.signOut();
  store.mutate((db) => {
    db.sesion = null;
  });
}

/** Trae de nuevo el local entero y lo publica. */
export async function recargar(): Promise<void> {
  const db = await cargarTodo();
  if (db) store.hidratar(db);
}

/** Sesión existente al abrir la app. */
export async function arrancarSesion(): Promise<boolean> {
  const sb = exigirCliente();
  const { data } = await sb.auth.getSession();
  if (!data.session) return false;
  const db = await cargarTodo();
  if (!db) return false;
  store.hidratar(db);
  return true;
}

/** Cambios de sesión en otra pestaña o al caducar el token. */
export function vigilarSesion(): () => void {
  const sb = exigirCliente();
  const { data } = sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT' || !sesion) {
      store.mutate((db) => {
        db.sesion = null;
      });
    }
  });
  return () => data.subscription.unsubscribe();
}

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password should be at least')) return 'La contraseña necesita al menos 6 caracteres.';
  if (m.includes('ya_tiene_local')) return 'Esa cuenta ya tiene un local.';
  if (m.includes('slug_invalido')) return 'El nombre del local no genera una dirección válida.';
  return mensaje;
}
