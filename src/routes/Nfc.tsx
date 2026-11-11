import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Nfc as NfcIcon, Search } from 'lucide-react';
import { useDb } from '../lib/store';
import { haySupabase, supabase } from '../lib/supabase';
import { anadirACola, asignarLlavero, registrarToque } from '../lib/actions';
import {
  clienteDe,
  colaDelDia,
  fidelidadDe,
  llaveroPorToken,
  posicionEnCola,
  ultimaVisita,
} from '../lib/derive';
import { vocabulario } from '../lib/vocabulario';
import { buscarTexto, fmtFechaCorta, haceCuanto, ultimaVisitaTexto } from '../lib/format';
import {
  Avatar,
  Btn,
  Eyebrow,
  Pill,
  Rule,
  btnClases,
  cn,
  inputClases,
  toast,
} from '../components/ui';

export default function Nfc() {
  const { token } = useParams();
  const db = useDb();
  const navegar = useNavigate();
  const [q, setQ] = useState('');
  const registrado = useRef(false);
  const [resolviendo, setResolviendo] = useState(haySupabase);

  const llavero = token ? llaveroPorToken(db, token) : undefined;
  const barberia = llavero ? db.barberias.find((b) => b.id === llavero.barberiaId) : undefined;
  const cliente = llavero?.clienteId ? clienteDe(db, llavero.clienteId) : undefined;
  const v = vocabulario(barberia?.tipo);

  /**
   * Sin sesión, este enlace no es del barbero: es el móvil del propio cliente.
   * Se traduce el token del llavero al de su tarjeta y se le manda allí. Solo
   * se pide ese texto opaco; lo que se ve lo decide la tarjeta, con su PIN.
   */
  useEffect(() => {
    if (db.sesion || !token) {
      setResolviendo(false);
      return;
    }
    let vivo = true;

    const buscar = async () => {
      let tarjeta: string | null = null;

      if (!haySupabase) {
        const l = llaveroPorToken(db, token);
        const c = l?.clienteId ? clienteDe(db, l.clienteId) : undefined;
        tarjeta = l?.estado === 'activo' && c ? c.tokenPublico : null;
      } else {
        const { data } = await supabase!.rpc('llavero_tarjeta', { p_token: token });
        tarjeta = typeof data === 'string' && data.length > 0 ? data : null;
      }

      if (!vivo) return;
      if (tarjeta) {
        navegar(`/c/${tarjeta}?desde=${encodeURIComponent(token)}`, { replace: true });
      } else {
        setResolviendo(false);
      }
    };

    void buscar().catch(() => {
      if (vivo) setResolviendo(false);
    });

    return () => {
      vivo = false;
    };
  }, [db, token, navegar]);

  useEffect(() => {
    if (!llavero || !cliente || !db.sesion || registrado.current) return;
    registrado.current = true;
    // El toque es el dato: queda registrado para automatizaciones futuras.
    registrarToque(llavero.id, cliente.id);
  }, [llavero, cliente, db.sesion]);

  /* ------------------------- Resolviendo la tarjeta ------------------------- */

  if (resolviendo) {
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center gap-4 bg-ivory">
        <span className="eyebrow">JULEX</span>
        <p className="font-serif text-[19px] text-ink">Abriendo tu tarjeta…</p>
      </div>
    );
  }

  /* ------------------------- Retirado (se sabe en local) ------------------------- */

  if (llavero?.estado === 'retirado') {
    return (
      <Neutro
        titulo="Este llavero ya no está activo"
        texto="Se retiró y no se puede volver a usar, ni siquiera con otro cliente. Tu historial en la barbería sigue intacto."
        pie={
          barberia && (
            <Link
              to={`/cita/${barberia.slug}`}
              className={btnClases('outline', 'md', 'mt-5')}
            >
              Pedir cita igualmente
            </Link>
          )
        }
      />
    );
  }

  /* ------------------------- Sin sesión y sin tarjeta ------------------------- */

  /*
   * Si tuviera tarjeta, ya se habría redirigido arriba. Aquí solo caen los
   * llaveros en blanco, los retirados y los inventados, y desde fuera no se
   * distinguen a propósito.
   */
  if (!db.sesion) {
    return (
      <Neutro
        titulo="Este llavero aún no tiene tarjeta"
        texto="Puede estar en blanco, retirado o no ser de esta barbería. Si eres de la barbería, entra y vuelve a acercarlo para asignarlo."
        pie={
          <Link
            to={`/barbero/login?next=${encodeURIComponent(`/nfc/${token}`)}`}
            className={btnClases('primary', 'md', 'mt-5')}
          >
            Entrar en la barbería
          </Link>
        }
        pie2={llavero ? `Llavero ${llavero.codigoCorto}` : undefined}
      />
    );
  }

  /* ------------------------- Con sesión: llavero desconocido ------------------------- */

  if (!llavero) {
    return (
      <Neutro
        titulo="Llavero no reconocido"
        texto="Este enlace no corresponde a ningún llavero de esta barbería. Si crees que es un error, revisa el inventario o pide uno nuevo."
      />
    );
  }

  /* ------------------------- En blanco: vincular ------------------------- */

  if (!cliente) {
    const candidatos = db.clientes
      .filter((c) => c.barberiaId === llavero.barberiaId)
      .filter((c) => buscarTexto(`${c.nombre} ${c.codigo} ${c.telefono}`, q))
      .slice(0, 8);

    return (
      <div className="grain min-h-dvh bg-ivory" style={{ ['--brand' as string]: barberia?.color }}>
        <div className="mx-auto w-full max-w-md px-5 pb-12 pt-6">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.24em] text-faint">JULEX</span>
            {!haySupabase && <Pill tono="warn">Simulado</Pill>}
          </div>

          <div className="mt-8">
            <div className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-paper text-[var(--brand)]">
              <NfcIcon size={17} />
            </div>
            <h1 className="mt-4 font-serif text-[26px] leading-tight text-ink">
              Llavero sin asignar.
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              Este llavero todavía no es de nadie. Elige al cliente y queda vinculado para siempre.
            </p>
            <p className="num mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">
              {llavero.codigoCorto} · lote {llavero.lote}
            </p>
          </div>

          <Rule className="my-6" />

          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente por nombre o teléfono"
              className={cn(inputClases, 'pl-9')}
              autoFocus
            />
          </div>

          <ul className="mt-2">
            {candidatos.map((c) => (
              <li key={c.id} className="border-b border-line-soft last:border-0">
                <button
                  onClick={() => {
                    asignarLlavero(llavero.token, c.id);
                    toast(`Llavero ${llavero.codigoCorto} vinculado a ${c.nombre}`, 'ok');
                  }}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-paper/60"
                >
                  <Avatar nombre={c.nombre} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{c.nombre}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {c.codigo} · {ultimaVisitaTexto(ultimaVisita(db, c.id))}
                    </span>
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>

          {candidatos.length === 0 && (
            <p className="mt-3 text-[12px] text-muted">Ningún cliente con ese nombre.</p>
          )}

          <Link to="/barbero/alta" className={btnClases('outline', 'md', 'mt-4 w-full border-dashed')}>
            Es un cliente nuevo: darlo de alta
          </Link>

          <p className="mt-4 text-[10.5px] leading-relaxed text-faint">
            En la barbería basta con acercar el llavero al móvil: esta pantalla aparece sola. Elegir de
            la lista es el mismo acto, sin chip.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------- Ficha al tocar ------------------------- */

  const cola = colaDelDia(db, llavero.barberiaId);
  const posicion = posicionEnCola(cola, cliente.id);
  const enSillon = cola.sillon?.clienteId === cliente.id;
  const fidelidad = fidelidadDe(db, cliente);
  const ultima = ultimaVisita(db, cliente.id);

  const anadir = () => {
    anadirACola(cliente.id, db.servicios.find((s) => s.barberiaId === llavero.barberiaId)?.id ?? null, 'llavero');
    toast(`${cliente.nombre} añadido a la cola`, 'ok');
    navegar('/barbero/cola');
  };

  return (
    <div className="grain min-h-dvh bg-ivory" style={{ ['--brand' as string]: barberia?.color }}>
      {/* Banda de lectura */}
      <div className="bg-[var(--brand)] px-5 pb-7 pt-6 text-ivory">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.22em] text-ivory/60">
              <NfcIcon size={12} /> Llavero leído
            </span>
            <span className="num text-[9.5px] font-bold tracking-[0.12em] text-ivory/50">
              {llavero.codigoCorto}
            </span>
          </div>

          <p className="mt-3 text-[11px] text-ivory/60">{barberia?.nombre}</p>
          <h1 className="mt-1 font-serif text-[30px] leading-[1.03] text-ivory">{cliente.nombre}</h1>

          <div className="mt-4 flex items-center gap-3">
            <div>
              <p className="num font-serif text-[21px] leading-none text-ivory">{fidelidad.cortes}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ivory/45">{v.serviciosMin}</p>
            </div>
            <span className="h-7 w-px bg-ivory/20" />
            <div>
              <p className="font-serif text-[14px] leading-none text-ivory">
                {ultimaVisitaTexto(ultima)}
              </p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ivory/45">
                última visita
              </p>
            </div>
            <span className="h-7 w-px bg-ivory/20" />
            <div>
              <p className="num font-serif text-[14px] leading-none text-ivory">
                {fidelidad.enCiclo}/{fidelidad.meta}
              </p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ivory/45">
                fidelización
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-6">
        {/* CÓMO CORTA */}
        <section>
          <Eyebrow>{v.comoAtiende}</Eyebrow>
          <p className="mt-2 border-l-2 border-[var(--brand)] pl-3.5 font-serif text-[16px] italic leading-[1.55] text-ink">
            {cliente.comoCorta || 'Sin notas todavía. Pregúntale y apúntalo después.'}
          </p>
        </section>

        {cliente.notas && (
          <section className="mt-5">
            <Eyebrow>Notas</Eyebrow>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{cliente.notas}</p>
          </section>
        )}

        {cliente.preferencias && (
          <section className="mt-4">
            <Eyebrow>Prefiere</Eyebrow>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{cliente.preferencias}</p>
          </section>
        )}

        <Rule className="my-6" />

        {/* ESTADO */}
        {enSillon ? (
          <div className="rounded-[4px] border border-line bg-paper px-4 py-3">
            <Pill tono="brand">{v.enPuesto}</Pill>
            <p className="mt-2 text-[12px] text-ink-soft">
              Empezó a las {haceCuanto(cola.sillon!.inicioEn ?? cola.sillon!.llegadaEn).replace('hace ', 'hace ')}.
            </p>
          </div>
        ) : posicion ? (
          <div className="rounded-[4px] border border-line bg-paper px-4 py-3">
            <Pill tono="warn">Esperando · {posicion}º</Pill>
            <p className="mt-2 text-[12px] text-ink-soft">
              Llegó {haceCuanto(cola.esperando[posicion - 1].llegadaEn)}.
            </p>
          </div>
        ) : (
          <Btn t="lg" className="w-full" onClick={anadir}>
            Añadir a la cola
          </Btn>
        )}

        <div className="mt-2 flex gap-2">
          <Link
            to={`/barbero/clientes/${cliente.id}`}
            className={btnClases('outline', 'md', 'flex-1')}
          >
            Ficha completa
          </Link>
          <Link to="/barbero/cola" className={btnClases('quiet', 'md', 'flex-1')}>
            Ir a la cola
          </Link>
        </div>

        <p className="mt-6 text-[10px] leading-relaxed text-faint">
          Lectura simulada por URL, igual que la haría el sistema operativo al detectar la etiqueta.
          La ficha privada solo se muestra con la sesión de la barbería.
        </p>
      </div>
    </div>
  );
}

function Neutro({
  titulo,
  texto,
  pie,
  pie2,
}: {
  titulo: string;
  texto: string;
  pie?: React.ReactNode;
  pie2?: string;
}) {
  return (
    <div className="grain flex min-h-dvh flex-col bg-ivory">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.24em] text-faint">JULEX</span>
        <h1 className="mt-4 font-serif text-[25px] leading-tight text-ink">{titulo}</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{texto}</p>
        {pie}
        {pie2 && <p className="num mt-4 text-[10.5px] uppercase tracking-[0.12em] text-faint">{pie2}</p>}
        <Link
          to="/"
          className="mt-8 text-[11px] font-medium text-faint underline decoration-line underline-offset-4 hover:text-muted"
        >
          Ir al inicio de JULEX
        </Link>
      </div>
    </div>
  );
}
