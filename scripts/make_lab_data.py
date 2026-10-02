"""Write the data the docs widgets and the Engine Lab load: docs/assets/lab/model.json and policies.

    python scripts/make_lab_data.py

model.json holds the calibrated surrogate parameters, the trim table, the PI gains, the calibration
targets and fit (for the model card) and step responses of the surrogate. Trained actors are copied
from data/policies/ to docs/assets/lab/policies/ (loaded only when a Lab preset needs them).
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from rl_rocket_engine.surrogate import calibrate  # noqa: E402
from rl_rocket_engine.surrogate.env import TRIM_FILE  # noqa: E402
from rl_rocket_engine.surrogate.params import CALIBRATED, DEFAULT_PARAMS  # noqa: E402
from rl_rocket_engine.surrogate.pi import GAINS_FILE  # noqa: E402

OUT = ROOT / "docs" / "assets" / "lab"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cal = json.loads(CALIBRATED.read_text())
    steps = {}
    for valve in ("TFV", "TOV"):
        t, tr = calibrate.step_response(DEFAULT_PARAMS, valve, duration=40.0, dt_out=0.1)
        steps[valve] = {"t": [round(float(x), 2) for x in t], **{k: [round(float(x), 4) for x in v] for k, v in tr.items()}}
    data = {
        "note": "LUMEN-like surrogate (not DLR's simulator); written by scripts/make_lab_data.py",
        "params": DEFAULT_PARAMS.to_dict(),
        "trim": json.loads(TRIM_FILE.read_text()),
        "pi_gains": json.loads(GAINS_FILE.read_text())["gains"],
        "calibration": {"report": cal["report"], "targets": cal["targets"]},
        "steps": steps,
    }
    (OUT / "model.json").write_text(json.dumps(data, separators=(",", ":")))
    pol_src, pol_dst = ROOT / "data" / "policies", OUT / "policies"
    pol_dst.mkdir(exist_ok=True)
    for f in sorted(pol_src.glob("*.json")):
        if not f.name.endswith(".train.json") and "-seed" not in f.name:  # the Lab shows seed 0
            shutil.copy(f, pol_dst / f.name)
    print(f"wrote {OUT.relative_to(ROOT)}/model.json and {len(list(pol_dst.glob('*.json')))} policies")


if __name__ == "__main__":
    main()
