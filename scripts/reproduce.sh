#!/usr/bin/env bash
# Reproduce everything this repository currently contains.
# The LUMEN Control Challenge simulator was not public on 2026-09-30
# (docs/07-references.md, section 7.1), so there are no baselines to train yet.
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-python}"

"$PYTHON" -m pytest -q
"$PYTHON" -m mkdocs build --strict --quiet
"$PYTHON" scripts/check_challenge.py || echo "challenge check could not run (network?)"
echo "Baselines: not run. The LUMEN Control Challenge simulator is not public; see docs/index.md."
