// JULEX · propuestas que el cliente deja para su ficha
//
// El cliente no escribe en su ficha: propone. El barbero acepta, edita o
// descarta. Sin Supabase (demo) no hay propuestas y la sección no sale.

import { haySupabase, supabase } from './supabase';
import { cargarTodo } from './repo';
import { store } from './store';

export interface Propuesta {
  id: string;
  comoCorta: string;
  preferencias: string;
  textoOriginal: string;
  creadaEn: string;
}

export async function propuestasPendientes(clienteId: string): Promise<Propuesta[]> {
  if (!haySupabase || !supabase) return [];

  const { data, error } = await supabase
    .from('ficha_propuesta')
    .select('id, como_corta, preferencias, texto_original, creada_en')
    .eq('cliente_id', clienteId)
    .eq('estado', 'pendiente')
    .order('creada_en', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    comoCorta: String(r.como_corta ?? ''),
    preferencias: String(r.preferencias ?? ''),
    textoOriginal: String(r.texto_original ?? ''),
    creadaEn: String(r.creada_en ?? ''),
  }));
}

async function recargar(): Promise<void> {
  const db = await cargarTodo();
  if (db) store.hidratar(db);
}

export async function aceptarPropuesta(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('aceptar_propuesta', { p_propuesta: id });
  if (error) throw new Error(error.message);
  await recargar();
  return data === true;
}

export async function descartarPropuesta(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('descartar_propuesta', { p_propuesta: id });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Guarda lo corregido por el barbero y la acepta en un paso. */
export async function aplicarCorregida(
  id: string,
  comoCorta: string,
  preferencias: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('ficha_propuesta')
    .update({ como_corta: comoCorta, preferencias })
    .eq('id', id)
    .eq('estado', 'pendiente');
  if (error) throw new Error(error.message);

  return aceptarPropuesta(id);
}
