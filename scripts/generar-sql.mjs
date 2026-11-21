/**
 * Junta las migraciones en supabase/aplicar_todo.sql.
 *
 *   npm run sql:generar
 *
 * Se genera desde los ficheros, no a mano: si se añade una migración y
 * no se regenera, el bundle se queda viejo y un proyecto nuevo nace
 * incompleto. Este script es la única fuente.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = 'supabase/migrations';
const ficheros = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const salida = [
  '-- JULEX · esquema completo',
  '-- Pega este archivo en el SQL Editor de un proyecto NUEVO y ejecútalo.',
  '',
];

for (const f of ficheros) {
  salida.push(`-- ---------- ${f} ----------`, '', readFileSync(`${DIR}/${f}`, 'utf8'));
}

writeFileSync('supabase/aplicar_todo.sql', salida.join('\n'));
console.log(`${ficheros.length} migraciones · supabase/aplicar_todo.sql`);
