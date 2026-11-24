import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Clock,
  Loader2,
  MessageCircle,
  Phone,
  X,
  RotateCcw,
} from 'lucide-react';
import { useDb } from '../lib/store';
import { barberiaActiva } from '../lib/derive';
import { fmtEuros, haceCuanto } from '../lib/format';
import { haySupabase } from '../lib/supabase';
import { AVATARES } from '../lib/avatares';
import {
  CONFIG_POR_DEFECTO,
  FUNCIONES_RECEPCION,
  PERSONALIDADES,
  autorizarNumero,
  cambiarModo,
  cargarConfig,
  cargarPanel,
  cargarRequisitos,
  cambiarComplemento,
  completarConexion,
  conectar,
  desconectar,
  guardarConfig,
  resolverPendiente,
  simular,
  type ClaveFuncion,
  type ConfigRecepcion,
  type RequisitosRecepcion,
  type PanelRecepcion,
  type PendienteRecepcion,
} from '../lib/recepcion';
import { Shell } from '../components/Shell';
import { Avatar } from '../components/Avatar';
import {
  Btn,
  Confirmar,
  Eyebrow,
  Field,
  Pill,
  Stat,
  Switch,
  cn,
  inputClases,
  toast,
} from '../components/ui';

interface Burbuja {
  papel: 'cliente' | 'agente';
  texto: string;
  herramientas?: string[];
}

