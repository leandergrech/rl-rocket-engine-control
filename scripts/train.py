"""Train the baselines on the LUMEN-like surrogate (CPU only).

    python scripts/train.py pi                         # tune the decoupled PI gains at 20 Hz (about 10 min)
    python scripts/train.py ppo                        # PPO at 20 Hz without preview (the challenge's setting)
    python scripts/train.py all                        # PI, then PPO and SAC at 20 Hz
    python scripts/train.py legacy                     # the first baselines: 10 Hz, with and without preview
    python scripts/train.py ppo --seed 1               # a second seed, saved as ppo-seed1
    python scripts/train.py sac --steps 20000 --out /tmp/x   # quick smoke run

Trained actors go to data/policies/<name>.json (small, used by the docs Lab and by evaluate.py);
SB3 checkpoints go to data/checkpoints/ (not committed).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from rl_rocket_engine.surrogate.env import LumenSurrogateEnv  # noqa: E402
from rl_rocket_engine.surrogate.pi import GAINS_FILE, DecoupledPI, PIGains, gains_for_bandwidth, identify_loops  # noqa: E402
from rl_rocket_engine.surrogate.rl import CONFIGS, CURRENT, run_name, train  # noqa: E402

TUNE_SEEDS = list(range(100, 112))


def tune_pi(log=print) -> dict:
    from scipy.optimize import minimize

    env = LumenSurrogateEnv()

    def cost(z):
        g = PIGains(*np.exp(z))
        total = 0.0
        for seed in TUNE_SEEDS:
            env.reset(seed=seed)
            pi = DecoupledPI(g, env.trim)
            done = False
            while not done:
                p_ref, r_ref = env.setpoint
                _, r, term, trunc, _ = env.step(env.to_action(pi(*env.measurement, p_ref, r_ref)))
                total += r
                done = term or trunc
        return -total / len(TUNE_SEEDS)

    t0 = time.time()
    best = None
    for start in ([0.3, 0.6, 0.4, 2.0], [0.1, 0.3, 0.3, 1.5], [0.05, 0.2, 0.6, 3.0]):
        res = minimize(cost, np.log(start), method="Nelder-Mead", options=dict(maxfev=160, xatol=0.02, fatol=0.05))
        log(f"pi: start {start} -> {np.round(np.exp(res.x), 4).tolist()}, mean return {-res.fun:.1f}")
        if best is None or res.fun < best.fun:
            best = res
    gains = {k: round(float(v), 4) for k, v in zip(("kp_p", "ki_p", "kp_r", "ki_r"), np.exp(best.x))}
    GAINS_FILE.write_text(json.dumps({"gains": gains, "how": (
        "Nelder-Mead on the mean return of 12 random 30 s training episodes (seeds 100-111) at 20 Hz, sensor "
        "delays and noise on, no randomisation; scripts/train.py pi"), "loops": identify_loops(), "loops_how": (
        "first order plus dead time of each decoupled channel at 40 bar / ROF 3.4, fitted to the first 3 s of "
        "a step; dead time includes the sensor delay and half a control interval (pi.identify_loops)")}, indent=1))
    log(f"pi: wrote {GAINS_FILE.name} in {time.time() - t0:.0f} s")
    return gains


BW_GRID_P = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5]
BW_GRID_R = [0.05, 0.1, 0.15, 0.2, 0.3, 0.47]


def _bw_return(fp_fr):
    fp, fr = fp_fr
    loops = json.loads(GAINS_FILE.read_text())["loops"]
    env = LumenSurrogateEnv()
    total = 0.0
    for seed in TUNE_SEEDS:
        env.reset(seed=seed)
        pi = DecoupledPI(gains_for_bandwidth(fp, fr, loops), env.trim, env.dt)
        done = False
        while not done:
            p_ref, r_ref = env.setpoint
            _, r, term, trunc, _ = env.step(env.to_action(pi(*env.measurement, p_ref, r_ref)))
            total += r
            done = term or trunc
    return fp_fr, total / len(TUNE_SEEDS)


def tune_bandwidth(workers: int = 4, log=print) -> list:
    """Grid search of the two loop bandwidths on the training episodes, by mean return."""
    from concurrent.futures import ProcessPoolExecutor

    grid = [(fp, fr) for fp in BW_GRID_P for fr in BW_GRID_R]
    with ProcessPoolExecutor(workers) as pool:
        scores = dict(pool.map(_bw_return, grid))
    best = max(scores, key=scores.get)
    d = json.loads(GAINS_FILE.read_text())
    d["bandwidth"] = list(best)
    d["bandwidth_how"] = (f"grid search over {len(grid)} pairs of loop bandwidths on the 12 training episodes, by mean return "
                          f"({scores[best]:.1f}); scripts/train.py pi")
    GAINS_FILE.write_text(json.dumps(d, indent=1))
    log(f"pi: default bandwidths {best[0]} / {best[1]} Hz, mean return {scores[best]:.1f}")
    return list(best)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", choices=["pi", "all", "legacy", *CONFIGS])
    ap.add_argument("--steps", type=int, default=None)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--n-envs", type=int, default=6)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "checkpoints")
    args = ap.parse_args()
    legacy = [n for n in CONFIGS if n not in CURRENT]
    names = {"all": ["pi", *CURRENT], "legacy": legacy}.get(args.name, [args.name])
    for name in names:
        if name == "pi":
            tune_pi()
            tune_bandwidth()
            continue
        meta = train(name, args.out, steps=args.steps, seed=args.seed, n_envs=args.n_envs)
        policies = ROOT / "data" / "policies"
        policies.mkdir(parents=True, exist_ok=True)
        if args.out.resolve() == (ROOT / "data" / "checkpoints").resolve():
            stem = run_name(name, args.seed)
            (policies / f"{stem}.json").write_text((args.out / f"{stem}.json").read_text())
            curve = meta["curve"]
            step = max(1, len(curve) // 200)  # keep the learning curve small enough to commit
            (policies / f"{stem}.train.json").write_text(json.dumps(dict(meta, curve=curve[::step])))
        print(f"{name}: {meta['steps']} steps in {meta['wall_s'] / 60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
