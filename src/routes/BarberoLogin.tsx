import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useDb } from '../lib/store';
import { entrar as entrarLocal } from '../lib/actions';
import { crearCuentaLocal, crearLocalEstandoDentro, entrar as entrarReal, haySupabase } from '../lib/acceso';
import { normaliza } from '../lib/format';
import { Btn, Eyebrow, Field, Pill, Rule, Wordmark, inputClases, toast } from '../components/ui';
import { Foto, PieFoto } from '../components/Foto';

function aSlug(texto: string): string {
  return normaliza(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function BarberoLogin() {
  const [params] = useSearchParams();
  const next = params.get('next') || '/barbero/cola';
  return haySupabase ? <AccesoReal next={next} /> : <AccesoLocal next={next} />;
}

function AccesoLocal({ next }: { next: string }) {
  const db = useDb();
  const navegar = useNavigate();
  const barbero = db.barberos[0];
  const barberia = db.barberias[0];

  const dentro = () => {
    entrarLocal(barbero?.id);
    navegar(next, { replace: true });
  };

  return (
    <Marco>
      <Eyebrow>Acceso del barbero</Eyebrow>
      <h1 className="mt-3 font-serif text-[30px] leading-[1.1] text-ink">Entra en tu barbería.</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
        La sesión se queda abierta en este navegador. Es lo que permite que el llavero abra la ficha
        directamente al acercarlo.
      </p>

      <Rule className="my-7" />

      <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] font-semibold text-ink">{barbero?.nombre}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {barberia?.nombre} · {barbero?.rol === 'dueno' ? 'Dueño' : 'Barbero'}
            </p>
          </div>
          <Pill tono="ok">Demo</Pill>
        </div>
      </div>

      <Btn t="lg" className="mt-3 w-full" onClick={dentro}>
        Entrar <ArrowRight size={15} />
      </Btn>

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        Modo local: los datos viven en este navegador. Con Supabase configurado, aquí se entra con
        correo y contraseña.
      </p>
    </Marco>
  );
}

/* ------------------------------------------------------------------ */
/* Modo real: correo y contraseña                                      */
/* ------------------------------------------------------------------ */

function AccesoReal({ next }: { next: string }) {
  const navegar = useNavigate();
  const [modo, setModo] = useState<'entrar' | 'crear' | 'local'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [local, setLocal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const crear = modo === 'crear';
  const soloLocal = modo === 'local';
  const localOk = local.trim().length >= 2 && aSlug(local).length >= 2;
  const credencialesOk = email.includes('@') && password.length >= 6;
  const valido = soloLocal ? localOk : crear ? credencialesOk && localOk : credencialesOk;

  const enviar = async () => {
    if (!valido || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      if (soloLocal) {
        await crearLocalEstandoDentro({ local: local.trim(), slug: aSlug(local) });
        toast('Local creado. Ya puedes trabajar.', 'ok');
      } else if (crear) {
        await crearCuentaLocal({ email, password, local: local.trim(), slug: aSlug(local) });
        toast('Local creado. Ya puedes trabajar.', 'ok');
      } else {
        const resultado = await entrarReal({ email, password });
        if (resultado === 'sin_local') {
          setModo('local');
          setError('Tu cuenta existe pero aún no tiene local. Ponle nombre para terminar.');
          return;
        }
      }
      navegar(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido completar el acceso.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Marco>
      <Eyebrow>{soloLocal ? 'Un último paso' : crear ? 'Nuevo local' : 'Acceso del barbero'}</Eyebrow>
      <h1 className="mt-3 font-serif text-[30px] leading-[1.1] text-ink">
        {soloLocal ? 'Ponle nombre.' : crear ? 'Abre tu barbería.' : 'Entra en tu barbería.'}
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
        {soloLocal
          ? 'Tu cuenta ya está creada. Solo falta el nombre con el que tus clientes verán la barbería.'
          : crear
            ? 'La cuenta y el local se crean en un solo paso: nombre, correo y contraseña.'
            : 'La sesión se queda abierta. Es lo que permite que el llavero abra la ficha al acercarlo.'}
      </p>

      <Rule className="my-7" />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        {(crear || soloLocal) && (
          <Field label="Nombre del local" requerido hint="así lo verá el cliente">
            <input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className={inputClases}
              placeholder="Barbería Pablo"
              autoComplete="organization"
              autoFocus
            />
          </Field>
        )}

        {!soloLocal && (
          <>
            <Field label="Correo" requerido>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClases}
                placeholder="tu@correo.com"
                autoComplete="email"
                inputMode="email"
              />
            </Field>

            <Field label="Contraseña" requerido hint="mínimo 6 caracteres">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClases}
                autoComplete={crear ? 'new-password' : 'current-password'}
              />
            </Field>
          </>
        )}

        {(crear || soloLocal) && localOk && (
          <p className="text-[11px] text-muted">
            Tu dirección pública será{' '}
            <span className="num font-semibold text-ink">/cita/{aSlug(local)}</span>
          </p>
        )}

        {error && (
          <p className="rounded-[3px] border border-clay/30 bg-clay/5 px-3 py-2 text-[11.5px] leading-relaxed text-clay">
            {error}
          </p>
        )}

        <Btn t="lg" className="w-full" disabled={!valido || enviando}>
          {enviando ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Un momento…
            </>
          ) : (
            <>
              {soloLocal ? 'Crear local' : crear ? 'Crear local' : 'Entrar'} <ArrowRight size={15} />
            </>
          )}
        </Btn>
      </form>

      {!soloLocal && (
        <button
          onClick={() => {
            setModo(crear ? 'entrar' : 'crear');
            setError(null);
          }}
          className="mt-5 text-[11.5px] font-semibold text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
        >
          {crear ? 'Ya tengo cuenta: entrar' : 'Soy nuevo: crear mi local'}
        </button>
      )}

      <p className="mt-5 text-[10.5px] leading-relaxed text-faint">
        Al crear la cuenta aceptas que guardemos los datos de tu local para prestarte el servicio. Los
        datos de tus clientes son tuyos y puedes exportarlos cuando quieras.
      </p>
    </Marco>
  );
}

/* ------------------------------------------------------------------ */

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain flex min-h-dvh flex-col bg-ivory lg:grid lg:grid-cols-2">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-6 lg:justify-center">
        <Wordmark />
        <div className="my-auto pt-6 lg:py-0">{children}</div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <Foto src="/img/tienda.webp" alt="" posicion="center 30%" prioridad />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-ink/20" />
        <div className="absolute inset-x-0 bottom-0 p-9">
          <p className="max-w-[24ch] font-serif text-[25px] italic leading-[1.15] text-ivory">
            «El barbero acerca el móvil al llavero y aparece la persona que tiene delante.»
          </p>
          <PieFoto className="mt-4 text-ivory/55">
            August Pingpank · 413 Bleecker Street, 1938
          </PieFoto>
        </div>
      </aside>
    </div>
  );
}
