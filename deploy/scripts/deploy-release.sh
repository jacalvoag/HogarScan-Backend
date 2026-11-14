#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
export PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || fail 'Ejecuta este script con sudo o mediante SSM.'
[[ $# -eq 1 ]] || fail 'Uso: deploy-release.sh <identificador>'
release_id=$1
[[ $release_id =~ ^[a-f0-9]{40}(-[0-9]+-[0-9]+)?$ ]] || fail 'Identificador inválido.'

exec 9>/run/lock/hogarscan-deploy.lock
flock -n 9 || fail 'Ya hay otro despliegue en curso.'

base=/opt/hogarscan
release_dir="$base/releases/$release_id"
unit=/etc/systemd/system/hogarscan-api.service
caddyfile=/etc/caddy/Caddyfile
bucket=hogarscan-deploy-jacalvoag-mx-central-1
region=mx-central-1
domain=hogarscan-jacalvoag.duckdns.org

[[ ! -e $release_dir && ! -L $release_dir ]] || fail 'Esta versión ya existe; usa otro identificador.'
[[ -L $base/current ]] || fail 'No existe el enlace de la versión anterior.'
previous=$(readlink -e "$base/current")
[[ ! -e $base/previous || -L $base/previous ]] || fail 'previous debe ser un enlace simbólico.'
previous_link=$(readlink "$base/previous" 2>/dev/null || true)
[[ $previous == "$base/releases/"* && -f $previous/dist/main.js ]] || fail 'La versión anterior no es válida.'
[[ -f $unit && -f $caddyfile ]] || fail 'Falta la configuración instalada.'

work=$(mktemp -d /tmp/hogarscan-deploy.XXXXXXXX)
changing=false
committed=false

wait_ready() {
  local url=$1
  shift
  local code
  for ((attempt = 1; attempt <= 10; attempt++)); do
    code=$(curl --silent --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 3 --max-time 15 "$@" "$url") || code=000
    [[ $code == 200 ]] && return 0
    sleep 2
  done
  return 1
}

switch_release() {
  ln -s "$1" "$base/current.deploy"
  mv -Tf "$base/current.deploy" "$base/current"
}

rollback() {
  local failed=0
  printf '\nRestaurando la versión anterior...\n' >&2
  install -o root -g root -m 644 "$work/previous.service" "$unit" || failed=1
  install -o root -g root -m 644 "$work/previous.Caddyfile" "$caddyfile" || failed=1
  rm -f "$base/current.deploy" || failed=1
  switch_release "$previous" || failed=1
    if [[ -n $previous_link ]]; then
      ln -sfnT "$previous_link" "$base/previous" || failed=1
    else
      rm -f "$base/previous" || failed=1
    fi
  systemctl daemon-reload || failed=1
  systemctl reset-failed hogarscan-api || failed=1
  systemctl restart hogarscan-api || failed=1
  systemctl reload caddy || failed=1
  wait_ready http://127.0.0.1:3000/health/ready || failed=1
  wait_ready "https://$domain/health/ready" --resolve "$domain:443:127.0.0.1" || failed=1
  if [[ $failed -eq 0 ]]; then
    printf 'Versión anterior restaurada: %s\n' "$previous" >&2
  else
    printf 'La restauración requiere revisión manual en EC2.\n' >&2
  fi
}

finish() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  if [[ $changing == true && $committed == false ]]; then
    rollback
    status=1
  fi
  rm -rf "$work"
  exit "$status"
}

trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$work"
for filename in hogarscan-api.tar.gz hogarscan-api.tar.gz.sha256; do
  aws s3 cp "s3://$bucket/releases/$release_id/$filename" "$filename" \
    --region "$region" --only-show-errors --no-cli-pager
done

checksum=$(cat hogarscan-api.tar.gz.sha256)
[[ $checksum =~ ^[a-f0-9]{64}\ \ hogarscan-api\.tar\.gz$ ]] || fail 'Formato de checksum inválido.'
sha256sum --check hogarscan-api.tar.gz.sha256

mkdir -m 750 "$release_dir"
tar --no-same-owner -xzf hogarscan-api.tar.gz -C "$release_dir"
for file in dist/main.js package.json package-lock.json deploy/systemd/hogarscan-api.service deploy/caddy/Caddyfile; do
  [[ -f $release_dir/$file ]] || fail "Falta un archivo del paquete: $file"
done

chown -R hogarscan:hogarscan "$release_dir"
chmod -R u=rwX,g=rX,o= "$release_dir"
cd /tmp
sudo -H -u hogarscan npm ci --prefix "$release_dir" --omit=dev \
  --no-audit --no-fund --cache /var/cache/hogarscan-npm
chown -R root:hogarscan "$release_dir"
chmod -R u=rwX,g=rX,o= "$release_dir"

systemd-analyze verify "$release_dir/deploy/systemd/hogarscan-api.service"
caddy validate --config "$release_dir/deploy/caddy/Caddyfile" --adapter caddyfile
cp "$unit" "$work/previous.service"
cp "$caddyfile" "$work/previous.Caddyfile"

changing=true
switch_release "$release_dir"
install -o root -g root -m 644 "$release_dir/deploy/systemd/hogarscan-api.service" "$unit"
install -o root -g root -m 644 "$release_dir/deploy/caddy/Caddyfile" "$caddyfile"
systemctl daemon-reload
systemctl reset-failed hogarscan-api
systemctl restart hogarscan-api
wait_ready http://127.0.0.1:3000/health/ready
systemctl reload caddy
wait_ready "https://$domain/health/ready" --resolve "$domain:443:127.0.0.1"

ln -sfnT "$previous" "$base/previous"
committed=true
printf '\nDespliegue completado: %s\n' "$release_id"