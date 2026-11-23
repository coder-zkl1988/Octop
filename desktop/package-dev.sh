#!/bin/bash
# Desktop shell against a source Octop (hot reload). Not ~/.octop/portable.
# Starts Octop in this shell and stops it when wails3 / this script exits.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OCTOP_PORT:-8088}"
OCTOP_HOME_DIR="${OCTOP_HOME:-${HOME}/.octop}"

# The desktop variant is selected by the same enterprise backend setting that
# the Octop sidecar reads. Keeping this fallback here prevents a configured
# enterprise desktop from silently starting the self-hosted slider page.
enterprise_backend="${OCTOP_ENTERPRISE_URL:-}"
if [[ -z "$enterprise_backend" && -z "${OCTOP_DESKTOP_URL:-}" ]]; then
  config_file="${OCTOP_HOME_DIR}/config.json"
  if [[ -f "$config_file" ]]; then
    enterprise_backend="$({
      python3 - "$config_file" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        value = json.load(handle).get("enterprise_backend_url")
except (OSError, TypeError, ValueError):
    value = None
if isinstance(value, str):
    print(value.strip())
PY
    } 2>/dev/null || true)"
  fi
fi

URL="${enterprise_backend:-${OCTOP_DESKTOP_URL:-http://127.0.0.1:${PORT}}}"
HEALTH="${URL%/}/api/health"
WAILS3_PKG="github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.16"

# Go installs wails3 into GOBIN or GOPATH/bin, which is not always on PATH in
# a desktop launch context.
if ! command -v wails3 >/dev/null 2>&1 && command -v go >/dev/null 2>&1; then
  go_bin="$(go env GOBIN 2>/dev/null || true)"
  if [[ -z "$go_bin" ]]; then
    go_bin="$(go env GOPATH 2>/dev/null || true)/bin"
  fi
  if [[ -x "${go_bin}/wails3" ]]; then
    PATH="${go_bin}:${PATH}"
    export PATH
  fi
fi

missing=0
if ! command -v go >/dev/null 2>&1; then
  missing=1
  echo "go is not installed (need Go 1.25+)." >&2
  echo "  macOS:  brew install go" >&2
  echo "  Linux:  https://go.dev/dl/" >&2
  echo "  then:   export PATH=\"\$(go env GOPATH)/bin:\$PATH\"" >&2
fi
if ! command -v wails3 >/dev/null 2>&1; then
  missing=1
  echo "wails3 is not installed." >&2
  echo "  go install ${WAILS3_PKG}" >&2
  echo "  export PATH=\"\$(go env GOPATH)/bin:\$PATH\"" >&2
fi
if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

octop_pid=""
vite_pid=""
cleaned=0

cleanup() {
  [[ "$cleaned" -eq 1 ]] && return
  cleaned=1
  trap - EXIT INT TERM
  if [[ -n "$octop_pid" ]] && kill -0 "$octop_pid" 2>/dev/null; then
    kill -TERM "$octop_pid" 2>/dev/null || true
    wait "$octop_pid" 2>/dev/null || true
  fi
  if [[ -n "$vite_pid" ]] && kill -0 "$vite_pid" 2>/dev/null; then
    kill -TERM "$vite_pid" 2>/dev/null || true
    wait "$vite_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ -n "$enterprise_backend" ]]; then
  enterprise_backend="${enterprise_backend%/}"
  local_port="${OCTOP_ENTERPRISE_LOCAL_PORT:-8090}"
  dashboard_port="${OCTOP_ENTERPRISE_DESKTOP_PORT:-8091}"
  dashboard_url="http://127.0.0.1:${dashboard_port}"
  local_health="http://127.0.0.1:${local_port}/api/health"
  if curl -sf -o /dev/null --max-time 1 "${dashboard_url}/login"; then
    echo "Dashboard already listening at ${dashboard_url}; stop it first so this script can own the process." >&2
    exit 1
  fi
  echo "starting Octop enterprise proxy at ${local_health}"
  (
    cd "$REPO"
    exec env OCTOP_DESKTOP=1 OCTOP_BIND_HOST=127.0.0.1 OCTOP_PORT="$local_port" \
      OCTOP_REQUIRE_SETUP_PASSWORD=0 OCTOP_ENABLE_DASHBOARD=0 \
      OCTOP_ENTERPRISE_URL="$enterprise_backend" \
      uv run octop run --reload
  ) &
  octop_pid=$!
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null --max-time 1 "$local_health"; then
      break
    fi
    if ! kill -0 "$octop_pid" 2>/dev/null; then
      echo "Octop 企业代理在就绪前退出了，请查看上方日志。" >&2
      exit 1
    fi
    sleep 0.5
  done
  if ! curl -sf -o /dev/null --max-time 1 "$local_health"; then
    echo "Octop 企业代理未在 30 秒内就绪（${local_health}）。" >&2
    exit 1
  fi
  echo "starting enterprise dashboard at ${dashboard_url}"
  (
    cd "$REPO/dashboard"
    exec env VITE_ENTERPRISE_MODE=1 VITE_API_PORT="$local_port" \
      npm run dev -- --host 127.0.0.1 --port "$dashboard_port" --strictPort
  ) &
  vite_pid=$!
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null --max-time 1 "$dashboard_url"; then
      break
    fi
    if ! kill -0 "$vite_pid" 2>/dev/null; then
      echo "企业桌面页面在就绪前退出了，请查看上方日志。" >&2
      exit 1
    fi
    sleep 0.5
  done
  if ! curl -sf -o /dev/null --max-time 1 "$dashboard_url"; then
    echo "企业桌面页面未在 30 秒内就绪（${dashboard_url}）。" >&2
    exit 1
  fi
  cd "$REPO/desktop/src"
  OCTOP_DESKTOP_URL="$dashboard_url" wails3 dev
  exit $?
elif curl -sf -o /dev/null --max-time 1 "$HEALTH"; then
  echo "Octop already listening at ${URL}; stop it first so this script can own the process." >&2
  exit 1
fi

echo "starting octop --reload on port ${PORT}"
(
  cd "$REPO"
  # Env overrides apply for this process and are not written back to config.json.
  exec env OCTOP_DESKTOP=1 OCTOP_BIND_HOST=127.0.0.1 OCTOP_PORT="$PORT" uv run octop run --reload
) &
octop_pid=$!

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 1 "$HEALTH"; then
    break
  fi
  if ! kill -0 "$octop_pid" 2>/dev/null; then
    echo "Octop 进程在就绪前退出了，请查看上方日志。" >&2
    exit 1
  fi
  sleep 0.5
done

if ! curl -sf -o /dev/null --max-time 1 "$HEALTH"; then
  echo "Octop 未在 30 秒内就绪（${URL}）。" >&2
  echo "请查看上方 octop run 的输出；常见原因：端口被占用、依赖缺失，或服务启动失败。" >&2
  exit 1
fi

cd "$REPO/desktop/src"
OCTOP_DESKTOP_URL="$URL" wails3 dev
