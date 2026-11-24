#!/usr/bin/env bash
# G1 preflight only: no downloads, no DB writes, no credentials, no remote link.
set -euo pipefail
if [[ "${CODESPACES:-}" != true || "${GITHUB_REPOSITORY:-}" != bonecodesign/salvamotoca ]]; then
  echo 'G1_CODESPACE=WRONG_ENVIRONMENT'; exit 2
fi
echo 'G1_CODESPACE=SALVAMOTOCA'
echo "CPU_CORES=$(getconf _NPROCESSORS_ONLN)"
awk '/MemTotal:/ {print "RAM_MB=" int($2/1024)}' /proc/meminfo
df -Pk . | awk 'NR==2 {print "WORKSPACE_FREE_MB=" int($4/1024)}'
for tool in docker node npm age psql supabase python3; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "TOOL_$tool=AVAILABLE"
  else
    echo "TOOL_$tool=MISSING"
  fi
done
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo 'DOCKER_ENGINE=READY'
else
  echo 'DOCKER_ENGINE=BLOCKED'; exit 3
fi
echo 'G1_PREFLIGHT_ONLY=PASS'
echo 'G1_REAL_RESTORE=NOT_EXECUTED'
echo 'G1=BLOCKED'
echo 'RELEASE=NO_GO'
