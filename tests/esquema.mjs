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
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const DIR = 'supabase/migrations';
let fallos = 0;
let total = 0;

function ok(condicion, titulo, detalle = '') {
  total++;
  if (!condicion) fallos++;
  console.log(`${condicion ? '  ok  ' : ' FALLO'} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
}

// pgcrypto sí, porque el PIN de la tarjeta se guarda con bcrypt y hay que
// comprobar contra Postgres que el hash y el bloqueo por intentos funcionan.
const db = new PGlite({ extensions: { pgcrypto } });

/* Entorno mínimo que Supabase ya trae: roles, auth y storage. */
async function preparar() {
  await db.exec(`
    create role anon;
    create role authenticated;

    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      banned_until timestamptz,
      updated_at timestamptz,
      instance_id uuid,
      aud text, role text, created_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      is_sso_user boolean, is_anonymous boolean,
      confirmation_token text, recovery_token text, email_change text,
      email_change_token_new text, email_change_token_current text,
      phone_change text, phone_change_token text, reauthentication_token text
    );
    create table auth.identities (id uuid primary key, user_id uuid, identity_data jsonb,
      provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);

    -- El id del usuario se inyecta desde el test con set_config('test.uid', ...)
    create function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid;
      $$;

    -- En Supabase las extensiones viven aquí; se replica para probar lo mismo.
    create schema extensions;
    create extension pgcrypto schema extensions;

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

  /* Con dos sillas, el mismo tramo admite dos reservas y no tres */
  await db.query(`insert into sillas (barberia_id, nombre, orden) values ($1, 'Silla 2', 2)`, [barberiaId]);
  ok((await db.query(`select sillas_activas($1::uuid) as n`, [barberiaId])).rows[0].n === 2,
    'Con dos sillas activas la capacidad sube a 2');

  const libres2 = await db.query(`select huecos_publicos('barberia-paco', $1, 30, 30) as h`, [dia]);
  ok(libres2.rows[0].h.includes(lista[0]), 'La segunda silla vuelve a abrir el hueco ocupado', lista[0]);

  const c2 = await db.query(
    `select solicitar_cita('barberia-paco', (select id from servicios where barberia_id = $1 limit 1), $2::timestamptz, 'Cliente Dos', '600111222') as id`,
    [barberiaId, inicio],
  );
  const silla2 = await db.query(`select silla_id from citas where id = $1`, [c2.rows[0].id]);
  ok(!!silla2.rows[0].silla_id, 'La reserva se queda con una silla concreta');

  let tercera = false;
  try {
    await db.query(
      `select solicitar_cita('barberia-paco', (select id from servicios where barberia_id = $1 limit 1), $2::timestamptz, 'Cliente Tres', '600333444')`,
      [barberiaId, inicio],
    );
  } catch (e) {
    tercera = e.message.includes('horario_ocupado');
  }
  ok(tercera, 'Con las dos sillas ocupadas, la tercera se rechaza');

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

  /* ------------------------------------------------------------------ */
  /* La tarjeta con PIN                                                  */
  /* ------------------------------------------------------------------ */

  const pinToken = token;

  /* Sin PIN, la tarjeta se abre como siempre */
  let fPin = await db.query(`select ficha_publica($1) as f`, [pinToken]);
  ok(fPin.rows[0].f?.estado === 'abierta', 'Sin PIN, la tarjeta se abre con el enlace');

  /* Un PIN fuera de 4-6 cifras no entra */
  let corto = false;
  try {
    await db.query(`select pin_poner($1, '12')`, [pinToken]);
  } catch {
    corto = true;
  }
  ok(corto, 'Se rechaza un PIN de menos de cuatro cifras');

  /* Se pone el PIN */
  const puesto = await db.query(`select pin_poner($1, '4821') as ok`, [pinToken]);
  fPin = await db.query(`select ficha_publica($1) as f`, [pinToken]);
  ok(puesto.rows[0].ok === true, 'pin_poner() guarda el PIN');
  ok(
    fPin.rows[0].f?.estado === 'denegada' && !fPin.rows[0].f?.cliente,
    'Con PIN, el enlace solo no devuelve ningún dato',
  );

  /* El PIN guardado no es el PIN: es un hash bcrypt */
  const guardado = await db.query(`select hash from clientes_pin where cliente_id = $1`, [clienteId]);
  ok(
    /^\$2[aby]\$/.test(guardado.rows[0].hash) && !guardado.rows[0].hash.includes('4821'),
    'El PIN se guarda cifrado, nunca en claro',
  );

  /* Un PIN equivocado no abre; el bueno sí */
  const malo = await db.query(`select ficha_publica($1, '0000') as f`, [pinToken]);
  const bueno = await db.query(`select ficha_publica($1, '4821') as f`, [pinToken]);
  ok(malo.rows[0].f?.estado === 'denegada', 'Un PIN equivocado no abre la tarjeta');
  ok(
    bueno.rows[0].f?.estado === 'abierta' && bueno.rows[0].f?.cliente?.nombre === 'Cliente Uno',
    'El PIN correcto abre la tarjeta',
  );

  /* Las acciones de la tarjeta también lo piden */
  const sinPinActualizar = await db.query(
    `select actualizar_mis_datos($1, '699000000', null, null, null) as ok`,
    [pinToken],
  );
  const conPinActualizar = await db.query(
    `select actualizar_mis_datos($1, '699000000', null, null, null, '4821') as ok`,
    [pinToken],
  );
  ok(
    sinPinActualizar.rows[0].ok === false && conPinActualizar.rows[0].ok === true,
    'Editar los datos exige el PIN',
  );

  /* Cinco fallos seguidos bloquean quince minutos */
  for (let i = 0; i < 5; i++) {
    await db.query(`select ficha_publica($1, '0000') as f`, [pinToken]);
  }
  const bloqueada = await db.query(`select ficha_publica($1, '4821') as f`, [pinToken]);
  ok(bloqueada.rows[0].f?.estado === 'bloqueada', 'Cinco fallos bloquean la tarjeta, aun con el PIN bueno');

  /* El barbero ve que hay PIN y puede quitarlo, pero no leerlo */
  const estadoBarbero = await db.query(`select pin_barbero_estado($1) as e`, [clienteId]);
  const quitado = await db.query(`select pin_barbero_quitar($1) as q`, [clienteId]);
  const trasQuitar = await db.query(`select ficha_publica($1) as f`, [pinToken]);
  ok(estadoBarbero.rows[0].e === true, 'El barbero ve que la tarjeta está protegida');
  ok(quitado.rows[0].q === true && trasQuitar.rows[0].f?.estado === 'abierta',
     'Y puede quitar el PIN; la tarjeta vuelve a abrirse con el enlace');

  /* Un barbero de otro local no toca esta tarjeta */
  const otroDueno = '22222222-2222-2222-2222-222222222222';
  await db.query(`insert into auth.users (id) values ($1)`, [otroDueno]);
  await db.query(`select set_config('test.uid', $1, false)`, [otroDueno]);
  await db.query(`select crear_local('Barbería Otra', 'barberia-otra')`);
  await db.query(`select pin_poner($1, '1357')`, [pinToken]); // sin PIN previo: cualquiera con el enlace
  const ajeno = await db.query(`select pin_barbero_quitar($1) as q, pin_barbero_estado($1) as e`, [clienteId]);
  ok(ajeno.rows[0].q === false && ajeno.rows[0].e === false, 'Otro local no puede tocar el PIN de esta tarjeta');

  /* ------------------------------------------------------------------ */
  /* El llavero traduce a la tarjeta                                    */
  /* ------------------------------------------------------------------ */

  const puente = await db.query(`select llavero_tarjeta('tok_uno') as t`);
  ok(
    puente.rows[0].t === cliente.rows[0].token_publico,
    'El llavero devuelve el token público de su cliente',
  );

  await db.query(
    `insert into llaveros (barberia_id, token, codigo_corto) values ($1, 'tok_blanco', 'PBL-0900')`,
    [barberiaId],
  );
  const enBlanco = await db.query(`select llavero_tarjeta('tok_blanco') as t`);
  ok(enBlanco.rows[0].t === null, 'Un llavero en blanco no devuelve tarjeta');

  await db.query(
    `insert into llaveros (barberia_id, token, codigo_corto) values ($1, 'tok_retirado', 'PBL-0901')`,
    [barberiaId],
  );
  await db.query(
    `update llaveros set estado = 'activo', cliente_id = $1, asignado_en = now() where token = 'tok_retirado'`,
    [clienteId],
  );
  await db.query(`update llaveros set estado = 'retirado' where token = 'tok_retirado'`);
  const retirado = await db.query(`select llavero_tarjeta('tok_retirado') as t`);
  ok(retirado.rows[0].t === null, 'Un llavero retirado ya no abre ninguna tarjeta');

  const inventado = await db.query(`select llavero_tarjeta('no_existe') as t`);
  ok(inventado.rows[0].t === null, 'Un token inventado no devuelve nada');

  const permiso = await db.query(
    `select has_function_privilege('anon', 'public.llavero_tarjeta(text)', 'execute') as p`,
  );
  ok(permiso.rows[0].p === true, 'El público anónimo puede llamarla');

  /* ------------------------------------------------------------------ */
  /* El tipo de negocio                                                 */
  /* ------------------------------------------------------------------ */

  const tipoPaco = await db.query(`select tipo from barberias where slug = 'barberia-paco'`);
  ok(tipoPaco.rows[0].tipo === 'barberia', 'Sin decir el tipo, el local nace barbería');

  const dueno3 = '33333333-3333-3333-3333-333333333333';
  await db.query(`insert into auth.users (id) values ($1)`, [dueno3]);
  await db.query(`select set_config('test.uid', $1, false)`, [dueno3]);

  const unas = await db.query(`select crear_local('Salón Luna', 'salon-luna', null, 'unas') as id`);
  const salonId = unas.rows[0].id;
  const semilla = await db.query(
    `select
       (select tipo from barberias where id = $1) as tipo,
       (select nombre from sillas where barberia_id = $1 order by orden limit 1) as puesto,
       (select string_agg(nombre, ' · ' order by orden) from servicios where barberia_id = $1) as servicios`,
    [salonId],
  );
  const sem = semilla.rows[0];
  ok(sem.tipo === 'unas', 'El local nace con el tipo elegido');
  ok(sem.puesto === 'Mesa 1', 'Y su primer puesto se llama Mesa', sem.puesto);
  ok(
    /Manicura/.test(sem.servicios) && !/Corte \+ barba/.test(sem.servicios),
    'Los servicios de partida son los del sector',
    sem.servicios,
  );

  // El administrador puede cambiarlo después.
  await db.query(`insert into admins (user_id) values ($1)`, [dueno]);
  await db.query(`select set_config('test.uid', $1, false)`, [dueno]);
  const cambiado = await db.query(`select cambiar_tipo_local($1, 'tatuaje') as ok`, [salonId]);
  const tipoNuevo = await db.query(`select tipo from barberias where id = $1`, [salonId]);
  ok(cambiado.rows[0].ok === true && tipoNuevo.rows[0].tipo === 'tatuaje',
     'El administrador cambia el tipo de un local');

  // Y el público lo ve.
  const publico = await db.query(`select local_publico('salon-luna') as l`);
  ok(publico.rows[0].l?.tipo === 'tatuaje', 'El tipo sale en el local público');

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
