import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Btn, Check as Casilla, Eyebrow, Field, Rule, inputClases, toast } from './ui';

/**
 * Ajustes del asistente del llavero. Solo en modo real: en la demo no hay
 * configuración que guardar.
 */
export function AsistenteAjustes({ barberiaId }: { barberiaId: string }) {
  const [nombre, setNombre] = useState('');
  const [activo, setActivo] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!supabase) {
      setCargando(false);
      return;
    }
    supabase
      .from('asistente_config')
      .select('nombre, activo')
      .eq('barberia_id', barberiaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        if (data) {
          setNombre(String(data.nombre ?? ''));
          setActivo(Boolean(data.activo));
        }
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [barberiaId]);

  const guardar = async () => {
    if (!supabase) return;
    setGuardando(true);
    try {
      const { error } = await supabase
        .from('asistente_config')
        .upsert(
          { barberia_id: barberiaId, nombre: nombre.trim().slice(0, 40), activo },
          { onConflict: 'barberia_id' },
        );
      if (error) throw new Error(error.message);
      toast('Asistente guardado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'aviso');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section>
      <Eyebrow>Asistente del llavero</Eyebrow>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
        Cuando el cliente toca su llavero, el asistente le saluda por su nombre y le ofrece lo que toca:
        su próxima cita, su premio o pedir una nueva. Si lo apagas, la tarjeta sigue funcionando.
      </p>

      <div className="mt-3">
        <Field label="Nombre del asistente" hint="si lo dejas vacío, se presenta como «el asistente de tu local»">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={inputClases}
            placeholder="Julia"
            maxLength={40}
            disabled={cargando}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Casilla checked={activo} onChange={setActivo}>
          Atender a los clientes desde su tarjeta
        </Casilla>
      </div>

      <div className="mt-3">
        <Btn t="sm" onClick={() => void guardar()} disabled={cargando || guardando}>
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar
        </Btn>
      </div>

      <Rule className="my-5" />
      <p className="text-[10.5px] leading-relaxed text-faint">
        El asistente nunca inventa precios ni horas: solo ofrece lo que hay en tu agenda. Lo que el
        cliente cuente sobre su corte te llegará a su ficha como propuesta, para que lo aceptes tú.
      </p>
    </section>
  );
}
