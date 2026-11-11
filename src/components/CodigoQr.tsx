import { useRef } from 'react';
import { Copy, Download, Printer } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Btn, Eyebrow, toast } from './ui';

/**
 * El QR de reservas de un local.
 *
 * Es uno solo por barbería y no lleva nada personal: apunta a `/cita/<slug>`,
 * que es pública. Se imprime una vez y se pega en el mostrador o en el espejo.
 * Se genera en el navegador, sin mandar la URL a ningún servicio.
 *
 * También se puede imprimir desde el móvil del barbero: la hoja de impresión
 * (`@media print` en `index.css`) deja solo este bloque.
 */
export function CodigoQr({
  url,
  subtitulo,
  nombreFichero = 'julex-reservas',
}: {
  url: string;
  subtitulo?: string;
  nombreFichero?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado', 'ok');
    } catch {
      toast('No se pudo copiar en este navegador', 'aviso');
    }
  };

  const descargar = () => {
    const lienzo = caja.current?.querySelector('canvas');
    if (!lienzo) return;
    const enlace = document.createElement('a');
    enlace.href = lienzo.toDataURL('image/png');
    enlace.download = `${nombreFichero}.png`;
    enlace.click();
    toast('QR descargado', 'ok');
  };

  return (
    <div className="rounded-[4px] border border-line bg-paper px-4 py-3.5">
      <Eyebrow>QR de reservas</Eyebrow>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        {subtitulo ??
          'Uno solo para toda la barbería: quien lo escanee abre la reserva de este local. No lleva datos de ningún cliente.'}
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div data-imprimir className="rounded-[3px] bg-white p-3">
          <div ref={caja}>
            <QRCodeCanvas value={url} size={176} level="M" marginSize={1} />
          </div>
          <p className="mt-2 max-w-[176px] break-all text-center text-[9px] leading-snug text-ink-soft">
            {url.replace(/^https?:\/\//, '')}
          </p>
          <p className="mt-1 text-center text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink">
            Pedir cita
          </p>
        </div>

        <div className="flex-1 space-y-2">
          <p className="break-all rounded-[3px] border border-line-soft bg-ivory px-2.5 py-2 text-[11px] text-ink-soft">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn v="outline" t="sm" onClick={() => void copiar()}>
              <Copy size={12} /> Copiar
            </Btn>
            <Btn v="outline" t="sm" onClick={descargar}>
              <Download size={12} /> Descargar PNG
            </Btn>
            <Btn v="outline" t="sm" onClick={() => window.print()}>
              <Printer size={12} /> Imprimir
            </Btn>
          </div>
          <p className="text-[10.5px] leading-relaxed text-faint">
            Imprímelo una vez y pégalo en el mostrador. El llavero lleva su propia URL grabada; esto
            no hay que prepararlo por cliente.
          </p>
        </div>
      </div>
    </div>
  );
}
