/**
 * Comprobación previa de JULEX contra el proyecto real de Supabase.
 *
 *   node scripts/preflight.mjs        (lee .env.local)
 *
 * Verifica que el proyecto responde, que las migraciones están aplicadas,
 * que las funciones públicas existen y que el bucket de logos está creado.
 * No escribe nada: solo lee.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function leerEnv() {
  const env = { ...process.env };
  if (existsSync('.env.local')) {
    for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = leerEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;

let fallos = 0;
const ok = (cond, titulo, detalle = '') => {
  if (!cond) fallos++;
  console.log(`${cond ? '  ok  ' : ' FALLO'} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
};

if (!url || !anon) {
  console.log('Falta configuración. Crea .env.local a partir de .env.example con:');
  console.log('  VITE_SUPABASE_URL=https://<proyecto>.supabase.co');
  console.log('  VITE_SUPABASE_ANON_KEY=<anon key>');
  process.exit(1);
}

console.log(`Proyecto: ${url}\n`);
const sb = createClient(url, anon, { auth: { persistSession: false } });

/* 1. El proyecto responde */
try {
  const { error } = await sb.auth.getSession();
  ok(!error, 'El proyecto responde', error?.message ?? '');
} catch (e) {
  ok(false, 'El proyecto responde', e.message);
}

/* 2. Las tablas existen (con anon basta para distinguir "no existe" de "sin permiso") */
const tabla = await sb.from('clientes').select('id', { head: true, count: 'exact' }).limit(1);
const mensaje = tabla.error?.message ?? '';
ok(
  !/does not exist/i.test(mensaje),
  'Tablas creadas (migraciones aplicadas)',
  mensaje ? mensaje.slice(0, 80) : 'accesible',
);

/* 3. Las funciones públicas están */
const fnLocal = await sb.rpc('local_publico', { p_slug: '__preflight__' });
ok(
  !fnLocal.error || !/Could not find the function/i.test(fnLocal.error.message),
  'Función local_publico()',
  fnLocal.error?.message?.slice(0, 80) ?? 'ok',
);

const fnFicha = await sb.rpc('ficha_publica', { p_token: '__preflight__' });
ok(
  !fnFicha.error || !/Could not find the function/i.test(fnFicha.error.message),
  'Función ficha_publica()',
  fnFicha.error?.message?.slice(0, 80) ?? 'ok',
);

const fnHuecos = await sb.rpc('huecos_publicos', {
  p_slug: '__preflight__',
  p_dia: new Date().toISOString().slice(0, 10),
  p_minutos: 30,
  p_paso: 30,
});
ok(
  !fnHuecos.error || !/Could not find the function/i.test(fnHuecos.error.message),
  'Función huecos_publicos()',
  fnHuecos.error?.message?.slice(0, 80) ?? 'ok',
);

const fnCita = await sb.rpc('solicitar_cita', {
  p_slug: '__preflight__',
  p_servicio: '00000000-0000-0000-0000-000000000000',
  p_inicio: new Date().toISOString(),
  p_nombre: 'Preflight',
  p_telefono: '600000000',
});
ok(
  /local_no_encontrado|Could not find the function/i.test(fnCita.error?.message ?? ''),
  'Función solicitar_cita() (responde y valida)',
  fnCita.error?.message?.slice(0, 80) ?? 'sin error esperado',
);

/* 4. El bucket de logos */
const bucket = await sb.storage.from('logos').list('', { limit: 1 });
ok(
  !bucket.error || !/not found/i.test(bucket.error.message),
  'Bucket «logos» creado',
  bucket.error?.message?.slice(0, 80) ?? 'ok',
);

console.log(
  fallos === 0
    ? '\nTodo listo. Aplica las migraciones con `npx supabase db push` si aún no lo has hecho.'
    : `\n${fallos} comprobación(es) fallida(s). Revisa el README, sección «Conectar Supabase».`,
);
process.exit(fallos === 0 ? 0 : 1);
