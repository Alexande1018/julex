import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageCircle, TrendingUp, UserMinus } from 'lucide-react';
import { useDb } from '../lib/store';
import { haySupabase, supabase } from '../lib/supabase';
import type { Cliente } from '../lib/types';
import { peticionBajaCliente, registrarMensaje } from '../lib/actions';
import {
  actividadSemanal,
  barberiaActiva,
  clientesActivos,
  clientesInactivos,
  ingresosDelMes,
  llaverosActivos,
  resumenLlaveros,
} from '../lib/derive';
import { fmtEuros, primerNombre, telefonoBonito } from '../lib/format';
import { Shell } from '../components/Shell';
import {
  Btn,
  Eyebrow,
  Pill,
  Rule,
  Sheet,
  Stat,
  cn,
  inputClases,
  toast,
} from '../components/ui';

export default function Panel() {
  const db = useDb();
  const barberia = barberiaActiva(db);
  const [recordar, setRecordar] = useState<string | null>(null);
  const [pedidas, setPedidas] = useState<Set<string>>(new Set());
  const [resenas, setResenas] = useState<
    {
      id: string;
      programada_para: string;
      clientes: { nombre: string; telefono: string | null } | null;
    }[]
  >([]);

  const clientes = db.clientes.filter((c) => c.barberiaId === barberia.id);
  const activos = clientesActivos(db, barberia.id, 30);
  const llaveros = resumenLlaveros(db, barberia.id);
  const activosLlavero = llaverosActivos(db, barberia.id);
  const semanas = actividadSemanal(db, barberia.id, 8);
  const inactivos = clientesInactivos(db, barberia.id, 60);
  const ingresos = ingresosDelMes(db, barberia.id);

  const ahora = new Date();
  const citasMes = db.citas.filter((c) => {
    if (c.barberiaId !== barberia.id) return false;
    const d = new Date(c.inicio);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  });
  const porOrigen = (origen: string) => citasMes.filter((c) => c.origen === origen).length;

  const maxSemana = Math.max(1, ...semanas.map((s) => s.visitas));
  const totalSemanas = semanas.reduce((s, w) => s + w.visitas, 0);

  useEffect(() => {
    if (!haySupabase || !supabase) return;
    void supabase
      .from('resenas')
      .select('id, programada_para, clientes(nombre, telefono)')
      .eq('estado', 'pendiente')
      .lte('programada_para', new Date().toISOString())
      .order('programada_para')
      .then(({ data }) => setResenas((data ?? []) as unknown as typeof resenas));
  }, []);

  const textoResena = (nombre: string) =>
    `Hola ${nombre.split(' ')[0]}, gracias por tu visita a ${barberia.nombre}. Si te apetece, déjanos una reseña: ${barberia.googleResenaUrl}`;

  const enviarResena = async (r: (typeof resenas)[number], canal: 'sms' | 'whatsapp') => {
    const nombre = r.clientes?.nombre ?? '';
    const tel = (r.clientes?.telefono ?? '').replace(/[^\d+]/g, '');
    const texto = textoResena(nombre || 'hola');

    if (!barberia.googleResenaUrl) {
      toast('Pon antes el enlace de reseñas en Ajustes', 'aviso');
      return;
    }
    if (tel.length < 6) {
      toast('Ese cliente no tiene teléfono', 'aviso');
      return;
    }

    if (canal === 'whatsapp') {
      const t = tel.startsWith('34') && tel.length >= 11 ? tel : tel.length === 9 ? `34${tel}` : tel;
      window.open(`https://wa.me/${t}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    } else {
      const movil = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (!movil) {
        await navigator.clipboard.writeText(texto).catch(() => undefined);
        toast('Texto copiado: pégalo en un SMS', 'info');
      } else {
        const sep = /iPhone|iPad/i.test(navigator.userAgent) ? '&' : '?';
        window.location.href = `sms:${tel}${sep}body=${encodeURIComponent(texto)}`;
      }
    }

    if (supabase) {
      await supabase
        .from('resenas')
        .update({ estado: 'enviada', enviada_en: new Date().toISOString(), canal })
        .eq('id', r.id);
      setResenas((x) => x.filter((y) => y.id !== r.id));
    }
  };

  const descartarResena = async (id: string) => {
    if (!supabase) return;
    await supabase.from('resenas').update({ estado: 'descartada' }).eq('id', id);
    setResenas((x) => x.filter((y) => y.id !== id));
  };

  const enlaceCita = `${window.location.origin}/cita/${barberia.slug}`;
  const mensajeCita = (c: Cliente) =>
    `En ${barberia.nombre} te están esperando. ¿Quieres apartar tu cita? Pide la tuya aquí: ${enlaceCita}`;

  /** WhatsApp necesita el número en formato internacional, sin signos. */
  const telInternacional = (tel: string) => {
    const d = tel.replace(/\D/g, '');
    if (d.startsWith('34') && d.length >= 11) return d;
    if (d.startsWith('0')) return `34${d.slice(1)}`;
    if (d.length === 9) return `34${d}`;
    return d;
  };

  const abrirWhatsapp = (c: Cliente) => {
    const tel = telInternacional(c.telefono);
    if (tel.length < 9) {
      toast('Este cliente no tiene un teléfono válido', 'aviso');
      return;
    }
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeCita(c))}`, '_blank', 'noopener');
  };

  const abrirSms = (c: Cliente) => {
    const texto = mensajeCita(c);
    const tel = c.telefono.replace(/[^\d+]/g, '');
    const movil = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) && tel.length > 5;
    if (!movil) {
      void navigator.clipboard
        .writeText(texto)
        .then(() => toast('Texto copiado: pégalo en un SMS', 'info'))
        .catch(() => toast('No se pudo copiar el texto', 'aviso'));
      return;
    }
    const sep = /iPhone|iPad/i.test(navigator.userAgent) ? '&' : '?';
    window.location.href = `sms:${tel}${sep}body=${encodeURIComponent(texto)}`;
  };

  const clienteRecordar = recordar ? clientes.find((c) => c.id === recordar) : undefined;

  const pedirBaja = async (clienteId: string) => {
    const enviada = await peticionBajaCliente(clienteId);
    if (!enviada) {
      toast('No se pudo enviar la petición', 'aviso');
      return;
    }
    setPedidas((x) => new Set(x).add(clienteId));
    toast('Solicitud enviada al administrador', 'ok');
  };

  return (
    <Shell barberia={barberia} activo="/barbero/panel">
      <div className="pt-5">
        <Eyebrow>Panel</Eyebrow>
        <h1 className="mt-1.5 font-serif text-[27px] leading-none tracking-tight text-ink">
          Tu barbería en números
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Todo sale de las visitas y citas registradas en JULEX. Nada estimado a ojo.
        </p>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        <Stat valor={clientes.length} etiqueta="Clientes" nota={`${activos.length} activos en 30 días`} />
        <Stat
          valor={llaveros.activos}
          etiqueta="Llaveros activos"
          nota={`${llaveros.sinAsignar} sin asignar`}
        />
        <Stat valor={citasMes.length} etiqueta="Citas del mes" nota={`${porOrigen('qr')} por QR`} />
        <Stat
          valor={fmtEuros(ingresos)}
          etiqueta="Ingresos del mes"
          nota="A precio de tarifa"
          grande={false}
        />
      </section>

      <Rule className="my-6" />

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Actividad · 8 semanas</Eyebrow>
          <span className="num text-[11px] text-muted">{totalSemanas} visitas</span>
        </div>

        <div className="mt-4 flex items-end gap-1.5">
          {semanas.map((s, i) => {
            const alto = Math.max(3, Math.round((s.visitas / maxSemana) * 78));
            const ultima = i === semanas.length - 1;
            return (
              <div key={s.etiqueta} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="num text-[9.5px] leading-none text-faint">{s.visitas || ''}</span>
                <div
                  className={cn(
                    'w-full rounded-t-[1px] transition-[height] duration-300',
                    s.visitas === 0 ? 'bg-line' : ultima ? 'bg-[var(--brand)]' : 'bg-ink/35',
                  )}
                  style={{ height: `${alto}px` }}
                  title={`${s.etiqueta}: ${s.visitas} visitas`}
                />
                <span className="num text-[8.5px] leading-none text-faint">{s.etiqueta}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-faint">
          Cada barra es una semana. La última, la que termina hoy.
        </p>
      </section>

      <Rule className="my-6" />

      <section>
        {resenas.length > 0 && (
          <>
            <div className="flex items-baseline justify-between">
              <Eyebrow>Reseñas pendientes</Eyebrow>
              <span className="num text-[11px] text-clay">{resenas.length}</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              Estos clientes salieron hace más de dos horas. Un mensaje con el enlace de tu ficha de
              Google y listo.
            </p>
            <ul className="mt-1">
              {resenas.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {r.clientes?.nombre}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => void enviarResena(r, 'whatsapp')}
                      className="inline-flex items-center gap-1 rounded-[2px] border border-line px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-soft hover:border-ink/30 hover:text-ink"
                    >
                      WhatsApp
                    </button>
                    <button
                      onClick={() => void enviarResena(r, 'sms')}
                      className="inline-flex items-center gap-1 rounded-[2px] border border-line px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-soft hover:border-ink/30 hover:text-ink"
                    >
                      SMS
                    </button>
                    <button
                      onClick={() => void descartarResena(r.id)}
                      className="rounded-[2px] px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint hover:text-clay"
                    >
                      Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Rule className="my-6" />
          </>
        )}

        <div className="flex items-baseline justify-between">
          <Eyebrow>Sin venir más de 60 días</Eyebrow>
          <span className="num text-[11px] text-faint">{inactivos.length}</span>
        </div>

        {inactivos.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            No hay nadie perdido ahora mismo. Es buena señal.
          </p>
        ) : (
          <ul className="mt-1">
            {inactivos.map(({ cliente, dias }) => {
              const consentimiento = cliente.consentimientos.promociones || cliente.consentimientos.marketing;
              return (
                <li
                  key={cliente.id}
                  className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0"
                >
                  <span className="num w-9 shrink-0 font-serif text-[14px] text-clay">{dias} d</span>
                  <Link
                    to={`/barbero/clientes/${cliente.id}`}
                    className="min-w-0 flex-1 truncate text-[13px] text-ink hover:underline"
                  >
                    {cliente.nombre}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => void pedirBaja(cliente.id)}
                      disabled={pedidas.has(cliente.id)}
                      title={
                        pedidas.has(cliente.id)
                          ? 'Solicitud enviada al administrador'
                          : 'Pedir al administrador que retire su llavero'
                      }
                      className="inline-flex items-center gap-1 rounded-[2px] border border-line px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-soft transition-colors enabled:hover:border-clay/50 enabled:hover:text-clay disabled:opacity-35"
                    >
                      <UserMinus size={10} /> {pedidas.has(cliente.id) ? 'Pedida' : 'Baja'}
                    </button>
                    <button
                      onClick={() => setRecordar(cliente.id)}
                      disabled={!consentimiento}
                      title={
                        consentimiento
                          ? 'Enviar un mensaje con el enlace para pedir cita'
                          : 'Sin consentimiento para promociones'
                      }
                      className="inline-flex items-center gap-1 rounded-[2px] border border-line px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-soft transition-colors enabled:hover:border-ink/30 enabled:hover:text-ink disabled:opacity-35"
                    >
                      <MessageCircle size={10} /> Mensaje
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          «Baja» pide al administrador que retire el llavero; no se ejecuta solo. «Mensaje» abre tu
          aplicación de SMS con el texto y el enlace listos, y solo está disponible si el cliente
          aceptó promociones.
        </p>
      </section>

      <Rule className="my-6" />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
          <Eyebrow>Origen de las citas</Eyebrow>
          <div className="mt-2.5 flex gap-4">
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">{porOrigen('qr')}</p>
              <p className="eyebrow mt-1">QR</p>
            </div>
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">{porOrigen('llavero')}</p>
              <p className="eyebrow mt-1">Llavero</p>
            </div>
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">
                {porOrigen('manual') + porOrigen('web')}
              </p>
              <p className="eyebrow mt-1">Otros</p>
            </div>
          </div>
        </div>

        <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
          <Eyebrow>Llaveros</Eyebrow>
          <div className="mt-2.5 flex items-center justify-between">
            <div>
              <p className="num font-serif text-[20px] leading-none text-ink">{llaveros.activos}</p>
              <p className="eyebrow mt-1">activos de {llaveros.total}</p>
            </div>
            <Link
              to="/barbero/clientes"
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted hover:text-ink"
            >
              Asignar <ArrowUpRight size={11} />
            </Link>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${(llaveros.activos / Math.max(1, llaveros.total)) * 100}%` }}
            />
          </div>
        </div>
      </section>

      <p className="mt-4 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
        <TrendingUp size={12} className="mt-0.5 shrink-0" />
        Los ingresos se calculan con las visitas registradas a precio de tarifa. La caja real —efectivo,
        tarjeta, bonos— llega en la siguiente entrega.
      </p>

      <Sheet
        open={!!recordar}
        onClose={() => setRecordar(null)}
        titulo="Recordatorio de visita"
        descripcion={
          clienteRecordar
            ? `${clienteRecordar.nombre} · ${telefonoBonito(clienteRecordar.telefono)}`
            : ''
        }
        pie={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Btn
                v="outline"
                className="flex-1"
                onClick={() => {
                  if (!clienteRecordar) return;
                  abrirSms(clienteRecordar);
                  registrarMensaje({
                    clienteId: clienteRecordar.id,
                    tipo: 'reactivacion',
                    canal: 'sms',
                    texto: mensajeCita(clienteRecordar),
                  });
                  setRecordar(null);
                }}
              >
                SMS
              </Btn>
              <Btn
                className="flex-1"
                onClick={() => {
                  if (!clienteRecordar) return;
                  abrirWhatsapp(clienteRecordar);
                  registrarMensaje({
                    clienteId: clienteRecordar.id,
                    tipo: 'reactivacion',
                    canal: 'whatsapp',
                    texto: mensajeCita(clienteRecordar),
                  });
                  setRecordar(null);
                }}
              >
                WhatsApp
              </Btn>
            </div>
            <Btn
              v="quiet"
              onClick={() => {
                if (!clienteRecordar) return;
                void navigator.clipboard
                  .writeText(mensajeCita(clienteRecordar))
                  .then(() => toast('Texto copiado', 'info'))
                  .catch(() => toast('No se pudo copiar', 'aviso'));
              }}
            >
              Copiar el texto
            </Btn>
          </div>
        }
      >
        {clienteRecordar && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Pill tono="ok">Con consentimiento</Pill>
              <span className="text-[11px] text-muted">Promociones aceptadas</span>
            </div>
            <p className="rounded-[3px] border border-line bg-paper px-3.5 py-3 font-serif text-[14px] italic leading-relaxed text-ink">
              {mensajeCita(clienteRecordar)}
            </p>
            <p className="break-all rounded-[3px] border border-line bg-ivory px-3 py-2 text-[11px] text-muted">
              {enlaceCita}
            </p>
            <p className="text-[11px] leading-relaxed text-faint">
              SMS abre la aplicación de mensajes del móvil; WhatsApp abre el chat en la app o en
              WhatsApp Web. En los dos casos el mensaje sale de tu número y queda registrado aquí. En
              el ordenador, el SMS no puede abrirse: usa WhatsApp o «Copiar el texto».
            </p>
          </div>
        )}
      </Sheet>
    </Shell>
  );
}
