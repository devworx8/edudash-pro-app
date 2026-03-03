#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_PROFILE="playstore-shared-key"
DEFAULT_PLATFORM="android"
DEFAULT_NON_INTERACTIVE="true"
CREDENTIALS_FILE="${EAS_CREDENTIALS_FILE:-${ROOT_DIR}/credentials.json}"

usage() {
  cat <<'EOF'
Use one upload key while switching EAS projects dynamically.

Usage:
  scripts/eas-shared-key.sh status
  scripts/eas-shared-key.sh switch <alias|projectId> [--owner <owner>] [--slug <slug>]
  scripts/eas-shared-key.sh build <alias|projectId> [options] [-- <extra eas build args>]

Build options:
  --profile <name>         EAS build profile (default: playstore-shared-key)
  --platform <name>        Build platform (default: android)
  --interactive            Do not pass --non-interactive
  --owner <owner>          Custom owner (when using custom project id)
  --slug <slug>            Custom slug (when using custom project id)

Examples:
  scripts/eas-shared-key.sh switch playstore
  scripts/eas-shared-key.sh build dash-t
  scripts/eas-shared-key.sh build d3bb7cfc-56c8-4266-be3a-9892dab09c0c --owner dash-t --slug edudashpro
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

resolve_keystore() {
  local keystore_path
  keystore_path="$(jq -r '.android.keystore.keystorePath // empty' "${CREDENTIALS_FILE}")"
  if [[ -z "${keystore_path}" ]]; then
    echo "credentials.json is missing android.keystore.keystorePath"
    exit 1
  fi
  if [[ "${keystore_path}" = /* ]]; then
    echo "${keystore_path}"
  else
    echo "${ROOT_DIR}/${keystore_path}"
  fi
}

print_keystore_fingerprint() {
  local keystore_file="$1"
  local store_pass key_alias key_pass fingerprint

  store_pass="$(jq -r '.android.keystore.keystorePassword // empty' "${CREDENTIALS_FILE}")"
  key_alias="$(jq -r '.android.keystore.keyAlias // empty' "${CREDENTIALS_FILE}")"
  key_pass="$(jq -r '.android.keystore.keyPassword // empty' "${CREDENTIALS_FILE}")"

  if [[ -z "${store_pass}" || -z "${key_alias}" || -z "${key_pass}" ]]; then
    echo "Upload key: configured (fingerprint unavailable - missing password/alias fields)"
    return
  fi

  if ! command -v keytool >/dev/null 2>&1; then
    echo "Upload key: configured (install keytool to print fingerprint)"
    return
  fi

  fingerprint="$(
    keytool -list -v \
      -keystore "${keystore_file}" \
      -storepass "${store_pass}" \
      -alias "${key_alias}" \
      -keypass "${key_pass}" 2>/dev/null \
      | sed -n 's/^SHA256: //p' \
      | head -n 1
  )"

  if [[ -n "${fingerprint}" ]]; then
    echo "Upload key SHA256: ${fingerprint}"
  else
    echo "Upload key: configured (fingerprint unavailable)"
  fi
}

check_shared_key_ready() {
  require_cmd jq
  require_cmd node

  if [[ ! -f "${CREDENTIALS_FILE}" ]]; then
    echo "Missing credentials file: ${CREDENTIALS_FILE}"
    echo "Create it with a single android keystore to keep signing consistent across projects."
    exit 1
  fi

  local keystore_file
  keystore_file="$(resolve_keystore)"
  if [[ ! -f "${keystore_file}" ]]; then
    echo "Keystore file not found: ${keystore_file}"
    exit 1
  fi

  echo "Credentials file: ${CREDENTIALS_FILE}"
  echo "Keystore file: ${keystore_file}"
  print_keystore_fingerprint "${keystore_file}"
}

switch_project() {
  local target="$1"
  shift
  (
    cd "${ROOT_DIR}"
    node scripts/eas-project.mjs use "${target}" "$@"
  )
}

show_status() {
  check_shared_key_ready
  (
    cd "${ROOT_DIR}"
    node scripts/eas-project.mjs current
  )
}

run_build() {
  local target="$1"
  shift

  local profile="${DEFAULT_PROFILE}"
  local platform="${DEFAULT_PLATFORM}"
  local non_interactive="${DEFAULT_NON_INTERACTIVE}"
  local switch_args=()
  local passthrough=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        profile="$2"
        shift 2
        ;;
      --platform)
        platform="$2"
        shift 2
        ;;
      --interactive)
        non_interactive="false"
        shift
        ;;
      --owner|--slug)
        switch_args+=("$1" "$2")
        shift 2
        ;;
      --)
        shift
        passthrough+=("$@")
        break
        ;;
      *)
        passthrough+=("$1")
        shift
        ;;
    esac
  done

  check_shared_key_ready
  switch_project "${target}" "${switch_args[@]}"

  if [[ "${profile}" != "playstore-shared-key" && "${profile}" != "playstore-shared-key-apk" ]]; then
    echo "Warning: profile '${profile}' does not guarantee local shared-key signing."
  fi

  local cmd=(node scripts/eas-wrapper.mjs build --platform "${platform}" --profile "${profile}")
  if [[ "${non_interactive}" == "true" ]]; then
    cmd+=(--non-interactive)
  fi
  cmd+=("${passthrough[@]}")

  (
    cd "${ROOT_DIR}"
    EAS_NO_PROJECT_PROMPT=1 "${cmd[@]}"
  )
}

main() {
  local action="${1:-status}"
  shift || true

  case "${action}" in
    status)
      show_status
      ;;
    switch)
      if [[ $# -lt 1 ]]; then
        usage
        exit 1
      fi
      check_shared_key_ready
      switch_project "$1" "${@:2}"
      ;;
    build)
      if [[ $# -lt 1 ]]; then
        usage
        exit 1
      fi
      run_build "$1" "${@:2}"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
