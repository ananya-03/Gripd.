#!/usr/bin/env bash
# Sync root .env into client/.env for Vite (prefixes keys with VITE_)
set -euo pipefail
ROOT_ENV=".env"
CLIENT_ENV="client/.env"

if [ ! -f "$ROOT_ENV" ]; then
  echo "No $ROOT_ENV found in repo root. Create one with your keys and re-run."
  exit 1
fi

echo "# Generated from root .env on $(date)" > "$CLIENT_ENV"

prefix_if_present() {
  local key="$1"
  local outkey="$2"
  local val
  val=$(grep -E "^\s*${key}\s*=" "$ROOT_ENV" | sed -E "s/^\s*${key}\s*=\s*//" | tr -d '\r' | sed -E "s/^\s*\"(.*)\"\s*$/\1/") || true
  if [ -n "$val" ]; then
    echo "${outkey}=${val}" >> "$CLIENT_ENV"
  fi
}

# Keep the ElevenLabs API key server-side for the local Vite proxy.
prefix_if_present "ELEVENLABS_API_KEY" "ELEVENLABS_API_KEY"
prefix_if_present "ELEVEN_LABS_API_KEY" "ELEVENLABS_API_KEY"

# Map client-safe identifiers to VITE_ prefix used by Vite
prefix_if_present "ELEVENLABS_VOICE_ID" "VITE_ELEVENLABS_VOICE_ID"
prefix_if_present "ELEVENLABS_VOICE_ANANYA_ID" "VITE_ELEVENLABS_VOICE_ANANYA_ID"
prefix_if_present "VITE_ELEVENLABS_VOICE_ANANYA_ID" "VITE_ELEVENLABS_VOICE_ANANYA_ID"
prefix_if_present "ELEVENLABS_VOICE_SNEHA_ID" "VITE_ELEVENLABS_VOICE_SNEHA_ID"
prefix_if_present "VITE_ELEVENLABS_VOICE_SNEHA_ID" "VITE_ELEVENLABS_VOICE_SNEHA_ID"
prefix_if_present "GEMINI_API_KEY" "VITE_GEMINI_API_KEY"
prefix_if_present "OPEN_AI_API_KEY" "VITE_OPEN_AI_API_KEY"
prefix_if_present "OPENAI_API_KEY" "VITE_OPENAI_API_KEY"
prefix_if_present "EXA_API_KEY" "VITE_EXA_API_KEY"
prefix_if_present "CONVEX_URL" "VITE_CONVEX_URL"
prefix_if_present "CONVEX_KEY" "VITE_CONVEX_KEY"

echo "Wrote $CLIENT_ENV (ElevenLabs API key is used only by the local Vite proxy)." >&2
