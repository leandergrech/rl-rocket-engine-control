"""Evaluate every controller on the surrogate and write data/results/.

    python scripts/evaluate.py            # about 2 min on a laptop CPU
    python scripts/evaluate.py --check    # re-evaluate and compare with the stored summary.json

Controllers: open-loop feedforward (trim table only), the decoupled PI, and every exported policy in
data/policies/ (PPO and SAC, with and without reference preview), all evaluated deterministically.
Test sets:

* the fixed 40 s evaluation profile (seed 0), traces saved for the docs;
* 20 held-out random 30 s episodes (seeds 1000-1019), nominal model, sensor delays and noise on;
* the same 20 episodes with domain randomisation (thesis Table A.3 ranges);
* a sweep of the wall heat flux (x 0.9 ... 1.1), 10 episodes per point: the parameter that drives the
  slow thermal loop, i.e. the kind of model error the challenge's parametric test cases introduce.
"""

from __future__ import annotations

import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from rl_rocket_engine.surrogate.env import LumenSurrogateEnv  # noqa: E402
from rl_rocket_engine.surrogate.metrics import episode_metrics, summarise  # noqa: E402
from rl_rocket_engine.surrogate.params import DEFAULT_PARAMS  # noqa: E402
from rl_rocket_engine.surrogate.pi import DecoupledPI  # noqa: E402
from rl_rocket_engine.surrogate.rl import JsonPolicy  # noqa: E402

OUT = ROOT / "data" / "results"
TEST_SEEDS = list(range(1000, 1020))
SWEEP = [0.9, 0.95, 1.0, 1.05, 1.1]
LABELS = {"open-loop": "Open-loop feedforward", "pi": "Decoupled PI", "ppo-preview": "PPO, preview",
          "ppo-nopreview": "PPO, no preview", "sac-preview": "SAC, preview", "sac-nopreview": "SAC, no preview"}


def controllers() -> dict:
    ctl = {"open-loop": None, "pi": None}
    for f in sorted((ROOT / "data" / "policies").glob("*.json")):
        if not f.name.endswith(".train.json"):
            ctl[f.stem] = JsonPolicy(f)
    return ctl


def rollout(name, policy, env_kwargs, seed, options=None) -> list[dict]:
    preview = policy.spec["env"]["preview"] if isinstance(policy, JsonPolicy) else False
    env = LumenSurrogateEnv(preview=preview, **env_kwargs)
    obs, _ = env.reset(seed=seed, options=options)
    pi = DecoupledPI(trim=env.trim) if name == "pi" else None
    log, done = [], False
    while not done:
        if name == "pi":
            action = env.to_action(pi(*env.measurement, *env.setpoint))
        elif name == "open-loop":
            action = env.to_action(env.trim.valves(*env.setpoint))
        else:
            action = policy(np.asarray(obs, float))
        obs, r, term, trunc, info = env.step(action)
        log.append(dict(info, reward=r))
        done = term or trunc
    return log


def check(summary: dict) -> None:
    """The environment and the exported networks are deterministic: stored results must reproduce."""
    stored = json.loads((OUT / "summary.json").read_text())
    worst = 0.0
    for name, row in stored.items():
        for block in ("eval_profile", "test", "test_randomised"):
            for key, v in row[block].items():
                w = summary[name][block][key]
                if np.isfinite(v) or np.isfinite(w):
                    worst = max(worst, abs(w - v) / max(1.0, abs(v)))
    print(f"largest relative difference to the stored summary: {worst:.1e}")
    if worst > 1e-6:
        raise SystemExit("stored results do not reproduce")


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="compare with data/results/summary.json instead of writing")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ctl = controllers()
    summary, traces = {}, {}
    for name, pol in ctl.items():
        log = rollout(name, pol, {}, 0, {"profile": "eval"})
        traces[name] = {k: [round(float(s[k]), 4) for s in log] for k in
                        ("p_cc", "rof", "p_ref", "rof_ref", "u_tfv", "u_tov", "x_tfv", "x_tov", "t_turbine", "reward")}
        row = {"eval_profile": episode_metrics(log)}
        row["test"] = summarise([episode_metrics(rollout(name, pol, {}, s)) for s in TEST_SEEDS])
        row["test_randomised"] = summarise([episode_metrics(rollout(name, pol, {"randomise": True}, s)) for s in TEST_SEEDS])
        sweep = {}
        for f in SWEEP:
            params = replace(DEFAULT_PARAMS, q_ref=DEFAULT_PARAMS.q_ref * f)
            ms = [episode_metrics(rollout(name, pol, {"params": params}, s)) for s in TEST_SEEDS[:10]]
            sweep[str(f)] = summarise(ms)
        row["heat_flux_sweep"] = sweep
        train = ROOT / "data" / "policies" / f"{name}.train.json"
        if train.exists():
            meta = json.loads(train.read_text())
            row["training"] = {"steps": meta["steps"], "wall_min": round(meta["wall_s"] / 60, 1), "algo": meta["algo"]}
        summary[name] = row
        t = row["test"]
        print(f"{LABELS.get(name, name):24s} test MAPE p {t['mape_p']:.2f} %, ROF {t['mape_rof']:.2f} %, "
              f"return {t['reward']:.1f}, violations {t['violations']:.1f}", flush=True)
    if args.check:
        check(summary)
        return
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    (OUT / "eval_traces.json").write_text(json.dumps(traces))
    lines = ["# Baselines on the LUMEN-like surrogate", "",
             "Surrogate results (not DLR's simulator). Mean over 20 held-out 30 s episodes (seeds 1000-1019).", "",
             "| Controller | MAPE p_cc [%] | MAPE ROF [%] | Return | Settling p_cc [s] | Settling ROF [s] | Valve travel | "
             "Violation steps | Randomised: MAPE p_cc / ROF [%] |", "|---|---|---|---|---|---|---|---|---|"]
    for name, row in summary.items():
        t, d = row["test"], row["test_randomised"]
        lines.append(f"| {LABELS.get(name, name)} | {t['mape_p']:.2f} | {t['mape_rof']:.2f} | {t['reward']:.1f} | "
                     f"{t['settle_p']:.2f} | {t['settle_rof']:.2f} | {t['valve_travel']:.2f} | {t['violations']:.1f} | "
                     f"{d['mape_p']:.2f} / {d['mape_rof']:.2f} |")
    (OUT / "summary.md").write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}/summary.json, summary.md, eval_traces.json")


if __name__ == "__main__":
    main()
