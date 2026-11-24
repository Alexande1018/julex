#!/usr/bin/env bash
#
# Deja el canal de WhatsApp desplegado y en marcha.
#
#   ./scripts/desplegar-wa.sh                # hace todo
#   ./scripts/desplegar-wa.sh --comprobar    # solo dice qué falta
#
# Necesita una sesión de Supabase. Dos maneras, la que prefieras:
#
#   npx supabase login
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#
# Y el fichero `.env.whatsapp` relleno (copia de `.env.whatsapp.example`).
#
# Es idempotente: si lo lanzas dos veces, la segunda no rompe nada.

set -euo pipefail

cd "$(dirname "$0")/.."

ROJO=$'\033[31m'; VERDE=$'\033[32m'; AMBAR=$'\033[33m'; GRIS=$'\033[90m'; FIN=$'\033[0m'
paso()  { printf '\n%s▸ %s%s\n' "$VERDE" "$1" "$FIN"; }
aviso() { printf '%s  %s%s\n' "$AMBAR" "$1" "$FIN"; }
fallo() { printf '%s  ✗ %s%s\n' "$ROJO" "$1" "$FIN"; }
bien()  { printf '%s  ✓ %s%s\n' "$GRIS" "$1" "$FIN"; }

SOLO_COMPROBAR=0
[[ "${1:-}" == "--comprobar" ]] && SOLO_COMPROBAR=1

# ---------------------------------------------------------------- proyecto
if [[ ! -f .env.local ]]; then
  fallo "Falta .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY"
  exit 1
fi

URL=$(grep -E '^VITE_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
REF=$(printf '%s' "$URL" | sed -E 's#https://([a-z0-9]+)\.supabase\.co.*#\1#')

if [[ -z "$REF" || "$REF" == "$URL" ]]; then
  fallo "No sé sacar el identificador del proyecto de VITE_SUPABASE_URL ($URL)"
  exit 1
fi

paso "Proyecto $REF"

# ---------------------------------------------------------------- sesión
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  bien "sesión por SUPABASE_ACCESS_TOKEN"
elif [[ -f "$HOME/.supabase/access-token" ]]; then
  bien "sesión guardada por «supabase login»"
else
  aviso "Sin sesión de Supabase. Ejecuta antes:  npx supabase login"
  aviso "o exporta SUPABASE_ACCESS_TOKEN=sbp_... (se crea en Account → Access Tokens)"
  [[ $SOLO_COMPROBAR -eq 1 ]] || exit 1
fi

SUPA="npx --yes supabase@latest"

# Si no hay CLI todavía, se descarga la primera vez (tarda un poco).
# En modo comprobación no se descarga nada: solo se avisa.
if [[ $SOLO_COMPROBAR -eq 0 ]]; then
  if ! $SUPA --version >/dev/null 2>&1; then
    aviso "Descargando la CLI de Supabase la primera vez…"
  fi
fi

# ---------------------------------------------------------------- secretos
paso "Secretos del canal"
if [[ -f .env.whatsapp ]]; then
  faltan=$(grep -E '^[A-Z0-9_]+=$' .env.whatsapp | cut -d= -f1 | tr '\n' ' ' || true)
  if [[ -n "$faltan" ]]; then
    aviso "En .env.whatsapp faltan valores: $faltan"
  else
    bien "todas las claves tienen valor"
  fi
else
  fallo "No existe .env.whatsapp (copia .env.whatsapp.example y rellénalo)"
  [[ $SOLO_COMPROBAR -eq 1 ]] || exit 1
fi

# ---------------------------------------------------------------- estado
paso "Estado actual"
if [[ $SOLO_COMPROBAR -eq 1 ]]; then
  npm run --silent preflight || true
  printf '\nPara desplegar:  ./scripts/desplegar-wa.sh\n'
  exit 0
fi

# ---------------------------------------------------------------- enlazar
paso "Enlazando el proyecto"
$SUPA link --project-ref "$REF" --yes

# ---------------------------------------------------------------- migraciones
paso "Aplicando migraciones (0031–0036)"
$SUPA db push

# ---------------------------------------------------------------- secretos
paso "Cargando secretos en las funciones"
$SUPA secrets set --env-file .env.whatsapp

# ---------------------------------------------------------------- funciones
paso "Desplegando funciones"
$SUPA functions deploy asistente wa-webhook wa-cron wa-onboarding wa-simular

# ---------------------------------------------------------------- cron
paso "Cron y comprobación final"
cat <<SQL

  Falta un paso a mano, una sola vez, en el editor SQL del proyecto:

    insert into config_secreta (clave, valor) values
      ('wa_cron_url', '${URL}/functions/v1/wa-cron'),
      ('wa_cron_secreto', '<el mismo CRON_SECRET de .env.whatsapp>')
    on conflict (clave) do update set valor = excluded.valor;

SQL

npm run --silent preflight || true

printf '\n%sListo lo que se puede hacer desde aquí.%s\n' "$VERDE" "$FIN"
printf 'Lo que queda es Meta: %sdocs/whatsapp/meta-pasos.md%s\n\n' "$GRIS" "$FIN"
