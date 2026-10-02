#!/usr/bin/env bash
# Reproduce everything this repository contains.
#
#   bash scripts/reproduce.sh          # tests, strict docs build, re-evaluation of every stored policy
#   bash scripts/reproduce.sh --full   # also recalibrate the surrogate and retrain PI, PPO and SAC
#
# The LUMEN Control Challenge simulator was not public on 2026-10-02 (docs/07-references.md, 7.1).
# Every baseline here runs on this repo's surrogate engine, which is not DLR's simulator.
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-python}"

if [[ "${1:-}" == "--full" ]]; then
  "$PYTHON" -m rl_rocket_engine.surrogate.calibrate   # about 2 min; rewrites calibrated.json, trim_table.json
  "$PYTHON" scripts/train.py all                       # PI about 8 min, each PPO about 20 min, each SAC about 50 min
  "$PYTHON" scripts/evaluate.py
  "$PYTHON" scripts/make_lab_data.py
fi

"$PYTHON" -m pytest -q
"$PYTHON" -m mkdocs build --strict --quiet
"$PYTHON" scripts/evaluate.py --check
"$PYTHON" scripts/check_challenge.py || echo "challenge check could not run (network?)"
echo "Done. Surrogate results: data/results/summary.md (not DLR's simulator; see docs/04a-surrogate-baselines.md)."
