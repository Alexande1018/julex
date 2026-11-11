import { useSyncExternalStore } from 'react';
import type { Db } from './types';
import { buildSeed, SEED_VERSION } from './seed';
import { haySupabase } from './supabase';

const KEY = 'julex.demo.v1';

function cargar(): Db | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Db;
    if (!parsed || parsed.version !== SEED_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Estado neutro: en modo real no se enseña ni un dato de ejemplo. */
const VACIO: Db = {
  version: 0,
  barberias: [
    {
      id: '',
      nombre: '',
      slug: '',
      color: '#3E4A35',
      telefono: '',
      direccion: '',
      logo: null,
      fidelidadMeta: 10,
      tipo: 'barberia',
      domicilioLegal: '',
      correoLegal: '',
      altaEn: '',
    },
  ],
  barberos: [],
  sillas: [],
  servicios: [],
  clientes: [],
  llaveros: [],
  citas: [],
  cola: [],
  visitas: [],
  movimientos: [],
  recompensas: [],
  mensajes: [],
  eventos: [],
  sesion: null,
};

let db: Db = haySupabase ? VACIO : (cargar() ?? buildSeed());
const oyentes = new Set<() => void>();

function persistir() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Sin almacenamiento (modo privado lleno): la sesión sigue en memoria.
  }
}

function notificar() {
  persistir();
  oyentes.forEach((fn) => fn());
}

export const store = {
  get: (): Db => db,

  subscribe(fn: () => void): () => void {
    oyentes.add(fn);
    return () => {
      oyentes.delete(fn);
    };
  },

  /** Lee sin copiar. Para cálculos. */
  read: (): Db => db,

  /** Publica datos venidos del servidor sin escribirlos en el navegador. */
  hidratar(next: Db): void {
    db = next;
    oyentes.forEach((fn) => fn());
  },

  /** Modifica una copia y publica. Nada muta el estado publicado. */
  mutate(fn: (draft: Db) => void): void {
    const copia: Db = structuredClone(db);
    fn(copia);
    db = copia;
    notificar();
  },

  reset(): void {
    db = buildSeed();
    notificar();
  },
};

export function useDb(): Db {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export { KEY as STORAGE_KEY };
