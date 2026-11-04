#!/usr/bin/env bash
# Instala os agendamentos de backup e imprime a chave publica para service/backup-target.sh.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
[ -f /root/.ssh/frotak_backup ] || ssh-keygen -q -t ed25519 -N '' -C frotak-backup -f /root/.ssh/frotak_backup

install -m 644 "$here"/systemd/frotak-backup.service "$here"/systemd/frotak-backup.timer \
  "$here"/systemd/frotak-restore-test.service "$here"/systemd/frotak-restore-test.timer \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now frotak-backup.timer frotak-restore-test.timer >/dev/null 2>&1
cat /root/.ssh/frotak_backup.pub
