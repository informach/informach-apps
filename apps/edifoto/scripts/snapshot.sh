#!/bin/sh
# Dev aid: scripts/snapshot.sh out.png script.js [delay_ms] — runs the app in dev mode with a
# throwaway profile, executes the script in the renderer, saves a window screenshot and quits.
cd "$(dirname "$0")/.."
EDIFOTO_SNAPSHOT="$1" EDIFOTO_SNAPSHOT_JS="$2" EDIFOTO_SNAPSHOT_DELAY="${3:-1500}" EDIFOTO_USER_DATA="$PWD/.tmp/profile" EDIFOTO_NO_MCP="${EDIFOTO_NO_MCP-1}" npx electron-vite dev 2>&1 | grep -v "^\s*$" | grep -iv "devtools\|autofill" | tail -25
