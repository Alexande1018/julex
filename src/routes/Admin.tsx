import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Nfc, Plus, Search, Store } from 'lucide-react';
import { haySupabase, supabase } from '../lib/supabase';
import { useDb } from '../lib/store';
import { fmtEuros, fmtFechaCorta, normaliza } from '../lib/format';
import {
  Btn,
  Eyebrow,
  Field,
  Pill,
  Rule,
  Stat,
  btnClases,
  cn,
  inputClases,
  toast,
} from '../components/ui';

const CUOTA_MINIMA = 15;

/** «Barbería Centro» → barberia-centro (sin acentos). */
function slugDe(texto: string): string {
  return normaliza(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

interface LlaveroAdmin {
  id: string;
  barberiaId: string;
  codigoCorto: string;
  token: string;
  lote: string;
  estado: 'sin_asignar' | 'activo' | 'retirado';
  clienteId: string | null;
}

interface LocalAdmin {
  id: string;
  nombre: string;
  slug: string;
  llaveros: LlaveroAdmin[];
  clientes: number;
  barberoId: string | null;
  email: string | null;
  activo: boolean;
}

type Filtro = 'todos' | 'activos' | 'libres' | 'retirados';

export default function Admin() {
  const db = useDb();
  const navegar = useNavigate();
  const [locales, setLocales] = useState<LocalAdmin[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', color: '#3E4A35' });
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [cuentaAbierta, setCuentaAbierta] = useState<string | null>(null);
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');

  const cargar = useCallback(async () => {
    if (!haySupabase) {
      setLocales(
        db.barberias.map((b) => ({
          id: b.id,
          nombre: b.nombre,
          slug: b.slug,
          clientes: db.clientes.filter((c) => c.barberiaId === b.id).length,
          barberoId: db.barberos.find((x) => x.barberiaId === b.id)?.id ?? null,
          email: null,
          activo: true,
          llaveros: db.llaveros
            .filter((l) => l.barberiaId === b.id)
            .map((l) => ({
              id: l.id,
              barberiaId: l.barberiaId,
              codigoCorto: l.codigoCorto,
              token: l.token,
              lote: l.lote,
              estado: l.estado,
              clienteId: l.clienteId,
            })),
        })),
      );
      return;
    }

    const sb = supabase!;
    const [loc, lla, cli] = await Promise.all([
      sb.rpc('admin_locales'),
      sb.from('llaveros').select('id, barberia_id, codigo_corto, token, lote, estado, cliente_id'),
      sb.from('clientes').select('id, nombre, barberia_id'),
    ]);
    if (loc.error) {
      toast('No se pudieron leer los locales', 'aviso');
      setLocales([]);
      return;
    }
    type FilaLocal = {
      id: string;
      nombre: string;
      slug: string;
      barbero_id: string | null;
      email: string | null;
      activo: boolean;
    };

    const nombresPorId: Record<string, string> = {};
    for (const c of cli.data ?? []) nombresPorId[c.id as string] = c.nombre as string;
    setNombres(nombresPorId);

    const porLocal = new Map<string, LlaveroAdmin[]>();
    for (const l of lla.data ?? []) {
      const clave = l.barberia_id as string;
      if (!porLocal.has(clave)) porLocal.set(clave, []);
      porLocal.get(clave)!.push({
        id: l.id as string,
        barberiaId: clave,
        codigoCorto: l.codigo_corto as string,
        token: l.token as string,
        lote: (l.lote as string) ?? '',
        estado: l.estado as LlaveroAdmin['estado'],
        clienteId: (l.cliente_id as string) ?? null,
      });
    }

    setLocales(
      ((loc.data ?? []) as FilaLocal[]).map((b) => ({
        id: b.id,
        nombre: b.nombre,
        slug: b.slug,
        clientes: (cli.data ?? []).filter((c) => c.barberia_id === b.id).length,
        llaveros: porLocal.get(b.id) ?? [],
        barberoId: b.barbero_id,
        email: b.email,
        activo: b.activo,
      })),
    );
  }, [db]);

  useEffect(() => {
    if (!haySupabase) {
      void cargar();
      return;
    }
    // Esta consola es del administrador. Un barbero tiene su propio panel.
    void (async () => {
      const { data } = await supabase!.rpc('soy_admin');
      if (data !== true) {
        navegar('/barbero/cola', { replace: true });
        return;
      }
      await cargar();
    })();
  }, [cargar, navegar]);

  const todos = useMemo(() => (locales ?? []).flatMap((l) => l.llaveros), [locales]);
  const activos = todos.filter((l) => l.estado === 'activo');
  const libres = todos.filter((l) => l.estado === 'sin_asignar');
  const retirados = todos.filter((l) => l.estado === 'retirado');
  const facturacion = (locales ?? []).reduce((s, l) => {
    const n = l.llaveros.filter((x) => x.estado === 'activo').length;
    return s + Math.max(CUOTA_MINIMA, n);
  }, 0);

  const lista = useMemo(() => {
    const base =
      filtro === 'activos'
        ? activos
        : filtro === 'libres'
          ? libres
          : filtro === 'retirados'
            ? retirados
            : todos;
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((l) => {
      const dueno = l.clienteId ? nombres[l.clienteId] ?? '' : '';
      const local = locales?.find((x) => x.id === l.barberiaId)?.nombre ?? '';
      return `${l.codigoCorto} ${l.lote} ${dueno} ${local}`.toLowerCase().includes(t);
    });
  }, [todos, activos, libres, retirados, filtro, q, nombres, locales]);

  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/nfc/${token}`);
      toast('URL del chip copiada', 'ok');
    } catch {
      toast('No se pudo copiar', 'aviso');
    }
  };

  const crearLocal = async () => {
    if (!haySupabase || ocupado) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase!.rpc('crear_local_admin', {
        p_nombre: form.nombre.trim(),
        p_slug: slugDe(form.nombre),
        p_email: form.email.trim(),
        p_password: form.password,
        p_color: form.color,
      });
      if (error) {
        const m = error.message.includes('email_en_uso')
          ? 'Ese correo ya tiene cuenta'
          : error.message.includes('password_corta')
            ? 'La contraseña necesita 6 caracteres'
            : error.message.includes('solo_admin')
              ? 'Tu cuenta no es de administrador'
              : error.message.slice(0, 60);
        toast(m, 'aviso');
        return;
      }
      const slug = (data as { slug?: string })?.slug ?? '';
      toast(`Local creado · /${slug}`, 'ok');
      setNuevo(false);
      setForm({ nombre: '', email: '', password: '', color: '#3E4A35' });
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  const accionCuenta = async (
    rpc: 'admin_cambiar_password' | 'admin_cambiar_email' | 'admin_activar',
    args: Record<string, unknown>,
    exito: string,
  ) => {
    if (!haySupabase || ocupado) return;
    setOcupado(true);
    try {
      const { error } = await supabase!.rpc(rpc, args);
      if (error) {
        const m = error.message.includes('email_en_uso')
          ? 'Ese correo ya está en uso'
          : error.message.includes('password_corta')
            ? 'La contraseña necesita 6 caracteres'
            : error.message.includes('email_invalido')
              ? 'El correo no es válido'
              : 'No se pudo guardar';
        toast(m, 'aviso');
        return;
      }
      toast(exito, 'ok');
      setClave('');
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  const anadirLlaveros = async (barberiaId: string, cantidad: number, nombre: string) => {
    if (!haySupabase || ocupado) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase!.rpc('crear_lote_admin', {
        p_barberia: barberiaId,
        p_cantidad: cantidad,
        p_lote: '',
      });
      if (error) {
        toast(error.message.includes('solo_admin') ? 'Tu cuenta no es de administrador' : 'No se pudo crear el lote', 'aviso');
        return;
      }
      toast(`${nombre}: ${data} llaveros añadidos`, 'ok');
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="grain min-h-dvh bg-ivory">
      <header className="bg-ink px-5 pb-6 pt-5 text-ivory">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-ivory/80">
              Julex
            </span>
            {!haySupabase && <Pill tono="warn">Demo</Pill>}
          </div>
          <h1 className="mt-6 font-serif text-[26px] leading-tight text-ivory">
            Panel del administrador
          </h1>
          <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-ivory/55">
            Todos los locales, su inventario y lo que se factura. Cada barbería sigue viendo solo la
            suya.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat valor={locales?.length ?? 0} etiqueta="Locales" />
          <Stat valor={activos.length} etiqueta="Llaveros activos" nota={`de ${todos.length}`} />
          <Stat valor={libres.length} etiqueta="Sin asignar" />
          <Stat valor={fmtEuros(facturacion)} etiqueta="Cuota mensual" nota="Suma de mínimos" />
        </section>

        <Rule className="my-7" />

        {/* LOCALES */}
        <section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Locales</Eyebrow>
            <button
              onClick={() => setNuevo((v) => !v)}
              className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
            >
              {nuevo ? 'Cancelar' : 'Nuevo local'}
            </button>
          </div>

          {nuevo && (
            <div className="mt-3 rounded-[4px] border border-line bg-paper px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre del local">
                  <input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Barbería Centro"
                    className={inputClases}
                  />
                </Field>
                <Field label="Correo del barbero">
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="barbero@correo.com"
                    className={inputClases}
                  />
                </Field>
                <Field label="Contraseña inicial">
                  <input
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="mínimo 6 caracteres"
                    className={inputClases}
                  />
                </Field>
                <Field label="Color">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-9 w-full rounded-[2px] border border-line bg-paper"
                  />
                </Field>
              </div>
              <Btn
                v="primary"
                t="md"
                className="mt-3 w-full"
                onClick={() => void crearLocal()}
                disabled={ocupado || !form.nombre.trim() || !form.email.trim() || form.password.length < 6}
              >
                <Plus size={13} /> {ocupado ? 'Creando…' : 'Crear local y su barbero'}
              </Btn>
              <p className="mt-2 text-[10.5px] text-faint">
                Se crea la barbería con su cuenta, sus tres servicios, su horario y su primera silla.
                El barbero entra con ese correo y contraseña; después puede cambiarla.
              </p>
            </div>
          )}

          <div className="mt-3">
            {(locales ?? []).map((l) => {
              const act = l.llaveros.filter((x) => x.estado === 'activo').length;
              const cuota = Math.max(CUOTA_MINIMA, act);
              return (
                <div key={l.id} className="border-b border-line py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-serif text-[16px] leading-tight text-ink">
                        <Store size={12} className="shrink-0 text-faint" />
                        {l.nombre}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        /{l.slug} · {l.clientes} clientes · {l.llaveros.length} llaveros
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-[13px] font-semibold text-ink">{fmtEuros(cuota)}</p>
                      <p className="text-[10px] text-faint">
                        {act < CUOTA_MINIMA ? `mínimo (${act} activos)` : `${act} activos`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Btn
                      v="outline"
                      t="sm"
                      onClick={() => void anadirLlaveros(l.id, 15, l.nombre)}
                      disabled={ocupado || !haySupabase}
                    >
                      <Plus size={12} /> 15 llaveros
                    </Btn>
                    <Btn
                      v="quiet"
                      t="sm"
                      onClick={() => void anadirLlaveros(l.id, 1, l.nombre)}
                      disabled={ocupado || !haySupabase}
                    >
                      +1
                    </Btn>
                    <Link
                      to={`/cita/${l.slug}`}
                      className="text-[10.5px] font-semibold text-muted underline decoration-line underline-offset-4 hover:text-ink"
                    >
                      Ver reservas
                    </Link>
                    <button
                      onClick={() => {
                        setCuentaAbierta(cuentaAbierta === l.id ? null : l.id);
                        setCorreo(l.email ?? '');
                        setClave('');
                      }}
                      className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted underline decoration-line underline-offset-4 hover:text-ink"
                    >
                      Cuenta
                    </button>
                  </div>

                  {cuentaAbierta === l.id && (
                    <div className="mt-2.5 rounded-[4px] border border-line bg-paper px-3.5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted">
                          Acceso: <span className="font-semibold text-ink">{l.email ?? '—'}</span>
                        </p>
                        <Pill tono={l.activo ? 'ok' : 'danger'}>
                          {l.activo ? 'con acceso' : 'bloqueado'}
                        </Pill>
                      </div>

                      {!l.barberoId ? (
                        <p className="mt-2 text-[11px] text-faint">Este local no tiene cuenta asociada.</p>
                      ) : (
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                          <div className="flex gap-1.5">
                            <input
                              value={correo}
                              onChange={(e) => setCorreo(e.target.value)}
                              placeholder="correo@barberia.com"
                              className={cn(inputClases, 'min-w-0 flex-1')}
                            />
                            <Btn
                              v="outline"
                              t="sm"
                              disabled={ocupado || correo.trim() === (l.email ?? '')}
                              onClick={() =>
                                void accionCuenta(
                                  'admin_cambiar_email',
                                  { p_usuario: l.barberoId, p_email: correo.trim() },
                                  'Correo actualizado',
                                )
                              }
                            >
                              Guardar
                            </Btn>
                          </div>

                          <div className="flex gap-1.5">
                            <input
                              value={clave}
                              onChange={(e) => setClave(e.target.value)}
                              placeholder="nueva contraseña"
                              className={cn(inputClases, 'min-w-0 flex-1')}
                            />
                            <Btn
                              v="outline"
                              t="sm"
                              disabled={ocupado || clave.length < 6}
                              onClick={() =>
                                void accionCuenta(
                                  'admin_cambiar_password',
                                  { p_usuario: l.barberoId, p_password: clave },
                                  'Contraseña cambiada',
                                )
                              }
                            >
                              Guardar
                            </Btn>
                          </div>

                          <div className="sm:col-span-2">
                            <Btn
                              v={l.activo ? 'quiet' : 'outline'}
                              t="sm"
                              disabled={ocupado}
                              onClick={() =>
                                void accionCuenta(
                                  'admin_activar',
                                  { p_usuario: l.barberoId, p_activo: !l.activo },
                                  l.activo ? 'Acceso bloqueado' : 'Acceso devuelto',
                                )
                              }
                            >
                              {l.activo ? 'Bloquear acceso' : 'Devolver acceso'}
                            </Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {locales?.length === 0 && (
              <p className="mt-2 text-[12px] text-muted">Todavía no hay locales.</p>
            )}
          </div>
        </section>

        <Rule className="my-7" />

        {/* INVENTARIO */}
        <section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Llaveros</Eyebrow>
            <span className="num text-[11px] text-faint">
              {activos.length} activos · {libres.length} libres · {retirados.length} retirados
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(
              [
                ['todos', 'Todos', todos.length],
                ['activos', 'Con dueño', activos.length],
                ['libres', 'Sin asignar', libres.length],
                ['retirados', 'Retirados', retirados.length],
              ] as [Filtro, string, number][]
            ).map(([id, etiqueta, n]) => (
              <button
                key={id}
                onClick={() => setFiltro(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors',
                  filtro === id
                    ? 'border-ink bg-ink text-ivory'
                    : 'border-line text-muted hover:border-ink/30 hover:text-ink',
                )}
              >
                {etiqueta}
                <span className={cn('num', filtro === id ? 'text-ivory/60' : 'text-faint')}>{n}</span>
              </button>
            ))}
          </div>

          <div className="relative mt-2.5">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código, lote, cliente o local"
              className={cn(inputClases, 'pl-9')}
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-[4px] border border-line">
            {lista.slice(0, 80).map((l) => {
              const dueno = l.clienteId ? nombres[l.clienteId] : null;
              const local = locales?.find((x) => x.id === l.barberiaId)?.nombre ?? '';
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-3 border-b border-line-soft bg-paper px-3 py-2.5 last:border-0"
                >
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-line bg-ivory text-[var(--brand)]">
                    <Nfc size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="num text-[12px] font-semibold text-ink">{l.codigoCorto}</p>
                      <Pill
                        tono={l.estado === 'activo' ? 'ok' : l.estado === 'retirado' ? 'danger' : 'neutral'}
                      >
                        {l.estado === 'activo' ? 'activo' : l.estado === 'retirado' ? 'retirado' : 'libre'}
                      </Pill>
                    </div>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted">
                      {dueno ? (
                        <>
                          <span className="font-semibold text-ink-soft">{dueno}</span>
                          <span className="text-faint"> · {local} · lote {l.lote}</span>
                        </>
                      ) : (
                        <span className="text-faint">
                          {local} · sin asignar · lote {l.lote}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => copiar(l.token)}
                      aria-label={`Copiar URL de ${l.codigoCorto}`}
                      className="rounded-[2px] p-1.5 text-muted hover:bg-paper-2 hover:text-ink"
                    >
                      <Copy size={12} />
                    </button>
                    <a
                      href={`/nfc/${l.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[2px] px-1.5 py-1 text-[10px] font-semibold text-muted hover:text-ink"
                    >
                      Abrir
                    </a>
                  </div>
                </div>
              );
            })}
            {lista.length === 0 && (
              <p className="bg-paper px-3 py-4 text-[12px] text-muted">Nada con ese filtro.</p>
            )}
          </div>
          {lista.length > 80 && (
            <p className="mt-1.5 text-[10.5px] text-faint">
              Mostrando 80 de {lista.length}. Afina con el buscador.
            </p>
          )}
        </section>

        <Rule className="my-7" />

        {/* MENSAJES */}
        <section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Mensajes</Eyebrow>
            <span className="num text-[11px] text-faint">{db.mensajes.length}</span>
          </div>
          {db.mensajes.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted">Todavía no se ha registrado ninguno.</p>
          ) : (
            <ul className="mt-2">
              {db.mensajes
                .slice()
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                .slice(0, 6)
                .map((m) => {
                  const c = db.clientes.find((x) => x.id === m.clienteId);
                  return (
                    <li key={m.id} className="border-b border-line-soft py-2.5 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[12.5px] text-ink">{c?.nombre ?? 'Cliente'}</span>
                        <span className="num shrink-0 text-[10.5px] text-faint">
                          {fmtFechaCorta(m.fecha)}
                        </span>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <div className="mt-8 rounded-[4px] border border-line bg-paper px-4 py-3.5">
          <Eyebrow>Límite de privacidad</Eyebrow>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Esta consola no muestra «cómo corta», notas, historial de visitas, teléfonos completos ni
            ingresos de las barberías. Es logística y facturación.
          </p>
        </div>

        <div className="mt-6">
          <Link to="/" className={btnClases('quiet', 'md')}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
