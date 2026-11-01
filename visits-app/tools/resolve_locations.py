"""Fill exact coordinates into seed.js by resolving each account's Google Maps link.

Needs network access to www.google.com. Run from the repo root:
    python3 visits-app/tools/resolve_locations.py
It rewrites visits-app/app/src/main/assets/www/seed.js in place (lat/lng added).
"""
import json
import re
import sys
import time
import urllib.request

SEED = 'visits-app/app/src/main/assets/www/seed.js'
PATTERNS = [
    r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)',
    r'\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]',
    r'center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)',
    r'@(-?\d+\.\d+),(-?\d+\.\d+)',
    r'll=(-?\d+\.\d+),(-?\d+\.\d+)',
]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def find_coords(text):
    for pat in PATTERNS:
        for m in re.finditer(pat, text or ''):
            lat, lng = float(m.group(1)), float(m.group(2))
            if 22 < lat < 27 and 51 < lng < 57:
                return lat, lng
    return None


def fetch(url):
    url = url.replace('http://', 'https://', 1)
    url += ('&' if '?' in url else '?') + 'hl=en'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+'})
    with urllib.request.urlopen(req, timeout=25) as r:
        final = r.geturl()
        body = r.read(3_000_000).decode('utf-8', 'replace')
    return find_coords(body) or find_coords(final)


def main():
    src = open(SEED, encoding='utf-8').read()
    head, _, rest = src.partition('window.SEED_ACCOUNTS = ')
    accounts = json.loads(rest.rstrip().rstrip(';'))
    todo = [a for a in accounts if a.get('url') and a.get('lat') is None and not a.get('disabled')]
    print(f'{len(todo)} accounts to resolve', file=sys.stderr)
    ok = 0
    for i, a in enumerate(todo, 1):
        try:
            c = fetch(a['url'])
        except Exception as e:  # network / HTTP error: keep going
            c = None
            print(f'  ! {a["name"][:50]}: {e}', file=sys.stderr)
        if c:
            a['lat'], a['lng'] = c
            ok += 1
        print(f'{i}/{len(todo)} {"ok " if c else "-- "} {a["name"][:60]} {c or ""}', file=sys.stderr)
        time.sleep(0.4)
    with open(SEED, 'w', encoding='utf-8') as f:
        f.write(head + 'window.SEED_ACCOUNTS = ' + json.dumps(accounts, ensure_ascii=False, indent=0) + ';\n')
    print(f'resolved {ok}/{len(todo)}', file=sys.stderr)


if __name__ == '__main__':
    main()
