#!/bin/sh
# Build the bundled synthetic example and serve its offline review on loopback.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ ! -x .venv/bin/python ]; then
    python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import pydantic, duckdb, pypdfium2, PIL, networkx' 2>/dev/null; then
    .venv/bin/python -m pip install -e .
fi
mkdir -p work/mini-plant/extract
cp tests/fixtures/mini_plant/extract/page_*.json work/mini-plant/extract/
.venv/bin/python skills/pid-to-kg/scripts/build_kg.py work/mini-plant --plant-name 'Mini plant - synthetic demo'
.venv/bin/python skills/pid-to-kg/scripts/review_kg.py work/mini-plant
if [ "${1:-}" = '--build-only' ]; then
    exit 0
fi
printf '\nOpen http://127.0.0.1:%s/mini-plant/review/ (Ctrl-C stops the server)\n' "${PORT:-8765}"
exec .venv/bin/python -m http.server "${PORT:-8765}" --bind 127.0.0.1 --directory work
