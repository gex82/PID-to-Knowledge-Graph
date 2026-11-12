#!/bin/sh
# Rebuild the source-reviewed local Pahala extraction and open a loopback server.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ ! -f work/pahala/extract/page_25.json ]; then
  printf '%s\n' 'Pahala extraction is not present. Restore the local work/pahala folder first.' >&2
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import pydantic, duckdb, pypdfium2, PIL, networkx' 2>/dev/null; then
  .venv/bin/python -m pip install -e .
fi
.venv/bin/python skills/pid-to-kg/scripts/build_kg.py work/pahala
.venv/bin/python work/pahala/validate_pahala.py
.venv/bin/python work/pahala/validation/validate_treatment.py
.venv/bin/python skills/pid-to-kg/scripts/review_kg.py work/pahala
if [ "${1:-}" = '--build-only' ]; then exit 0; fi
printf '\nOpen http://127.0.0.1:%s/pahala/review/ (Ctrl-C stops the server)\n' "${PORT:-8765}"
exec .venv/bin/python -m http.server "${PORT:-8765}" --bind 127.0.0.1 --directory work
