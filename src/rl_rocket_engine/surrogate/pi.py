"""Decoupled, gain-scheduled PI baseline for the 2x2 task.

u = u_trim(ref) + K(ref)^-1 [PI_p(e_p), PI_r(e_r)]

* feedforward: the trim openings that hold the reference in steady state (``trim.py``);
* static decoupler: the inverse of the local static gain matrix d(p_cc, ROF)/d(TFV, TOV), so that each
  PI loop acts on one output (the pairing TFV -> p_cc, TOV -> ROF has relative gain 0.67 at 40 bar);
* the ROF loop is fast and the p_cc loop slow, as on LUMEN's hot-fire controllers (thesis p. 18);
* anti-windup by conditional integration: an integrator freezes while its command would push a
  saturated valve further.

It sees the same delayed, noisy measurements as the RL agents and no reference preview.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from .env import DT, U_HIGH, U_LOW, TrimTable

GAINS_FILE = Path(__file__).with_name("pi_gains.json")


@dataclass
class PIGains:
    kp_p: float = 0.3    # p_cc loop: proportional [bar per bar], integral [1/s]
    ki_p: float = 0.6
    kp_r: float = 0.4    # ROF loop
    ki_r: float = 2.0

    @classmethod
    def load(cls) -> "PIGains":
        if GAINS_FILE.exists():
            return cls(**json.loads(GAINS_FILE.read_text())["gains"])
        return cls()


class DecoupledPI:
    def __init__(self, gains: PIGains | None = None, trim: TrimTable | None = None, dt: float = DT):
        self.g = gains or PIGains.load()
        self.trim = trim or TrimTable()
        self.dt = dt
        self.reset()

    def reset(self):
        self.i = np.zeros(2)

    def __call__(self, p_meas, rof_meas, p_ref, rof_ref) -> np.ndarray:
        g = self.g
        e = np.array([p_ref - p_meas, rof_ref - rof_meas])
        kinv = np.linalg.inv(self.trim.gain(p_ref, rof_ref))
        u_ff = self.trim.valves(p_ref, rof_ref)
        kp = np.array([g.kp_p, g.kp_r])
        ki = np.array([g.ki_p, g.ki_r])
        i_new = self.i + ki * e * self.dt
        u = u_ff + kinv @ (kp * e + i_new)
        # Conditional integration: keep the update only for loops that do not push a valve past its limit.
        sat_hi, sat_lo = u > U_HIGH, u < U_LOW
        if sat_hi.any() or sat_lo.any():
            push = kinv @ (ki * e * self.dt)  # how this step's integration moves each valve
            bad = (sat_hi & (push > 0)) | (sat_lo & (push < 0))
            if bad.any():
                # Freeze the loops that contribute to the offending valve movement.
                contrib = np.abs(kinv[bad]).sum(axis=0) > 0
                i_new = np.where(contrib, self.i, i_new)
                u = u_ff + kinv @ (kp * e + i_new)
        self.i = i_new
        return np.clip(u, U_LOW, U_HIGH)

    def to_dict(self) -> dict:
        return asdict(self.g)


def run_episode(env, policy=None, seed=None, options=None):
    """Roll out one episode with either the PI baseline (policy=None) or a callable obs -> action."""
    obs, info = env.reset(seed=seed, options=options)
    pi = DecoupledPI(trim=env.trim) if policy is None else None
    log = []
    done = False
    while not done:
        if pi is not None:
            p_ref, r_ref = env.setpoint
            pm, rm = env.measurement
            action = env.to_action(pi(pm, rm, p_ref, r_ref))
        else:
            action = policy(obs)
        obs, r, term, trunc, info = env.step(action)
        info = dict(info, reward=r)
        log.append(info)
        done = term or trunc
    return log
