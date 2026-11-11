import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Nfc, Plus, Search } from 'lucide-react';
import { haySupabase, supabase } from '../lib/supabase';
import { fmtEuros } from '../lib/format';
import { Salir } from '../components/Salir';
import { CodigoQr } from '../components/CodigoQr';
import { TIPOS, vocabulario } from '../lib/vocabulario';
import type { TipoNegocio } from '../lib/types';
import {
  Btn,
  Eyebrow,
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

interface FilaLlavero {
  id: string;
  codigo_corto: string;
  token: string;
  lote: string;
  estado: 'sin_asignar' | 'activo' | 'retirado';
  cliente_id: string | null;
}

interface CuentaLocal {
  id: string;
  nombre: string;
  slug: string;
  barbero_id: string | null;
  email: string | null;
  activo: boolean;
  tipo: TipoNegocio;
  estado_cobro: string;
  proximo_pago: string | null;
  nota_cobro: string;
  suspension_manual: boolean;
  material_pendiente: number;
  material_llaveros: number;
  direccion_envio: string;
  cp_envio: string;
  ciudad_envio: string;
  provincia_envio: string;
  telefono_contacto: string;
}

type Filtro = 'todos' | 'activos' | 'libres' | 'retirados';

export default function AdminLocal() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [local, setLocal] = useState<CuentaLocal | null>(null);
  const [llaveros, setLlaveros] = useState<FilaLlavero[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [clientes, setClientes] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [correo, setCorreo] = useState('');
  const [notaCobro, setNotaCobro] = useState('');
  const [clave, setClave] = useState('');

  const cargar = useCallback(async () => {
    if (!haySupabase || !id) return;
    const sb = supabase!;

    const { data: esAdmin } = await sb.rpc('soy_admin');
    if (esAdmin !== true) {
      navegar('/barbero/cola', { replace: true });
      return;
    }

    const [loc, lla, cli] = await Promise.all([
      sb.rpc('admin_locales'),
      sb
        .from('llaveros')
        .select('id, codigo_corto, token, lote, estado, cliente_id')
        .eq('barberia_id', id)
        .order('creado_en'),
      sb.from('clientes').select('id, nombre').eq('barberia_id', id),
    ]);

    const fila = ((loc.data ?? []) as CuentaLocal[]).find((x) => x.id === id) ?? null;
    setLocal(fila);
    if (fila) setCorreo(fila.email ?? '');

    const mapa: Record<string, string> = {};
    for (const c of cli.data ?? []) mapa[c.id as string] = c.nombre as string;
    setNombres(mapa);
    setClientes((cli.data ?? []).length);
    setLlaveros((lla.data ?? []) as FilaLlavero[]);
  }, [id, navegar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accionCobro = async (funcion: string, args: Record<string, unknown>) => {
    if (!haySupabase || !local) return;
    setOcupado(true);
    try {
      const { error } = await supabase!.rpc(funcion, args);
      if (error) throw new Error(error.message);
      toast(funcion === 'marcar_pagado' ? 'Mes marcado como pagado' : 'Local suspendido', 'ok');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo', 'aviso');
    } finally {
      setOcupado(false);
    }
  };

  const cambiarTipo = async (tipo: TipoNegocio) => {
    if (!haySupabase || !local) return;
    setOcupado(true);
    try {
      const { error } = await supabase!.rpc('cambiar_tipo_local', {
        p_barberia: local.id,
        p_tipo: tipo,
      });
      if (error) throw error;
      setLocal({ ...local, tipo });
      toast(`Ahora es ${vocabulario(tipo).etiqueta}`, 'ok');
    } catch {
      toast('No se pudo cambiar el tipo', 'aviso');
    } finally {
      setOcupado(false);
    }
  };

  const activos = llaveros.filter((l) => l.estado === 'activo');
  const libres = llaveros.filter((l) => l.estado === 'sin_asignar');
  const retirados = llaveros.filter((l) => l.estado === 'retirado');
  const cuota = Math.min(CUOTA_MAXIMA, Math.max(CUOTA_MINIMA, activos.length));

  const lista = useMemo(() => {
    const base =
      filtro === 'activos'
        ? activos
        : filtro === 'libres'
          ? libres
          : filtro === 'retirados'
            ? retirados
            : llaveros;
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((l) => {
      const dueno = l.cliente_id ? nombres[l.cliente_id] ?? '' : '';
      return `${l.codigo_corto} ${l.lote} ${dueno}`.toLowerCase().includes(t);
    });
  }, [llaveros, activos, libres, retirados, filtro, q, nombres]);

  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/nfc/${token}`);
      toast('URL del chip copiada', 'ok');
    } catch {
      toast('No se pudo copiar', 'aviso');
    }
  };

  const accion = async (
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

  const anadir = async (cantidad: number) => {
    if (!haySupabase || ocupado || !local) return;
    if (cantidad < 5) {
      toast('Los pedidos de llaveros van de 5 en 5 como mínimo', 'aviso');
      return;
    }
    setOcupado(true);
    try {
      const { data, error } = await supabase!.rpc('crear_lote_admin', {
        p_barberia: local.id,
        p_cantidad: cantidad,
        p_lote: '',
      });
      if (error) {
        toast('No se pudo crear el lote', 'aviso');
        return;
      }
      toast(`${data} llaveros añadidos`, 'ok');
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  if (!local) {
    return (
      <div className="grain min-h-dvh bg-ivory">
        <div className="mx-auto w-full max-w-3xl px-5 py-10">
          <div className="flex items-center justify-between">
            <Link to="/admin" className="text-[11px] font-semibold text-muted hover:text-ink">
              ← Volver
            </Link>
            <Salir a="/" />
          </div>
          <p className="mt-4 text-[13px] text-muted">Local no encontrado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grain min-h-dvh bg-ivory">
      <header className="bg-ink px-5 pb-6 pt-5 text-ivory">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ivory/50 hover:text-ivory"
            >
              <ArrowLeft size={12} /> Panel
            </Link>
            <Salir a="/" tono="oscuro" />
          </div>
          <h1 className="mt-4 font-serif text-[25px] leading-tight text-ivory">{local.nombre}</h1>
          <p className="mt-1 text-[11.5px] text-ivory/50">
            /{local.slug} · {vocabulario(local.tipo).etiqueta}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <section className="grid grid-cols-3 gap-x-4">
          <Stat valor={clientes} etiqueta="Clientes" />
          <Stat valor={activos.length} etiqueta="Activos" nota={`de ${llaveros.length}`} />
          <Stat valor={fmtEuros(cuota)} etiqueta="Cuota" />
        </section>

        <Rule className="my-6" />

        {/* TIPO DE NEGOCIO */}
        <section>
          <Eyebrow>Tipo de negocio</Eyebrow>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Cambia el vocabulario del local —la cola, los puestos, la ficha— y los valores con los que
            nació. No toca sus servicios ni sus datos.
          </p>
          <select
            value={local.tipo}
            disabled={ocupado}
            onChange={(e) => void cambiarTipo(e.target.value as TipoNegocio)}
            className={`${inputClases} mt-2`}
          >
            {TIPOS.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </section>

        <Rule className="my-6" />

        {/* QR DE RESERVAS: uno por local, nada personal */}
        <section>
          <CodigoQr
            url={`${window.location.origin}/cita/${local.slug}`}
            nombreFichero={`julex-${local.slug}-reservas`}
          />
        </section>

        <Rule className="my-6" />

        {/* ENVÍO */}
        {(local.direccion_envio || local.ciudad_envio) && (
          <>
            <section>
              <Eyebrow>Envío</Eyebrow>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
                {local.direccion_envio}
                <br />
                {[local.cp_envio, local.ciudad_envio, local.provincia_envio].filter(Boolean).join(' · ')}
                {local.telefono_contacto ? ` · ${local.telefono_contacto}` : ''}
              </p>
              <p className="mt-1 text-[10.5px] text-faint">
                Los llaveros de esta alta salen de aquí.
              </p>
            </section>
            <Rule className="my-6" />
          </>
        )}

        {/* COBRO */}
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>Cobro</Eyebrow>
            <Pill
              tono={
                local.estado_cobro === 'al_dia'
                  ? 'ok'
                  : local.estado_cobro === 'suspendido'
                    ? 'danger'
                    : 'warn'
              }
            >
              {local.estado_cobro === 'al_dia'
                ? 'AL DÍA'
                : local.estado_cobro === 'pendiente'
                  ? 'PENDIENTE'
                  : local.estado_cobro === 'lectura'
                    ? 'SOLO LECTURA'
                    : 'SUSPENDIDO'}
            </Pill>
          </div>

          <div className="mt-2 grid gap-1.5 text-[11.5px] text-muted">
            <p>
              Próximo pago:{' '}
              <span className="text-ink-soft">
                {local.proximo_pago
                  ? new Date(`${local.proximo_pago}T12:00:00`).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'sin fecha: el barrido no lo toca'}
              </span>
            </p>
            {local.nota_cobro && <p>Nota: {local.nota_cobro}</p>}
            {local.suspension_manual && <p className="text-clay">Suspendido a mano.</p>}
            <p>
              Cuota:{' '}
              <span className="text-ink-soft">
                {fmtEuros(Math.min(CUOTA_MAXIMA, Math.max(CUOTA_MINIMA, activos.length)))}
                {activos.length >= CUOTA_MAXIMA ? ' (tope)' : ''}
              </span>
            </p>
            <p>
              Material pendiente:{' '}
              <span className={local.material_pendiente > 0 ? 'text-clay' : 'text-ink-soft'}>
                {fmtEuros(Number(local.material_pendiente))}
                {local.material_llaveros > 0 ? ` · ${local.material_llaveros} llaveros` : ''}
              </span>
            </p>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Btn t="sm" onClick={() => void accionCobro('marcar_pagado', { p_local: local.id })}>
              Marcar mes pagado
            </Btn>
            <input
              value={notaCobro}
              onChange={(e) => setNotaCobro(e.target.value)}
              placeholder="motivo de la suspensión"
              className={cn(inputClases, 'h-8 w-44 text-[11.5px]')}
            />
            <Btn
              v="quiet"
              t="sm"
              onClick={() => void accionCobro('marcar_material_cobrado', { p_local: local.id })}
            >
              Marcar material cobrado
            </Btn>
            <Btn
              v="outline"
              t="sm"
              onClick={() =>
                void accionCobro('suspender_local', {
                  p_local: local.id,
                  p_nota: notaCobro.trim() || 'Suspendido por impago',
                })
              }
            >
              Suspender
            </Btn>
          </div>
        </section>

        <Rule className="my-6" />

        {/* CUENTA */}
        <section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Cuenta del barbero</Eyebrow>
            <Pill tono={local.activo ? 'ok' : 'danger'}>
              {local.activo ? 'con acceso' : 'bloqueado'}
            </Pill>
          </div>

          {!local.barbero_id ? (
            <p className="mt-2 text-[12px] text-muted">Este local no tiene cuenta asociada.</p>
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
                  disabled={ocupado || correo.trim() === (local.email ?? '')}
                  onClick={() =>
                    void accion(
                      'admin_cambiar_email',
                      { p_usuario: local.barbero_id, p_email: correo.trim() },
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
                    void accion(
                      'admin_cambiar_password',
                      { p_usuario: local.barbero_id, p_password: clave },
                      'Contraseña cambiada',
                    )
                  }
                >
                  Guardar
                </Btn>
              </div>

              <div className="sm:col-span-2">
                <Btn
                  v={local.activo ? 'quiet' : 'outline'}
                  t="sm"
                  disabled={ocupado}
                  onClick={() =>
                    void accion(
                      'admin_activar',
                      { p_usuario: local.barbero_id, p_activo: !local.activo },
                      local.activo ? 'Acceso bloqueado' : 'Acceso devuelto',
                    )
                  }
                >
                  {local.activo ? 'Bloquear acceso' : 'Devolver acceso'}
                </Btn>
              </div>
            </div>
          )}
        </section>

        <Rule className="my-6" />

        {/* LLAVEROS */}
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
                ['todos', 'Todos', llaveros.length],
                ['activos', 'Con dueño', activos.length],
                ['libres', 'Sin asignar', libres.length],
                ['retirados', 'Retirados', retirados.length],
              ] as [Filtro, string, number][]
            ).map(([f, etiqueta, n]) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors',
                  filtro === f
                    ? 'border-ink bg-ink text-ivory'
                    : 'border-line text-muted hover:border-ink/30 hover:text-ink',
                )}
              >
                {etiqueta}
                <span className={cn('num', filtro === f ? 'text-ivory/60' : 'text-faint')}>{n}</span>
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
              placeholder="Buscar por código, lote o cliente"
              className={cn(inputClases, 'pl-9')}
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-[4px] border border-line">
            {lista.slice(0, 200).map((l) => {
              const dueno = l.cliente_id ? nombres[l.cliente_id] : null;
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
                      <p className="num text-[12px] font-semibold text-ink">{l.codigo_corto}</p>
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
                          <span className="text-faint"> · lote {l.lote}</span>
                        </>
                      ) : (
                        <span className="text-faint">sin asignar · lote {l.lote}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => copiar(l.token)}
                      aria-label={`Copiar URL de ${l.codigo_corto}`}
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

          <div className="mt-3 flex flex-wrap gap-2">
            <Btn v="outline" t="md" onClick={() => void anadir(15)} disabled={ocupado}>
              <Plus size={13} /> 15 llaveros
            </Btn>
            <Btn v="quiet" t="md" onClick={() => void anadir(5)} disabled={ocupado}>
              <Plus size={13} /> 5 llaveros
            </Btn>
            <Link to={`/cita/${local.slug}`} className={btnClases('quiet', 'md')}>
              Ver reservas
            </Link>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            Mínimo 5 llaveros por pedido. A partir del llavero 41, cada uno se cobra a 1 € una sola
            vez.
          </p>
        </section>
      </div>
    </div>
  );
}
