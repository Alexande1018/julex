import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Pencil, Phone, Plus, X } from 'lucide-react';
import { useDb } from '../lib/store';
import {
  actualizarCliente,
  anadirACola,
  aplicarRecompensa,
  atender,
  pasarASillon,
  registrarMensaje,
  retirarLlavero,
} from '../lib/actions';
import {
  barberiaActiva,
  clienteDe,
  colaDelDia,
  fidelidadDe,
  llaveroDeCliente,
  servicioDe,
  serviciosDe,
  ultimaVisita,
  visitasDe,
} from '../lib/derive';
import { estadoPin, quitarPinComoBarbero } from '../lib/publico';
import { fmtFechaCorta, fmtDuracion, fmtEuros, fmtHora, telefonoBonito, ultimaVisitaTexto } from '../lib/format';
import { Shell } from '../components/Shell';
import { vocabulario } from '../lib/vocabulario';
import { Sellos } from '../components/Timer';
import {
  Avatar,
  Btn,
  Confirmar,
  Eyebrow,
  Pill,
  Rule,
  Sheet,
  btnClases,
  cn,
  inputClases,
  toast,
} from '../components/ui';

export default function Ficha() {
  const { id } = useParams();
  const db = useDb();
  const navegar = useNavigate();
  const loc = useLocation();
  const barberia = barberiaActiva(db);
  const v = vocabulario(barberia.tipo);

  const [editCorta, setEditCorta] = useState(false);
  const [editNotas, setEditNotas] = useState(false);
  const [corta, setCorta] = useState('');
  const [notas, setNotas] = useState('');
  const [nuevaCola, setNuevaCola] = useState(false);
  const [servicioElegido, setServicioElegido] = useState<string>('');
  const [retirar, setRetirar] = useState(false);
  const [claveQuitar, setClaveQuitar] = useState(false);
  const [conPin, setConPin] = useState(false);
  const [premio, setPremio] = useState(false);
  const [verTodo, setVerTodo] = useState(false);

  const cliente = clienteDe(db, id);

  const cortaActual = cliente?.comoCorta ?? '';
  const notasActuales = cliente?.notas ?? '';
  useEffect(() => {
    setCorta(cortaActual);
  }, [cortaActual]);
  useEffect(() => {
    setNotas(notasActuales);
  }, [notasActuales]);

  // El PIN no viaja con el cliente: se pregunta aparte, y solo dice si lo hay.
  const clienteId = cliente?.id;
  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    estadoPin(clienteId)
      .then((hay) => {
        if (vivo) setConPin(hay);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  if (!cliente) {
    return (
      <Shell barberia={barberia} activo="/barbero/clientes">
        <div className="pt-10 text-center">
          <p className="font-serif text-[20px] text-ink">No encuentro a este cliente</p>
          <Link to="/barbero/clientes" className={btnClases('outline', 'md', 'mt-4')}>
            Volver al directorio
          </Link>
        </div>
      </Shell>
    );
  }

  const cola = colaDelDia(db, barberia.id);
  const enEspera = cola.esperando.find((q) => q.clienteId === cliente.id);
  const enSillon = cola.sillon?.clienteId === cliente.id ? cola.sillon : null;
  const fidelidad = fidelidadDe(db, cliente);
  const llavero = llaveroDeCliente(db, cliente.id);

  const visitas = visitasDe(db, cliente.id);
  const ultima = ultimaVisita(db, cliente.id);
  const servicios = serviciosDe(db, barberia.id);
  const otroEnSillon = !!cola.sillon && !enSillon;

  const guardarCorta = () => {
    actualizarCliente(cliente.id, { comoCorta: corta.trim() });
    setEditCorta(false);
    toast(`${v.comoAtiende} guardado`, 'ok');
  };

  const guardarNotas = () => {
    actualizarCliente(cliente.id, { notas: notas.trim() });
    setEditNotas(false);
    toast('Notas guardadas', 'ok');
  };

  const terminar = async () => {
    if (!enSillon) return;
    const r = await atender(enSillon.id, enSillon.servicioId);
    if (!r) return;
    if (r.recompensaGanada) setPremio(true);
    else toast(`${cliente.nombre}: ${r.cortesTotales} ${v.serviciosMin} registrados`, 'ok');
  };

  const anadir = () => {
    const servicio = servicioElegido || servicios[0]?.id;
    anadirACola(cliente.id, servicio ?? null, 'mostrador');
    setNuevaCola(false);
    toast(`${cliente.nombre} está en la cola`, 'ok');
    navegar('/barbero/cola');
  };

  const copiarEnlace = async () => {
    if (!llavero) return;
    const url = `${window.location.origin}/nfc/${llavero.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace del llavero copiado', 'ok');
    } catch {
      toast('No se pudo copiar en este navegador', 'aviso');
    }
  };

  return (
    <Shell barberia={barberia} activo="/barbero/clientes">
      <div className="pt-4">
        <button
          onClick={() => (loc.state ? navegar(-1) : navegar('/barbero/clientes'))}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} /> Volver
        </button>
      </div>

      {/* CABECERA */}
      <header className="mt-4">
        <div className="flex items-start gap-3.5">
          <Avatar nombre={cliente.nombre} size={46} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                {cliente.codigo}
              </span>
              {enSillon && <Pill tono="brand">{v.enPuesto}</Pill>}
              {enEspera && <Pill tono="warn">Esperando · {cola.esperando.indexOf(enEspera) + 1}º</Pill>}
              {llavero ? <Pill tono="ok">Llavero</Pill> : <Pill>Sin llavero</Pill>}
            </div>
            <h1 className="display mt-1 text-[31px] text-ink">
              {cliente.nombre}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              {cliente.telefono && (
                <a
                  href={`tel:${cliente.telefono.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink"
                >
                  <Phone size={11.5} /> {telefonoBonito(cliente.telefono)}
                </a>
              )}
              <span className="text-faint">
                Cliente desde {fmtFechaCorta(cliente.creadoEn)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* CÓMO CORTA: el corazón de la ficha */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <Eyebrow>{v.comoAtiende}</Eyebrow>
          {!editCorta && (
            <button
              onClick={() => setEditCorta(true)}
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted hover:text-ink"
            >
              <Pencil size={11} /> Editar
            </button>
          )}
        </div>

        {editCorta ? (
          <div className="mt-2">
            <textarea
              value={corta}
              onChange={(e) => setCorta(e.target.value)}
              rows={5}
              autoFocus
              className={cn(inputClases, 'bg-paper font-serif text-[15px] italic leading-relaxed')}
              placeholder="Degradado bajo, laterales al 0,5, arriba con tijera…"
            />
            <div className="mt-2 flex gap-2">
              <Btn t="sm" onClick={guardarCorta}>
                <Check size={13} /> Guardar
              </Btn>
              <Btn
                t="sm"
                v="quiet"
                onClick={() => {
                  setCorta(cliente.comoCorta);
                  setEditCorta(false);
                }}
              >
                <X size={13} /> Cancelar
              </Btn>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditCorta(true)}
            className="mt-2 block w-full rounded-[4px] border border-line bg-paper px-4 py-4 text-left transition-colors hover:border-ink/20"
          >
            <span className="block border-l-2 border-[var(--brand)] pl-3.5 font-serif text-[16px] italic leading-[1.55] text-ink">
              {cliente.comoCorta || 'Todavía no has escrito cómo corta. Toca para añadirlo.'}
            </span>
          </button>
        )}
      </section>

      {/* DATOS DE UN VISTAZO */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        <div>
          <p className="num font-serif text-[21px] leading-none text-ink">{fidelidad.cortes}</p>
          <p className="eyebrow mt-1.5">{v.servicios}</p>
        </div>
        <div className="border-l border-line-soft pl-3">
          <p className="font-serif text-[15px] leading-tight text-ink">{ultimaVisitaTexto(ultima)}</p>
          <p className="eyebrow mt-1.5">Última visita</p>
        </div>
        <div className="border-l border-line-soft pl-3">
          <p className="num font-serif text-[21px] leading-none text-ink">
            {Math.round(visitas.reduce((s, v) => s + v.precio, 0))}
            <span className="text-[13px]"> €</span>
          </p>
          <p className="eyebrow mt-1.5">Gastado</p>
        </div>
      </section>

      <Rule className="my-6" />

      {/* NOTAS Y PREFERENCIAS */}
      <section className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Notas</Eyebrow>
            {!editNotas && (
              <button
                onClick={() => setEditNotas(true)}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted hover:text-ink"
              >
                <Pencil size={11} /> Editar
              </button>
            )}
          </div>
          {editNotas ? (
            <div className="mt-2">
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                autoFocus
                className={inputClases}
              />
              <div className="mt-2 flex gap-2">
                <Btn t="sm" onClick={guardarNotas}>
                  <Check size={13} /> Guardar
                </Btn>
                <Btn
                  t="sm"
                  v="quiet"
                  onClick={() => {
                    setNotas(cliente.notas);
                    setEditNotas(false);
                  }}
                >
                  <X size={13} /> Cancelar
                </Btn>
              </div>
            </div>
          ) : (
            <p
              onClick={() => setEditNotas(true)}
              className={cn(
                'mt-1.5 cursor-text text-[13.5px] leading-relaxed',
                cliente.notas ? 'text-ink-soft' : 'text-faint',
              )}
            >
              {cliente.notas || 'Sin notas.'}
            </p>
          )}
        </div>

        <div>
          <Eyebrow>Preferencias</Eyebrow>
          <p
            className={cn(
              'mt-1.5 text-[13.5px] leading-relaxed',
              cliente.preferencias ? 'text-ink-soft' : 'text-faint',
            )}
          >
            {cliente.preferencias || 'Sin preferencias anotadas.'}
          </p>
        </div>
      </section>

      {/* LLAVERO */}
      <section className="mt-6 rounded-[4px] border border-line bg-paper px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Llavero</Eyebrow>
            {llavero ? (
              <>
                <p className="mt-1.5 text-[13px] font-semibold text-ink">{llavero.codigoCorto}</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Activo desde {fmtFechaCorta(llavero.asignadoEn ?? llavero.creadoEn)} · lote{' '}
                  {llavero.lote}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Sin llavero asignado. Acerca un llavero en blanco al móvil para vincularlo a este
                cliente.
              </p>
            )}
          </div>
          {llavero && (
            <button
              onClick={copiarEnlace}
              className="shrink-0 rounded-[3px] border border-line p-2 text-muted hover:bg-paper-2 hover:text-ink"
              aria-label="Copiar enlace del llavero"
            >
              <Copy size={13} />
            </button>
          )}
        </div>
        {llavero && (
          <button
            onClick={() => setRetirar(true)}
            className="mt-2.5 text-[10.5px] font-medium text-faint underline decoration-line underline-offset-4 hover:text-clay"
          >
            Retirar llavero
          </button>
        )}
      </section>

      {/* TARJETA DEL CLIENTE */}
      <section className="mt-5 rounded-[4px] border border-line bg-paper px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Tarjeta del cliente</Eyebrow>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">
              {conPin ? 'Protegida con PIN' : 'Abierta con el enlace'}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
              {conPin
                ? 'Quien tenga el enlace sin el PIN no ve su nombre, su teléfono ni su historial. Aquí no se puede leer, solo quitar.'
                : 'El enlace de su tarjeta la abre sin pedir nada. El cliente puede ponerle un PIN desde «Mis datos».'}
            </p>
          </div>
        </div>
        {conPin && (
          <button
            onClick={() => setClaveQuitar(true)}
            className="mt-2.5 text-[10.5px] font-medium text-faint underline decoration-line underline-offset-4 hover:text-clay"
          >
            Quitar el PIN al cliente
          </button>
        )}
      </section>

      {/* FIDELIZACIÓN */}
      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Fidelización</Eyebrow>
          <span className="num text-[11px] text-muted">
            {fidelidad.disponibles > 0
              ? `${fidelidad.disponibles} recompensa${fidelidad.disponibles > 1 ? 's' : ''} disponible${fidelidad.disponibles > 1 ? 's' : ''}`
              : `${fidelidad.enCiclo} de ${fidelidad.meta}`}
          </span>
        </div>
        <div className="mt-2.5">
          <Sellos meta={fidelidad.meta} llenos={fidelidad.enCiclo} />
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-[11.5px] leading-relaxed text-muted">
            {fidelidad.disponibles > 0
              ? 'Tiene un corte gratis pendiente de aplicar.'
              : fidelidad.cicloCompleto
                ? 'Ciclo completo: le corresponde un corte gratis.'
                : `Le faltan ${fidelidad.faltan} cortes para el siguiente gratis.`}
          </p>
          {fidelidad.disponibles > 0 && (
            <Btn
              t="sm"
              onClick={() => {
                aplicarRecompensa(cliente.id);
                toast('Recompensa aplicada', 'ok');
              }}
            >
              Aplicar
            </Btn>
          )}
        </div>
      </section>

      {/* HISTORIAL */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Historial</Eyebrow>
          <span className="num text-[11px] text-faint">{visitas.length} visitas</span>
        </div>

        {visitas.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Todavía no hay visitas registradas.</p>
        ) : (
          <ul className="mt-1">
            {visitas.slice(0, verTodo ? visitas.length : 6).map((v) => {
              const s = servicioDe(db, v.servicioId);
              return (
                <li
                  key={v.id}
                  className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2.5"
                >
                  <span className="min-w-0">
                    <span className="num text-[12.5px] text-ink">{fmtFechaCorta(v.fecha)}</span>
                    <span className="ml-2 text-[12.5px] text-ink-soft">{s?.nombre ?? 'Servicio'}</span>
                  </span>
                  <span className="num shrink-0 text-[12px] text-faint">
                    {fmtEuros(v.precio)} · {fmtHora(v.fecha)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {visitas.length > 6 && (
          <button
            onClick={() => setVerTodo((x) => !x)}
            className="mt-2.5 text-[11px] font-semibold text-muted underline decoration-line underline-offset-4 hover:text-ink"
          >
            {verTodo ? 'Ver menos' : `Ver las ${visitas.length} visitas`}
          </button>
        )}
      </section>

      {/* ACCIONES */}
      <section className="mt-7">
        {enSillon ? (
          <Btn t="lg" className="w-full" onClick={() => void terminar()}>
            Terminar y registrar
          </Btn>
        ) : enEspera ? (
          <Btn
            t="lg"
            className="w-full"
            disabled={otroEnSillon}
            onClick={() => {
              pasarASillon(enEspera.id);
              toast(`${cliente.nombre} pasa al ${v.puestoMin}`, 'ok');
            }}
          >
            {otroEnSillon ? v.puestoOcupado : v.pasarAPuesto}
          </Btn>
        ) : (
          <Btn t="lg" className="w-full" onClick={() => setNuevaCola(true)}>
            <Plus size={14} /> Añadir a la cola
          </Btn>
        )}

        <div className="mt-2 flex gap-2">
          <Btn
            v="outline"
            className="flex-1"
            onClick={() => {
              registrarMensaje({
                clienteId: cliente.id,
                tipo: 'reactivacion',
                canal: 'whatsapp',
                texto: `Hola ${cliente.nombre.split(' ')[0]}, ¿te guardo hueco esta semana? — ${barberia.nombre}`,
              });
              toast('Mensaje registrado como simulado (no se ha enviado)', 'info');
            }}
            disabled={!cliente.consentimientos.marketing}
          >
            Recordar visita
          </Btn>
          <Link
            to={`/c/${cliente.tokenPublico}`}
            className={btnClases('outline', 'md', 'flex-1')}
            target="_blank"
          >
            Ver su tarjeta
          </Link>
        </div>

        {!cliente.consentimientos.marketing && (
          <p className="mt-2 text-center text-[10.5px] text-faint">
            Este cliente no dio consentimiento para recibir avisos.
          </p>
        )}
      </section>

      {/* HOJAS */}
      <Sheet
        open={nuevaCola}
        onClose={() => setNuevaCola(false)}
        titulo="Añadir a la cola"
        descripcion={`${cliente.nombre} entra hoy en la cola de ${barberia.nombre}.`}
        pie={
          <Btn t="md" className="w-full" onClick={anadir}>
            Añadir a la cola
          </Btn>
        }
      >
        <div className="space-y-2">
          <Eyebrow>Servicio</Eyebrow>
          {servicios.map((s) => {
            const on = (servicioElegido || servicios[0]?.id) === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setServicioElegido(s.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-[3px] border px-3.5 py-3 text-left transition-colors',
                  on ? 'border-ink bg-paper' : 'border-line hover:bg-paper',
                )}
              >
                <span className="text-[13px] font-semibold text-ink">{s.nombre}</span>
                <span className="num text-[12px] text-muted">
                  {fmtDuracion(s.minutos)} · {fmtEuros(s.precio)}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <Confirmar
        open={claveQuitar}
        titulo="¿Quitar el PIN de la tarjeta?"
        texto="La tarjeta vuelve a abrirse con su enlace. El cliente podrá poner otro PIN cuando quiera."
        etiquetaConfirmar="Quitar PIN"
        nota={null}
        onClose={() => setClaveQuitar(false)}
        onConfirm={() => {
          void (async () => {
            try {
              const hecho = await quitarPinComoBarbero(cliente.id);
              setConPin(!hecho);
              toast(hecho ? 'PIN quitado' : 'No se pudo quitar el PIN', hecho ? 'ok' : 'aviso');
            } catch {
              toast('No se pudo quitar el PIN', 'aviso');
            }
          })();
        }}
      />

      <Confirmar
        open={retirar}
        titulo="¿Retirar el llavero?"
        texto="El llavero deja de funcionar para siempre y no se puede reasignar. El cliente, su historial y su fidelización no cambian."
        etiquetaConfirmar="Retirar llavero"
        peligro
        onClose={() => setRetirar(false)}
        onConfirm={() => {
          if (llavero) retirarLlavero(llavero.id);
          toast('Llavero retirado', 'info');
        }}
      />

      <Sheet
        open={premio}
        onClose={() => setPremio(false)}
        titulo="Corte gratis conseguido"
        descripcion={`${cliente.nombre} ha llegado a ${fidelidad.cortes} cortes.`}
        pie={
          <div className="flex gap-2">
            <Btn v="outline" className="flex-1" onClick={() => setPremio(false)}>
              No aplicar todavía
            </Btn>
            <Btn
              className="flex-1"
              onClick={() => {
                aplicarRecompensa(cliente.id);
                setPremio(false);
                toast('Recompensa aplicada', 'ok');
              }}
            >
              Aplicar recompensa
            </Btn>
          </div>
        }
      >
        <p className="border-l-2 border-[var(--brand)] pl-3.5 font-serif text-[16px] italic leading-relaxed text-ink">
          «Este cliente ha conseguido su próximo corte gratis.»
        </p>
      </Sheet>
    </Shell>
  );
}
