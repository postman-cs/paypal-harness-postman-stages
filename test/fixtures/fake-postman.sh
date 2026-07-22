#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${FAKE_POSTMAN_LOG:?FAKE_POSTMAN_LOG is required}"
printf '%q ' "$@" >> "$LOG_FILE"
printf '\n' >> "$LOG_FILE"

case "${1:-}" in
  --version)
    printf '1.44.0-test\n'
    ;;
  login|logout)
    ;;
  search)
    cat <<'JSON'
{"data":{"workspaces":[{"id":"11111111-2222-3333-4444-555555555555","name":"Winter Trinity"}]}}
JSON
    ;;
  collection)
    export_path=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--reporter-junit-export" ]; then
        shift
        export_path="${1:-}"
        break
      fi
      shift
    done
    if [ -n "$export_path" ]; then
      mkdir -p "$(dirname "$export_path")"
      printf '%s\n' '<testsuite name="synthetic-postman" tests="1" failures="0"><testcase name="contract"/></testsuite>' > "$export_path"
    fi
    ;;
  *)
    printf 'Unsupported synthetic Postman command: %s\n' "${1:-}" >&2
    exit 2
    ;;
esac
