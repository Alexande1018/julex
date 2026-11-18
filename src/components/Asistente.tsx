import { useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { primerNombre } from '../lib/format';
import {
  estadoAsistente,
  hablar,
  recordarCerrado,
  estabaCerrado,
  type EstadoAsistente,
} from '../lib/asistente';

interface Props {
  token: string;
  pin: string | null;
  nombreCliente: string;
  nombreLocal: string;
}

interface Burbuja {
  papel: 'cliente' | 'asistente';
  texto: string;
}

const ATAJOS = [
  { etiqueta: 'Pedir cita', mensaje: 'Quiero pedir una cita.' },
  { etiqueta: 'Cómo lo quiero', mensaje: 'Te cuento cómo quiero el corte.' },
  { etiqueta: 'Mis sellos', mensaje: '¿Cuántos sellos me faltan para el premio?' },
];

export function Asistente({ token, pin, nombreCliente, nombreLocal }: Props) {
  const [estado, setEstado] = useState<EstadoAsistente | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [conversacion, setConversacion] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    if (estabaCerrado(token)) return;
    estadoAsistente(token, pin)
      .then((e) => {
        if (!vivo) return;
        setEstado(e);
        setAbierto(e.estado === 'abierta');
      })
      .catch(() => {
        /* si falla, la tarjeta sigue: el recuadro no es obligatorio */
      });
    return () => {
      vivo = false;
    };
  }, [token, pin]);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'nearest' });
  }, [burbujas, enviando]);

  if (!estado || !abierto) return null;

  const nombreAsistente = estado.nombre ?? 'Asistente virtual';
  const inicial = (estado.nombre ?? 'A').charAt(0).toUpperCase();
  const saludo = `Hola, ${primerNombre(nombreCliente)}. ¿En qué puedo ayudarte hoy?`;

  const cerrar = () => {
    recordarCerrado(token);
    setAbierto(false);
  };

  const enviar = async (mensaje: string) => {
    const limpio = mensaje.trim();
    if (!limpio || enviando) return;

    setBurbujas((b) => [...b, { papel: 'cliente', texto: limpio }]);
    setTexto('');
    setEnviando(true);

    try {
      const respuesta = await hablar({ token, pin, conversacionId: conversacion, mensaje: limpio });
      setConversacion(respuesta.conversacionId);
      setBurbujas((b) => [...b, { papel: 'asistente', texto: respuesta.texto }]);
    } catch {
      setBurbujas((b) => [
        ...b,
        {
          papel: 'asistente',
          texto: 'Ahora mismo no puedo contestar. Prueba otra vez, o pide la cita en el formulario.',
        },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="mt-4" aria-label="Asistente del local">
      <div className="overflow-hidden rounded-[10px] border border-line bg-paper shadow-[0_14px_34px_-26px_rgba(26,27,23,0.55)]">
        {/* Cabecera */}
        <div className="flex items-center gap-2.5 border-b border-line bg-paper-2 px-3.5 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-semibold text-ivory">
            {inicial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold leading-tight text-ink">{nombreAsistente}</p>
            <p className="text-[10px] leading-tight text-faint">en línea</p>
          </div>
          <button
            onClick={cerrar}
            aria-label="Cerrar el asistente"
            className="-mr-1 rounded-[3px] p-1 text-faint transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {/* Conversación */}
        <div
          className="max-h-[320px] space-y-1.5 overflow-y-auto bg-paper-2 px-3 py-3"
          role="log"
          aria-live="polite"
        >
          <p className="w-fit max-w-[85%] rounded-[10px] rounded-tl-[2px] bg-paper px-3 py-2 text-[12.5px] leading-relaxed text-ink ring-1 ring-line-soft">
            {saludo}
          </p>

          {burbujas.map((b, i) => (
            <p
              key={`${b.papel}-${i}`}
              className={
                b.papel === 'cliente'
                  ? 'ml-auto w-fit max-w-[85%] rounded-[10px] rounded-tr-[2px] bg-[var(--brand)] px-3 py-2 text-[12.5px] leading-relaxed text-ivory'
                  : 'w-fit max-w-[85%] rounded-[10px] rounded-tl-[2px] bg-paper px-3 py-2 text-[12.5px] leading-relaxed text-ink ring-1 ring-line-soft'
              }
            >
              {b.texto}
            </p>
          ))}

          {enviando && (
            <p className="w-fit rounded-[10px] bg-paper px-3 py-2 text-[11.5px] text-faint">Escribiendo…</p>
          )}

          <div ref={fin} />
        </div>

        {/* Atajos, solo al empezar */}
        {burbujas.length === 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-line bg-paper px-3 pt-2.5">
            {ATAJOS.map((a) => (
              <button
                key={a.etiqueta}
                onClick={() => void enviar(a.mensaje)}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
              >
                {a.etiqueta}
              </button>
            ))}
          </div>
        )}

        {/* Barra de escribir */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
          className="flex items-center gap-2 bg-paper px-3 py-2.5"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe aquí…"
            aria-label="Escribir al asistente"
            maxLength={500}
            className="min-w-0 flex-1 rounded-full border border-line bg-ivory px-3.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-ink/30"
          />
          <button
            type="submit"
            disabled={!texto.trim() || enviando}
            aria-label="Enviar"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-ivory transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={16} />
          </button>
        </form>
      </div>

      <p className="mt-2 px-1 text-[10px] leading-relaxed text-faint">
        Responde un asistente virtual. Si no puede, avisa a {nombreLocal}.
      </p>
    </section>
  );
}
