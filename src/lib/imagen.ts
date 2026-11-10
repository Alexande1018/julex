/**
 * Reduce una imagen a algo manejable antes de guardarla.
 * Devuelve un Blob (para subir a Storage) o un data URL (modo local).
 */

async function lienzo(file: File, max = 512): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen');
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolver, rechazar) => {
      if (img.decode) {
        img.decode().then(() => resolver()).catch(() => rechazar(new Error('imagen ilegible')));
      } else {
        img.onload = () => resolver();
        img.onerror = () => rechazar(new Error('imagen ilegible'));
      }
    });

    const anchoOriginal = img.naturalWidth || max;
    const altoOriginal = img.naturalHeight || max;
    const escala = Math.min(1, max / Math.max(anchoOriginal, altoOriginal));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(anchoOriginal * escala));
    canvas.height = Math.max(1, Math.round(altoOriginal * escala));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sin canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** WebP con transparencia, como Blob. */
export async function imagenAWebpBlob(file: File, max = 512): Promise<Blob> {
  const canvas = await lienzo(file, max);
  return new Promise<Blob>((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('no se pudo codificar'))),
      'image/webp',
      0.92,
    );
  });
}

/** Igual, pero como data URL (modo local). */
export async function imagenAWebp(file: File, max = 512): Promise<string> {
  const canvas = await lienzo(file, max);
  return canvas.toDataURL('image/webp', 0.92);
}
