import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, Nfc, QrCode } from 'lucide-react';
import { useDb } from '../lib/store';
import { haySupabase } from '../lib/supabase';
import { Btn, Eyebrow, Pill, Wordmark, btnClases, cn } from '../components/ui';
import { Foto, PieFoto } from '../components/Foto';

const PUERTAS = [
  {
    n: '01',
    titulo: 'El barbero',
    texto:
      'La cola del día, la ficha de cada cliente y su memoria. Se usa con una mano, mientras se trabaja.',
    to: '/barbero/cola',
  },
  {
    n: '02',
    titulo: 'El cliente',
    texto:
      'Su tarjeta de socio: fidelización, historial y pedir cita sin crear ninguna cuenta.',
    to: '/c/P-0004', // se sustituye por el token real del cliente de ejemplo
  },
  {
    n: '03',
    titulo: 'El creador',
    texto: 'Barberías, llaveros activos y la cuota del mes. La trastienda del producto.',
    to: '/admin',
  },
];

const PASOS = [
  {
    n: '01',
    titulo: 'Alta en el mostrador',
    texto:
      'Nombre, cómo corta y un llavero que se vincula con el primer toque. Menos de noventa segundos, con el cliente delante.',
  },
  {
    n: '02',
    titulo: 'El cliente se lo lleva',
    texto:
      'Su tarjeta digital funciona desde ese momento: fidelización, historial y pedir cita. Sin cuenta y sin instalar nada.',
  },
  {
    n: '03',
    titulo: 'Vuelve, y ya le conoces',
    texto:
      'Acerca el llavero al móvil y aparece la ficha. Deja de preguntar lo que ya te contó la última vez.',
  },
];

