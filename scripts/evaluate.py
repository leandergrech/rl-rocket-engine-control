"""Evaluate every controller on the surrogate and write data/results/.

    python scripts/evaluate.py            # about 2 min on a laptop CPU
    python scripts/evaluate.py --check    # re-evaluate and compare with the stored summary.json

Controllers: open-loop feedforward (trim table only), the decoupled PI with tuned gains and with gains
designed for a bandwidth, and every exported policy in data/policies/, all evaluated deterministically.
PPO and SAC at 20 Hz without preview are the challenge's setting; the 10 Hz agents, with and without
preview, are this repo's first baselines and run at their own rate. Test sets:

* the fixed 40 s evaluation profile (seed 0), traces saved for the docs;
* 20 held-out random 30 s episodes (seeds 1000-1019), nominal model, sensor delays and noise on;
* the same 20 episodes with domain randomisation (thesis Table A.3 ranges);
* a sweep of the wall heat flux (x 0.9 ... 1.1), 10 episodes per point: the parameter that drives the
  slow thermal loop, i.e. the kind of model error the challenge's parametric test cases introduce;
* the challenge's seven test cases in miniature (scenarios.json): one episode each, with faults;
* for the PI only, a sweep of each loop's bandwidth (data/results/pi_bandwidth.json).
"""

from __future__ import annotations

import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import replace
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from rl_rocket_engine.surrogate.env import DT, DT_LEGACY, LumenSurrogateEnv  # noqa: E402
from rl_rocket_engine.surrogate.metrics import episode_metrics, summarise  # noqa: E402
from rl_rocket_engine.surrogate.params import DEFAULT_PARAMS  # noqa: E402
from rl_rocket_engine.surrogate.pi import (DecoupledPI, default_bandwidth, gains_for_bandwidth,  # noqa: E402
                                           load_loops, loop_margins, PIGains)
from rl_rocket_engine.surrogate.rl import JsonPolicy  # noqa: E402
from rl_rocket_engine.surrogate.scenarios import episode_options, load as load_scenarios  # noqa: E402

OUT = ROOT / "data" / "results"
TEST_SEEDS = list(range(1000, 1020))
SWEEP = [0.9, 0.95, 1.0, 1.05, 1.1]
BW_SWEEP = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5]
LABELS = {"open-loop": "Open-loop feedforward", "pi": "Decoupled PI, tuned", "pi-bw": "Decoupled PI, bandwidth design",
          "ppo": "PPO (20 Hz)", "sac": "SAC (20 Hz)",
          "ppo-preview": "PPO, preview (10 Hz)", "ppo-nopreview": "PPO, no preview (10 Hz)",
          "sac-preview": "SAC, preview (10 Hz)", "sac-nopreview": "SAC, no preview (10 Hz)"}


def label(name: str) -> str:
    base, _, seed = name.partition("-seed")
    return LABELS.get(base, base) + (f", seed {seed}" if seed else "")


def controllers() -> dict:
    ctl = {"open-loop": None, "pi": None, "pi-bw": None}
    for f in sorted((ROOT / "data" / "policies").glob("*.json")):
        if not f.name.endswith(".train.json"):
            ctl[f.stem] = JsonPolicy(f)
    return ctl


def pi_gains(name: str, bandwidth=None) -> PIGains:
    if name == "pi":
        return PIGains.load()
    loops = load_loops()
    return gains_for_bandwidth(*(bandwidth or default_bandwidth(loops)), loops)


def rollout(name, policy, env_kwargs, seed, options=None, scenario=None, bandwidth=None) -> list[dict]:
    spec = policy.spec["env"] if isinstance(policy, JsonPolicy) else {}
    dt = spec.get("dt", DT_LEGACY) if spec else DT  # exported 10 Hz agents predate the dt field
    env = LumenSurrogateEnv(preview=spec.get("preview", False), dt=dt, **env_kwargs)
    if scenario is not None:
        options = episode_options(scenario, env.dt, env.n_future)
    obs, _ = env.reset(seed=seed, options=options)
    pi = DecoupledPI(pi_gains(name, bandwidth), env.trim, env.dt) if name.startswith("pi") else None
    log, done = [], False
    while not done:
        if pi is not None:
            action = env.to_action(pi(*env.measurement, *env.setpoint))
        elif name == "open-loop":
            action = env.to_action(env.trim.valves(*env.setpoint))
        else:
            action = policy(np.asarray(obs, float))
        obs, r, term, trunc, info = env.step(action)
        log.append(dict(info, reward=r))
        done = term or trunc
    return log


