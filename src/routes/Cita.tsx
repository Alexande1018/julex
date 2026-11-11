import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, MapPin, Phone } from 'lucide-react';
import {
  cargarDestinoReserva,
  huecosPublicos,
  pedirCita,
  type LocalPublico,
} from '../lib/publico';
import {
  addDays,
  etiquetaDia,
  fmtDuracion,
  fmtEuros,
  fmtHora,
  mismoDia,
  primerNombre,
  startOfDay,
} from '../lib/format';
import { Btn, Check as CheckBox, Eyebrow, Pill, Rule, cn, inputClases, toast } from '../components/ui';
import { Logotipo } from '../components/Logotipo';
import { Salir } from '../components/Salir';

interface Destino {
  local: LocalPublico;
  cliente: string | null;
  token: string | null;
}

export default function Cita() {
  const { token, slug } = useParams();
  const navegar = useNavigate();

  const [destino, setDestino] = useState<Destino | null>(null);
  const [cargando, setCargando] = useState(true);
  const [servicioId, setServicioId] = useState('');
  const [dia, setDia] = useState<Date>(startOfDay(new Date()));
  const [hora, setHora] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [hecho, setHecho] = useState<{ dia: Date; hora: string } | null>(null);
  const [huecos, setHuecos] = useState<string[]>([]);
  const [cargandoHuecos, setCargandoHuecos] = useState(false);

  /* Quién reserva: el local, y el cliente si viene de su tarjeta. */
  useEffect(() => {
    let vivo = true;
    cargarDestinoReserva(token, slug)
      .then((d) => {
        if (!vivo) return;
        setDestino(d);
        if (d) {
          setServicioId(d.local.servicios[0]?.id ?? '');
          setNombre(d.cliente ?? '');
          setAcepta(!!d.cliente);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [token, slug]);

  const local = destino?.local ?? null;
  const servicios = local?.servicios ?? [];
  const servicio = servicios.find((s) => s.id === servicioId) ?? servicios[0];
  const cliente = destino?.cliente
    ? { nombre: destino.cliente, tokenPublico: destino.token }
    : null;
  const dias = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(startOfDay(new Date()), i)), []);

  /* Al entrar, salta al primer día con hueco. */
  useEffect(() => {
    if (!destino) return;
    const primero = destino.local.servicios[0];
    if (!primero) return;
    let vivo = true;
    (async () => {
      for (let i = 0; i < 8; i++) {
        const d = addDays(startOfDay(new Date()), i);
        const libres = await huecosPublicos(destino.local.slug, d, primero.minutos);
        if (!vivo) return;
        if (libres.length > 0) {
          setDia(d);
          return;
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [destino]);

  /* Huecos del día elegido, calculados en el servidor. */
  useEffect(() => {
    if (!destino || !servicio) {
      setHuecos([]);
      return;
    }
    let vivo = true;
    setCargandoHuecos(true);
    huecosPublicos(destino.local.slug, dia, servicio.minutos)
      .then((h) => {
        if (vivo) setHuecos(h);
      })
      .catch(() => {
        if (vivo) setHuecos([]);
      })
      .finally(() => {
        if (vivo) setCargandoHuecos(false);
      });
    return () => {
      vivo = false;
    };
  }, [destino, dia, servicio?.id]);

  if (cargando) {
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center gap-4 bg-ivory">
        <span className="eyebrow">JULEX</span>
        <p className="font-serif text-[19px] text-ink">Buscando huecos…</p>
      </div>
    );
  }

  if (!local) {
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center bg-ivory px-6 text-center">
        <p className="eyebrow">JULEX</p>
        <h1 className="mt-3 font-serif text-[24px] text-ink">Esta barbería no está disponible</h1>
        <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-muted">
          Revisa el enlace o pídele a tu barbería el enlace de reservas actualizado.
        </p>
        <Link to="/" className="mt-5 text-[12px] font-semibold text-ink underline underline-offset-4">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const barberia = local;
  const puedeConfirmar = !!servicio && !!hora && (!!cliente || (!!nombre.trim() && acepta));

  const confirmar = async () => {
    if (!servicio || !hora) return;
    const [h, m] = hora.split(':').map(Number);
    const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m, 0, 0);

    try {
      await pedirCita({
        slug: local.slug,
        servicioId: servicio.id,
        inicio,
        nombre,
        telefono,
        token: destino?.token,
        origen: destino?.token ? 'qr' : 'web',
      });
      setHecho({ dia, hora });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo pedir la cita', 'aviso');
    }
  };

  /* ------------------------- Confirmación ------------------------- */

  if (hecho) {
    return (
      <div className="grain min-h-dvh bg-ivory">
        <div className="mx-auto w-full max-w-md px-5 pb-12 pt-8">
          <div className="flex items-center gap-2.5 border-b border-line-soft pb-4">
            <Logotipo nombre={barberia.nombre} logo={barberia.logo} tamano={26} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
              {barberia.nombre}
            </span>
          </div>

          <div className="mt-7 inline-flex size-9 items-center justify-center rounded-full border border-sage/40 bg-sage/10 text-olive">
            <Check size={17} strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 font-serif text-[27px] leading-tight text-ink">Cita solicitada.</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            {barberia.nombre} te confirmará en breve. Queda guardada como pendiente.
          </p>

          <Rule className="my-6" />

          <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
            <p className="font-serif text-[19px] leading-tight text-ink">{etiquetaDia(dia)}</p>
            <p className="num mt-0.5 text-[15px] text-ink-soft">a las {hora}</p>
            <p className="mt-2 text-[12px] text-muted">
              {servicio?.nombre} · {servicio ? fmtDuracion(servicio.minutos) : ''} ·{' '}
              {servicio ? fmtEuros(servicio.precio) : ''}
            </p>
            <div className="mt-2">
              <Pill tono="warn">Pendiente de confirmar</Pill>
            </div>
          </div>

          {(barberia.direccion || barberia.telefono) && (
            <div className="mt-3 rounded-[4px] border border-line bg-paper px-4 py-3.5">
              <Eyebrow>Dónde</Eyebrow>
              {barberia.direccion && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-ink">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-faint" />
                  {barberia.direccion}
                </p>
              )}
              {barberia.telefono && (
                <a
                  href={`tel:${barberia.telefono.replace(/\s/g, '')}`}
                  className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-soft hover:text-ink"
                >
                  <Phone size={12} className="shrink-0 text-faint" />
                  {barberia.telefono}
                </a>
              )}
            </div>
          )}

          {cliente ? (
            <Link
              to={`/c/${cliente.tokenPublico}`}
              className="mt-5 inline-flex text-[12px] font-semibold text-ink underline underline-offset-4"
            >
              Volver a mi tarjeta
            </Link>
          ) : (
            <p className="mt-5 text-[11.5px] leading-relaxed text-faint">
              Guarda este enlace de la barbería para futuras citas: {barberia.slug}.
            </p>
          )}

          <p className="mt-6 text-[10.5px] leading-relaxed text-faint">
            Demo: la cita se guarda en este navegador. No se envía ningún mensaje de confirmación.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------- Reserva ------------------------- */

  return (
    <div className="grain min-h-dvh bg-ivory" style={{ ['--brand' as string]: barberia.color }}>
      <div className="mx-auto w-full max-w-md px-5 pb-32 pt-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => (cliente ? navegar(`/c/${cliente.tokenPublico}`) : navegar('/'))}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={13} /> Volver
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-faint">JULEX</span>
            <Salir a="/" etiqueta="Cerrar" icono="cerrar" cerrarSesion={false} />
          </div>
        </div>

        <header className="mt-6">
          <div className="flex items-start gap-3.5">
            <Logotipo nombre={barberia.nombre} logo={barberia.logo} tamano={54} />
            <div className="min-w-0 flex-1 pt-0.5">
              <Eyebrow>Pedir cita</Eyebrow>
              <h1 className="mt-1 font-serif text-[24px] leading-[1.1] text-ink">{barberia.nombre}</h1>
              {barberia.direccion && (
                <p className="mt-1 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
                  <MapPin size={11} className="mt-[3px] shrink-0 text-faint" />
                  {barberia.direccion}
                </p>
              )}
            </div>
          </div>

          {cliente && (
            <p className="mt-4 text-[12.5px] text-muted">
              Hola, {primerNombre(cliente.nombre)}. Elige servicio, día y hora.
            </p>
          )}
        </header>

        {/* 1. Servicio */}
        <section className="mt-7">
          <Eyebrow>1 · Servicio</Eyebrow>
          <div className="mt-2 space-y-1.5">
            {servicios.map((s) => {
              const on = servicioId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setServicioId(s.id);
                    setHora('');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-[3px] border px-3.5 py-3 text-left transition-colors',
                    on ? 'border-ink bg-paper' : 'border-line hover:bg-paper',
                  )}
                >
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{s.nombre}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{fmtDuracion(s.minutos)}</span>
                  </span>
                  <span className="num text-[13px] text-ink">{fmtEuros(s.precio)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Día */}
        <section className="mt-6">
          <Eyebrow>2 · Día</Eyebrow>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {dias.map((d) => {
              const on = mismoDia(d, dia);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => {
                    setDia(d);
                    setHora('');
                  }}
                  className={cn(
                    'shrink-0 rounded-[3px] border px-3 py-2 text-center transition-colors',
                    on
                      ? 'border-ink bg-ink text-ivory'
                      : 'border-line text-ink-soft hover:bg-paper',
                  )}
                >
                  <span className="block text-[9px] font-bold uppercase tracking-[0.1em] opacity-70">
                    {d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <span className="num mt-0.5 block text-[14px] font-semibold">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Hora */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <Eyebrow>3 · Hora</Eyebrow>
            <span className="text-[10.5px] text-faint">
              {cargandoHuecos
                ? 'buscando…'
                : huecos.length > 0
                  ? `${huecos.length} huecos libres`
                  : 'sin huecos'}
            </span>
          </div>

          {huecos.length === 0 ? (
            <p className="mt-2 rounded-[3px] border border-dashed border-line px-3.5 py-4 text-[12px] leading-relaxed text-muted">
              No quedan huecos para este servicio ese día. Prueba otro día.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {huecos.map((h) => (
                <button
                  key={h}
                  onClick={() => setHora(h)}
                  className={cn(
                    'num rounded-[3px] border py-2 text-[12.5px] font-semibold transition-colors',
                    hora === h
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-ivory'
                      : 'border-line text-ink-soft hover:border-ink/30 hover:text-ink',
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 4. Datos */}
        {!cliente && (
          <section className="mt-6 space-y-3">
            <Eyebrow>4 · Tus datos</Eyebrow>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellidos"
              className={inputClases}
              autoComplete="name"
            />
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono"
              className={inputClases}
              inputMode="tel"
              autoComplete="tel"
            />
            <CheckBox checked={acepta} onChange={setAcepta}>
              Acepto que la barbería guarde mis datos para gestionar esta cita.{' '}
              <a href="/legal#datos" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Leer
              </a>
            </CheckBox>
          </section>
        )}

        <p className="mt-5 text-[10.5px] leading-relaxed text-faint">
          La cita queda pendiente hasta que la barbería la confirme. No hace falta crear ninguna
          cuenta.
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ivory/95 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium text-ink">
              {servicio?.nombre ?? 'Elige servicio'} · {hora || 'elige hora'}
            </p>
            <p className="text-[10.5px] text-faint">{servicio ? fmtEuros(servicio.precio) : ''}</p>
          </div>
          <Btn t="lg" onClick={() => void confirmar()} disabled={!puedeConfirmar} className="px-5">
            Solicitar cita
          </Btn>
        </div>
      </div>
    </div>
  );
}
