import { Link } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Check,
  CreditCard,
  ListOrdered,
  MessageCircle,
  Nfc,
  Package,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { Btn, Eyebrow, Rule, Wordmark, btnClases } from '../components/ui';
import { haySupabase } from '../lib/supabase';

/* ------------------------------------------------------------------ */
/* Contenido                                                           */
/* ------------------------------------------------------------------ */

const BLOQUES = [
  {
    ceja: 'El día a día',
    titulo: 'La cola y la agenda, en la misma pantalla.',
    texto:
      'Quién está esperando, quién ocupa cada sillón y qué viene después. La cola avanza sola al terminar un corte y la agenda reparte las citas entre los puestos sin pisarse.',
    puntos: [
      'Cola en vivo con el tiempo de espera de cada uno',
      'Relevo automático al sillón que se queda libre',
      'Agenda por día y por puesto, con la duración real de cada servicio',
      'Citas creadas a mano cuando llaman por teléfono',
    ],
    imagen: '/img/manos.webp',
    alt: 'Barbero trabajando con peine y tijera',
  },
  {
    ceja: 'El cliente',
    titulo: 'Su ficha, antes de que se siente.',
    texto:
      'Acerca su llavero al móvil y aparece lo que necesitas: cómo corta, qué pidió la última vez, cuánto lleva sin venir y qué recompensa tiene pendiente. Sin buscar, sin preguntar, sin acordarte de memoria.',
    puntos: [
      'Cómo corta, notas y preferencias de atención',
      'Historial de visitas con servicio e importe',
      'Sellos de fidelización y recompensa disponible',
      'Aviso si el cliente protegió su tarjeta con PIN',
    ],
    imagen: '/img/tienda.webp',
    alt: 'Escaparate de barbería de archivo',
  },
  {
    ceja: 'El negocio',
    titulo: 'Los números que de verdad usas.',
    texto:
      'Cuántos clientes tienes, cuántos han venido este mes, de dónde llegan las citas y quién lleva dos meses sin aparecer. Todo sale de las visitas que registras, no de una estimación.',
    puntos: [
      'Clientes activos, citas e ingresos del mes',
      'Origen de cada cita: QR, llavero u otras',
      'Clientes que llevan más de 60 días sin venir',
      'Aviso por SMS o WhatsApp a quien no vuelve',
    ],
    imagen: '/img/oficios/barberia.webp',
    alt: 'Barbero afeitando a un cliente en un sillón clásico',
  },
];

const GRUPOS = [
  {
    ceja: 'Día a día',
    funciones: [
      {
        Icon: ListOrdered,
        titulo: 'La cola',
        texto: 'Quién espera, quién está en el sillón y cuánto lleva cada uno. Se avanza con un toque.',
      },
      {
        Icon: CalendarDays,
        titulo: 'Agenda por puesto',
        texto: 'Un día por pantalla, una columna por sillón, con la duración real de cada servicio.',
      },
      {
        Icon: QrCode,
        titulo: 'Reservas 24 h',
        texto: 'El cliente reserva solo desde tu página o el QR del mostrador. Sin cuenta y sin llamar.',
      },
    ],
  },
  {
    ceja: 'El cliente',
    funciones: [
      {
        Icon: Nfc,
        titulo: 'El llavero',
        texto:
          'Un toque y aparece su ficha, si lo tocas tú, o su tarjeta, si lo toca él. Sin app que instalar.',
      },
      {
        Icon: UserRound,
        titulo: 'Lo que le gusta',
        texto: 'Su degradado, su máquina, lo que no quiere. Se escribe una vez y se recuerda siempre.',
      },
      {
        Icon: Smartphone,
        titulo: 'Su tarjeta',
        texto: 'Sellos, próxima cita, historial y pedir cita. Con PIN opcional si pierde el llavero.',
      },
      {
        Icon: Clock3,
        titulo: 'Historial y gasto',
        texto: 'Cada visita con su fecha, su servicio y su importe. Y lo que lleva gastado desde que es cliente.',
      },
      {
        Icon: Sparkles,
        titulo: 'Fidelización',
        texto: 'Cada visita suma. Al llegar a la meta, la recompensa se genera sola y se aplica al cobrar.',
      },
      {
        Icon: MessageCircle,
        titulo: 'Mensajes',
        texto:
          'A quien lleva 60 días sin venir: SMS o WhatsApp con el texto y el enlace ya escritos, desde tu móvil.',
      },
    ],
  },
  {
    ceja: 'El negocio',
    funciones: [
      {
        Icon: BarChart3,
        titulo: 'El panel',
        texto: 'Clientes, citas, ingresos, actividad de ocho semanas y de dónde llega cada reserva.',
      },
      {
        Icon: Users,
        titulo: 'Cuatro oficios',
        texto:
          'Barbería, peluquería, salón de uñas o estudio de tatuaje: cambia el vocabulario y los servicios de partida.',
      },
      {
        Icon: CreditCard,
        titulo: 'Pago automático',
        texto: 'Alta, cuota mensual con tope, facturas y pausa para vacaciones de hasta 30 días.',
      },
      {
        Icon: ShieldCheck,
        titulo: 'Privacidad',
        texto: 'Permisos separados, bajas con plazo y tus textos legales enlazados desde la tarjeta.',
      },
      {
        Icon: Package,
        titulo: 'Llaveros',
        texto: 'Pedidos de 5 en 5 desde el panel, con la dirección de envío en tu ficha.',
      },
      {
        Icon: Wallet,
        titulo: 'Sin permanencia',
        texto: 'La cuota nunca pasa de 40 € al mes. Cada llavero extra, 1 € una sola vez.',
      },
    ],
  },
];

