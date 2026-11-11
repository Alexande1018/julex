import { Link } from 'react-router-dom';
import { Link2, Nfc, ShieldCheck } from 'lucide-react';
import { Eyebrow, Rule, Wordmark, btnClases } from '../components/ui';
import { haySupabase } from '../lib/supabase';
import { useDb } from '../lib/store';

/**
 * Puerta del cliente: la que no tiene cuenta ni token propio.
 *
 * No hay una tarjeta «general» que enseñar: cada tarjeta vive en el llavero
 * del cliente o en el enlace que le da su barbería. Esta página explica cómo
 * entrar, que es lo único que un cliente necesita saber.
 */
export default function Cliente() {
  const db = useDb();
  const ejemplo = db.clientes.find((c) => c.codigo === 'P-0004');

  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6">
        <Wordmark />

        <header className="mt-10">
          <Eyebrow>Para clientes</Eyebrow>
          <h1 className="mt-2 font-serif text-[30px] leading-[1.1] text-ink">
            Tu tarjeta vive en tu llavero.
          </h1>
          <p className="mt-3 max-w-[52ch] text-[13px] leading-relaxed text-ink-soft">
            No hay que registrarse en ningún sitio. Tu ficha, tus sellos y tus citas están en el
            llavero que te dio tu barbería, o en el enlace que te mandaron.
          </p>
        </header>

        <Rule className="my-8" />

        <ol className="space-y-6">
          <li className="flex gap-4">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
              <Nfc size={15} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">Acerca el llavero al móvil</p>
              <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-muted">
                Se abre tu tarjeta: cuántos servicios llevas, si tienes una recompensa y cuándo es tu
                próxima cita. Funciona con cualquier móvil, sin instalar nada.
              </p>
            </div>
          </li>

          <li className="flex gap-4">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
              <Link2 size={15} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">O abre el enlace que te dieron</p>
              <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-muted">
                Si tu barbería te mandó tu enlace por WhatsApp, guárdalo en el móvil: es tu tarjeta.
                Desde ahí puedes pedir cita, cancelarla y ver tu historial.
              </p>
            </div>
          </li>

          <li className="flex gap-4">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
              <ShieldCheck size={15} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">Si lo pierdes</p>
              <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-muted">
                Pide en tu barbería que retiren ese llavero y te den otro. Tu historial no se pierde.
                Y si quieres que nadie vea tu tarjeta al abrirla, puedes ponerle un PIN.
              </p>
            </div>
          </li>
        </ol>

        <Rule className="my-8" />

        <section>
          <Eyebrow>¿Aún no tienes llavero?</Eyebrow>
          <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-soft">
            Pídelo en tu barbería. Mientras tanto puedes pedir cita con el QR que tienen en el
            mostrador, o desde su enlace de reservas.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/" className={btnClases('outline', 'md')}>
            Volver al inicio
          </Link>
          {!haySupabase && ejemplo && (
            <Link to={`/c/${ejemplo.tokenPublico}`} className={btnClases('quiet', 'md')}>
              Ver una tarjeta de ejemplo
            </Link>
          )}
        </div>

        <p className="mt-8 text-[10.5px] leading-relaxed text-faint">
          <Link to="/legal" className="underline decoration-line underline-offset-2 hover:text-muted">
            Privacidad y consentimientos
          </Link>
        </p>
      </div>
    </div>
  );
}
