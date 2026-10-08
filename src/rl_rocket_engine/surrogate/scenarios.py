"""The LUMEN Control Challenge's seven test cases in miniature: episodes defined in scenarios.json.

    from rl_rocket_engine.surrogate.scenarios import load, episode_options
    env.reset(seed=0, options=episode_options(load()["tc7"], env.dt, env.n_future))

The test-case descriptions are the challenge's (Bareiss et al. 2025, AI4Aerospace); the engine changes,
faults, onsets and magnitudes are this repo's choices. lab.js builds the same episodes in the browser.
"""

from __future__ import annotations

import json
from dataclasses import replace

from .env import DT, eval_profile, profile_from_knots
from .faults import SCENARIOS_FILE
from .params import DEFAULT_PARAMS


def load() -> dict:
    return json.loads(SCENARIOS_FILE.read_text())["scenarios"]


def episode_options(sc: dict, dt: float = DT, horizon: int = 4, base=DEFAULT_PARAMS) -> dict:
    """reset() options for one scenario: set points, engine parameters, sensor delays and faults."""
    prof = sc.get("profile", "eval")
    if prof == "eval":
        pref, rref = eval_profile(dt, horizon)
    else:
        pref, rref = profile_from_knots(prof["knots"], prof["duration"], dt, horizon)
    params = base
    spec = sc.get("params") or {}
    if spec:
        params = replace(base, **{k: getattr(base, k) * f for k, f in spec.get("factors", {}).items()})
        if "valve_delay" in spec:
            params = replace(params, valve_delay=spec["valve_delay"])
    opts = dict(profile=(pref, rref), params=params, faults=list(sc.get("faults", [])))
    if "delay" in sc:
        opts["delay"] = sc["delay"]
    return opts
