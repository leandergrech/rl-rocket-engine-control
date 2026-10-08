"""Decoupled, gain-scheduled PI baseline for the 2x2 task.

u = u_trim(ref) + K(ref)^-1 [PI_p(e_p), PI_r(e_r)]

* feedforward: the trim openings that hold the reference in steady state (``trim.py``);
* static decoupler: the inverse of the local static gain matrix d(p_cc, ROF)/d(TFV, TOV), so that each
  PI loop acts on one output (the pairing TFV -> p_cc, TOV -> ROF has relative gain 0.67 at 40 bar);
* the ROF loop is fast and the p_cc loop slow, as on LUMEN's hot-fire controllers (thesis p. 18);
* anti-windup by conditional integration: an integrator freezes while its command would push a
  saturated valve further.

It sees the same delayed, noisy measurements as the RL agents and no reference preview.

Two ways to set the gains: ``PIGains.load()`` reads the gains tuned by Nelder-Mead on training episodes
(``scripts/train.py pi``); ``gains_for_bandwidth`` designs them for a chosen closed-loop bandwidth per
loop, from a first-order-plus-dead-time model of each decoupled channel (``identify_loops``) and the
SIMC rules (Skogestad 2003): K_p = tau / (k (lambda + theta)), T_i = min(tau, 4 (lambda + theta)), with
lambda = 1 / (2 pi f_b). ``loop_margins`` reports the crossover frequency and phase margin either way.
"""

from __future__ import annotations

import cmath
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from .env import DT, SENSOR_DELAY, U_HIGH, U_LOW, TrimTable
from .model import EngineModel, outputs
from .params import DEFAULT_PARAMS

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


def load_loops() -> dict:
    """The identified loop models stored next to the tuned gains (written by identify_loops)."""
    return json.loads(GAINS_FILE.read_text())["loops"]


def identify_loops(params=DEFAULT_PARAMS, trim: TrimTable | None = None, p_ref: float = 40.0, rof_ref: float = 3.4,
                   dt: float = DT, fit_s: float = 3.0) -> dict:
    """First order plus dead time for each decoupled channel at a reference point.

    A step of the PI's virtual input through the static decoupler moves mostly one output. Its first
    ``fit_s`` seconds (the fast part, before the thermal sag) are fitted with k (1 - exp(-(t - theta) / tau)).
    The loop's dead time adds the sensor delay and half a control interval (zero-order hold).
    """
    from scipy.optimize import least_squares

    trim = trim or TrimTable()
    u0 = np.clip(trim.valves(p_ref, rof_ref), U_LOW, U_HIGH)
    kinv = np.linalg.inv(trim.gain(p_ref, rof_ref))
    loops = {}
    for i, (name, key, delta) in enumerate((("p", "p_cc", 1.0), ("rof", "rof", 0.05))):
        m = EngineModel(params=params, dt=0.005)
        y0 = m.reset(float(u0[0]), float(u0[1]))[key]
        e = np.zeros(2)
        e[i] = delta
        u1 = u0 + kinv @ e
        m.command(float(u1[0]), float(u1[1]))
        t = np.arange(1, int(round(fit_s / 0.01)) + 1) * 0.01
        y = np.array([(m.advance(0.01)[key] - y0) / delta for _ in t])

        def resid(z):
            k, tau, theta = z
            return np.where(t > theta, k * (1 - np.exp(-(t - theta) / max(tau, 1e-3))), 0.0) - y

        z = least_squares(resid, [y[-1], 0.3, 0.05], bounds=([0.01, 0.01, 0.0], [10.0, 5.0, 1.0])).x
        delay = SENSOR_DELAY["p_cc" if name == "p" else "rof"]
        loops[name] = dict(k=round(float(z[0]), 4), tau=round(float(z[1]), 4),
                           theta=round(float(z[2]) + delay + dt / 2, 4), theta_plant=round(float(z[2]), 4))
    return loops


def simc_tight(loops: dict) -> tuple[float, float]:
    """SIMC's tight-but-robust choice, lambda = theta: about 60 degrees of phase margin per loop [Hz]."""
    return tuple(round(1.0 / (2.0 * math.pi * loops[k]["theta"]), 3) for k in ("p", "rof"))


def default_bandwidth(loops: dict | None = None) -> tuple[float, float]:
    """The bandwidths chosen on the training episodes (scripts/train.py pi), else SIMC's tight setting.

    SIMC's tight setting trusts the first-order model; the pressure loop's model leaves out the thermal
    sag and the coupling, so on the engine the best pressure-loop bandwidth is several times lower.
    """
    if GAINS_FILE.exists():
        stored = json.loads(GAINS_FILE.read_text()).get("bandwidth")
        if stored:
            return tuple(stored)
    return simc_tight(loops or load_loops())


def gains_for_bandwidth(f_p: float, f_r: float, loops: dict) -> PIGains:
    """SIMC PI gains for closed-loop bandwidths f_p (pressure loop) and f_r (mixture-ratio loop) in Hz."""
    out = []
    for f, lp in ((f_p, loops["p"]), (f_r, loops["rof"])):
        lam = 1.0 / (2.0 * math.pi * f)
        kp = lp["tau"] / (lp["k"] * (lam + lp["theta"]))
        ti = min(lp["tau"], 4.0 * (lam + lp["theta"]))
        out += [kp, kp / ti]
    return PIGains(*out)


def loop_margins(g: PIGains, loops: dict) -> dict:
    """Crossover frequency [Hz] and phase margin [deg] of each loop with its identified model."""
    res = {}
    for name, kp, ki in (("p", g.kp_p, g.ki_p), ("rof", g.kp_r, g.ki_r)):
        lp = loops[name]

        def loop_gain(w):
            return (kp + ki / (1j * w)) * lp["k"] * cmath.exp(-1j * w * lp["theta"]) / (1 + 1j * w * lp["tau"])

        lo, hi = 1e-3, 1e3  # |L| falls with frequency for these loops: bisect on log w for |L| = 1
        for _ in range(80):
            mid = math.sqrt(lo * hi)
            lo, hi = (mid, hi) if abs(loop_gain(mid)) > 1 else (lo, mid)
        wc = math.sqrt(lo * hi)
        pm = 180.0 + math.degrees(cmath.phase(loop_gain(wc)))
        pm = (pm + 180.0) % 360.0 - 180.0
        res[name] = dict(fc=wc / (2 * math.pi), pm=pm)
    return res


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
