#!/usr/bin/env bash
# 服务器部署脚本：写 release.env → 拉镜像 → 启动 → /healthz 门控，失败自动回退上一版
# 用法: /srv/kk-ai-hub-bi/bin/deploy.sh <镜像:tag>
set -euo pipefail
APP_DIR="${APP_DIR:-/srv/kk-ai-hub-bi}"
IMAGE="${1:?usage: deploy.sh <image:tag>}"
cd "$APP_DIR"
mkdir -p releases data

# 沿用上次的端口配置
BIND_ADDR=0.0.0.0; HOST_PORT=5002
[ -f release.env ] && . ./release.env
[ -f release.env ] && cp release.env "releases/release.env.$(date +%Y%m%d-%H%M%S)"

printf 'APP_IMAGE=%s\nBIND_ADDR=%s\nHOST_PORT=%s\nDEPLOYED_AT=%s\n' "$IMAGE" "$BIND_ADDR" "$HOST_PORT" "$(date -u +%FT%TZ)" > release.env

compose() { docker compose --env-file release.env -f compose.prod.yml "$@"; }
compose pull
compose up -d --no-build --force-recreate

for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/healthz" >/dev/null 2>&1; then
    echo "✅ 部署成功：$IMAGE → http://<服务器IP>:${HOST_PORT}"
    ls -1t releases | tail -n +11 | sed 's|^|releases/|' | xargs -r rm -f   # 只留最近 10 份
    exit 0
  fi
  sleep 2
done

echo "❌ 健康检查失败，最近日志："; docker logs --tail 50 kk-ai-hub-bi || true
PREV="$(ls -1t releases/release.env.* 2>/dev/null | head -1 || true)"
if [ -n "$PREV" ]; then
  echo "↩ 回退到上一版：$PREV"; cp "$PREV" release.env
  compose up -d --no-build --force-recreate
fi
exit 1
