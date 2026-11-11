import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, Download, LogOut, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useDb } from '../lib/store';
import {
  actualizarBarberia,
  actualizarServicio,
  actualizarSilla,
  crearServicio,
  crearSilla,
  quitarSilla,
  reiniciarDemo,
  salir,
} from '../lib/actions';
import { barberiaActiva, cuotaMensual, resumenLlaveros, sillasDe } from '../lib/derive';
import { fmtEuros } from '../lib/format';
import { Shell } from '../components/Shell';
import { haySupabase, supabase } from '../lib/supabase';
import { subirLogo } from '../lib/repo';
import { Logotipo } from '../components/Logotipo';
import { imagenAWebp, imagenAWebpBlob } from '../lib/imagen';
import {
  Btn,
  Confirmar,
  btnClases,
  Eyebrow,
  Field,
  Pill,
  Rule,
  cn,
  inputClases,
  toast,
} from '../components/ui';

const COLORES = [
  { hex: '#3E4A35', nombre: 'Oliva' },
  { hex: '#8A6A46', nombre: 'Bronce' },
  { hex: '#A2553C', nombre: 'Arcilla' },
  { hex: '#20211F', nombre: 'Carbón' },
  { hex: '#6E7B5F', nombre: 'Salvia' },
];

export default function Ajustes() {
  const db = useDb();
  const navegar = useNavigate();
  const barberia = barberiaActiva(db);

  const [nombre, setNombre] = useState(barberia.nombre);
  const [telefono, setTelefono] = useState(barberia.telefono);
  const [direccion, setDireccion] = useState(barberia.direccion);
  const [meta, setMeta] = useState(String(barberia.fidelidadMeta));
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);
  const [reset, setReset] = useState(false);
  const [salirConfirm, setSalirConfirm] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);

  const llaveros = resumenLlaveros(db, barberia.id);
  const cuota = cuotaMensual(db, barberia.id);
  useEffect(() => {
    if (!haySupabase || !supabase) return;
    void supabase.rpc('soy_admin').then(({ data }) => setEsAdmin(data === true));
  }, []);

  const servicios = db.servicios.filter((s) => s.barberiaId === barberia.id);
  const sillas = sillasDe(db, barberia.id);

  const guardarDatos = () => {
    const m = Math.max(2, Math.min(30, Number(meta) || 10));
    actualizarBarberia({
      nombre: nombre.trim() || barberia.nombre,
      telefono: telefono.trim(),
      direccion: direccion.trim(),
      fidelidadMeta: m,
    });
    setMeta(String(m));
    toast('Datos del local guardados', 'ok');
  };

  const cambiarLogo = async (file: File) => {
    setSubiendoLogo(true);
    try {
      if (haySupabase) {
        const blob = await imagenAWebpBlob(file);
        const url = await subirLogo(barberia.id, blob);
        await actualizarBarberia({ logo: url });
      } else {
        const dataUrl = await imagenAWebp(file);
        await actualizarBarberia({ logo: dataUrl });
      }
      toast('Logo actualizado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo leer la imagen', 'aviso');
    } finally {
      setSubiendoLogo(false);
    }
  };

  const exportar = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `julex-demo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Datos exportados a JSON', 'ok');
  };

  return (
    <Shell barberia={barberia} activo="/barbero/ajustes">
      <div className="pt-5">
        <Eyebrow>Ajustes</Eyebrow>
        <h1 className="mt-1.5 font-serif text-[27px] leading-none tracking-tight text-ink">
          {barberia.nombre}
        </h1>
      </div>

      {/* LOCAL */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>Local</Eyebrow>
          <span className="text-[10.5px] text-faint">Así te ve el cliente</span>
        </div>

        <div className="mt-3 space-y-4">
          <div className="flex items-center gap-3.5 rounded-[3px] border border-line bg-paper px-3.5 py-3">
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-line bg-ivory">
              {barberia.logo ? (
                <img src={barberia.logo} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Logotipo nombre={barberia.nombre} logo={null} tamano={38} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink">Logo del local</p>
              <p className="mt-0.5 max-w-[34ch] text-[10.5px] leading-relaxed text-muted">
                PNG o SVG con fondo transparente. Se reduce a 512 px.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                onClick={() => inputLogo.current?.click()}
                disabled={subiendoLogo}
                className={btnClases('outline', 'sm')}
              >
                {subiendoLogo ? 'Leyendo…' : barberia.logo ? 'Cambiar' : 'Subir'}
              </button>
              {barberia.logo && (
                <button
                  onClick={() => {
                    actualizarBarberia({ logo: null });
                    toast('Logo quitado', 'info');
                  }}
                  className="text-[10px] font-semibold text-faint underline decoration-line underline-offset-2 hover:text-clay"
                >
                  Quitar
                </button>
              )}
            </div>

            <input
              ref={inputLogo}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void cambiarLogo(file);
                e.target.value = '';
              }}
            />
          </div>

          <Field label="Nombre del local">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClases} />
          </Field>

          <Field label="Teléfono" hint="opcional">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={inputClases}
              inputMode="tel"
              placeholder="600 000 000"
            />
          </Field>

          <Field label="Dirección" hint="el cliente la ve al pedir cita">
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className={inputClases}
              placeholder="Calle Mayor 14, 28013 Madrid"
            />
          </Field>

          <div>
            <Eyebrow>Color de marca</Eyebrow>
            <div className="mt-2 flex items-center gap-2">
              {COLORES.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => {
                    actualizarBarberia({ color: c.hex });
                    toast(`Color ${c.nombre.toLowerCase()} aplicado`, 'ok');
                  }}
                  aria-label={c.nombre}
                  className={cn(
                    'size-8 rounded-[3px] border-2 transition-transform',
                    barberia.color.toLowerCase() === c.hex.toLowerCase()
                      ? 'border-ink'
                      : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              <span className="ml-1 text-[11px] text-muted">{barberia.color.toUpperCase()}</span>
            </div>
          </div>

          <Field label="Meta de fidelización" hint="cortes por corte gratis">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2}
                max={30}
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                className={cn(inputClases, 'num w-24 text-center')}
              />
              <span className="text-[12px] text-muted">+ 1 gratis</span>
            </div>
          </Field>

          <Btn t="md" onClick={guardarDatos}>
            Guardar cambios
          </Btn>
        </div>
      </section>

      <Rule className="my-6" />

      {/* SERVICIOS */}
      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Servicios</Eyebrow>
          <span className="num text-[11px] text-faint">{servicios.length}</span>
        </div>

        <div className="mt-2">
          {servicios.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[1fr_58px_58px_26px] items-center gap-2 border-b border-line-soft py-2.5"
            >
              <input
                defaultValue={s.nombre}
                onBlur={(e) => {
                  const nombre = e.target.value.trim();
                  if (nombre && nombre !== s.nombre) actualizarServicio(s.id, { nombre });
                }}
                className={cn(
                  'min-w-0 truncate rounded-[2px] border border-transparent bg-transparent px-1 py-1 text-[13px] hover:border-line focus:border-ink/40 focus:bg-paper focus:outline-none',
                  s.activo ? 'text-ink' : 'text-faint line-through',
                )}
              />
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={s.precio}
                  onChange={(e) => actualizarServicio(s.id, { precio: Number(e.target.value) || 0 })}
                  className="num w-full rounded-[2px] border border-transparent bg-transparent py-1 pl-1 pr-3 text-right text-[12.5px] text-ink-soft hover:border-line focus:border-ink/40 focus:bg-paper focus:outline-none"
                />
                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-faint">
                  €
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={s.minutos}
                  onChange={(e) => actualizarServicio(s.id, { minutos: Number(e.target.value) || 0 })}
                  className="num w-full rounded-[2px] border border-transparent bg-transparent py-1 pl-1 pr-3 text-right text-[12.5px] text-ink-soft hover:border-line focus:border-ink/40 focus:bg-paper focus:outline-none"
                />
                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-faint">
                  m
                </span>
              </div>
              <button
                onClick={() => actualizarServicio(s.id, { activo: !s.activo })}
                aria-label={s.activo ? `Ocultar ${s.nombre}` : `Volver a ofrecer ${s.nombre}`}
                className={cn(
                  'justify-self-end rounded-full border p-1 transition-colors',
                  s.activo
                    ? 'border-[var(--brand)] text-[var(--brand)]'
                    : 'border-line text-faint hover:text-muted',
                )}
              >
                {s.activo ? <Check size={11} /> : <Circle size={11} />}
              </button>
            </div>
          ))}
        </div>

        <Btn v="outline" t="sm" className="mt-3 w-full border-dashed" onClick={() => crearServicio()}>
          <Plus size={13} /> Añadir servicio
        </Btn>
        <p className="mt-2 text-[10.5px] text-faint">
          Los cambios se aplican al instante en la agenda, la cola y la tarjeta del cliente. Lo que
          ocultes deja de ofrecerse al reservar, pero no borra su historial.
        </p>
      </section>

      <Rule className="my-6" />

      {/* SILLAS */}
      <section>
        <div className="flex items-end justify-between">
          <Eyebrow>Sillas</Eyebrow>
          <span className="num text-[11px] text-faint">
            {sillas.filter((x) => x.activa).length} activas
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Cada silla es un puesto de trabajo. Con más de una, el mismo tramo admite varias citas a la
          vez y cada silla lleva su propia cuenta.
        </p>

        <div className="mt-2">
          {sillas.map((silla) => (
            <div
              key={silla.id}
              className="flex items-center gap-2 border-b border-line-soft py-2.5"
            >
              <button
                onClick={() => actualizarSilla(silla.id, { activa: !silla.activa })}
                aria-label={silla.activa ? `Desactivar ${silla.nombre}` : `Activar ${silla.nombre}`}
                className={cn(
                  'shrink-0 rounded-full border p-1 transition-colors',
                  silla.activa
                    ? 'border-[var(--brand)] text-[var(--brand)]'
                    : 'border-line text-faint hover:text-muted',
                )}
              >
                {silla.activa ? <Check size={11} /> : <Circle size={11} />}
              </button>

              <input
                defaultValue={silla.nombre}
                onBlur={(e) => {
                  const nombre = e.target.value.trim();
                  if (nombre && nombre !== silla.nombre) actualizarSilla(silla.id, { nombre });
                }}
                className={cn(
                  'min-w-0 flex-1 rounded-[2px] border border-transparent bg-transparent px-1 py-1 text-[13px] hover:border-line focus:border-ink/40 focus:bg-paper focus:outline-none',
                  silla.activa ? 'text-ink' : 'text-faint line-through',
                )}
              />

              <button
                onClick={() => quitarSilla(silla.id)}
                aria-label={`Quitar ${silla.nombre}`}
                className="shrink-0 rounded-[2px] p-1 text-faint hover:bg-paper-2 hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <Btn v="outline" t="sm" className="mt-3 w-full border-dashed" onClick={() => crearSilla('')}>
          <Plus size={13} /> Añadir silla
        </Btn>
        <p className="mt-2 text-[10.5px] text-faint">
          Desactivar una silla deja de ofrecer huecos en ella; su historial no se pierde.
        </p>
      </section>

      <Rule className="my-6" />

      {/* CUOTA JULEX */}
      <section>
        <Eyebrow>Tu cuota JULEX</Eyebrow>
        <div className="mt-2 rounded-[4px] border border-line bg-paper px-4 py-3.5">
          <div className="flex items-end justify-between">
            <div>
              <p className="num font-serif text-[26px] leading-none text-ink">{fmtEuros(cuota.cuota)}</p>
              <p className="eyebrow mt-1.5">al mes</p>
            </div>
            <div className="text-right">
              <p className="num text-[12.5px] text-ink">{llaveros.activos} activos</p>
              <p className="mt-0.5 text-[10.5px] text-faint">de {llaveros.total} llaveros</p>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            {cuota.minimo
              ? `Mínimo de 15 €: se factura por los 15 llaveros incluidos en el alta, estén asignados o no.`
              : `15 € de base más 1 € por cada llavero activo a partir del decimoquinto.`}
          </p>
          {llaveros.sinAsignar > 0 && (
            <p className="mt-1.5 text-[11px] text-bronze">
              Te quedan {llaveros.sinAsignar} llaveros sin asignar.
            </p>
          )}
        </div>
      </section>

      <Rule className="my-6" />

      {/* AVISOS */}
      <section>
        <Eyebrow>Avisos y mensajes</Eyebrow>
        <div className="mt-2 flex items-center gap-2">
          <Pill tono="neutral">Próximamente</Pill>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
          Los recordatorios de cita y las solicitudes de reseña ya quedan registrados en el historial de
          cada cliente. El envío automático por WhatsApp o SMS llegará en la próxima actualización.
        </p>
      </section>

      <Rule className="my-6" />

      {esAdmin && (
        <>
          <Rule className="my-6" />
          <section>
            <Eyebrow>Administración</Eyebrow>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              Esta cuenta es de administrador: gestiona todos los locales, sus llaveros y sus accesos.
            </p>
            <Link
              to="/admin"
              className={cn(
                btnClases('outline', 'md'),
                'mt-2.5 inline-flex w-full items-center justify-center gap-1.5',
              )}
            >
              Abrir panel de administrador
            </Link>
          </section>
        </>
      )}

      <Rule className="my-6" />

      {/* DATOS */}
      <section className="pb-6">
        <Eyebrow>Datos</Eyebrow>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Btn v="outline" t="md" onClick={exportar}>
            <Download size={13} /> Exportar datos
          </Btn>
          {!haySupabase && (
            <Btn v="outline" t="md" onClick={() => setReset(true)}>
              <RotateCcw size={13} /> Reiniciar demo
            </Btn>
          )}
          <Btn v="quiet" t="md" onClick={() => setSalirConfirm(true)}>
            <LogOut size={13} /> Cerrar sesión
          </Btn>
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
          {haySupabase
            ? 'Los datos viven en vuestra base de datos. La exportación incluye clientes, visitas y llaveros.'
            : 'Todo se guarda en este navegador. La demo está aislada: no comparte datos con ninguna barbería real ni con ningún servicio externo.'}
        </p>
      </section>

      <Confirmar
        open={reset}
        titulo="¿Reiniciar la demo?"
        texto="Se borran los cambios de esta sesión y vuelven los datos de ejemplo. No se puede deshacer."
        etiquetaConfirmar="Reiniciar"
        peligro
        onClose={() => setReset(false)}
        onConfirm={() => {
          reiniciarDemo();
          toast('Demo reiniciada', 'info');
        }}
      />

      <Confirmar
        open={salirConfirm}
        titulo="¿Cerrar la sesión?"
        texto="Se cierra la sesión en este navegador: la cola y las fichas volverán a pedir acceso."
        etiquetaConfirmar="Cerrar sesión"
        nota={null}
        onClose={() => setSalirConfirm(false)}
        onConfirm={() => {
          void salir().finally(() => navegar('/'));
        }}
      />
    </Shell>
  );
}
