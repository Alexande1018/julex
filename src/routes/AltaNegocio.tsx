import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Btn, Eyebrow, Field, Rule, Wordmark, cn, inputClases, toast } from '../components/ui';
import { TIPOS, vocabulario } from '../lib/vocabulario';
import type { TipoNegocio } from '../lib/types';
import { haySupabase, supabase } from '../lib/supabase';

const PROVINCIAS = [
  'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona', 'Burgos', 'Cáceres',
  'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona',
  'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Islas Baleares', 'Jaén',
  'La Coruña', 'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga',
  'Melilla', 'Murcia', 'Navarra', 'Orense', 'Palencia', 'Pontevedra', 'Salamanca',
  'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo',
  'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza',
];

/**
 * Alta a distancia: un negocio se crea su cuenta, deja sus datos de envío
 * y paga el alta. Los llaveros se preparan y se envían desde el panel.
 */
export default function AltaNegocio() {
  const [form, setForm] = useState({
    nombre: '',
    tipo: 'barberia' as TipoNegocio,
    email: '',
    password: '',
    domicilio: '',
    correo: '',
    direccion: '',
    cp: '',
    ciudad: '',
    provincia: 'Madrid',
    telefono: '',
    extras: 0,
  });
  const [acepta, setAcepta] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const v = vocabulario(form.tipo);
  const total = 15 + form.extras;
  const extrasCobro = Math.max(0, total - 15);
  const cuota = Math.min(40, Math.max(15, total));

  const set = (k: keyof typeof form, valor: string | number) =>
    setForm((f) => ({ ...f, [k]: valor }));

  const valido =
    form.nombre.trim().length > 1 &&
    form.email.includes('@') &&
    form.password.length >= 8 &&
    form.direccion.trim().length > 4 &&
    form.ciudad.trim().length > 1 &&
    form.telefono.trim().length > 5 &&
    acepta;

  const enviar = async () => {
    if (!valido || ocupado) return;
    if (!haySupabase || !supabase) {
      toast('En la demo no se puede dar de alta', 'info');
      return;
    }
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc('crear_alta_publica', {
        p_nombre: form.nombre.trim(),
        p_slug: form.nombre.trim(),
        p_email: form.email.trim(),
        p_password: form.password,
        p_tipo: form.tipo,
        p_domicilio: form.domicilio.trim(),
        p_correo: form.correo.trim(),
        p_direccion: form.direccion.trim(),
        p_cp: form.cp.trim(),
        p_ciudad: form.ciudad.trim(),
        p_provincia: form.provincia,
        p_telefono: form.telefono.trim(),
        p_llaveros: total,
      });

      if (error) {
        const mapa: Record<string, string> = {
          email_en_uso: 'Ese correo ya tiene una cuenta. Entra con ella.',
          password_corta: 'La contraseña necesita 8 caracteres.',
          direccion_incompleta: 'Faltan la dirección o la ciudad de envío.',
        };
        toast(mapa[error.message] ?? error.message, 'aviso');
        return;
      }

      const alta = data as { email: string };
      const { error: entra } = await supabase.auth.signInWithPassword({
        email: alta.email,
        password: form.password,
      });
      if (entra) {
        toast('Cuenta creada. Entra y activa el pago en Ajustes.', 'ok');
        window.location.href = '/barbero/ajustes';
        return;
      }

      const pago = await supabase.functions.invoke('stripe-checkout', { body: {} });
      if (pago.error) throw new Error(pago.error.message);
      if (pago.data?.url) {
        window.location.href = pago.data.url as string;
        return;
      }
      window.location.href = '/barbero/ajustes';
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar el alta', 'aviso');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="grain min-h-dvh bg-ivory">
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6">
        <div className="flex items-center justify-between">
          <Wordmark />
          <Link to="/" className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">
            Volver
          </Link>
        </div>

        <header className="mt-9">
          <Eyebrow>Alta del negocio</Eyebrow>
          <h1 className="mt-2 font-serif text-[30px] leading-[1.1] text-ink">
            Tu negocio, en marcha hoy
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            15 llaveros y el primer mes incluidos en el alta de 30 € + IVA. Envío a toda España
            incluido. Después, {cuota} €/mes.
          </p>
        </header>

        <Rule className="my-7" />

        <div className="space-y-4">
          <Field label="Nombre del negocio" requerido>
            <input
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              className={inputClases}
              placeholder="Barbería Pablo"
            />
          </Field>

          <label className="block">
            <span className="eyebrow">Tipo de negocio</span>
            <select
              value={form.tipo}
              onChange={(e) => set('tipo', e.target.value)}
              className={cn(inputClases, 'mt-1.5')}
            >
              {TIPOS.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo" requerido>
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={inputClases}
                inputMode="email"
                autoComplete="email"
                placeholder="hola@tunegocio.com"
              />
            </Field>
            <Field label="Contraseña" requerido hint="mínimo 8 caracteres">
              <input
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className={inputClases}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono" requerido>
              <input
                value={form.telefono}
                onChange={(e) => set('telefono', e.target.value)}
                className={inputClases}
                inputMode="tel"
                placeholder="600 000 000"
              />
            </Field>
            <Field label="Correo legal" hint="para derechos y reclamaciones">
              <input
                value={form.correo}
                onChange={(e) => set('correo', e.target.value)}
                className={inputClases}
                inputMode="email"
                placeholder="hola@tunegocio.com"
              />
            </Field>
          </div>

          <Rule className="my-2" />
          <Eyebrow>Dónde te enviamos los llaveros</Eyebrow>

          <Field label="Dirección" requerido>
            <input
              value={form.direccion}
              onChange={(e) => set('direccion', e.target.value)}
              className={inputClases}
              placeholder="Calle, número, piso"
              autoComplete="street-address"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Código postal" requerido>
              <input
                value={form.cp}
                onChange={(e) => set('cp', e.target.value)}
                className={inputClases}
                inputMode="numeric"
                placeholder="28013"
                autoComplete="postal-code"
              />
            </Field>
            <Field label="Ciudad" requerido>
              <input
                value={form.ciudad}
                onChange={(e) => set('ciudad', e.target.value)}
                className={inputClases}
                placeholder="Madrid"
                autoComplete="address-level2"
              />
            </Field>
            <label className="block">
              <span className="eyebrow">Provincia</span>
              <select
                value={form.provincia}
                onChange={(e) => set('provincia', e.target.value)}
                className={cn(inputClases, 'mt-1.5')}
              >
                {PROVINCIAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Field label="Domicilio legal" hint="puede ser solo la ciudad">
            <input
              value={form.domicilio}
              onChange={(e) => set('domicilio', e.target.value)}
              className={inputClases}
              placeholder="Madrid"
            />
          </Field>

          <Rule className="my-2" />

          <div className="rounded-[3px] border border-line bg-paper px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-ink">Llaveros</p>
                <p className="mt-0.5 text-[10.5px] text-muted">15 incluidos · de 5 en 5</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => set('extras', Math.max(0, form.extras - 5))}
                  className="inline-flex size-7 items-center justify-center rounded-[2px] border border-line text-[15px] text-ink-soft"
                  aria-label="Quitar cinco"
                >
                  −
                </button>
                <span className="num w-8 text-center font-serif text-[18px] text-ink">{total}</span>
                <button
                  onClick={() => set('extras', form.extras + 5)}
                  className="inline-flex size-7 items-center justify-center rounded-[2px] border border-line text-[15px] text-ink-soft"
                  aria-label="Añadir cinco"
                >
                  +
                </button>
              </div>
            </div>
            {extrasCobro > 0 && (
              <p className="mt-2 text-[10.5px] leading-relaxed text-clay">
                {extrasCobro} llaveros de más: 1 € cada uno una sola vez, por el llavero.
              </p>
            )}
          </div>

          <label className="flex items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-ink"
            />
            <span className="text-[11.5px] leading-relaxed text-ink-soft">
              Actúo como profesional y acepto las{' '}
              <Link to="/condiciones" className="underline decoration-line underline-offset-2">
                condiciones
              </Link>{' '}
              y el{' '}
              <Link to="/encargo-tratamiento" className="underline decoration-line underline-offset-2">
                encargo de tratamiento
              </Link>
              .
            </span>
          </label>

          <div className="rounded-[3px] border border-line bg-paper px-3.5 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-muted">Alta (15 llaveros y primer mes)</span>
              <span className="num text-[13px] text-ink">30,00 €</span>
            </div>
            {extrasCobro > 0 && (
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-[12px] text-muted">
                  {extrasCobro} llaveros de más
                </span>
                <span className="num text-[13px] text-ink">{extrasCobro},00 €</span>
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[12px] text-muted">IVA 21 %</span>
              <span className="num text-[13px] text-ink">
                {(((extrasCobro + 30) * 0.21)).toFixed(2).replace('.', ',')} €
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-2">
              <span className="text-[12px] font-semibold text-ink">Total hoy</span>
              <span className="num font-serif text-[20px] text-ink">
                {((extrasCobro + 30) * 1.21).toFixed(2).replace('.', ',')} €
              </span>
            </div>
            <p className="mt-1 text-[10px] text-faint">
              Después {cuota} €/mes + IVA. Sin permanencia.
            </p>
          </div>

          <Btn className="w-full" onClick={() => void enviar()} disabled={!valido || ocupado}>
            {ocupado ? 'Creando…' : 'Crear mi negocio y pagar'}
            {!ocupado && <ArrowRight size={14} />}
          </Btn>

          <p className="text-[10.5px] leading-relaxed text-faint">
            Al pagar se crean tu panel, tu página de reservas y tus llaveros. Te los enviamos a la
            dirección que has puesto, en toda España, sin coste añadido.
          </p>
        </div>
      </div>
    </div>
  );
}
