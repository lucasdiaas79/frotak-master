#!/usr/bin/env bash
# Publica uma versao do Master e do TMS a partir de um pacote do codigo.
# Uso: ./deploy-app.sh ARQUIVO.tar.gz NOME_DA_VERSAO
# Para voltar atras: ln -sfn /opt/frotak/releases/ANTERIOR /opt/frotak/current
#                    systemctl restart frotak-app@master frotak-app@tms
set -euo pipefail

archive="${1:?informe o pacote do codigo}"
release="${2:?informe o nome da versao}"
build_dir="/var/lib/frotak-app/build/${release}"
release_dir="/opt/frotak/releases/${release}"

rm -rf "$build_dir"
install -d -o frotak -g frotak "$build_dir"
tar -xzf "$archive" -C "$build_dir"
chown -R frotak:frotak "$build_dir"

# O build roda sem privilegio: scripts de dependencia nao precisam de root.
build_app() {
  local dir="$1"
  runuser -u frotak -- env -i PATH="$PATH" HOME=/var/lib/frotak-app NITRO_PRESET=node-server \
    bash -c "set -a; . /etc/frotak/build.env; set +a; cd '$dir' && npm ci --no-audit --no-fund --loglevel=error && npm run build"
}
echo "construindo Master"
build_app "$build_dir" > /var/lib/frotak-app/build-master.log 2>&1 || { tail -25 /var/lib/frotak-app/build-master.log; exit 1; }
echo "construindo TMS"
build_app "$build_dir/central-dias-main" > /var/lib/frotak-app/build-tms.log 2>&1 || { tail -25 /var/lib/frotak-app/build-tms.log; exit 1; }

rm -rf "$release_dir"
install -d "$release_dir"
cp -a "$build_dir/.output" "$release_dir/master"
cp -a "$build_dir/central-dias-main/.output" "$release_dir/tms"
chown -R root:root "$release_dir"
chmod -R a+rX "$release_dir"
rm -rf "$build_dir"

ln -sfn "$release_dir" /opt/frotak/current
systemctl enable frotak-app@master frotak-app@tms >/dev/null 2>&1
systemctl restart frotak-app@master frotak-app@tms

check() {
  local name="$1" port="$2" path="$3"
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${port}${path}" || true)"
    case "$code" in
      2*|3*) echo "$name respondeu HTTP $code"; return 0 ;;
    esac
    sleep 1
  done
  echo "$name nao respondeu (ultimo HTTP: $code)" >&2
  journalctl -u "frotak-app@${name}" -n 20 --no-pager >&2
  return 1
}
check master 3001 /login
check tms 3002 /login

# Mantem as 3 versoes mais recentes para poder voltar atras.
ls -1dt /opt/frotak/releases/* | tail -n +4 | xargs -r rm -rf
echo "versao ${release} no ar"