export default function Landing() {
  const db = useDb();
  const activo = db.llaveros.find((l) => l.estado === 'activo');
  const libre = db.llaveros.find((l) => l.estado === 'sin_asignar');
  const retirado = db.llaveros.find((l) => l.estado === 'retirado');
  const ejemplo = db.clientes.find((c) => c.codigo === 'P-0004');
  const tarjetaDemo = ejemplo ? `/c/${ejemplo.tokenPublico}` : '/';
  const puertas = PUERTAS.map((p) => (p.n === '02' ? { ...p, to: tarjetaDemo } : p));

  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:inline">
              Producto para barberías
            </span>
            {!haySupabase && <Pill tono="warn">Demo</Pill>}
          </div>
        </header>

        {/* HERO */}
        <section className="mt-10 lg:mt-16 lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:items-start lg:gap-12">
          <div>
            <Eyebrow>El llavero · la ficha · la vuelta</Eyebrow>
            <h1 className="display mt-5 max-w-[16ch] text-[42px] text-ink sm:text-[54px] lg:text-[66px]">
              El llavero que hace que tu barbería
              <span className="display-i text-[var(--brand)]"> te conozca.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft">
              El cliente acerca su llavero al móvil del barbero y aparece su ficha: cómo corta,
              cuándo vino y cuántas veces. Sin buscar, sin preguntar, sin recordar de memoria.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <Link to="/barbero/cola" className={btnClases('primary', 'lg', 'px-6')}>
                Entrar en la demo
              </Link>
              {!haySupabase && (
                <Link to={tarjetaDemo} className={btnClases('outline', 'lg')}>
                  Ver una tarjeta
                </Link>
              )}
            </div>

            <p className="mt-5 flex items-center gap-3 text-[11px] leading-relaxed text-faint">
              <span aria-hidden className="h-px w-7 bg-line" />
              30 € el alta con 15 llaveros · 15 €/mes · sin permanencia
            </p>
          </div>

          <figure className="mt-9 lg:mt-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2px] bg-paper-2 lg:aspect-[3/4]">
              <Foto
                src="/img/tienda.webp"
                alt="Escaparate de una barbería de 1938 con su poste de barbero"
                prioridad
              />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-ink/15" />
            </div>
            <figcaption className="mt-2 flex items-baseline justify-between gap-4">
              <PieFoto>August Pingpank · 413 Bleecker Street, Nueva York, 1938</PieFoto>
              <span className="pie-foto shrink-0">Archivo</span>
            </figcaption>
          </figure>
        </section>

        {/* PUERTAS */}
        <nav className="mt-10 border-t border-line">
          {puertas.map((p) => (
            <Link
              key={p.n}
              to={p.to}
              className="group flex items-baseline gap-4 border-b border-line px-1 py-5 transition-colors hover:bg-paper/80 sm:gap-7"
            >
              <span className="num shrink-0 font-serif text-[13px] text-faint">{p.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[21px] leading-tight text-ink">{p.titulo}</span>
                <span className="mt-1.5 block max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
                  {p.texto}
                </span>
              </span>
              <ArrowRight
                size={17}
                className="shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
              />
            </Link>
          ))}
        </nav>

        {/* MANIFIESTO */}
        <section className="mt-12 lg:mt-16">
          <div className="relative overflow-hidden rounded-[2px]">
            <div className="aspect-[16/11] lg:aspect-[21/9]">
              <Foto
                src="/img/manos.webp"
                alt="Manos de barbero peinando a un cliente con peine y máquina"
                posicion="center 42%"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/25 to-transparent" />
            <blockquote className="absolute inset-x-4 bottom-4 lg:inset-x-9 lg:bottom-8">
              <p className="max-w-[22ch] font-serif text-[21px] italic leading-[1.15] text-ivory sm:text-[26px] lg:max-w-[26ch] lg:text-[32px]">
                «Un barbero no debería tener que recordar lo que ya le contó su cliente.»
              </p>
            </blockquote>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <PieFoto>El mismo gesto · barbería, hoy</PieFoto>
            <Link
              to="/legal"
              className="pie-foto shrink-0 underline decoration-line underline-offset-4 hover:text-muted"
            >
              Créditos
            </Link>
          </div>
        </section>

        {/* PASOS — banda oscura */}
        <section className="mt-14 -mx-5 bg-ink px-5 py-11 text-ivory sm:-mx-8 sm:px-8 lg:mx-0 lg:mt-20 lg:rounded-[2px] lg:px-12 lg:py-14">
          <div className="flex items-baseline justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ivory/45">
              Cómo funciona
            </span>
            <span className="num text-[10.5px] tracking-[0.14em] text-ivory/30">01 — 03</span>
          </div>

          <div className="mt-9 grid gap-9 sm:grid-cols-3 sm:gap-10">
            {PASOS.map((p) => (
              <div key={p.n} className="border-t border-ivory/15 pt-5">
                <span className="num display text-[32px] text-ivory/25">{p.n}</span>
                <h3 className="mt-3 font-serif text-[20px] leading-[1.15] text-ivory">{p.titulo}</h3>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ivory/55">{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SIMULADOR */}
        <section className="mt-12 lg:mt-16">
          <div className="flex items-baseline justify-between gap-4">
            <Eyebrow>Simulador de llavero</Eyebrow>
            <Pill tono="warn">Simulado</Pill>
          </div>
          <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
            Sin chip físico, esto es lo que ocurre cuando el cliente acerca el llavero al móvil. Se
            abre en otra pestaña, igual que lo haría el sistema operativo al leer la etiqueta.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ToqueDemo
              icono={<Nfc size={15} />}
              titulo="Llavero de Pablo"
              detalle="Ya asignado: abre su ficha."
              token={activo?.token}
            />
            <ToqueDemo
              icono={<QrCode size={15} />}
              titulo="Llavero en blanco"
              detalle="Sin cliente: pide a quién se lo das."
              token={libre?.token}
            />
            <ToqueDemo
              icono={<KeyRound size={15} />}
              titulo="Llavero retirado"
              detalle="Bloqueado: no muestra datos."
              token={retirado?.token}
            />
          </div>
        </section>

        {/* PRECIO */}
        <section className="mt-12 border-t border-line pt-6 lg:mt-16">
          <Eyebrow>Lo que cuesta</Eyebrow>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 sm:gap-12">
            <div>
              <p className="num display text-[46px] text-ink lg:text-[56px]">30 €</p>
              <p className="mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-muted">
                Alta de la barbería con quince llaveros, una sola vez. Los chips se graban en blanco:
                no hace falta saber quién los va a usar.
              </p>
            </div>
            <div>
              <p className="num display text-[46px] text-ink lg:text-[56px]">15 €/mes</p>
              <p className="mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-muted">
                Mínimo. Un euro más por cada llavero activo a partir del decimoquinto, desde el segundo
                mes. Si no activas más, son quince y no cambia.
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-14 border-t border-line pt-5">
          <p className="max-w-[64ch] text-[11.5px] leading-relaxed text-faint">
            Demo con datos falsos y aislados. No se envía ningún mensaje, no se cobra nada y no hay
            ninguna integración externa conectada. Los cambios se guardan en este navegador.
          </p>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-[11.5px]">
            <div className="flex flex-wrap items-baseline gap-4">
              <Link
                to="/legal"
                className="text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
              >
                Textos legales
              </Link>
              <span className="text-faint">
                {db.clientes.length} clientes · {db.llaveros.length} llaveros
              </span>
            </div>
            <span className="pie-foto">
              Fotografías: dominio público y CC BY 2.0 ·{' '}
              <Link to="/legal" className="underline decoration-line underline-offset-2">
                créditos
              </Link>
            </span>
          </div>

          <p
            aria-hidden
            className="mt-16 select-none text-center text-[16vw] font-extrabold uppercase leading-none tracking-[0.1em] text-ink/[0.07] sm:text-[120px]"
          >
            Julex
          </p>
        </footer>
      </div>
    </div>
  );
}

function ToqueDemo({
  icono,
  titulo,
  detalle,
  token,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  token?: string;
}) {
  const contenido = (
    <>
      <span className="flex items-center gap-1.5 text-ink">
        {icono}
        <span className="text-[12px] font-semibold">{titulo}</span>
      </span>
      <span className="mt-1 block text-[11.5px] leading-snug text-muted">{detalle}</span>
    </>
  );

  if (!token) {
    return (
      <div className="rounded-[3px] border border-dashed border-line px-3.5 py-3 opacity-50">
        {contenido}
      </div>
    );
  }

  return (
    <a
      href={`/nfc/${token}`}
      target="_blank"
      rel="noreferrer"
      className="rounded-[3px] border border-line bg-paper px-3.5 py-3 transition-colors hover:border-ink/30 hover:bg-paper-2"
    >
      {contenido}
    </a>
  );
}
