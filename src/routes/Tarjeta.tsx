import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarPlus, Download, Lock, ShieldCheck, X } from 'lucide-react';
import {
  cancelarCitaPublica,
  cargarFicha,
  guardarMisDatos,
  pedirBaja,
  pinDeSesion,
  ponerPin,
  quitarPin,
  recordarPin,
  type ResultadoFicha,
} from '../lib/publico';
import { Candado } from '../components/Candado';
import { vocabulario } from '../lib/vocabulario';
import {
  etiquetaDia,
  fmtFechaCorta,
  fmtEuros,
  fmtHora,
  primerNombre,
  telefonoBonito,
} from '../lib/format';
import { Sellos } from '../components/Timer';
import { Foto } from '../components/Foto';
import { Logotipo } from '../components/Logotipo';
import { Salir } from '../components/Salir';
import {
  Btn,
  Check,
  Confirmar,
  Eyebrow,
  Pill,
  Rule,
  Sheet,
  cn,
  inputClases,
  toast,
} from '../components/ui';

export default function Tarjeta() {
  const { token } = useParams();
  const [params] = useSearchParams();
  /** Si se llegó tocando un llavero, aquí viaja su token (para volver al entrar). */
  const desdeLlavero = params.get('desde');
  const [pin, setPin] = useState<string | null>(() => (token ? pinDeSesion(token) : null));
  const [ficha, setFicha] = useState<ResultadoFicha | null>(null);
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [preferencias, setPreferencias] = useState('');
  const [clave, setClave] = useState(false);
  const [nuevoPin, setNuevoPin] = useState('');
  const [repetirPin, setRepetirPin] = useState('');

  useEffect(() => {
    if (!token) {
      setCargando(false);
      return;
    }
    let vivo = true;
    setCargando(true);
    cargarFicha(token, pin)
      .then((f) => {
        if (vivo) setFicha(f);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [token, pin]);

  useEffect(() => {
    if (ficha?.estado !== 'abierta') return;
    setTelefono(ficha.cliente.telefono);
    setPreferencias(ficha.cliente.preferencias);
  }, [ficha]);

  const recargar = async () => {
    if (!token) return;
    setFicha(await cargarFicha(token, pin));
  };

  if (cargando) {
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center gap-4 bg-ivory">
        <span className="eyebrow">JULEX</span>
        <p className="font-serif text-[19px] text-ink">Abriendo tu tarjeta…</p>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center bg-ivory px-6 text-center">
        <p className="eyebrow">JULEX</p>
        <h1 className="mt-3 font-serif text-[24px] text-ink">Esta tarjeta no existe</h1>
        <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted">
          El enlace puede estar incompleto o el cliente ya no estar dado de alta en la barbería.
        </p>
        <Link to="/" className="mt-5 text-[12px] font-semibold text-ink underline underline-offset-4">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (ficha.estado !== 'abierta') {
    return (
      <Candado
        token={token ?? ''}
        estado={ficha.estado}
        onAbierto={(p) => {
          if (token) recordarPin(token, p);
          setPin(p);
        }}
      />
    );
  }

  const v = vocabulario(ficha.local.tipo);
  const cliente = ficha.cliente;
  const barberia = ficha.local;
  const citas = ficha.proxima;
  const servicioCita = citas ? { nombre: citas.servicio, precio: citas.precio } : undefined;
  const visitas = ficha.visitas;
  const cortes = ficha.cortes;
  const gastado = ficha.gastado;

  const meta = Math.max(1, barberia.fidelidadMeta);
  const disponibles = ficha.recompensas.disponibles;
  const cicloCompleto = disponibles > 0;
  const fidelidad = {
    meta,
    cortes,
    enCiclo: ficha.ciclo,
    faltan: cicloCompleto ? 0 : meta - (cortes % meta),
    disponibles,
    aplicadas: ficha.recompensas.aplicadas,
    cicloCompleto,
  };

  const cancelarLaCita = async () => {
    if (!token || !citas) return;
    try {
      const hecha = await cancelarCitaPublica(token, citas.id, pin);
      toast(hecha ? 'Cita cancelada' : 'Ya no se puede cancelar desde aquí', hecha ? 'info' : 'aviso');
      await recargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cancelar', 'aviso');
    }
  };

  const guardarDatos = async () => {
    if (!token) return;
    try {
      await guardarMisDatos(
        token,
        {
          telefono,
          preferencias,
          avisos: cliente.consentimientos.avisos,
          marketing: cliente.consentimientos.marketing,
        },
        pin,
      );
      await recargar();
      setDatos(false);
      toast('Datos guardados', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudieron guardar', 'aviso');
    }
  };

  const cambiarConsentimiento = async (campo: 'avisos' | 'marketing', valor: boolean) => {
    if (!token) return;
    try {
      await guardarMisDatos(
        token,
        {
          telefono: cliente.telefono,
          preferencias: cliente.preferencias,
          avisos: campo === 'avisos' ? valor : cliente.consentimientos.avisos,
          marketing: campo === 'marketing' ? valor : cliente.consentimientos.marketing,
        },
        pin,
      );
      await recargar();
      toast(valor ? 'Consentimiento activado' : 'Consentimiento retirado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'aviso');
    }
  };

  const solicitarBaja = async () => {
    if (!token) return;
    try {
      await pedirBaja(token, pin);
      await recargar();
      toast('Solicitud registrada. La barbería te contactará.', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo registrar la baja', 'aviso');
    }
  };

  const guardarClave = async () => {
    if (!token) return;
    if (!/^[0-9]{4,6}$/.test(nuevoPin)) {
      toast('El PIN tiene que ser de 4 a 6 cifras', 'aviso');
      return;
    }
    if (nuevoPin !== repetirPin) {
      toast('Los dos PIN no son iguales', 'aviso');
      return;
    }
    try {
      const hecho = await ponerPin(token, nuevoPin, pin);
      if (!hecho) {
        toast('No se pudo poner el PIN', 'aviso');
        return;
      }
      recordarPin(token, nuevoPin);
      setPin(nuevoPin);
      setClave(false);
      setNuevoPin('');
      setRepetirPin('');
      toast('PIN puesto. A partir de ahora la tarjeta lo pedirá.', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo poner el PIN', 'aviso');
    }
  };

  const sacarClave = async () => {
    if (!token) return;
    try {
      const hecho = await quitarPin(token, pin);
      if (!hecho) {
        toast('No se pudo quitar el PIN', 'aviso');
        return;
      }
      recordarPin(token, null);
      setPin(null);
      toast('PIN quitado: la tarjeta se abre con el enlace', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo quitar el PIN', 'aviso');
    }
  };

  return (
    <div
      className="grain min-h-dvh bg-ivory pb-10"
      style={{ ['--brand' as string]: barberia.color }}
    >
      {/* CABECERA DE SOCIO */}
      <header className="relative overflow-hidden bg-[var(--brand)] px-5 pb-8 pt-6 text-ivory">
        <Foto
          src="/img/manos.webp"
          alt=""
          posicion="center 38%"
          prioridad
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-luminosity"
        />
        <div className="pointer-events-none absolute inset-0 bg-ink/30" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.5),rgba(0,0,0,0)_62%)]" />
        <div className="relative mx-auto w-full max-w-md">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Logotipo nombre={barberia.nombre} logo={barberia.logo} tamano={22} tono="oscuro" />
                <p className="text-[9.5px] font-bold uppercase tracking-[0.24em] text-ivory/75">
                  JULEX · tarjeta de socio
                </p>
              </div>
              <h1 className="display mt-2 text-[34px] text-ivory">
                {barberia.nombre}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="num rounded-[2px] border border-ivory/25 px-1.5 py-1 text-[9.5px] font-bold tracking-[0.1em] text-ivory/70">
                {cliente.codigo}
              </span>
              <Salir a="/" tono="oscuro" etiqueta="Cerrar" icono="cerrar" cerrarSesion={false} />
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between">
            <div>
              <p className="text-[11px] text-ivory/70">Socio desde {fmtFechaCorta(cliente.creadoEn)}</p>
              <p className="num mt-1 font-serif text-[15px] text-ivory/90">{cortes} {v.serviciosMin}</p>
            </div>
            <div className="text-right">
              <p className="num font-serif text-[30px] leading-none text-ivory">{fidelidad.enCiclo}</p>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ivory/50">
                de {fidelidad.meta}
              </p>
            </div>
          </div>

        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-5">
        {/* SALUDO */}
        <section className="-mt-0 pt-7">
          <h2 className="display text-[30px] text-ink">
            Hola, {primerNombre(cliente.nombre)}.
          </h2>
          <p className="mt-1 text-[13px] text-muted">Qué bueno verte por aquí.</p>
        </section>

        {/* EN LA COLA */}
        {ficha.cola && (
          <section className="mt-5">
            {ficha.cola.estado === 'sillon' ? (
              <div className="rounded-[4px] bg-ink px-4 py-4 text-ivory">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ivory/50">
                  Ya es tu turno
                </p>
                <p className="display mt-1.5 text-[26px] leading-none">
                  Pasa a {ficha.cola.silla ?? 'la silla'}.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-ivory/60">
                  El barbero te está esperando. El tiempo corre desde que te llamó.
                </p>
              </div>
            ) : (
              <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">
                  Estás en la cola
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  En cuanto se libere una silla, esta pantalla te dirá cuál es la tuya.
                </p>
              </div>
            )}
          </section>
        )}

        {/* PRÓXIMA CITA */}
        <section className="mt-6">
          <Eyebrow>Tu próxima cita</Eyebrow>
          {citas ? (
            <div className="mt-2 rounded-[4px] border border-line bg-paper px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-[17px] leading-tight text-ink">
                    {etiquetaDia(citas.inicio)}
                    <span className="num ml-2 text-[15px] text-ink-soft">{fmtHora(citas.inicio)}</span>
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {servicioCita?.nombre ?? 'Servicio'} ·{' '}
                    {citas.estado === 'confirmada' ? 'Confirmada' : 'Pendiente de confirmar'}
                  </p>
                </div>
                <Pill tono={citas.estado === 'confirmada' ? 'ok' : 'warn'}>
                  {citas.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                </Pill>
              </div>
              <button
                onClick={() => setCancelar(true)}
                className="mt-2.5 text-[10.5px] font-medium text-faint underline decoration-line underline-offset-4 hover:text-clay"
              >
                Cancelar esta cita
              </button>
            </div>
          ) : (
            <div className="mt-2 rounded-[4px] border border-dashed border-line px-4 py-4">
              <p className="text-[12.5px] text-ink-soft">No tienes ninguna cita próxima.</p>
              <Link
                to={`/c/${token}/cita`}
                className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink underline underline-offset-4"
              >
                Pedir cita <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </section>

        {/* FIDELIZACIÓN */}
        <section className="mt-7">
          <Eyebrow>Tu fidelización</Eyebrow>
          <div className="mt-2 rounded-[4px] border border-line bg-paper px-4 py-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="num font-serif text-[34px] leading-none text-ink">{cortes}</p>
                <p className="eyebrow mt-1.5">{v.serviciosMin} en total</p>
              </div>
              {fidelidad.disponibles > 0 ? (
                <Pill tono="brand">1 corte gratis</Pill>
              ) : (
                <p className="max-w-[16ch] text-right text-[11px] leading-snug text-muted">
                  {fidelidad.faltan === 1
                    ? 'Te falta 1 corte para el siguiente gratis.'
                    : `Te faltan ${fidelidad.faltan} ${v.serviciosMin} para el siguiente gratis.`}
                </p>
              )}
            </div>

            <div className="mt-4">
              <Sellos meta={fidelidad.meta} llenos={fidelidad.enCiclo} />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2.5">
              <span className="text-[10.5px] text-faint">
                {fidelidad.aplicadas} {v.serviciosMin} gratis disfrutados
              </span>
              <span className="num text-[10.5px] font-semibold text-ink-soft">
                {fidelidad.enCiclo}/{fidelidad.meta}
              </span>
            </div>
          </div>
        </section>

        {/* HISTORIAL */}
        <section className="mt-7" id="historial">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Tus últimas visitas</Eyebrow>
            <span className="num text-[10.5px] text-faint">{fmtEuros(gastado)} en total</span>
          </div>

          {visitas.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted">
              Aún no hay visitas. La primera te la apuntamos aquí.
            </p>
          ) : (
            <ul className="mt-1">
              {visitas.map((v, i) => {
                return (
                  <li
                    key={`${v.fecha}-${i}`}
                    className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2.5 last:border-0"
                  >
                    <span className="text-[12.5px] text-ink">
                      <span className="num">{fmtFechaCorta(v.fecha)}</span>
                      <span className="ml-2 text-ink-soft">{v.servicio}</span>
                    </span>
                    <span className="num text-[11.5px] text-faint">{fmtEuros(v.precio)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ACCIONES */}
        <section className="mt-7 space-y-2">
          <Link
            to={`/c/${token}/cita`}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[3px] bg-[var(--brand)] text-[11.5px] font-bold uppercase tracking-[0.14em] text-ivory"
          >
            <CalendarPlus size={15} /> Pedir cita
          </Link>
          <div className="flex gap-2">
            <button
              onClick={() => setDatos(true)}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[3px] border border-line text-[11.5px] font-semibold text-ink-soft hover:bg-paper"
            >
              Mis datos
            </button>
            <a
              href="#historial"
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[3px] border border-line text-[11.5px] font-semibold text-ink-soft hover:bg-paper"
            >
              Historial
            </a>
          </div>
        </section>

        <Rule className="my-7" />

        {desdeLlavero && (
          <p className="mt-8 text-center text-[10.5px] leading-relaxed text-faint">
            ¿Eres de la barbería?{' '}
            <Link
              to={`/barbero/login?next=${encodeURIComponent(`/nfc/${desdeLlavero}`)}`}
              className="font-semibold text-ink-soft underline decoration-line underline-offset-2 hover:text-ink"
            >
              Entra y vuelve a acercar el llavero
            </Link>
            .
          </p>
        )}

        <footer className="pb-4 text-center">
          <p className="text-[10px] leading-relaxed text-faint">
            {barberia.nombre} · {barberia.direccion}
            {barberia.telefono ? ` · ${telefonoBonito(barberia.telefono)}` : ''}
          </p>
          <p className="mt-1.5 text-[9.5px] uppercase tracking-[0.18em] text-faint">
            Hecho con JULEX
          </p>
          <Link
            to="/legal"
            className="mt-2 inline-block text-[10px] text-faint underline decoration-line underline-offset-2 hover:text-muted"
          >
            Privacidad y consentimientos
          </Link>
        </footer>
      </div>

      {/* MIS DATOS */}
      <Sheet
        open={datos}
        onClose={() => setDatos(false)}
        titulo="Mis datos"
        descripcion="Lo que la barbería guarda de ti y lo que puedes cambiar."
        pie={
          <Btn
            className="w-full"
            onClick={() => void guardarDatos()}
          >
            Guardar cambios
          </Btn>
        }
      >
        <div className="space-y-4">
          <div>
            <Eyebrow>Nombre</Eyebrow>
            <p className="mt-1 text-[13.5px] text-ink">{cliente.nombre}</p>
          </div>

          <label className="block">
            <Eyebrow>Teléfono</Eyebrow>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={cn(inputClases, 'mt-1.5')}
              inputMode="tel"
            />
          </label>

          <label className="block">
            <Eyebrow>Preferencias</Eyebrow>
            <input
              value={preferencias}
              onChange={(e) => setPreferencias(e.target.value)}
              className={cn(inputClases, 'mt-1.5')}
              placeholder="Le gusta reservar por la tarde."
            />
          </label>

          <div>
            <Eyebrow>Consentimientos</Eyebrow>
            <div className="mt-1 divide-y divide-line-soft">
              <Check checked={cliente.consentimientos.datos} onChange={() => toast('El consentimiento de datos es necesario para el servicio', 'aviso')}>
                Datos para gestionar mis citas e historial
              </Check>
              <Check
                checked={cliente.consentimientos.avisos}
                onChange={(v) => void cambiarConsentimiento('avisos', v)}
              >
                Avisos cuando sea mi turno
              </Check>
              <Check
                checked={cliente.consentimientos.marketing}
                onChange={(v) => void cambiarConsentimiento('marketing', v)}
              >
                Recordatorios de visita y solicitudes de reseña
              </Check>
            </div>
          </div>

          <div className="rounded-[3px] border border-line bg-paper px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <Lock size={13} /> PIN de la tarjeta
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              {pin
                ? 'Esta tarjeta pide un PIN. Quien tenga el enlace sin él no ve tu nombre, tu teléfono ni tus visitas.'
                : desdeLlavero
                  ? 'Tu llavero abre esta tarjeta. Si lo pierdes, quien lo encuentre la verá: ponle un PIN de 4 a 6 cifras y solo verá «tarjeta protegida».'
                  : 'Con el enlace, cualquiera que lo tenga ve tu tarjeta. Con un PIN de 4 a 6 cifras, no.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setNuevoPin('');
                  setRepetirPin('');
                  setClave(true);
                }}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                <Lock size={11} /> {pin ? 'Cambiar el PIN' : 'Poner un PIN'}
              </button>
              {pin && (
                <button
                  onClick={() => void sacarClave()}
                  className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-clay underline underline-offset-4"
                >
                  <X size={11} /> Quitar el PIN
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Si se te olvida, en la barbería pueden quitártelo. No pueden leerlo.
            </p>
          </div>

          <div className="rounded-[3px] border border-line bg-paper px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <ShieldCheck size={13} /> Tus derechos
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              Puedes descargar una copia de tus datos o solicitar la baja. La barbería recibirá el
              aviso y conservará solo lo que exija la normativa fiscal.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(cliente, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `julex-${cliente.codigo}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast('Copia descargada', 'ok');
                }}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                <Download size={11} /> Descargar
              </button>
              <button
                onClick={() => setBorrar(true)}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-clay underline underline-offset-4"
              >
                <X size={11} /> Solicitar baja
              </button>
            </div>
          </div>

        </div>
      </Sheet>

      <Sheet
        open={clave}
        onClose={() => setClave(false)}
        titulo={pin ? 'Cambiar el PIN' : 'Poner un PIN'}
        descripcion="De 4 a 6 cifras. Quien tenga el enlace sin el PIN no verá nada de tu tarjeta."
        pie={
          <Btn className="w-full" onClick={() => void guardarClave()}>
            Guardar PIN
          </Btn>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <Eyebrow>PIN nuevo</Eyebrow>
            <input
              value={nuevoPin}
              onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={cn(inputClases, 'num mt-1.5 text-center text-[20px] tracking-[0.3em]')}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••"
              autoFocus
            />
          </label>
          <label className="block">
            <Eyebrow>Repite el PIN</Eyebrow>
            <input
              value={repetirPin}
              onChange={(e) => setRepetirPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={cn(inputClases, 'num mt-1.5 text-center text-[20px] tracking-[0.3em]')}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••"
            />
          </label>
          {repetirPin.length > 0 && nuevoPin !== repetirPin && (
            <p className="text-[11.5px] text-clay">Los dos PIN no son iguales.</p>
          )}
        </div>
      </Sheet>

      <Confirmar
        open={cancelar}
        titulo="¿Cancelar la cita?"
        texto={
          citas
            ? `${etiquetaDia(citas.inicio)} a las ${fmtHora(citas.inicio)}. El hueco queda libre para otra persona.`
            : ''
        }
        etiquetaConfirmar="Sí, cancelar"
        peligro
        onClose={() => setCancelar(false)}
        onConfirm={() => void cancelarLaCita()}
      />

      <Confirmar
        open={borrar}
        titulo="Solicitar la baja"
        texto="La barbería recibirá la solicitud y eliminará tus datos personales, conservando solo lo que la ley obliga por motivos fiscales."
        etiquetaConfirmar="Solicitar baja"
        peligro
        onClose={() => setBorrar(false)}
        onConfirm={() => void solicitarBaja()}
      />
    </div>
  );
}
