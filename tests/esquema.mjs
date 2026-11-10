/**
 * Comprueba que las migraciones son SQL válido y que las reglas de negocio
 * se sostienen, sobre un Postgres real (WASM, en memoria).
 *
 *   node tests/esquema.mjs
 *
 * No sustituye a probar contra Supabase: verifica sintaxis, restricciones,
 * funciones y RLS, que es justo lo que se rompe al escribir el esquema a ciegas.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const DIR = 'supabase/migrations';
let fallos = 0;
let total = 0;

function ok(condicion, titulo, detalle = '') {
  total++;
  if (!condicion) fallos++;
  console.log(`${condicion ? '  ok  ' : ' FALLO'} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
}

const db = new PGlite();

/* Entorno mínimo que Supabase ya trae: roles, auth y storage. */
async function preparar() {
  await db.exec(`
    create role anon;
    create role authenticated;

    create schema auth;
    create table auth.users (id uuid primary key);

    -- El id del usuario se inyecta desde el test con set_config('test.uid', ...)
    create function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid;
      $$;

    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text,
      public boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text
    );
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
  `);
}

async function aplicarMigraciones() {
  const ficheros = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of ficheros) {
    let sql = readFileSync(join(DIR, f), 'utf8');
    // pgcrypto no está en el WASM; gen_random_uuid() ya es nativo en PG 18.
    sql = sql.replace(/create extension if not exists pgcrypto;/i, '');
    try {
      await db.exec(sql);
      ok(true, `Migración aplicada: ${f}`);
    } catch (e) {
      ok(false, `Migración aplicada: ${f}`, e.message.slice(0, 160));
      throw e;
    }
  }
}

