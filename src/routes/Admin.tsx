import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Store } from 'lucide-react';
import { haySupabase, supabase } from '../lib/supabase';
import { useDb } from '../lib/store';
import { fmtEuros } from '../lib/format';
import { Salir } from '../components/Salir';
import { TIPOS, vocabulario } from '../lib/vocabulario';
import type { TipoNegocio } from '../lib/types';
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
const CUOTA_MAXIMA = 40;

interface LocalAdmin {
  id: string;
  nombre: string;
  slug: string;
  clientes: number;
  llaveros: number;
  activos: number;
  email: string | null;
  activo: boolean;
  tipo: TipoNegocio;
  estadoCobro: string;
  proximoPago: string | null;
}

function slugDe(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function Admin() {
  const db = useDb();
  const navegar = useNavigate();
  const [locales, setLocales] = useState<LocalAdmin[] | null>(null);
  const [peticiones, setPeticiones] = useState<
    {
      id: string;
      creada_en: string;
      clientes: { nombre: string; codigo: string } | null;
      barberias: { nombre: string } | null;
    }[]
  >([]);
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: '',
    color: '#3E4A35',
    tipo: 'barberia' as TipoNegocio,
    domicilio: '',
    correoLegal: '',
  });

  const cargar = useCallback(async () => {
    if (!haySupabase) {
      setLocales(
        db.barberias.map((b) => ({
          id: b.id,
          nombre: b.nombre,
          slug: b.slug,
          clientes: db.clientes.filter((c) => c.barberiaId === b.id).length,
          llaveros: db.llaveros.filter((l) => l.barberiaId === b.id).length,
          activos: db.llaveros.filter((l) => l.barberiaId === b.id && l.estado === 'activo').length,
          email: null,
          activo: true,
          tipo: b.tipo,
          estadoCobro: 'al_dia',
          proximoPago: null,
        })),
      );
      return;
    }

    const sb = supabase!;

    const pet = await sb
      .from('peticiones_admin')
      .select('id, creada_en, clientes(nombre, codigo), barberias(nombre)')
      .eq('estado', 'pendiente')
      .order('creada_en');
    setPeticiones((pet.data ?? []) as unknown as typeof peticiones);

    const [loc, lla, cli] = await Promise.all([
      sb.rpc('admin_locales'),
      sb.from('llaveros').select('barberia_id, estado'),
      sb.from('clientes').select('id, barberia_id'),
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
      email: string | null;
      activo: boolean;
      tipo: TipoNegocio;
      estado_cobro: string;
      proximo_pago: string | null;
    };
    setLocales(
      ((loc.data ?? []) as FilaLocal[]).map((b) => {
        const suyos = (lla.data ?? []).filter((l) => l.barberia_id === b.id);
        return {
          id: b.id,
          nombre: b.nombre,
          slug: b.slug,
          clientes: (cli.data ?? []).filter((c) => c.barberia_id === b.id).length,
          llaveros: suyos.length,
          activos: suyos.filter((l) => l.estado === 'activo').length,
          email: b.email,
          activo: b.activo,
          tipo: b.tipo ?? 'barberia',
          estadoCobro: b.estado_cobro ?? 'al_dia',
          proximoPago: b.proximo_pago,
        };
      }),
    );
  }, [db]);

  useEffect(() => {
    if (!haySupabase) {
      void cargar();
      return;
    }
    void (async () => {
      // Sin sesión no es «no eres administrador»: es que hay que entrar por
      // esta puerta, y al volver tiene que caer aquí, no en la cola.
      const { data: sesion } = await supabase!.auth.getSession();
      if (!sesion.session) {
        navegar('/barbero/login?rol=admin&next=%2Fadmin', { replace: true });
        return;
      }
      const { data } = await supabase!.rpc('soy_admin');
      if (data !== true) {
        navegar('/barbero/cola', { replace: true });
        return;
      }
      await cargar();
    })();
  }, [cargar, navegar]);

  const totalActivos = (locales ?? []).reduce((s, l) => s + l.activos, 0);
  const totalLlaveros = (locales ?? []).reduce((s, l) => s + l.llaveros, 0);
  const libres = totalLlaveros - totalActivos;
  const facturacion = (locales ?? []).reduce(
    (s, l) => s + Math.min(CUOTA_MAXIMA, Math.max(CUOTA_MINIMA, l.activos)),
    0,
  );

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
        p_tipo: form.tipo,
        p_domicilio_legal: form.domicilio.trim(),
        p_correo_legal: form.correoLegal.trim(),
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
      setForm({
        nombre: '',
        email: '',
        password: '',
        color: '#3E4A35',
        tipo: 'barberia',
        domicilio: '',
        correoLegal: '',
      });
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  const resolverPeticion = async (id: string, accion: 'retirar' | 'descartar') => {
    const { error } = await supabase!.rpc('resolver_peticion_admin', {
      p_id: id,
      p_accion: accion,
      p_nota: '',
    });
    if (error) {
      toast(error.message, 'aviso');
      return;
    }
    toast(accion === 'retirar' ? 'Llavero retirado' : 'Petición descartada', 'ok');
    await cargar();
  };

  const revisarCobros = async () => {
    if (!haySupabase) {
      toast('La demo no tiene cobros', 'info');
      return;
    }
    const { error } = await supabase!.rpc('revisar_cobros');
    if (error) {
      toast(error.message, 'aviso');
      return;
    }
    toast('Cobros revisados', 'ok');
    await cargar();
  };

  return (
    <div className="grain min-h-dvh bg-ivory">
      <header className="bg-ink px-5 pb-6 pt-5 text-ivory">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-ivory/80">
              Julex
            </span>
            <div className="flex items-center gap-3">
              {!haySupabase && <Pill tono="warn">Demo</Pill>}
              <Salir a="/" tono="oscuro" />
            </div>
          </div>
          <h1 className="mt-6 font-serif text-[26px] leading-tight text-ivory">
            Panel del administrador
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat valor={locales?.length ?? 0} etiqueta="Locales" />
          <Stat valor={totalActivos} etiqueta="Llaveros activos" nota={`de ${totalLlaveros}`} />
          <Stat valor={Math.max(0, libres)} etiqueta="Sin asignar" />
          <Stat valor={fmtEuros(facturacion)} etiqueta="Cuota mensual" nota="Suma de mínimos" />
        </section>

        <Rule className="my-7" />

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
                <Field label="Tipo de negocio" hint="cambia el vocabulario y los servicios de partida">
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoNegocio }))}
                    className={inputClases}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.tipo} value={t.tipo}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Domicilio legal" hint="lo que se publica en su página legal; vale solo la ciudad">
                  <input
                    value={form.domicilio}
                    onChange={(e) => setForm((f) => ({ ...f, domicilio: e.target.value }))}
                    className={inputClases}
                    placeholder="Alicante"
                  />
                </Field>

                <Field label="Correo legal" hint="para derechos y reclamaciones de ese local">
                  <input
                    value={form.correoLegal}
                    onChange={(e) => setForm((f) => ({ ...f, correoLegal: e.target.value }))}
                    className={inputClases}
                    inputMode="email"
                    placeholder="hola@ellocal.com"
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
              {form.nombre.trim() && (
                <p className="mt-2 text-[11px] text-muted">
                  Su dirección será{' '}
                  <span className="num font-semibold text-ink">/cita/{slugDe(form.nombre)}</span>
                </p>
              )}
              <Btn
                v="primary"
                t="md"
                className="mt-3 w-full"
                onClick={() => void crearLocal()}
                disabled={
                  ocupado || !form.nombre.trim() || !form.email.trim() || form.password.length < 6
                }
              >
                <Plus size={13} /> {ocupado ? 'Creando…' : 'Crear local y su barbero'}
              </Btn>
              <p className="mt-2 text-[10.5px] text-faint">
                Se crea la barbería con su cuenta, sus tres servicios, su horario y su primera silla.
              </p>
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10.5px] leading-relaxed text-faint">
              El barrido de cobros corre solo cada día a las 6:00.
            </p>
            <button
              onClick={() => void revisarCobros()}
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-ink"
            >
              Revisar cobros ahora
            </button>
          </div>

          {peticiones.length > 0 && (
            <section className="mb-5">
              <div className="flex items-baseline justify-between">
                <Eyebrow>Bajas pedidas por los locales</Eyebrow>
                <span className="num text-[11px] text-faint">{peticiones.length}</span>
              </div>
              <ul className="mt-2 divide-y divide-line-soft rounded-[3px] border border-line bg-paper px-3.5">
                {peticiones.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">
                        {p.clientes?.nombre ?? 'Cliente'}{' '}
                        <span className="num text-[10.5px] font-normal text-faint">
                          {p.clientes?.codigo}
                        </span>
                      </p>
                      <p className="text-[10.5px] text-muted">
                        {p.barberias?.nombre} · {new Date(p.creada_en).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Btn t="sm" onClick={() => void resolverPeticion(p.id, 'retirar')}>
                        Retirar llavero
                      </Btn>
                      <Btn v="quiet" t="sm" onClick={() => void resolverPeticion(p.id, 'descartar')}>
                        Descartar
                      </Btn>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-3 overflow-hidden rounded-[4px] border border-line">
            {(locales ?? []).map((l) => {
              const cuota = Math.min(CUOTA_MAXIMA, Math.max(CUOTA_MINIMA, l.activos));
              return (
                <Link
                  key={l.id}
                  to={`/admin/local/${l.id}`}
                  className="flex items-center gap-3 border-b border-line-soft bg-paper px-3.5 py-3.5 last:border-0 transition-colors hover:bg-paper-2"
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[2px] border border-line bg-ivory text-[var(--brand)]">
                    <Store size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-serif text-[16px] leading-tight text-ink">
                      {l.nombre}
                      {!l.activo && <Pill tono="danger">bloqueado</Pill>}
                      {l.estadoCobro === 'pendiente' && <Pill tono="warn">pago</Pill>}
                      {l.estadoCobro === 'lectura' && <Pill tono="warn">solo lectura</Pill>}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      /{l.slug} · {l.clientes} clientes · {l.llaveros} llaveros
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-[13px] font-semibold text-ink">{fmtEuros(cuota)}</p>
                    <p className="text-[10px] text-faint">
                      {l.activos < CUOTA_MINIMA
                        ? `mínimo (${l.activos})`
                        : l.activos >= CUOTA_MAXIMA
                          ? `tope (${l.activos})`
                          : `${l.activos} activos`}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-faint" />
                </Link>
              );
            })}
            {locales?.length === 0 && (
              <p className="bg-paper px-3 py-4 text-[12px] text-muted">Todavía no hay locales.</p>
            )}
          </div>
        </section>

        <div className={cn('mt-8 rounded-[4px] border border-line bg-paper px-4 py-3.5')}>
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
