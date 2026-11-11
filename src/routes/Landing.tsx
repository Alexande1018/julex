import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, KeyRound, Nfc, QrCode } from 'lucide-react';
import { useDb } from '../lib/store';
import { haySupabase } from '../lib/supabase';
import { Btn, Eyebrow, Pill, Wordmark, btnClases, cn } from '../components/ui';
import { Foto, PieFoto } from '../components/Foto';

const ENTRADAS = [
  { titulo: 'Soy negocio', to: '/barbero/login' },
  { titulo: 'Admin', to: '/admin' },
];

const OFICIOS = [
  {
    nombre: 'Barbería',
    imagen: '/img/oficios/barberia.webp',
    alt: 'Barbero afeitando a un cliente en un sillón clásico',
  },
  {
    nombre: 'Peluquería',
    imagen: '/img/oficios/peluqueria.webp',
    alt: 'Peluquera secando el pelo a una clienta con secador y cepillo',
  },
  {
    nombre: 'Salón de uñas',
    imagen: '/img/oficios/unas.webp',
    alt: 'Manicura pintando las uñas de una clienta con un pincel',
  },
  {
    nombre: 'Estudio de tatuaje',
    imagen: '/img/oficios/tatuaje.webp',
    alt: 'Tatuadora trabajando en el brazo de un cliente',
  },
];

const PASOS = [
  {
    n: '01',
    titulo: 'Alta en el mostrador',
    texto:
      'Nombre, lo que le gusta y un llavero que se vincula con el primer toque. Menos de noventa segundos, con el cliente delante.',
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

  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:inline">
              Barbería · peluquería · uñas · tatuaje
            </span>
            {!haySupabase && <Pill tono="warn">Demo</Pill>}
          </div>
        </header>

        {/* HERO */}
        <section className="mt-10 lg:mt-16 lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:items-start lg:gap-12">
          <div>
            <h1 className="display max-w-[22ch] text-[38px] leading-[1.04] text-ink sm:text-[48px] lg:text-[58px]">
              La tecnología ideal para los negocios que trabajan
              <span className="display-i text-[var(--brand)]"> con citas.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">
              Julex ayuda a barberías, peluquerías, salones de uñas y estudios de tatuaje a llevar su
              negocio y a ofrecer una experiencia que invita a volver. Una nueva forma de organizar el
              día, conocer a tus clientes y hacer crecer la relación con cada visita.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {haySupabase ? (
                <>
                  <Link to="/alta" className={btnClases('primary', 'lg', 'px-6')}>
                    Crear mi negocio
                  </Link>
                  <Link to="/barbero/cola" className={btnClases('outline', 'lg')}>
                    Ya tengo cuenta
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/barbero/cola" className={btnClases('primary', 'lg', 'px-6')}>
                    Entrar en la demo
                  </Link>
                  <Link to={tarjetaDemo} className={btnClases('outline', 'lg')}>
                    Ver una tarjeta
                  </Link>
                </>
              )}
            </div>
          </div>

          <figure className="mt-9 lg:mt-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2px] bg-paper-2 lg:aspect-[3/4]">
              <Foto
                src="/img/portada.webp"
                alt="Cuaderno de citas con un llavero JULEX, tijeras y un boceto de tatuaje"
                prioridad
              />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-ink/15" />
            </div>
            <figcaption className="mt-2 flex items-baseline justify-between gap-4">
              <PieFoto>JULEX · cuaderno de citas</PieFoto>
              <span className="pie-foto shrink-0">Producto</span>
            </figcaption>
          </figure>
        </section>

        {/* ENTRAR — un solo desplegable para las tres puertas */}
        <details className="group mt-10 border-t border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-line px-1 py-5 [&::-webkit-details-marker]:hidden">
            <span className="font-serif text-[21px] leading-tight text-ink">Entrar</span>
            <span className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              <span className="hidden sm:inline">Negocio · admin</span>
              <ChevronDown
                size={16}
                className="transition-transform duration-200 group-open:rotate-180"
              />
            </span>
          </summary>

          <div className="border-b border-line">
            {ENTRADAS.map((e) => (
              <Link
                key={e.to}
                to={e.to}
                className="group/fila flex items-center gap-4 px-1 py-4 transition-colors hover:bg-paper/80"
              >
                <span className="min-w-0 flex-1 font-serif text-[18px] leading-tight text-ink">
                  {e.titulo}
                </span>
                <ArrowRight
                  size={15}
                  className="shrink-0 text-faint transition-transform duration-200 group-hover/fila:translate-x-0.5 group-hover/fila:text-ink"
                />
              </Link>
            ))}
          </div>
        </details>

        {/* OFICIOS */}
        <section className="mt-12 lg:mt-16">
          <div className="flex items-baseline justify-between gap-4">
            <Eyebrow>Un mismo JULEX, cuatro oficios</Eyebrow>
            <span className="num text-[10.5px] tracking-[0.14em] text-faint">01 — 04</span>
          </div>
          <p className="mt-3 max-w-[58ch] text-[12.5px] leading-relaxed text-muted">
            Eliges el tipo al crear el local y JULEX cambia sus palabras y su manera de trabajar: la
            cola o la agenda, el sillón o la mesa, cómo corta o el diseño del proyecto. Los servicios,
            los precios y los puestos los pones tú; el oficio decide el vocabulario, no lo que puedes
            hacer.
          </p>

          <div className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {OFICIOS.map((o) => (
              <figure key={o.nombre}>
                <div className="aspect-[4/5] overflow-hidden rounded-[2px] bg-paper-2">
                  <Foto src={o.imagen} alt={o.alt} />
                </div>
                <figcaption className="mt-2.5">
                  <p className="font-serif text-[18px] leading-tight text-ink">{o.nombre}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

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
              <p className="max-w-[30ch] font-serif text-[19px] italic leading-[1.16] text-ivory sm:text-[24px] lg:max-w-[34ch] lg:text-[29px]">
                «Recordar lo que nos cuenta el cliente asegura que siempre estemos un paso adelante en su atención.»
              </p>
            </blockquote>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <PieFoto>El mismo gesto · un negocio, hoy</PieFoto>
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

        {/* SIMULADOR: solo tiene sentido con los datos de ejemplo */}
        {!haySupabase && (
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
        )}

        <footer className="mt-14 border-t border-line pt-5">
          <span className="pie-foto">
            Fotografías: dominio público y CC BY 2.0 ·{' '}
            <Link to="/legal" className="underline decoration-line underline-offset-2">
              créditos
            </Link>
          </span>

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
