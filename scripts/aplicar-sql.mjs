/**
 * Aplica un archivo .sql a una base de datos Postgres.
 *   DATABASE_URL="postgresql://..." node scripts/aplicar-sql.mjs supabase/aplicar_todo.sql
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
const fichero = process.argv[2] ?? 'supabase/aplicar_todo.sql';
if (!url) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const sql = readFileSync(fichero, 'utf8');
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await cliente.connect();
  console.log('conectado');
  await cliente.query(sql);
  const t = await cliente.query(
    "select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  );
  const f = await cliente.query(
    "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'",
  );
  console.log(`aplicado: ${t.rows[0].n} tablas, ${f.rows[0].n} funciones`);
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
