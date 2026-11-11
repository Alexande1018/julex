import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Nfc } from 'lucide-react';
import { useDb } from '../lib/store';
import { vocabulario } from '../lib/vocabulario';
import { haySupabase } from '../lib/supabase';
import { actualizarCliente, crearCliente, asignarLlavero, anadirACola } from '../lib/actions';
import { barberiaActiva, resumenLlaveros, serviciosDe } from '../lib/derive';
import { fmtDuracion, fmtEuros } from '../lib/format';
import {
  Btn,
  Check as CheckBox,
  Eyebrow,
  Field,
  Pill,
  Rule,
  Wordmark,
  btnClases,
  cn,
  inputClases,
  toast,
} from '../components/ui';

export default function Alta() {
  const db = useDb();
  const navegar = useNavigate();
  const barberia = barberiaActiva(db);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [comoCorta, setComoCorta] = useState('');
  const [notas, setNotas] = useState('');
  const [preferencias, setPreferencias] = useState('');
  const [datos, setDatos] = useState(true);
  const [avisos, setAvisos] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);
  const [llaveroAsignado, setLlaveroAsignado] = useState<string | null>(null);

  const servicios = serviciosDe(db, barberia.id);
  const llaverosLibres = db.llaveros
    .filter((l) => l.barberiaId === barberia.id && l.estado === 'sin_asignar')
    .slice(0, 6);
  const resumen = resumenLlaveros(db, barberia.id);

  const valido = nombre.trim().length > 1 && comoCorta.trim().length > 3 && datos;

  const guardar = async () => {
    if (!valido) return;
    try {
      const c = await crearCliente({
        nombre,
        telefono,
        comoCorta,
        notas,
        preferencias,
        consentimientos: { datos, avisos, marketing },
      });
      setCreado(c.id);
      toast('Cliente creado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el cliente', 'aviso');
    }
  };

  const limpiar = () => {
    setNombre('');
    setTelefono('');
    setComoCorta('');
    setNotas('');
    setPreferencias('');
    setDatos(true);
    setAvisos(false);
    setMarketing(false);
    setCreado(null);
    setLlaveroAsignado(null);
  };

  /* ------------------------- Confirmación ------------------------- */

  if (creado) {
    const cliente = db.clientes.find((c) => c.id === creado)!;
    const llavero = db.llaveros.find((l) => l.clienteId === creado && l.estado === 'activo');
    const asignado = llavero?.codigoCorto ?? llaveroAsignado;

    return (
      <div className="grain min-h-dvh bg-ivory">
        <div className="mx-auto w-full max-w-md px-5 pb-12 pt-6">
          <Wordmark />

          <div className="mt-10">
            <div className="inline-flex size-9 items-center justify-center rounded-full border border-sage/40 bg-sage/10 text-olive">
              <Check size={17} strokeWidth={2.5} />
            </div>
            <h1 className="mt-4 font-serif text-[27px] leading-tight text-ink">
              {cliente.nombre} ya está en la barbería.
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              Su ficha queda guardada con el código{' '}
              <span className="num font-semibold text-ink">{cliente.codigo}</span>. La tarjeta
              digital funciona desde este momento, con o sin llavero.
            </p>
          </div>

          <Rule className="my-6" />

          {/* Llavero */}
          <section>
            <div className="flex items-baseline justify-between">
              <Eyebrow>Llavero</Eyebrow>
              <Pill tono={asignado ? 'ok' : 'neutral'}>
                {asignado ? 'Vinculado' : 'Sin vincular'}
              </Pill>
            </div>

            {asignado ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                {asignado} queda vinculado a {cliente.nombre.split(' ')[0]}. Desde ahora, al acercarlo
                al móvil se abre esta ficha.
              </p>
            ) : (
              <>
                <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-soft">
                  <Nfc size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                  Acerca un llavero en blanco al móvil y se vinculará solo. Si no lo tienes a mano,
                  elige uno del lote:
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {llaverosLibres.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        asignarLlavero(l.token, cliente.id);
                        setLlaveroAsignado(l.codigoCorto);
                        toast(`Llavero ${l.codigoCorto} vinculado`, 'ok');
                      }}
                      className="num rounded-[3px] border border-line bg-paper px-2 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
                    >
                      {l.codigoCorto}
                    </button>
                  ))}
                  {llaverosLibres.length === 0 && (
                    <p className="text-[11.5px] text-faint">
                      No quedan llaveros sin asignar en esta barbería.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          <Rule className="my-6" />

          <div className="space-y-2">
            <Btn
              t="lg"
              className="w-full"
              onClick={() => {
                anadirACola(cliente.id, servicios[0]?.id ?? null, 'mostrador');
                toast(`${cliente.nombre} está en la cola`, 'ok');
                navegar('/barbero/cola');
              }}
            >
              Añadir a la cola ahora <ArrowRight size={14} />
            </Btn>
            <div className="flex gap-2">
              <Link to={`/barbero/clientes/${cliente.id}`} className={btnClases('outline', 'md', 'flex-1')}>
                Ver su ficha
              </Link>
              <button onClick={limpiar} className={btnClases('quiet', 'md', 'flex-1')}>
                Dar de alta a otro
              </button>
            </div>
          </div>

          <p className="mt-6 text-[10.5px] leading-relaxed text-faint">
            Consentimientos guardados: datos {cliente.consentimientos.datos ? 'sí' : 'no'} · avisos{' '}
            {cliente.consentimientos.avisos ? 'sí' : 'no'} · recordatorios{' '}
            {cliente.consentimientos.marketing ? 'sí' : 'no'}. Puedes cambiarlos en su tarjeta.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------- Formulario ------------------------- */

  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="sticky top-0 z-30 border-b border-line bg-ivory/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <button
            onClick={() => navegar(-1)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={13} /> Volver
          </button>
          <Wordmark />
          <span className="w-12" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-5">
        <Eyebrow>Alta rápida</Eyebrow>
        <h1 className="mt-2 font-serif text-[26px] leading-tight text-ink">Nuevo cliente</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Cuatro datos y ya está. Lo demás se puede añadir después, en su ficha.
        </p>

        <div className="mt-6 space-y-5">
          <Field label="Nombre" requerido>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputClases}
              placeholder="Pablo Martínez"
              autoComplete="off"
              autoFocus
            />
          </Field>

          <Field label="Teléfono" hint="opcional">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={inputClases}
              placeholder="600 000 000"
              inputMode="tel"
              autoComplete="off"
            />
          </Field>

          <Field label={vocabulario(barberia?.tipo).comoAtiende} requerido hint="lo que no quieres volver a preguntar">
            <textarea
              value={comoCorta}
              onChange={(e) => setComoCorta(e.target.value)}
              rows={4}
              className={cn(inputClases, 'font-serif text-[14.5px] italic leading-relaxed')}
              placeholder="Degradado bajo, laterales al 0,5, arriba con tijera. No tocar el flequillo."
            />
          </Field>

          <Field label="Notas" hint="opcional">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className={inputClases}
              placeholder="Prefiere venir los sábados."
            />
          </Field>

          <Field label="Preferencias" hint="opcional">
            <input
              value={preferencias}
              onChange={(e) => setPreferencias(e.target.value)}
              className={inputClases}
              placeholder="Le gusta reservar por la tarde."
            />
          </Field>
        </div>

        <Rule className="my-6" />

        <Eyebrow>Consentimientos</Eyebrow>
        <div className="mt-1 divide-y divide-line-soft">
          <CheckBox checked={datos} onChange={setDatos}>
            Acepto que {barberia.nombre} guarde mis datos para gestionar mis citas y mi historial.{' '}
            <span className="text-[11px] text-faint">
              Necesario para el servicio. <LinkLegal hash="datos" />
            </span>
          </CheckBox>
          <CheckBox checked={avisos} onChange={setAvisos}>
            Quiero recibir un aviso cuando sea mi turno.{' '}
            <span className="text-[11px] text-faint">
              Opcional. <LinkLegal hash="avisos" />
            </span>
          </CheckBox>
          <CheckBox checked={marketing} onChange={setMarketing}>
            Quiero recibir recordatorios de visita y solicitudes de reseña.{' '}
            <span className="text-[11px] text-faint">
              Opcional. <LinkLegal hash="marketing" />
            </span>
          </CheckBox>
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
          {haySupabase
            ? 'Estos consentimientos se guardan en la ficha del cliente. No se envía ningún SMS ni mensaje.'
            : 'En demo estos consentimientos solo se guardan en este navegador. No se envía ningún SMS ni mensaje.'}
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-tight text-muted">
              {servicios[0] ? `${servicios[0].nombre} · ${fmtDuracion(servicios[0].minutos)} · ${fmtEuros(servicios[0].precio)}` : ''}
            </p>
            <p className="text-[10.5px] text-faint">
              {resumen.sinAsignar} llaveros sin asignar
            </p>
          </div>
          <Btn t="lg" onClick={() => void guardar()} disabled={!valido} className="px-6">
            Crear cliente
          </Btn>
        </div>
      </div>
    </div>
  );
}

function LinkLegal({ hash }: { hash: string }) {
  return (
    <a
      href={`/legal#${hash}`}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-line underline-offset-2 hover:text-ink-soft"
    >
      Leer
    </a>
  );
}

/** Reservado para futuras ampliaciones del alta. */
export const _actualizarCliente = actualizarCliente;
