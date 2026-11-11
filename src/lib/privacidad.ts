/**
 * Filtro de datos sensibles en los campos libres.
 *
 * Las notas y las preferencias son para cómo se atiende al cliente, no para
 * su historial clínico. El RGPD trata los datos de salud en el artículo 9:
 * no basta el consentimiento normal, y este producto no tiene ni las
 * garantías ni los controles para guardarlos.
 *
 * No es un detector perfecto: es un aviso y un freno para los casos claros.
 * La defensa de verdad está en la interfaz (campo corto, texto de ayuda) y
 * en formar a quien lo usa.
 */

const TERMINOS: { patron: RegExp; etiqueta: string }[] = [
  { patron: /\balergi|alérgic/i, etiqueta: 'alergias' },
  { patron: /\bmedicaci|medicament|pastillas\b/i, etiqueta: 'medicación' },
  { patron: /\bdiagnóstic|diagnostic/i, etiqueta: 'diagnósticos' },
  { patron: /\benfermedad|patolog|síntoma|sintoma/i, etiqueta: 'enfermedades' },
  { patron: /\bembaraz/i, etiqueta: 'embarazo' },
  { patron: /\bdiscapacidad|minusval/i, etiqueta: 'discapacidad' },
  { patron: /\bcáncer|cancer|quimio|vih|sida\b/i, etiqueta: 'datos de salud graves' },
  { patron: /\bdepresi|ansiedad|psiqui|trastorno/i, etiqueta: 'salud mental' },
  { patron: /\breligi|religión/i, etiqueta: 'religión' },
  { patron: /\bsexual|orientación|orientacion/i, etiqueta: 'vida sexual' },
  { patron: /\betnia|\braza\b|inmigrante/i, etiqueta: 'origen o etnia' },
];

/** Devuelve la etiqueta del primer término sensible encontrado, o null. */
export function terminoSensible(texto: string): string | null {
  if (!texto) return null;
  for (const t of TERMINOS) {
    if (t.patron.test(texto)) return t.etiqueta;
  }
  return null;
}

/** Aviso que se repite bajo los campos libres. */
export const AVISO_SENSIBLE =
  'Solo lo necesario para atenderle: gustos, estilo y detalles prácticos. No escribas datos de salud (alergias, medicación, diagnósticos), religión, origen ni vida sexual.';