export default function Recepcion() {
  const db = useDb();
  const barberia = barberiaActiva(db);
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const consultaAlta = params.toString();

  const [config, setConfig] = useState<ConfigRecepcion | null>(null);
  const [panel, setPanel] = useState<PanelRecepcion | null>(null);
  const [requisitos, setRequisitos] = useState<RequisitosRecepcion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [avisoConexion, setAvisoConexion] = useState<string | null>(null);
  const [confirmarDesconexion, setConfirmarDesconexion] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [confirmarReal, setConfirmarReal] = useState(false);
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const [cobrandoComplemento, setCobrandoComplemento] = useState(false);
  const [numeroNuevo, setNumeroNuevo] = useState('');
  const [autorizando, setAutorizando] = useState(false);

  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [textoPrueba, setTextoPrueba] = useState('');
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const finChat = useRef<HTMLDivElement>(null);
  const altaHecha = useRef(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);

    Promise.allSettled([
      cargarConfig(barberia.id),
      cargarPanel(barberia.id),
      cargarRequisitos(barberia.id),
    ]).then(([c, p, r]) => {
      if (!vivo) return;

      if (c.status === 'fulfilled') {
        setConfig(c.value);
      } else {
        setConfig({ ...CONFIG_POR_DEFECTO, funciones: { ...CONFIG_POR_DEFECTO.funciones } });
        toast('No se pudo leer la configuración de recepción', 'aviso');
      }

      setPanel(p.status === 'fulfilled' ? p.value : null);
      setRequisitos(r.status === 'fulfilled' ? r.value : null);
      setSucio(false);
      setCargando(false);
    });

    return () => {
      vivo = false;
    };
  }, [barberia.id]);

  // Meta vuelve a esta misma ruta con un código de un solo uso. Se canjea
  // una vez y se limpia la dirección para que recargar no lo repita.
  useEffect(() => {
    const code = params.get('code');
    if (!code || altaHecha.current) return;
    altaHecha.current = true;

    const waba = params.get('waba_id') ?? '';
    const phone = params.get('phone_number_id') ?? '';
    setConectando(true);
    setAvisoConexion(null);

    if (!waba || !phone) {
      setAvisoConexion('Meta ha vuelto sin el número. Vuelve a intentar la conexión.');
      setConectando(false);
      navegar('/panel/recepcion', { replace: true });
      return;
    }

    void completarConexion({ code, wabaId: waba, phoneNumberId: phone })
      .then(async (r) => {
        if (r.estado === 'error') {
          setAvisoConexion(r.mensaje ?? 'No se pudo terminar la conexión.');
          return;
        }
        try {
          setPanel(await cargarPanel(barberia.id));
        } catch {
          // El aviso de conexión ya cuenta lo importante.
        }
        toast(r.estado === 'conectado' ? 'WhatsApp conectado' : 'Número en modo prueba', 'ok');
      })
      .catch((e) => {
        setAvisoConexion(
          e instanceof Error ? e.message : 'No se pudo terminar la conexión.',
        );
      })
      .finally(() => {
        setConectando(false);
        navegar('/panel/recepcion', { replace: true });
      });
  }, [consultaAlta, barberia.id, navegar, params]);

  useEffect(() => {
    finChat.current?.scrollIntoView({ block: 'nearest' });
  }, [burbujas, enviandoPrueba]);

  const recargarPanel = async () => {
    try {
      setPanel(await cargarPanel(barberia.id));
    } catch {
      // Se queda lo que ya había: un fallo de red no borra la pantalla.
    }
  };

  const actualizar = (parcial: Partial<ConfigRecepcion>) => {
    setConfig((c) => (c ? { ...c, ...parcial } : c));
    setSucio(true);
  };

  const cambiarFuncion = (clave: ClaveFuncion, valor: boolean) => {
    setConfig((c) =>
      c ? { ...c, funciones: { ...c.funciones, [clave]: valor } } : c,
    );
    setSucio(true);
  };

  const guardar = async () => {
    if (!config || guardando) return;
    setGuardando(true);
    try {
      const hecho = await guardarConfig(barberia.id, config);
      if (hecho) {
        setSucio(false);
        toast('Recepción guardada', 'ok');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'aviso');
    } finally {
      setGuardando(false);
    }
  };

  const conectarCanal = async () => {
    if (conectando) return;
    setConectando(true);
    setAvisoConexion(null);
    try {
      const resultado = await conectar();
      if (resultado.estado === 'error') {
        setAvisoConexion(resultado.mensaje ?? 'No se pudo conectar. Inténtalo otra vez.');
        return;
      }

      // El alta de Meta se termina fuera de la app. Al volver, el panel
      // vuelve a leer la línea y enseña el número.
      if (resultado.url) {
        window.location.assign(resultado.url);
        return;
      }

      await recargarPanel();
      if (haySupabase) {
        if (resultado.estado === 'conectado') {
          toast('WhatsApp conectado', 'ok');
        } else if (resultado.mensaje) {
          setAvisoConexion(resultado.mensaje);
        }
      }
    } finally {
      setConectando(false);
    }
  };

  const pagarComplemento = async (accion: 'activar' | 'cancelar') => {
    setCobrandoComplemento(true);
    try {
      const r = await cambiarComplemento(accion);
      toast(r.mensaje, r.ok ? 'ok' : 'aviso');
      if (r.ok) setRequisitos(await cargarRequisitos(barberia.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el complemento.', 'aviso');
    } finally {
      setCobrandoComplemento(false);
    }
  };

  const anadirNumero = async () => {
    const limpio = numeroNuevo.replace(/\D/g, '');
    if (limpio.length !== 9) {
      toast('Un número de 9 cifras, sin prefijo.', 'aviso');
      return;
    }
    setAutorizando(true);
    try {
      await autorizarNumero(barberia.id, limpio, true);
      setNumeroNuevo('');
      await recargarPanel();
      toast('Número autorizado para la prueba.', 'ok');
    } catch {
      toast('No se pudo autorizar ese número.', 'aviso');
    } finally {
      setAutorizando(false);
    }
  };

  const quitarNumero = async (numero: string) => {
    try {
      await autorizarNumero(barberia.id, numero, false);
      await recargarPanel();
    } catch {
      toast('No se pudo quitar el número.', 'aviso');
    }
  };

  const aplicarModo = async (modo: 'prueba' | 'real') => {
    setCambiandoModo(true);
    try {
      await cambiarModo(barberia.id, modo);
      await recargarPanel();
      toast(
        modo === 'real'
          ? 'Recepción abierta: ya contesta a tus clientes.'
          : 'Vuelta a modo prueba: solo te contesta a ti.',
        'ok',
      );
    } catch {
      toast('No se pudo cambiar el modo. Prueba otra vez.', 'aviso');
    } finally {
      setCambiandoModo(false);
      setConfirmarReal(false);
    }
  };

  const desconectarCanal = async () => {
    if (desconectando) return;
    setDesconectando(true);
    try {
      await desconectar(barberia.id);
      await recargarPanel();
      if (haySupabase) toast('WhatsApp desconectado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo desconectar', 'aviso');
    } finally {
      setDesconectando(false);
    }
  };

  const enviarPrueba = async (mensaje?: string) => {
    const limpio = (mensaje ?? textoPrueba).trim();
    if (!limpio || enviandoPrueba) return;

    setBurbujas((b) => [...b, { papel: 'cliente', texto: limpio }]);
    setTextoPrueba('');
    setEnviandoPrueba(true);

    try {
      const r = await simular(
        limpio,
        burbujas.map((b) => ({ papel: b.papel, texto: b.texto })),
      );
      setBurbujas((b) => [
        ...b,
        { papel: 'agente', texto: r.respuesta, herramientas: r.herramientas },
      ]);
    } catch {
      setBurbujas((b) => [
        ...b,
        { papel: 'agente', texto: 'Ahora mismo no puedo contestar. Prueba otra vez.' },
      ]);
    } finally {
      setEnviandoPrueba(false);
    }
  };

  const reiniciarPrueba = () => {
    setBurbujas([]);
    setTextoPrueba('');
  };

  const decidir = async (pendiente: PendienteRecepcion, accion: 'aprobar' | 'descartar') => {
    if (resolviendo) return;
    setResolviendo(pendiente.id);
    try {
      const hecho = await resolverPendiente(pendiente, accion);
      if (!hecho) {
        toast('No se pudo completar la decisión', 'aviso');
        return;
      }
      setPanel((p) =>
        p ? { ...p, pendientes: p.pendientes.filter((x) => x.id !== pendiente.id) } : p,
      );
      if (haySupabase) {
        await recargarPanel();
        toast(accion === 'aprobar' ? 'Aprobado' : 'Descartado', 'ok');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar la decisión', 'aviso');
    } finally {
      setResolviendo(null);
    }
  };

  const nombreVisible = config?.nombre.trim() || 'tu recepcionista';
  const bienvenidaVisible = config?.bienvenida.trim() || 'Hola. ¿En qué te puedo ayudar?';
  const linea = panel?.linea ?? null;
  const conectada = linea?.estado === 'activa';
  const enPrueba = linea?.estado === 'pendiente' || (conectada && linea?.modo === 'prueba');
  const apagada = !linea || linea.estado === 'pausa';
  const estadoTexto = conectada && !enPrueba ? 'Conectado' : enPrueba ? 'En prueba' : 'Apagado';
  const tonoEstado: 'ok' | 'warn' | 'neutral' =
    conectada && !enPrueba ? 'ok' : enPrueba ? 'warn' : 'neutral';

  if (cargando || !config) {
    return (
      <Shell barberia={barberia} activo="/barbero/panel">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
          <Loader2 size={20} className="animate-spin text-muted" />
          <span className="eyebrow">Abriendo tu recepción</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell barberia={barberia} activo="/barbero/panel">
      <div className="pt-5">
        <Link
          to="/barbero/panel"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          <ArrowLeft size={11} /> Panel
        </Link>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>{barberia.nombre}</Eyebrow>
            <h1 className="mt-1.5 font-serif text-[28px] leading-none tracking-tight text-ink">
              Recepción por WhatsApp
            </h1>
            <p className="mt-2 max-w-[34ch] text-[12px] leading-relaxed text-muted">
              Contesta por WhatsApp, pide citas y toma recados mientras tú trabajas.
            </p>
          </div>
          <Pill tono={tonoEstado}>{estadoTexto}</Pill>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-[4px] border border-line bg-paper px-4 py-3">
          <div>
            <p className="eyebrow">Recepción</p>
            <p className="num mt-1 font-serif text-[24px] leading-none text-ink">
              {fmtEuros(10)}
              <span className="ml-1 font-sans text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">
                /mes
              </span>
            </p>
          </div>
          <p className="max-w-[17ch] text-right text-[10.5px] leading-relaxed text-faint">
            Un WhatsApp para tu local, atendido solo.
          </p>
        </div>
      </div>

      {/* PASO 1 */}
      <Paso numero="1" titulo="Tu recepcionista">
        <div className="space-y-4">
          <Field label="Nombre" hint="así se presenta">
            <input
              value={config.nombre}
              onChange={(e) => actualizar({ nombre: e.target.value })}
              className={inputClases}
              placeholder="Julia"
              maxLength={40}
            />
          </Field>

          <div>
            <div className="flex items-baseline justify-between">
              <Eyebrow>Su cara</Eyebrow>
              <span className="text-[10.5px] text-faint">Elige una</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {AVATARES.map((a) => {
                const elegido = a.id === config.avatarId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={elegido}
                    onClick={() => actualizar({ avatarId: a.id })}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-[4px] border px-1 py-1.5 transition-colors',
                      elegido
                        ? 'border-ink bg-paper'
                        : 'border-line-soft hover:border-line hover:bg-paper',
                    )}
                  >
                    <span className="relative">
                      <Avatar id={a.id} size={46} />
                      {elegido && (
                        <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-ink text-ivory">
                          <Check size={9} />
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] leading-none',
                        elegido ? 'font-semibold text-ink' : 'text-muted',
                      )}
                    >
                      {a.nombre}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Eyebrow>Cómo habla</Eyebrow>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {PERSONALIDADES.map((p) => {
                const elegida = p.id === config.personalidad;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={elegida}
                    onClick={() => actualizar({ personalidad: p.id, tono: p.tono })}
                    className={cn(
                      'rounded-[4px] border p-3 text-left transition-colors',
                      elegida
                        ? 'border-ink bg-paper'
                        : 'border-line-soft bg-paper/40 hover:border-line hover:bg-paper',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">{p.nombre}</span>
                      {elegida && <Check size={12} className="text-[var(--brand)]" />}
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted">
                      {p.ejemplo}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            label="Mensaje de bienvenida"
            hint={`${config.bienvenida.length}/160`}
          >
            <textarea
              value={config.bienvenida}
              onChange={(e) => actualizar({ bienvenida: e.target.value })}
              className={cn(inputClases, 'resize-none')}
              placeholder="Hola, soy tu recepcionista. ¿Te ayudo con tu próxima cita?"
              maxLength={160}
              rows={3}
            />
          </Field>
          <p className="-mt-2 text-[10.5px] leading-relaxed text-faint">
            Es lo primero que lee quien te escribe. Mejor corto y claro.
          </p>

          <div>
            <Eyebrow>Así lo ve el cliente</Eyebrow>
            <VistaPrevia
              local={barberia.nombre}
              nombre={nombreVisible}
              bienvenida={bienvenidaVisible}
              avatarId={config.avatarId}
            />
          </div>
        </div>
      </Paso>

      {/* PASO 2 */}
      <Paso numero="2" titulo="Conectar WhatsApp">
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Un solo botón. Meta te pedirá entrar con tu cuenta y confirmar el número del local.
          </p>

          {apagada && (
            <>
              <Btn
                t="lg"
                className="w-full"
                onClick={() => void conectarCanal()}
                disabled={conectando || (requisitos ? !requisitos.puede : false)}
              >
                {conectando ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <MessageCircle size={16} />
                )}
                {conectando ? 'Conectando…' : 'Conectar WhatsApp'}
              </Btn>
              <p className="text-[10.5px] leading-relaxed text-faint">
                Mientras no lo conectes, la recepción sigue apagada. No se envía nada.
              </p>
            </>
          )}

          {requisitos && !requisitos.puede && (
            <div className="rounded-[4px] border border-clay/30 bg-clay/10 px-4 py-3.5">
              <p className="text-[12.5px] font-semibold text-ink">
                {requisitos.faltan > 0
                  ? `Te faltan ${requisitos.faltan} llavero${requisitos.faltan === 1 ? '' : 's'}`
                  : 'Recepción no disponible'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                {requisitos.faltan > 0 ? (
                  <>
                    La recepción por WhatsApp se activa con{' '}
                    <span className="font-semibold text-ink">{requisitos.minimo} llaveros activos</span> y
                    ahora tienes <span className="num font-semibold text-ink">{requisitos.llaverosActivos}</span>.
                    Da de alta los que faltan desde <span className="font-semibold text-ink">Llaveros</span> y
                    vuelve aquí.
                  </>
                ) : !requisitos.pagada ? (
                  <>
                    La recepción se cobra aparte: <span className="font-semibold text-ink">10 €/mes</span> que
                    se suman a tu cuota. Actívala y podrás conectar tu WhatsApp.
                  </>
                ) : (
                  'La cuenta tiene un pago pendiente. Cuando se regularice podrás conectar WhatsApp.'
                )}
              </p>

              {requisitos.faltan === 0 && (
                <Btn
                  t="sm"
                  className="mt-2.5"
                  onClick={() => void pagarComplemento(requisitos.pagada ? 'cancelar' : 'activar')}
                  disabled={cobrandoComplemento}
                >
                  {cobrandoComplemento ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  {requisitos.pagada ? 'Quitar el complemento' : 'Activar por 10 €/mes'}
                </Btn>
              )}
            </div>
          )}

          {linea?.estado === 'pendiente' && (
            <div className="rounded-[4px] border border-bronze/30 bg-bronze/10 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-bronze" />
                <p className="text-[12.5px] font-semibold text-ink">Número en modo prueba</p>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                {linea.telefono ? (
                  <>
                    Es el{' '}
                    <span className="num font-semibold text-ink">
                      {telefonoVisible(linea.telefono)}
                    </span>
                    .{' '}
                  </>
                ) : (
                  'Meta todavía no nos ha dado el número. '
                )}
                Escribe «Hola» una vez desde el móvil del local para abrirlo.
              </p>
            </div>
          )}

          {conectada && (
            <div className="rounded-[4px] border border-sage/40 bg-sage/10 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-sage" />
                  <p className="num text-[13px] font-semibold text-ink">
                    {linea?.telefono ? telefonoVisible(linea.telefono) : 'Número del local'}
                  </p>
                </div>
                <Pill tono={linea?.modo === 'prueba' ? 'warn' : 'ok'}>
                  {linea?.modo === 'prueba' ? 'En prueba' : 'Conectado'}
                </Pill>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {linea?.modo === 'prueba'
                  ? 'Contesta, pero todavía no está abierto a todos tus clientes.'
                  : 'Ya contesta a tus clientes. Tú no tienes que mirar el móvil.'}
              </p>

              <div className="mt-3 border-t border-sage/30 pt-1">
                <Switch
                  checked={linea?.modo === 'real'}
                  onChange={(v) => (v ? setConfirmarReal(true) : void aplicarModo('prueba'))}
                  label="Atender a todos mis clientes"
                  description="Mientras esté apagado, solo te contesta a ti y a los números que autorices."
                />
              </div>

              {linea?.modo === 'prueba' && (
                <div className="mt-3 border-t border-sage/30 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                    Quién puede escribir en prueba
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Tú y el teléfono del local. Añade otro número si quieres enseñárselo a
                    alguien de confianza sin abrirlo a todo el mundo.
                  </p>

                  {(linea?.autorizados ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(linea?.autorizados ?? []).map((numero) => (
                        <button
                          key={numero}
                          type="button"
                          onClick={() => void quitarNumero(numero)}
                          className="num inline-flex items-center gap-1 rounded-[3px] border border-line bg-paper px-2 py-1 text-[11px] text-ink-soft transition hover:border-clay hover:text-clay"
                          title="Dejar de autorizar"
                        >
                          {telefonoVisible(numero)}
                          <X size={11} />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={numeroNuevo}
                      onChange={(e) => setNumeroNuevo(e.target.value)}
                      placeholder="600 11 22 33"
                      inputMode="numeric"
                      maxLength={16}
                      className={`${inputClases} max-w-[190px]`}
                    />
                    <Btn t="sm" onClick={() => void anadirNumero()} disabled={autorizando}>
                      {autorizando ? <Loader2 size={12} className="animate-spin" /> : null}
                      Autorizar
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}

          {avisoConexion && (
            <p className="text-[11.5px] leading-relaxed text-clay">{avisoConexion}</p>
          )}

          {linea && (
            <Btn
              v="outline"
              t="sm"
              onClick={() => setConfirmarDesconexion(true)}
              disabled={desconectando}
            >
              {desconectando ? 'Desconectando…' : 'Desconectar'}
            </Btn>
          )}
        </div>
      </Paso>

      {/* PASO 3 */}
      <Paso numero="3" titulo="Qué puede hacer">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Marca lo que resuelve solo. Lo que dejes apagado, te lo pasa a ti.
        </p>

        <div className="mt-3 divide-y divide-line-soft rounded-[4px] border border-line bg-paper px-4">
          {FUNCIONES_RECEPCION.map((f) => (
            <Switch
              key={f.clave}
              checked={config.funciones[f.clave]}
              onChange={(v) => cambiarFuncion(f.clave, v)}
              label={f.nombre}
              description={f.descripcion}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Btn t="md" className="w-full sm:w-auto" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Guardar cambios
          </Btn>
          {sucio && (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-bronze">
              Sin guardar
            </span>
          )}
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          El nombre, el avatar, la bienvenida y los diez permisos se guardan de una vez.
        </p>
      </Paso>

      {/* CONVERSACIÓN DE PRUEBA */}
      <section className="mt-8 border-t border-line-soft pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Conversación de prueba</Eyebrow>
            <h2 className="mt-1 font-serif text-[21px] leading-tight text-ink">
              Habla con {nombreVisible}
            </h2>
          </div>
          <Btn
            v="quiet"
            t="sm"
            onClick={reiniciarPrueba}
            disabled={burbujas.length === 0 && !textoPrueba}
          >
            <RotateCcw size={12} /> Reiniciar prueba
          </Btn>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Escribe como un cliente. Así ves lo que contestaría antes de abrirlo.
        </p>

        <div className="mt-3 overflow-hidden rounded-[10px] border border-line bg-paper shadow-[0_14px_34px_-28px_rgba(26,27,23,0.55)]">
          <div className="flex items-center gap-2.5 border-b border-line bg-paper px-3.5 py-2.5">
            <Avatar id={config.avatarId} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold leading-tight text-ink">
                {nombreVisible}
              </p>
              <p className="text-[10px] leading-tight text-faint">Así contestaría</p>
            </div>
            <Pill tono="warn">En prueba</Pill>
          </div>

          <div
            className="max-h-[320px] space-y-2 overflow-y-auto bg-paper-2 px-3 py-3"
            role="log"
            aria-live="polite"
          >
            <BurbujaAgente
              avatarId={config.avatarId}
              texto={bienvenidaVisible}
            />

            {burbujas.map((b, i) =>
              b.papel === 'cliente' ? (
                <p
                  key={`cliente-${i}`}
                  className="ml-auto w-fit max-w-[78%] rounded-[10px] rounded-tr-[2px] bg-[var(--brand)] px-3 py-2 text-[12.5px] leading-relaxed text-ivory"
                >
                  {b.texto}
                </p>
              ) : (
                <BurbujaAgente
                  key={`agente-${i}`}
                  avatarId={config.avatarId}
                  texto={b.texto}
                  herramientas={b.herramientas}
                />
              ),
            )}

            {enviandoPrueba && (
              <p className="w-fit rounded-[10px] bg-paper px-3 py-2 text-[11.5px] text-faint">
                Escribiendo…
              </p>
            )}

            <div ref={finChat} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviarPrueba();
            }}
            className="flex items-center gap-2 border-t border-line bg-paper px-3 py-2.5"
          >
            <input
              value={textoPrueba}
              onChange={(e) => setTextoPrueba(e.target.value)}
              placeholder="Escribe como un cliente…"
              aria-label="Mensaje de prueba"
              maxLength={500}
              className="min-w-0 flex-1 rounded-full border border-line bg-ivory px-3.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-ink/30"
            />
            <button
              type="submit"
              disabled={!textoPrueba.trim() || enviandoPrueba}
              aria-label="Enviar"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-ivory transition-opacity disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          </form>
        </div>

        <p className="mt-2 px-1 text-[10px] leading-relaxed text-faint">
          La prueba no envía mensajes ni toca tu agenda. Solo te enseña al agente.
        </p>
      </section>

      {/* PANEL DE ACTIVIDAD */}
      {conectada && panel && (
        <section className="mt-8 border-t border-line-soft pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>Panel de actividad</Eyebrow>
              <h2 className="mt-1 font-serif text-[21px] leading-tight text-ink">
                Lo que ha hecho {nombreVisible}
              </h2>
            </div>
            <Pill tono="ok">En marcha</Pill>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Datos del mes en curso. Se actualiza al volver a esta pantalla.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Stat valor={panel.metricas.conversaciones} etiqueta="Conversaciones" />
            <Stat valor={panel.metricas.citas} etiqueta="Citas pedidas" />
            <Stat valor={panel.metricas.fueraHorario} etiqueta="Fuera de horario" />
            <Stat valor={panel.metricas.derivadas} etiqueta="Te las pasó" />
            <Stat valor={panel.metricas.recordatorios} etiqueta="Recordatorios" />
            <Stat valor={panel.metricas.espera} etiqueta="En espera" />
            <Stat valor={panel.metricas.premios} etiqueta="Premios" />
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Para revisar</Eyebrow>
              <span className="num text-[11px] text-faint">{panel.pendientes.length}</span>
            </div>

            {panel.pendientes.length === 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Nada pendiente. Todo lo que ha entrado está resuelto.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-line-soft rounded-[4px] border border-line bg-paper px-4">
                {panel.pendientes.map((p) => (
                  <li key={p.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <Pill tono={p.tipo === 'cita' ? 'brand' : 'neutral'}>
                        {p.tipo === 'cita' ? 'Cita' : 'Ficha'}
                      </Pill>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] leading-relaxed text-ink">{p.texto}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                          <Clock size={9} /> {haceCuanto(p.creadoEn)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Btn
                        v="outline"
                        t="sm"
                        onClick={() => void decidir(p, 'aprobar')}
                        disabled={resolviendo === p.id}
                      >
                        Aprobar
                      </Btn>
                      <Btn
                        v="quiet"
                        t="sm"
                        onClick={() => void decidir(p, 'descartar')}
                        disabled={resolviendo === p.id}
                      >
                        Descartar
                      </Btn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Lista de espera</Eyebrow>
              <span className="num text-[11px] text-faint">{panel.espera.length}</span>
            </div>

            {panel.espera.length === 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Nadie esperando ahora mismo.
              </p>
            ) : (
              <ul className="mt-1">
                {panel.espera.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">{e.nombre}</p>
                      <p className="text-[10.5px] text-muted">{e.servicio || 'Sin servicio'}</p>
                    </div>
                    <span className="num shrink-0 text-[10.5px] text-faint">
                      {haceCuanto(e.desde)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 rounded-[4px] border border-line bg-paper px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Consumo del mes</Eyebrow>
              <span className="text-[10px] text-faint">Conversaciones y mensajes</span>
            </div>
            <BarraTopes
              etiqueta="Conversaciones"
              usados={panel.topes.usadas}
              tope={panel.topes.conversaciones}
            />
            <BarraTopes
              etiqueta="Mensajes"
              usados={panel.topes.usados}
              tope={panel.topes.mensajes}
            />
          </div>
        </section>
      )}

      <Confirmar
        open={confirmarReal}
        titulo="¿Abrir la recepción a tus clientes?"
        texto="Desde ahora contestará a cualquiera que escriba a tu número de WhatsApp. Las citas entran en tu agenda y tú no tienes que mirar el móvil."
        etiquetaConfirmar="Abrir recepción"
        nota={cambiandoModo ? 'Abriendo…' : null}
        onClose={() => setConfirmarReal(false)}
        onConfirm={() => void aplicarModo('real')}
      />

      <Confirmar
        open={confirmarDesconexion}
        titulo="¿Desconectar WhatsApp?"
        texto="El número dejará de contestar a tus clientes. Podrás volver a conectarlo cuando quieras."
        etiquetaConfirmar="Desconectar"
        peligro
        nota={null}
        onClose={() => setConfirmarDesconexion(false)}
        onConfirm={() => void desconectarCanal()}
      />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas pequeñas de la pantalla                                      */
/* ------------------------------------------------------------------ */

function Paso({ numero, titulo, children }: { numero: string; titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-line-soft pt-6">
      <Eyebrow>Paso {numero}</Eyebrow>
      <h2 className="mt-1 font-serif text-[21px] leading-tight text-ink">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function VistaPrevia({
  local,
  nombre,
  bienvenida,
  avatarId,
}: {
  local: string;
  nombre: string;
  bienvenida: string;
  avatarId: string;
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-[12px] border border-line bg-paper shadow-[0_16px_40px_-30px_rgba(26,27,23,0.6)]">
      <div className="bg-[var(--brand)] px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ivory/65">{local}</p>
        <p className="mt-1 font-serif text-[19px] leading-tight text-ivory">Mi ficha de cliente</p>
      </div>

      <div className="px-4 py-5 text-center">
        <Avatar id={avatarId} size={76} className="mx-auto" />
        <p className="mt-3 font-serif text-[18px] leading-tight text-ink">Habla con {nombre}</p>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-[11.5px] leading-relaxed text-muted">
          {bienvenida}
        </p>
        <div className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[3px] bg-[var(--brand)] text-[10.5px] font-bold uppercase tracking-[0.12em] text-ivory">
          <MessageCircle size={14} /> Hablar por WhatsApp
        </div>
        <p className="mt-2 text-[9px] uppercase tracking-[0.1em] text-faint">
          Toca el llavero o escanea el QR
        </p>
      </div>
    </div>
  );
}

function BurbujaAgente({
  avatarId,
  texto,
  herramientas,
}: {
  avatarId: string;
  texto: string;
  herramientas?: string[];
}) {
  return (
    <div className="flex items-end gap-1.5">
      <Avatar id={avatarId} size={22} />
      <div className="max-w-[78%]">
        <p className="w-fit rounded-[10px] rounded-tl-[2px] bg-paper px-3 py-2 text-[12.5px] leading-relaxed text-ink ring-1 ring-line-soft">
          {texto}
        </p>
        {herramientas && herramientas.length > 0 && (
          <p className="mt-1 pl-1 text-[9px] leading-relaxed text-faint">
            Ha usado: {herramientas.join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

function BarraTopes({
  etiqueta,
  usados,
  tope,
}: {
  etiqueta: string;
  usados: number;
  tope: number;
}) {
  const pct = Math.min(100, Math.round((usados / Math.max(1, tope)) * 100));
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold text-ink-soft">{etiqueta}</span>
        <span className="num text-[10.5px] text-faint">
          {usados} de {tope}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={tope}
        aria-valuenow={Math.min(usados, tope)}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            pct >= 90 ? 'bg-clay' : pct >= 70 ? 'bg-bronze' : 'bg-[var(--brand)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function telefonoVisible(t: string): string {
  const d = t.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('34')) {
    return `${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return t;
}