const PASOS = [
  {
    n: '01',
    titulo: 'Crea tu negocio',
    texto: 'Nombre, oficio y tus datos. En dos minutos tienes panel, página de reservas y servicios.',
  },
  {
    n: '02',
    titulo: 'Da de alta a tus clientes',
    texto: 'Nombre, lo que le gusta y un llavero. Menos de noventa segundos, con el cliente delante.',
  },
  {
    n: '03',
    titulo: 'Trabaja como siempre',
    texto: 'La cola, la agenda y el llavero hacen el resto. Tú sigues cortando; JULEX recuerda.',
  },
];

const PREGUNTAS = [
  {
    q: '¿Tienen que descargarse una app mis clientes?',
    a: 'No. El llavero lleva una dirección: al tocarlo se abre su tarjeta en el navegador. Sin cuenta, sin instalar nada, sin contraseñas.',
  },
  {
    q: '¿Cómo funciona el llavero?',
    a: 'Es un llavero normal con un chip dentro que solo guarda una dirección. Si lo toca tu móvil, con tu sesión, abre la ficha del cliente; si lo toca el suyo, abre su tarjeta.',
  },
  {
    q: '¿Puedo avisar a quien no vuelve?',
    a: 'Sí. En el panel aparecen los clientes que llevan más de 60 días sin venir y, con un botón, se abre tu aplicación de SMS o WhatsApp con el mensaje y el enlace de reserva ya escritos. Sale de tu número.',
  },
  {
    q: '¿Sirve para mi oficio?',
    a: 'Está pensado para barbería, peluquería, salón de uñas y estudio de tatuaje. Al crear el local eliges el oficio y cambian las palabras y los servicios de partida.',
  },
  {
    q: '¿Qué cuesta?',
    a: 'Alta de 30 € + IVA con 15 llaveros y el primer mes incluido. Después, cuota mensual desde 15 € + IVA, con un tope de 40 € al mes. Sin permanencia.',
  },
  {
    q: '¿Y mis datos?',
    a: 'Se guardan en Europa, aislados por local. Los permisos del cliente van separados y desmarcados, y si pide la baja, la resuelves desde tu panel.',
  },
];

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function Funciones() {
  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 sm:px-8">
        {/* Cabecera */}
        <header className="flex items-center justify-between">
          <Wordmark />
          <nav className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.12em]">
            <Link to="/" className="text-muted hover:text-ink">
              Inicio
            </Link>
            <span className="text-ink">Funciones</span>
            {haySupabase && (
              <Link to="/alta" className={btnClases('primary', 'sm')}>
                Crear mi negocio
              </Link>
            )}
          </nav>
        </header>

        {/* Héroe */}
        <section className="mt-12 lg:mt-16 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12">
          <div>
            <Eyebrow>Funciones</Eyebrow>
            <h1 className="display mt-3 max-w-[24ch] text-[38px] leading-[1.04] text-ink sm:text-[46px]">
              Todo lo que hace JULEX, <span className="display-i text-[var(--brand)]">sin adornos.</span>
            </h1>
            <p className="mt-5 max-w-[54ch] text-[14.5px] leading-relaxed text-ink-soft">
              Tu agenda, tu cola, tus clientes y sus llaveros. Y lo que casi nadie tiene: saber quién no
              vuelve y poder avisarle en dos toques.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link to={haySupabase ? '/alta' : '/barbero/cola'} className={btnClases('primary', 'lg', 'px-6')}>
                {haySupabase ? 'Crear mi negocio' : 'Entrar en la demo'}
              </Link>
              <Link to="/" className={btnClases('outline', 'lg')}>
                Ver la portada
              </Link>
            </div>
          </div>
          <figure className="mt-9 lg:mt-0">
            <div className="aspect-[4/5] overflow-hidden rounded-[2px] bg-paper-2">
              <img
                src="/img/portada.webp"
                alt="Cuaderno de citas y llavero JULEX"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </figure>
        </section>

        <Rule className="my-12" />

        {/* Bloques alternos */}
        <div className="space-y-14">
          {BLOQUES.map((b, i) => (
            <section
              key={b.ceja}
              className={`grid gap-7 lg:items-center lg:gap-12 ${i % 2 ? 'lg:grid-cols-[0.9fr_1.1fr]' : 'lg:grid-cols-[1.1fr_0.9fr]'}`}
            >
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <Eyebrow>{b.ceja}</Eyebrow>
                <h2 className="mt-2 font-serif text-[26px] leading-[1.15] text-ink sm:text-[30px]">
                  {b.titulo}
                </h2>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{b.texto}</p>
                <ul className="mt-4 space-y-1.5">
                  {b.puntos.map((p) => (
                    <li key={p} className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
                      <Check size={13} className="mt-[3px] shrink-0 text-[var(--brand)]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <figure className={i % 2 ? 'lg:order-1' : ''}>
                <div className="aspect-[4/3] overflow-hidden rounded-[2px] bg-paper-2">
                  <img src={b.imagen} alt={b.alt} className="h-full w-full object-cover" loading="lazy" />
                </div>
              </figure>
            </section>
          ))}
        </div>

        <Rule className="my-12" />

        {/* Rejilla de funciones */}
        <section>
          <Eyebrow>Explora las funciones</Eyebrow>
          <h2 className="mt-2 max-w-[30ch] font-serif text-[28px] leading-[1.15] text-ink sm:text-[32px]">
            Quince cosas que ya están hechas.
          </h2>

          <div className="mt-8 space-y-10">
            {GRUPOS.map((g) => (
              <div key={g.ceja}>
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <span className="eyebrow">{g.ceja}</span>
                  <span className="num text-[10.5px] text-faint">{g.funciones.length}</span>
                </div>
                <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                  {g.funciones.map((f) => (
                    <article key={f.titulo}>
                      <f.Icon size={17} strokeWidth={1.8} className="text-[var(--brand)]" />
                      <h3 className="mt-2 text-[15px] leading-snug text-ink">{f.titulo}</h3>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">{f.texto}</p>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <Rule className="my-12" />

        {/* Oficios */}
        <section>
          <Eyebrow>Un mismo JULEX, cuatro oficios</Eyebrow>
          <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-muted">
            Eliges el oficio al crear el local y cambian las palabras y los servicios de partida. Lo demás
            —fichas, llaveros, citas— es lo mismo.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { nombre: 'Barbería', img: '/img/oficios/barberia.webp' },
              { nombre: 'Peluquería', img: '/img/oficios/peluqueria.webp' },
              { nombre: 'Salón de uñas', img: '/img/oficios/unas.webp' },
              { nombre: 'Estudio de tatuaje', img: '/img/oficios/tatuaje.webp' },
            ].map((o) => (
              <figure key={o.nombre}>
                <div className="aspect-[4/5] overflow-hidden rounded-[2px] bg-paper-2">
                  <img src={o.img} alt={o.nombre} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <figcaption className="mt-2.5 font-serif text-[17px] leading-tight text-ink">
                  {o.nombre}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <Rule className="my-12" />

        {/* Pasos */}
        <section>
          <Eyebrow>Comenzar es fácil</Eyebrow>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {PASOS.map((p) => (
              <div key={p.n} className="border-t border-line pt-3">
                <span className="num text-[11px] text-faint">{p.n}</span>
                <h3 className="mt-1 font-serif text-[19px] leading-tight text-ink">{p.titulo}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <Rule className="my-12" />

        {/* Preguntas */}
        <section>
          <Eyebrow>Preguntas frecuentes</Eyebrow>
          <div className="mt-4 divide-y divide-line-soft">
            {PREGUNTAS.map((p) => (
              <details key={p.q} className="group py-3">
                <summary className="flex cursor-pointer items-baseline justify-between gap-3 text-[14px] text-ink marker:content-['']">
                  {p.q}
                  <span aria-hidden className="text-faint transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">{p.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Cierre */}
        <section className="mt-14 rounded-[3px] border border-line bg-paper px-6 py-8 text-center">
          <h2 className="font-serif text-[26px] leading-tight text-ink">¿Lo ves para tu negocio?</h2>
          <p className="mx-auto mt-2 max-w-[48ch] text-[12.5px] leading-relaxed text-muted">
            Alta de 30 € + IVA con 15 llaveros y el primer mes incluido. Cuota desde 15 € al mes, tope de
            40. Sin permanencia.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to={haySupabase ? '/alta' : '/barbero/cola'} className={btnClases('primary', 'lg', 'px-6')}>
              {haySupabase ? 'Crear mi negocio' : 'Entrar en la demo'}
            </Link>
            <Link to="/condiciones" className={btnClases('quiet', 'lg')}>
              Ver condiciones
            </Link>
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[10.5px] text-faint">
          <span>JULEX · Alexander Acero · Alicante</span>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-muted">
              Inicio
            </Link>
            <Link to="/legal" className="hover:text-muted">
              Textos legales
            </Link>
            <Link to="/creditos" className="hover:text-muted">
              Créditos
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