async function main() {
  await preparar();

  /* Las migraciones, tal cual. */
  await aplicarMigraciones();

  /* Tablas y funciones */
  const tablas = await db.query(`
    select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  ok(tablas.rows[0].n >= 14, 'Están las tablas del modelo', `${tablas.rows[0].n} tablas`);

  const funciones = await db.query(`
    select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  `);
  const nombres = new Set(funciones.rows.map((r) => r.proname));
  for (const f of [
    'mi_barberia',
    'crear_local',
    'atender_cola',
    'aplicar_recompensa',
    'local_publico',
    'ficha_publica',
    'solicitar_cita',
  ]) {
    ok(nombres.has(f), `Existe la función ${f}()`);
  }

  /* RLS activo en todo lo que lleva barberia_id */
  const sinRls = await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  `);
  ok(sinRls.rows.length === 0, 'Todas las tablas tienen RLS', sinRls.rows.map((r) => r.relname).join(', '));

  /* Alta de local: crea local, dueño, servicios y horario */
  const dueno = '11111111-1111-1111-1111-111111111111';
  await db.query(`insert into auth.users (id) values ($1)`, [dueno]);
  await db.query(`select set_config('test.uid', $1, false)`, [dueno]);

  const alta = await db.query(`select crear_local('Barbería Paco', 'barberia-paco') as id`);
  const barberiaId = alta.rows[0].id;
  ok(!!barberiaId, 'crear_local() devuelve el local');

  const cuenta = await db.query(
    `select
       (select count(*)::int from servicios where barberia_id = $1) as servicios,
       (select count(*)::int from horarios where barberia_id = $1) as horarios,
       (select count(*)::int from barberos where barberia_id = $1) as barberos`,
    [barberiaId],
  );
  const c = cuenta.rows[0];
  ok(c.servicios === 3 && c.horarios === 7 && c.barberos === 1, 'El alta deja el local listo', JSON.stringify(c));

  /* Un segundo alta con el mismo usuario falla */
  let repetido = false;
  try {
    await db.query(`select crear_local('Otro', 'otro')`);
  } catch {
    repetido = true;
  }
  ok(repetido, 'Un usuario no puede tener dos locales');

  /* Coherencia del llavero: activo siempre con cliente */
  const cliente = await db.query(
    `insert into clientes (barberia_id, codigo, nombre, telefono)
     values ($1, 'P-0001', 'Cliente Uno', '600000000') returning id, token_publico`,
    [barberiaId],
  );
  const clienteId = cliente.rows[0].id;
  ok(/^[a-f0-9]{32}$/.test(cliente.rows[0].token_publico), 'El cliente nace con token público');

  await db.query(
    `insert into llaveros (barberia_id, token, codigo_corto) values ($1, 'tok_uno', 'PBL-0001')`,
    [barberiaId],
  );

  let incoherente = false;
  try {
    await db.query(`update llaveros set estado = 'activo' where token = 'tok_uno'`);
  } catch {
    incoherente = true;
  }
  ok(incoherente, 'Un llavero activo sin cliente es rechazado');

  await db.query(
    `update llaveros set estado = 'activo', cliente_id = $1, asignado_en = now() where token = 'tok_uno'`,
    [clienteId],
  );
  ok(true, 'Con cliente sí se vincula');

  /* Atender: visita, movimiento, cita atendida y fidelización */
  const cola = await db.query(
    `insert into cola (barberia_id, cliente_id, servicio_id, estado, inicio_en)
     values ($1, $2, (select id from servicios where barberia_id = $1 limit 1), 'sillon', now())
     returning id`,
    [barberiaId, clienteId],
  );
  await db.query(
    `insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado)
     values ($1, $2, (select id from servicios where barberia_id = $1 limit 1), now(), 'confirmada')`,
    [barberiaId, clienteId],
  );

  const atencion = await db.query(`select atender_cola($1) as r`, [cola.rows[0].id]);
  const r = atencion.rows[0].r;
  ok(r.cortesTotales === 1, 'atender_cola() cuenta el corte', JSON.stringify(r));

  const post = await db.query(
    `select
       (select count(*)::int from visitas where cliente_id = $1) as visitas,
       (select count(*)::int from movimientos_fidelizacion where cliente_id = $1) as movs,
       (select count(*)::int from citas where cliente_id = $1 and estado = 'atendida') as atendidas`,
    [clienteId],
  );
  const p = post.rows[0];
  ok(p.visitas === 1 && p.movs === 1 && p.atendidas === 1, 'La visita deja rastro completo', JSON.stringify(p));

  let doble = false;
  try {
    await db.query(`select atender_cola($1)`, [cola.rows[0].id]);
  } catch {
    doble = true;
  }
  ok(doble, 'No se puede cerrar dos veces el mismo servicio');

  /* Ficha pública y solicitud de cita desde la web */
  const ficha = await db.query(`select ficha_publica($1) as f`, [cliente.rows[0].token_publico]);
  const f = ficha.rows[0].f;
  ok(f?.local?.nombre === 'Barbería Paco' && f?.cortes === 1, 'ficha_publica() devuelve la tarjeta', JSON.stringify(f?.cliente));

  const sinFicha = await db.query(`select ficha_publica('inventado') as f`);
  ok(sinFicha.rows[0].f === null, 'Un token inventado no devuelve nada');

  const pedida = await db.query(
    `select solicitar_cita($1, (select id from servicios where barberia_id = $2 limit 1), now() + interval '1 day', 'Cliente Dos', '611111111') as id`,
    ['barberia-paco', barberiaId],
  );
  ok(!!pedida.rows[0].id, 'solicitar_cita() crea la cita');

  const nuevo = await db.query(`select codigo from clientes where telefono = '611111111'`);
  ok(nuevo.rows[0]?.codigo === 'P-0002', 'Numera al cliente nuevo', nuevo.rows[0]?.codigo);

  /* La recompensa salta exactamente en la meta */
  const antesRw = await db.query(
    `select count(*)::int as n from recompensas where cliente_id = $1`,
    [clienteId],
  );
  ok(antesRw.rows[0].n === 0, 'Con un corte todavía no hay recompensa');

  await db.query(`update barberias set fidelidad_meta = 2 where id = $1`, [barberiaId]);
  const cola2 = await db.query(
    `insert into cola (barberia_id, cliente_id, servicio_id, estado, inicio_en)
     values ($1, $2, (select id from servicios where barberia_id = $1 limit 1), 'sillon', now())
     returning id`,
    [barberiaId, clienteId],
  );
  const segundo = await db.query(`select atender_cola($1) as r`, [cola2.rows[0].id]);
  ok(segundo.rows[0].r.recompensaGanada === true, 'Al llegar a la meta salta la recompensa', JSON.stringify(segundo.rows[0].r));

  const rw = await db.query(
    `select estado from recompensas where cliente_id = $1`,
    [clienteId],
  );
  ok(rw.rows.length === 1 && rw.rows[0].estado === 'disponible', 'La recompensa queda disponible');

  const movs = await db.query(
    `select tipo, count(*)::int as n from movimientos_fidelizacion
      where cliente_id = $1 group by tipo order by tipo`,
    [clienteId],
  );
  const tipos = Object.fromEntries(movs.rows.map((r) => [r.tipo, r.n]));
  ok(tipos.corte === 2 && tipos.recompensa_ganada === 1, 'El histórico de fidelización cuadra', JSON.stringify(tipos));

  /* Cara pública: cancelar, mis datos y baja */
  const token = cliente.rows[0].token_publico;

  const fichaConGasto = await db.query(`select ficha_publica($1) as f`, [token]);
  ok(Number(fichaConGasto.rows[0].f?.gastado) === 30, 'La ficha suma lo gastado', String(fichaConGasto.rows[0].f?.gastado));

  const f2 = fichaConGasto.rows[0].f;
  ok(
    typeof f2?.cliente?.telefono === 'string' &&
      typeof f2?.cliente?.preferencias === 'string' &&
      !!f2?.cliente?.creado_en &&
      typeof f2?.consentimientos?.datos === 'boolean',
    'La ficha trae los datos que el cliente puede editar',
    JSON.stringify(f2?.consentimientos),
  );

  const citaFutura = await db.query(
    `insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado)
     values ($1, $2, (select id from servicios where barberia_id = $1 limit 1), now() + interval '2 days', 'pendiente')
     returning id`,
    [barberiaId, clienteId],
  );

  const cancelada = await db.query(`select cancelar_cita($1, $2) as r`, [token, citaFutura.rows[0].id]);
  ok(cancelada.rows[0].r === true, 'El cliente cancela su cita con margen');

  const estadoCita = await db.query(`select estado from citas where id = $1`, [citaFutura.rows[0].id]);
  ok(estadoCita.rows[0].estado === 'cancelada', 'La cita queda cancelada');

  const tarde = await db.query(
    `insert into citas (barberia_id, cliente_id, servicio_id, inicio, estado)
     values ($1, $2, (select id from servicios where barberia_id = $1 limit 1), now() + interval '30 minutes', 'pendiente')
     returning id`,
    [barberiaId, clienteId],
  );
  const noCancelada = await db.query(`select cancelar_cita($1, $2) as r`, [token, tarde.rows[0].id]);
  ok(noCancelada.rows[0].r === false, 'Con menos de dos horas no se cancela sola');

  const ajenia = await db.query(
    `select cancelar_cita($1, gen_random_uuid()) as r`,
    [token],
  );
  ok(ajenia.rows[0].r === false, 'No se puede cancelar una cita ajena o inexistente');

  const datos = await db.query(
    `select actualizar_mis_datos($1, '699888777', 'Prefiere los viernes', true, false) as r`,
    [token],
  );
  ok(datos.rows[0].r === true, 'El cliente puede editar sus datos');

  const trasDatos = await db.query(
    `select telefono, preferencias, cons_avisos, cons_marketing, cons_datos
       from clientes where id = $1`,
    [clienteId],
  );
  const d = trasDatos.rows[0];
  ok(
    d.telefono === '699888777' && d.preferencias === 'Prefiere los viernes' && d.cons_avisos === true && d.cons_datos === true,
    'Cambian teléfono, preferencias y avisos; el consentimiento de datos no',
    JSON.stringify(d),
  );

  const baja = await db.query(`select solicitar_baja($1) as r`, [token]);
  const trasBaja = await db.query(
    `select cons_avisos, cons_marketing from clientes where id = $1`,
    [clienteId],
  );
  ok(baja.rows[0].r === true && trasBaja.rows[0].cons_avisos === false && trasBaja.rows[0].cons_marketing === false,
    'La baja apaga los consentimientos opcionales');

  const aviso = await db.query(
    `select count(*)::int as n from mensajes_log where cliente_id = $1 and texto like 'SOLICITUD DE BAJA%'`,
    [clienteId],
  );
  ok(aviso.rows[0].n === 1, 'La baja queda registrada para el local');

  /* Disponibilidad pública y reserva sin dobles */
  const manana = await db.query(
    `select (current_date + 1)::date as d, extract(dow from current_date + 1)::int as dow`,
  );
  const dia = new Date(manana.rows[0].d).toISOString().slice(0, 10);

  const huecos = await db.query(`select huecos_publicos('barberia-paco', $1, 30, 30) as h`, [dia]);
  const lista = huecos.rows[0].h;
  ok(Array.isArray(lista) && lista.length > 0, 'El día devuelve huecos libres', `${lista?.length ?? 0} huecos`);

  const primero = lista[0];
  const [hh, mm] = primero.split(':').map(Number);
  const inicio = `${dia}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  const tomado = await db.query(
    `select solicitar_cita('barberia-paco', (select id from servicios where barberia_id = $1 limit 1), $2::timestamptz, 'Cliente Tres', '622222222') as id`,
    [barberiaId, inicio],
  );
  ok(!!tomado.rows[0].id, 'Se puede reservar un hueco libre');

  const trasReservar = await db.query(`select huecos_publicos('barberia-paco', $1, 30, 30) as h`, [dia]);
  ok(!trasReservar.rows[0].h.includes(primero), 'El hueco reservado desaparece de la lista', primero);

  let dobleReserva = false;
  try {
    await db.query(
      `select solicitar_cita('barberia-paco', (select id from servicios where barberia_id = $1 limit 1), $2::timestamptz, 'Cliente Cuatro', '633333333')`,
      [barberiaId, inicio],
    );
  } catch (e) {
    dobleReserva = e.message.includes('horario_ocupado');
  }
  ok(dobleReserva, 'Dos reservas en el mismo hueco: la segunda se rechaza');

  /* Un bloqueo de agenda quita el hueco */
  const otro = lista[1];
  const [h2, m2] = otro.split(':').map(Number);
  const inicio2 = `${dia}T${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}:00`;
  await db.query(
    `insert into bloqueos_agenda (barberia_id, desde, hasta, motivo)
     values ($1, $2::timestamptz, $2::timestamptz + interval '1 hour', 'comida')`,
    [barberiaId, inicio2],
  );
  const conBloqueo = await db.query(`select huecos_publicos('barberia-paco', $1, 30, 30) as h`, [dia]);
  ok(!conBloqueo.rows[0].h.includes(otro), 'Un bloqueo de agenda quita el hueco', otro);

  /* La ficha trae los servicios del local */
  const fConServicios = await db.query(`select ficha_publica($1) as f`, [token]);
  ok((fConServicios.rows[0].f?.servicios ?? []).length === 3, 'La ficha trae los servicios para reservar');

  await db.query(`select aplicar_recompensa($1)`, [clienteId]);
  const trasCanje = await db.query(
    `select
       (select count(*)::int from recompensas where cliente_id = $1 and estado = 'aplicada') as aplicadas,
       (select count(*)::int from movimientos_fidelizacion where cliente_id = $1 and tipo = 'recompensa_canjeada') as canjes,
       (select count(*)::int from visitas where cliente_id = $1) as visitas`,
    [clienteId],
  );
  const t = trasCanje.rows[0];
  ok(t.aplicadas === 1 && t.canjes === 1 && t.visitas === 2, 'Canjear no borra el historial', JSON.stringify(t));

  await db.close();
}

try {
  await main();
} catch (e) {
  fallos++;
  console.log(`\n FALLO inesperado: ${e.message}`);
} finally {
  console.log(`\n${total - fallos}/${total} comprobaciones correctas`);
  process.exit(fallos === 0 ? 0 : 1);
}
