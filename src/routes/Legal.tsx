import { Link } from 'react-router-dom';
import { Eyebrow, Rule, Wordmark } from '../components/ui';

export default function Legal() {
  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6">
        <Wordmark />

        <header className="mt-10">
          <Eyebrow>Textos legales · versión demo</Eyebrow>
          <h1 className="mt-2 font-serif text-[28px] leading-tight text-ink">
            Privacidad, avisos y datos
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            Estos textos son un borrador de producto, no un documento jurídico revisado. Antes de usar
            JULEX con clientes reales tienen que pasar por un abogado y por el registro de actividades
            de tratamiento de la barbería.
          </p>
        </header>

        <Rule className="my-8" />

        <section id="datos" className="scroll-mt-6">
          <h2 className="text-[18px] leading-snug text-ink">1 · Datos necesarios para el servicio</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            La barbería guarda tu nombre, teléfono si lo das, cómo se te corta el pelo, notas de
            atención y tu historial de visitas. La finalidad es gestionar tu cita, atenderte con
            criterio y llevar el control de tu fidelización. La base legal es la ejecución de la
            relación de servicio. Sin este consentimiento no se puede usar el llavero ni la tarjeta,
            porque no habría ficha que abrir.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            El responsable del tratamiento es la barbería. JULEX actúa como encargado: presta el
            software y custodia los datos por su cuenta, sin usarlos para fines propios.
          </p>
        </section>

        <section id="avisos" className="mt-8">
          <h2 className="text-[18px] leading-snug text-ink">2 · Aviso de turno</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            Si lo aceptas, la barbería puede avisarte cuando estés cerca de tu turno. Es opcional y
            puedes retirarlo en cualquier momento desde tu tarjeta, sin que eso afecte al servicio.
          </p>
        </section>

        <section id="marketing" className="mt-8">
          <h2 className="text-[18px] leading-snug text-ink">3 · Recordatorios y reseñas</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            También opcional. La barbería puede escribirte para recordarte una visita si llevas tiempo
            sin venir, o para pedirte una reseña después de un corte. Siempre con la posibilidad de
            darte de baja. La barbería solo escribe a sus propios clientes, que es la excepción de
            relación previa de la LSSI; aun así, la baja se respeta siempre.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[18px] leading-snug text-ink">4 · Tus derechos</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            Puedes pedir acceso, rectificación, portabilidad, limitación y supresión. Desde tu tarjeta
            puedes descargar una copia de tus datos y solicitar la baja. La barbería conservará lo
            mínimo que exija la normativa fiscal aunque solicites la eliminación.
          </p>
        </section>

        <Rule className="my-8" />

        <section>
          <h2 className="text-[18px] leading-snug text-ink">5 · Sobre esta demo</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            Todo lo que ves aquí son datos inventados guardados en tu navegador. No hay servidor, no
            hay base de datos, no se envía ningún SMS ni mensaje de WhatsApp, y no se comparte nada con
            terceros. Si recargas o reinicias la demo, los datos vuelven a su estado inicial.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[18px] leading-snug text-ink">6 · Créditos de las fotografías</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            Las imágenes de la portada, del acceso y de la tarjeta del cliente están reveladas en
            duotono a partir de originales de Wikimedia Commons:
          </p>
          <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-ink-soft">
            <li className="border-l border-line pl-3">
              <span className="font-semibold text-ink">August Pingpank, 413 Bleecker Street</span> ·
              New York Public Library · dominio público.
            </li>
            <li className="border-l border-line pl-3">
              <span className="font-semibold text-ink">Barber cutting hair with comb</span> ·
              Wikimedia Commons · CC BY 2.0, con atribución en este documento.
            </li>
          </ul>
        </section>

        <div className="mt-10 flex gap-5 text-[12px]">
          <Link to="/" className="text-ink font-semibold underline underline-offset-4">
            Volver al inicio
          </Link>
          <Link to="/barbero/cola" className="text-muted underline underline-offset-4">
            Ir a la barbería
          </Link>
        </div>
      </div>
    </div>
  );
}