def evaluate_controller(name: str):
    """Every test set for one controller (run in a worker process)."""
    pol = controllers()[name]
    scenarios = load_scenarios()
    log = rollout(name, pol, {}, 0, {"profile": "eval"})
    trace = {k: [round(float(s[k]), 4) for s in log] for k in
             ("p_cc", "rof", "p_ref", "rof_ref", "u_tfv", "u_tov", "x_tfv", "x_tov", "t_turbine", "reward")}
    row = {"eval_profile": episode_metrics(log)}
    row["test"] = summarise([episode_metrics(rollout(name, pol, {}, s)) for s in TEST_SEEDS])
    row["test_randomised"] = summarise([episode_metrics(rollout(name, pol, {"randomise": True}, s)) for s in TEST_SEEDS])
    sweep = {}
    for f in SWEEP:
        params = replace(DEFAULT_PARAMS, q_ref=DEFAULT_PARAMS.q_ref * f)
        sweep[str(f)] = summarise([episode_metrics(rollout(name, pol, {"params": params}, s)) for s in TEST_SEEDS[:10]])
    row["heat_flux_sweep"] = sweep
    row["scenarios"] = {k: episode_metrics(rollout(name, pol, {}, 0, scenario=sc)) for k, sc in scenarios.items()}
    train = ROOT / "data" / "policies" / f"{name}.train.json"
    if train.exists():
        meta = json.loads(train.read_text())
        row["training"] = {"steps": meta["steps"], "wall_min": round(meta["wall_s"] / 60, 1), "algo": meta["algo"]}
    return name, row, trace


def bandwidth_point(args):
    loop, idx, f, f0 = args
    b = list(f0)
    b[idx] = f
    loops = load_loops()
    ms = summarise([episode_metrics(rollout("pi-bw", None, {}, s, bandwidth=b)) for s in TEST_SEEDS[:10]])
    return loop, f, dict(ms, **{f"margin_{k}": v for k, v in loop_margins(gains_for_bandwidth(*b, loops), loops).items()})


def check(summary: dict) -> None:
    """The environment and the exported networks are deterministic: stored results must reproduce."""
    stored = json.loads((OUT / "summary.json").read_text())
    worst = 0.0
    for name, row in stored.items():
        blocks = [(b, row[b], summary[name][b]) for b in ("eval_profile", "test", "test_randomised")]
        blocks += [(f"scenario {k}", v, summary[name]["scenarios"][k]) for k, v in row.get("scenarios", {}).items()]
        for block, old, new in blocks:
            for key, v in old.items():
                w = new[key]
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
    # One process per controller: each is deterministic, so the order of completion does not matter.
    with ProcessPoolExecutor(max_workers=min(len(ctl), os.cpu_count() or 1)) as pool:
        for name, row, trace in pool.map(evaluate_controller, list(ctl)):
            summary[name], traces[name] = row, trace
            t = row["test"]
            print(f"{label(name):34s} test MAPE p {t['mape_p']:.2f} %, ROF {t['mape_rof']:.2f} %, "
                  f"return {t['reward']:.1f}, over a limit {t['violation_s']:.2f} s", flush=True)
    if args.check:
        check(summary)
        return
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    # The PI's bandwidths: one loop swept, the other at its default (SIMC lambda = theta).
    loops = load_loops()
    f0 = default_bandwidth(loops)
    bw = {"default": f0, "loops": loops, "p": {}, "rof": {}}
    jobs = [(loop, idx, f, f0) for loop, idx in (("p", 0), ("rof", 1)) for f in BW_SWEEP]
    with ProcessPoolExecutor(max_workers=min(len(jobs), os.cpu_count() or 1)) as pool:
        for loop, f, m in pool.map(bandwidth_point, jobs):
            bw[loop][str(f)] = m
            print(f"PI bandwidth {loop} {f} Hz: MAPE p {m['mape_p']:.2f} %, ROF {m['mape_rof']:.2f} %", flush=True)
    (OUT / "pi_bandwidth.json").write_text(json.dumps(bw, indent=1))
    (OUT / "eval_traces.json").write_text(json.dumps(traces))
    lines = ["# Baselines on the LUMEN-like surrogate", "",
             "Surrogate results (not DLR's simulator). Mean over 20 held-out 30 s episodes (seeds 1000-1019).", "",
             "| Controller | MAPE p_cc [%] | MAPE ROF [%] | Return | Steps settled p_cc / ROF [%] | Settling p_cc / ROF [s] | "
             "Valve travel | Violations [s] | Randomised: MAPE p_cc / ROF [%] |", "|---|---|---|---|---|---|---|---|---|"]
    for name, row in summary.items():
        t, d = row["test"], row["test_randomised"]
        lines.append(f"| {label(name)} | {t['mape_p']:.2f} | {t['mape_rof']:.2f} | {t['reward']:.1f} | "
                     f"{100 * t['settled_p']:.0f} / {100 * t['settled_rof']:.0f} | {t['settle_p']:.2f} / {t['settle_rof']:.2f} | "
                     f"{t['valve_travel']:.2f} | {t['violation_s']:.2f} | {d['mape_p']:.2f} / {d['mape_rof']:.2f} |")
    (OUT / "summary.md").write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}/summary.json, summary.md, eval_traces.json")


if __name__ == "__main__":
    main()
