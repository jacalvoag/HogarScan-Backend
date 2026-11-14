#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
export PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || fail 'Ejecuta este script con sudo o mediante SSM.'
[[ $# -le 1 ]] || fail 'Uso: prune-releases.sh [--dry-run|--apply]'
mode=${1:---dry-run}
[[ $mode == --dry-run || $mode == --apply ]] || fail 'Modo inválido.'

exec 9>/run/lock/hogarscan-deploy.lock
flock -n 9 || fail 'Hay otro despliegue o limpieza en curso.'

base=/opt/hogarscan
releases="$base/releases"
keep_recent=5
pattern='^[a-f0-9]{40}(-[0-9]+-[0-9]+)?$'

[[ -d $releases && ! -L $releases ]] || fail 'El directorio releases no es válido.'

protected_release() {
  local link=$1
  local target

  [[ -L $link ]] || fail "Falta el enlace protegido: $link"
  target=$(readlink -e "$link") || fail "Enlace sin destino válido: $link"
  [[ ${target%/*} == "$releases" ]] || fail "Destino fuera de releases: $link"
  [[ ${target##*/} =~ $pattern && -d $target && -f $target/dist/main.js ]] || fail "Versión protegida inválida: $link"

  printf '%s\n' "$target"
}

current=$(protected_release "$base/current")
previous=$(protected_release "$base/previous")

inventory=$(mktemp /tmp/hogarscan-prune.XXXXXXXX)
trap 'rm -f "$inventory"' EXIT

find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\0' |
  LC_ALL=C sort -zrn > "$inventory"

printf 'Modo: %s\nActual: %s\nAnterior: %s\n' "$mode" "$current" "$previous"
recent=0
candidates=0

while IFS= read -r -d '' entry; do
  id=${entry#* }

  if [[ ! $id =~ $pattern ]]; then
    printf 'Ignorado: %s\n' "$id"
    continue
  fi

  directory="$releases/$id"
  [[ -d $directory && ! -L $directory ]] || fail "El directorio cambió: $directory"

  if [[ $directory == "$current" || $directory == "$previous" ]]; then
    printf 'Protegida: %s\n' "$id"
  elif (( recent < keep_recent )); then
    recent=$((recent + 1))
    printf 'Reciente: %s\n' "$id"
  else
    candidates=$((candidates + 1))

    if [[ $mode == --apply ]]; then
      rm -rf --one-file-system -- "$directory"
      printf 'Eliminada: %s\n' "$id"
    else
      printf 'Eliminaría: %s\n' "$id"
    fi
  fi
done < "$inventory"

printf 'Versiones candidatas: %s\n' "$candidates"