import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, KeyRound, Nfc, QrCode } from 'lucide-react';
import { useDb } from '../lib/store';
import { haySupabase } from '../lib/supabase';
import { Btn, Eyebrow, Pill, Wordmark, btnClases, cn } from '../components/ui';
import { Foto, PieFoto } from '../components/Foto';
import { TIPOS } from '../lib/vocabulario';

const ENTRADAS = [
  {
    titulo: 'Soy negocio',
    texto: 'Tu cola o agenda, tus clientes y sus fichas. Se entra con la cuenta del local.',
    to: '/barbero/login',
  },
  {
    titulo: 'Soy cliente',
    texto: 'Tu tarjeta, tus sellos y pedir cita. Sin cuenta y sin instalar nada.',
    to: '/cliente',
  },
  {
    titulo: 'Admin',
    texto: 'Locales, llaveros activos y la cuota del mes. La trastienda del producto.',
    to: '/admin',
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
              <Link to="/barbero/cola" className={btnClases('primary', 'lg', 'px-6')}>
                {haySupabase ? 'Entrar en mi negocio' : 'Entrar en la demo'}
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
              <span className="hidden sm:inline">Negocio · cliente · admin</span>
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
                className="group/fila flex items-baseline gap-4 px-1 py-4 transition-colors hover:bg-paper/80"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-[18px] leading-tight text-ink">
                    {e.titulo}
                  </span>
                  <span className="mt-1 block max-w-[52ch] text-[12px] leading-relaxed text-muted">
                    {e.texto}
                  </span>
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
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <Eyebrow>Un producto, cuatro oficios</Eyebrow>
            <span className="num text-[10.5px] tracking-[0.14em] text-faint">01 — 04</span>
          </div>
          <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {TIPOS.map((t) => (
              <div key={t.tipo} className="border-t border-line pt-2.5">
                <p className="font-serif text-[17px] leading-tight text-ink">{t.etiqueta}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{t.pista}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-[62ch] text-[11.5px] leading-relaxed text-faint">
            Eliges el tipo al crear el local y la app cambia sus palabras: la cola o la agenda, el
            sillón o la mesa, cómo corta o el diseño del proyecto. Los servicios, los precios y los
            puestos los pones tú, y el tipo se puede cambiar cuando quieras.
          </p>
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
              <p className="max-w-[22ch] font-serif text-[21px] italic leading-[1.15] text-ivory sm:text-[26px] lg:max-w-[26ch] lg:text-[32px]">
                «Nadie debería tener que recordar lo que ya le contó su cliente.»
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

        {/* PRECIO */}
        <section className="mt-12 border-t border-line pt-6 lg:mt-16">
          <Eyebrow>Lo que cuesta</Eyebrow>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 sm:gap-12">
            <div>
              <p className="num display text-[46px] text-ink lg:text-[56px]">30 €</p>
              <p className="mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-muted">
                Alta del negocio con quince llaveros, una sola vez. Los chips se graban en blanco:
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
            {haySupabase
              ? 'Cada negocio guarda sus datos en su propia base de datos. No se envía ningún mensaje automático, el cobro de la cuota se calcula y no se factura, y no se comparte nada con terceros.'
              : 'Demo con datos falsos y aislados. No se envía ningún mensaje, no se cobra nada y no hay ninguna integración externa conectada. Los cambios se guardan en este navegador.'}
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
