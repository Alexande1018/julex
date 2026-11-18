import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import {
  aceptarPropuesta,
  aplicarCorregida,
  descartarPropuesta,
  propuestasPendientes,
  type Propuesta,
} from '../lib/propuestas';
import { terminoSensible } from '../lib/privacidad';
import { Btn, Eyebrow, cn, inputClases, toast } from './ui';

function hace(iso: string): string {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} días`;
}

/**
 * Lo que el cliente ha contado desde su llavero. Nada de esto entra en la
 * ficha hasta que el barbero lo acepta.
 */
export function PropuestaFicha({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<Propuesta[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [corta, setCorta] = useState('');
  const [prefs, setPrefs] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    propuestasPendientes(clienteId)
      .then((p) => {
        if (vivo) setLista(p);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  if (lista.length === 0) return null;

  const propuesta = lista[0];

  const quitar = (id: string) => setLista((l) => l.filter((p) => p.id !== id));

  const aceptar = async () => {
    if (terminoSensible(propuesta.comoCorta) || terminoSensible(propuesta.preferencias)) {
      toast('Quita los datos de salud antes de aplicarlo: no pueden guardarse', 'aviso');
      return;
    }
    setGuardando(true);
    try {
      const hecho = await aceptarPropuesta(propuesta.id);
      if (hecho) {
        quitar(propuesta.id);
        toast('Añadido a la ficha del cliente', 'ok');
      } else {
        toast('No se pudo aplicar', 'aviso');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo aplicar', 'aviso');
    } finally {
      setGuardando(false);
    }
  };

  const descartar = async () => {
    setGuardando(true);
    try {
      await descartarPropuesta(propuesta.id);
      quitar(propuesta.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo descartar', 'aviso');
    } finally {
      setGuardando(false);
    }
  };

  const guardarCorregida = async () => {
    if (terminoSensible(corta) || terminoSensible(prefs)) {
      toast('Quita los datos de salud antes de aplicarlo: no pueden guardarse', 'aviso');
      return;
    }
    setGuardando(true);
    try {
      const hecho = await aplicarCorregida(propuesta.id, corta.trim(), prefs.trim());
      if (hecho) {
        quitar(propuesta.id);
        setEditando(null);
        toast('Añadido a la ficha del cliente', 'ok');
      } else {
        toast('No se pudo aplicar', 'aviso');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo aplicar', 'aviso');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="mt-4 rounded-[4px] border border-bronze/30 bg-bronze/[0.06] px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Dicho por el cliente</Eyebrow>
        <span className="text-[10px] text-faint">{hace(propuesta.creadaEn)}</span>
      </div>

      {propuesta.textoOriginal && (
        <p className="mt-1.5 font-serif text-[15px] italic leading-snug text-ink">
          «{propuesta.textoOriginal}»
        </p>
      )}

      {editando === propuesta.id ? (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="eyebrow">{'Cómo corta'}</span>
            <textarea
              value={corta}
              onChange={(e) => setCorta(e.target.value)}
              rows={3}
              className={cn(inputClases, 'mt-1 text-[13px]')}
            />
          </label>
          <label className="block">
            <span className="eyebrow">Preferencias</span>
            <textarea
              value={prefs}
              onChange={(e) => setPrefs(e.target.value)}
              rows={2}
              className={cn(inputClases, 'mt-1 text-[13px]')}
            />
          </label>
          <div className="flex gap-2">
            <Btn t="sm" onClick={() => void guardarCorregida()} disabled={guardando}>
              <Check size={13} /> Guardar en la ficha
            </Btn>
            <Btn t="sm" v="quiet" onClick={() => setEditando(null)}>
              <X size={13} /> Cancelar
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-ink-soft">
            {propuesta.comoCorta && (
              <p>
                <span className="font-semibold text-ink">Cómo corta:</span> {propuesta.comoCorta}
              </p>
            )}
            {propuesta.preferencias && (
              <p>
                <span className="font-semibold text-ink">Prefiere:</span> {propuesta.preferencias}
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Btn t="sm" onClick={() => void aceptar()} disabled={guardando}>
              <Check size={13} /> Aplicar a la ficha
            </Btn>
            <Btn
              t="sm"
              v="quiet"
              onClick={() => {
                setCorta(propuesta.comoCorta);
                setPrefs(propuesta.preferencias);
                setEditando(propuesta.id);
              }}
            >
              <Pencil size={13} /> Editar
            </Btn>
            <Btn t="sm" v="quiet" onClick={() => void descartar()} disabled={guardando}>
              <X size={13} /> Descartar
            </Btn>
          </div>
        </>
      )}
    </section>
  );
}
