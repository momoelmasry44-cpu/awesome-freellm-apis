#!/usr/bin/env bash
# Downloads the free VPN Gate server list to the given file and checks it.
# Usage: tool/fetch_servers.sh assets/servers.csv
set -euo pipefail
out="${1:-assets/servers.csv}"
tmp="$(mktemp)"
for attempt in 1 2 3 4 5; do
  for url in https://www.vpngate.net/api/iphone/ http://www.vpngate.net/api/iphone/; do
    if curl -fsSL --max-time 90 -A "FreeVPN/1.0" "$url" -o "$tmp"; then
      count=$(grep -c ',[A-Za-z0-9+/=]\{200,\}\s*$' "$tmp" || true)
      echo "Got $count servers from $url"
      if [ "$count" -ge 10 ]; then
        mv "$tmp" "$out"
        exit 0
      fi
    fi
  done
  sleep $((attempt * 10))
done
echo "Could not download the VPN Gate server list" >&2
exit 1
