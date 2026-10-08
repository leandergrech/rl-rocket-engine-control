"""Gymnasium environment for the 2x2 task on the LUMEN-like surrogate: TFV and TOV track p_cc and ROF.

Modelled on test case 1 of the Dresia (2025) thesis (Chapter 5) and on what is public about the
LUMEN Control Challenge, scaled to what the surrogate can reach with FCV, BPV, OCV and XCV frozen at
their Table 4.6 positions:

* control interval 0.05 s, the challenge's 20 Hz (organisers, October 2026; DLR's hardware controller
  also ran at 20 Hz, thesis p. 99). The thesis's simulation studies used 0.1 s; ``dt=0.1`` reproduces
  this repo's first baselines. Episodes of 30 s (the thesis uses 50 s);
* actions: TFV and TOV commands, scaled from [-1, 1] to [0.1, 0.7] and [0.1, 0.5];
* references: random holds, steps and ramps in 35-50 bar and ROF 3.0-3.8;
* reward: thesis eq. 5.6-5.8 with delta = 12 and beta = 0.5 (Table A.2), plus a small valve-travel
  penalty; the economic term (eq. 5.9) is off by default, because with two valves and two targets
  there is no freedom left to save turbine flow;
* constraints (thesis Table 5.1): 2.5 <= ROF <= 4, turbine inlet < 700 K, OTP < 28,000 rpm,
  FTP < 50,000 rpm, p_RC > 46 bar;
* optional reference preview (Nf = 4 future steps; the challenge has none), observation stacking
  (Np = 3), sensor delays and domain randomisation (thesis Table A.3), noise, and malfunctions
  (``faults.py``: stuck valves, bearing wear, leaks, blockages, sensor faults, slow drift).

This is a surrogate of a surrogate: results here say nothing quantitative about the real challenge.
"""

from __future__ import annotations

import json
import math
from dataclasses import replace
from pathlib import Path

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from . import faults as faultlib
from .model import EngineModel, outputs, steady_state
from .params import DEFAULT_PARAMS, Params

DT = 0.05         # control interval [s]: the challenge's 20 Hz
DT_LEGACY = 0.1   # this repo's first baselines (the thesis's simulation setting)
SUB = 0.05        # resolution of the sensor-delay buffer [s]
P_RANGE = (35.0, 50.0)
ROF_RANGE = (3.0, 3.8)
U_LOW = np.array([0.1, 0.1])
U_HIGH = np.array([0.7, 0.5])
LIMITS = dict(rof_min=2.5, rof_max=4.0, t_turbine_max=700.0, n_otp_max=28000.0, n_ftp_max=50000.0, p_rc_min=46.0)
SENSOR_DELAY = dict(p_cc=0.1, rof=0.2)  # middle of thesis Table A.3 (ROF from the 0.1-0.25 s flow meters)
TRIM_FILE = Path(__file__).with_name("trim_table.json")

# Domain randomisation (thesis Table A.3) mapped onto surrogate parameters: name -> (min, max) factor.
RANDOMISE = dict(
    k_tfv=(0.95, 1.05), k_tov=(0.95, 1.05), k_bpv=(0.95, 1.05),   # valve Kv
    valve_amax=(0.94, 1.06), valve_vmax=(0.92, 1.08),
    q_ref=(0.96, 1.04),                                         # heat-flux factor k1
    r_rc=(0.95, 1.05), kc=(0.986, 1.014),                       # cooling-channel loss; eta_c* x A_t
    r_inj=(0.97, 1.03), r_o=(0.97, 1.03),                       # injector loss coefficients
    eta_pf=(0.97, 1.03), eta_po=(0.96, 1.04),
    p_tank_o=(0.90, 1.00), p_tank_f=(0.90, 1.00), t_in=(0.97, 1.03),
)


def load_trim_table() -> dict:
    if TRIM_FILE.exists():
        return json.loads(TRIM_FILE.read_text())
    from .trim import trim_table

    return trim_table(np.arange(32.5, 52.6, 2.5), np.arange(2.8, 4.01, 0.2))


class TrimTable:
    """Bilinear interpolation of trim openings and static gains over (p_cc, ROF)."""

    def __init__(self, table: dict | None = None):
        t = table or load_trim_table()
        self.p = np.array(t["p_cc"], float)
        self.r = np.array(t["rof"], float)
        pts = t["points"]
        self.u = np.array([[[c["x_tfv"], c["x_tov"]] if c else [np.nan, np.nan] for c in row] for row in pts])
        self.k = np.array([[np.array(c["gain"]).ravel() if c else [np.nan] * 4 for c in row] for row in pts])

    def _interp(self, arr, p_cc, rof):
        i = float(np.clip(np.interp(p_cc, self.p, np.arange(len(self.p))), 0, len(self.p) - 1.001))
        j = float(np.clip(np.interp(rof, self.r, np.arange(len(self.r))), 0, len(self.r) - 1.001))
        i0, j0 = int(i), int(j)
        a, b = i - i0, j - j0
        return ((1 - a) * (1 - b) * arr[i0, j0] + a * (1 - b) * arr[i0 + 1, j0]
                + (1 - a) * b * arr[i0, j0 + 1] + a * b * arr[i0 + 1, j0 + 1])

    def valves(self, p_cc, rof) -> np.ndarray:
        return self._interp(self.u, p_cc, rof)

    def gain(self, p_cc, rof) -> np.ndarray:
        return self._interp(self.k, p_cc, rof).reshape(2, 2)


def random_reference(rng: np.random.Generator, duration: float, dt: float = DT, horizon: int = 4):
    """Piecewise holds, steps and ramps in the task box; returns arrays of length n_steps + horizon + 1."""
    n = int(round(duration / dt)) + horizon + 1
    t = np.arange(n) * dt
    p0, r0 = rng.uniform(*P_RANGE), rng.uniform(*ROF_RANGE)
    knots = [(0.0, p0, r0)]
    tk = rng.uniform(2.0, 5.0)
    while tk < t[-1]:
        p1 = p0 if rng.random() < 0.25 else rng.uniform(*P_RANGE)
        r1 = r0 if rng.random() < 0.25 else rng.uniform(*ROF_RANGE)
        ramp = 0.0 if rng.random() < 0.4 else rng.uniform(1.0, 5.0)
        knots += [(tk, p0, r0), (tk + max(ramp, 1e-6), p1, r1)]
        p0, r0 = p1, r1
        tk += ramp + rng.uniform(2.5, 6.0)
    kt, kp, kr = (np.array(v) for v in zip(*knots))
    return np.interp(t, kt, kp), np.interp(t, kt, kr)


def profile_from_knots(knots, duration: float, dt: float = DT, horizon: int = 4):
    """Piecewise-linear set points through (t, p_cc, ROF) knots, exactly as lumen-model.js builds them."""
    n = int(round(duration / dt)) + horizon + 1
    pref, rref = np.empty(n), np.empty(n)
    for i in range(n):
        t = i * dt
        j = 0
        while j < len(knots) - 2 and knots[j + 1][0] < t:
            j += 1
        t0, p0, r0 = knots[j]
        t1, p1, r1 = knots[min(j + 1, len(knots) - 1)]
        w = min(max((t - t0) / (t1 - t0), 0.0), 1.0) if t1 > t0 else 1.0
        pref[i], rref[i] = p0 + w * (p1 - p0), r0 + w * (r1 - r0)
    return pref, rref


def eval_profile(dt: float = DT, horizon: int = 4):
    """A fixed 40 s profile with steps and ramps in both outputs (used for plots and the Lab)."""
    knots = [(0, 40, 3.4), (5, 40, 3.4), (5.001, 45, 3.4), (10, 45, 3.4), (10.001, 45, 3.7), (15, 45, 3.7),
             (18, 50, 3.7), (22, 50, 3.7), (24, 50, 3.1), (27, 50, 3.1), (27.001, 38, 3.1), (33, 38, 3.1),
             (33.001, 38, 3.5), (36, 38, 3.5), (38, 35, 3.5), (60, 35, 3.5)]
    n = int(round(40.0 / dt)) + horizon + 1
    t = np.arange(n) * dt
    kt, kp, kr = (np.array(v, float) for v in zip(*knots))
    return np.interp(t, kt, kp), np.interp(t, kt, kr)


class LumenSurrogateEnv(gym.Env):
    """2x2 tracking on the surrogate. Observations are normalised; actions are in [-1, 1]^2."""

    metadata = {"render_modes": []}

    def __init__(self, preview: bool = True, n_future: int = 4, n_past: int = 3, sensor_delay: bool = True,
                 noise: bool = True, randomise: bool = False, duration: float = 30.0, delta: float = 12.0,
                 beta: float = 0.5, gamma_econ: float = 0.0, du_weight: float = 0.5,
                 params: Params | None = None, profile: str = "random", dt_sim: float = 0.005,
                 dt: float = DT, faults: list | None = None):
        super().__init__()
        self.preview, self.n_future, self.n_past = preview, n_future, n_past
        self.sensor_delay, self.noise, self.randomise = sensor_delay, noise, randomise
        self.duration, self.delta, self.beta = duration, delta, beta
        self.gamma_econ, self.du_weight = gamma_econ, du_weight
        self.base_params = params or DEFAULT_PARAMS
        self.profile, self.dt_sim, self.dt = profile, dt_sim, dt
        self.faults = list(faults or [])
        self.trim = TrimTable()
        self.n_steps = int(round(duration / dt))
        n_ref = 2 * (n_future + 1) if preview else 2
        self.frame_size = 2 + 2 + n_ref + 2 + 2 + 5
        self.observation_space = spaces.Box(-10.0, 10.0, (self.frame_size * (n_past + 1),), np.float32)
        self.action_space = spaces.Box(-1.0, 1.0, (2,), np.float32)

    # --- helpers -------------------------------------------------------------------------------
    @staticmethod
    def to_valves(action) -> np.ndarray:
        return U_LOW + (np.clip(action, -1, 1) + 1) * 0.5 * (U_HIGH - U_LOW)

    @staticmethod
    def to_action(valves) -> np.ndarray:
        return np.clip(2 * (np.asarray(valves, float) - U_LOW) / (U_HIGH - U_LOW) - 1, -1, 1)

    def _measure(self):
        hist = self._hist
        if self.sensor_delay:
            ip = max(0, len(hist) - 1 - int(round(self._delay["p_cc"] / SUB)))
            ir = max(0, len(hist) - 1 - int(round(self._delay["rof"] / SUB)))
        else:
            ip = ir = len(hist) - 1
        p, r = hist[ip][0], hist[ir][1]
        if self.noise:
            p += self.np_random.normal(0, 0.05)
            r += self.np_random.normal(0, 0.005)
        if self._faults:  # faulty sensors (faults.py)
            p, r = faultlib.sensor_reading(self._faults, self._k * self.dt, p, r, self._sensor_memo)
        return p, r

    def _frame(self):
        k = self._k
        p_m, r_m = self._meas
        pr, rr = self._pref, self._rref
        o = self._out
        # The set point for the coming interval is ref[k + 1] (the reward is scored there); the preview
        # adds the n_future set points after it.
        n = self.n_future + 1 if self.preview else 1
        idx = [min(k + 1 + i, len(pr) - 1) for i in range(n)]
        refs = [(pr[i] - 42.5) / 7.5 for i in idx] + [(rr[i] - 3.4) / 0.4 for i in idx]
        f = [(p_m - 42.5) / 7.5, (r_m - 3.4) / 0.4,
             np.clip((p_m - pr[k + 1]) / pr[k + 1] * 20, -5, 5), np.clip((r_m - rr[k + 1]) / rr[k + 1] * 20, -5, 5),
             *refs,
             (o["x_tfv"] - 0.4) / 0.3, (o["x_tov"] - 0.3) / 0.2,
             (self._u[0] - 0.4) / 0.3, (self._u[1] - 0.3) / 0.2,
             (o["t_rc"] - 500) / 200, o["n_otp"] / 28000, o["n_ftp"] / 50000, (o["p_rc"] - 46) / 20,
             (o["m_tf"] + o["m_to"]) / 0.6]
        return np.asarray(f, np.float32)

    def _obs(self):
        frames = list(self._frames)
        return np.clip(np.concatenate(frames[::-1]), -10, 10).astype(np.float32)

    def violations(self, o) -> dict:
        return dict(rof=o["rof"] < LIMITS["rof_min"] or o["rof"] > LIMITS["rof_max"],
                    t_turbine=o["t_rc"] > LIMITS["t_turbine_max"],
                    n_otp=o["n_otp"] > LIMITS["n_otp_max"], n_ftp=o["n_ftp"] > LIMITS["n_ftp_max"],
                    p_rc=o["p_rc"] < LIMITS["p_rc_min"])

    # --- gym API -------------------------------------------------------------------------------
    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        options = options or {}
        rng = self.np_random
        p = self.base_params
        if self.randomise:
            p = replace(p, **{k: getattr(p, k) * rng.uniform(lo, hi) for k, (lo, hi) in RANDOMISE.items()},
                        valve_delay=rng.uniform(0.03, 0.08))
            self._delay = dict(p_cc=rng.uniform(0.05, 0.15), rof=rng.uniform(0.1, 0.25))
        else:
            self._delay = dict(SENSOR_DELAY)
        if "delay" in options:
            self._delay = dict(options["delay"])
        if "params" in options:
            p = options["params"]
        self.params = self._base = p
        self._faults = list(options.get("faults", self.faults))
        self._sensor_memo = {}
        dt = self.dt
        profile = options.get("profile", self.profile)
        if profile == "eval":
            self._pref, self._rref = eval_profile(dt, self.n_future)
            self.n_steps = int(round(40.0 / dt))
        elif isinstance(profile, tuple):
            self._pref, self._rref = (np.asarray(a, float) for a in profile)
            self.n_steps = len(self._pref) - self.n_future - 1
        else:
            self._pref, self._rref = random_reference(rng, self.duration, dt, self.n_future)
            self.n_steps = int(round(self.duration / dt))
        u0 = np.clip(self.trim.valves(self._pref[0], self._rref[0]), U_LOW, U_HIGH)
        self.model = EngineModel(params=p, dt=self.dt_sim)
        self.model.state = steady_state(float(u0[0]), float(u0[1]), p)
        self.model.t = 0.0
        self.model._queue = []
        self.model._u = (float(u0[0]), float(u0[1]))
        self._u = u0.copy()
        self._out = outputs(self.model.state, p)
        self._hist = [(self._out["p_cc"], self._out["rof"])] * 8
        self._k = 0
        self._meas = self._measure()
        f = self._frame()
        self._frames = [f] * (self.n_past + 1)
        return self._obs(), {"p_cc": self._out["p_cc"], "rof": self._out["rof"]}

    def step(self, action):
        u = self.to_valves(np.asarray(action, float))
        du = np.abs(u - self._u).sum()
        self._u = u
        if self._faults:  # malfunctions change the engine from their onset on (faults.py)
            p = faultlib.engine_params(self._base, self._faults, self._k * self.dt)
            if p != self.model.params:
                self.model.params = self.params = p
        self.model.command(float(u[0]), float(u[1]))
        for _ in range(int(round(self.dt / SUB))):
            self._out = self.model.advance(SUB)
            self._hist.append((self._out["p_cc"], self._out["rof"]))
        self._hist = self._hist[-16:]
        self._k += 1
        k = self._k
        o = self._out
        finite = all(math.isfinite(o[key]) for key in ("p_cc", "rof", "t_rc", "n_otp", "n_ftp"))
        if not finite:
            return self._obs(), -100.0, True, False, {"crash": True}
        self._meas = self._measure()
        e_p = abs(o["p_cc"] - self._pref[k]) / self._pref[k]
        e_r = abs(o["rof"] - self._rref[k]) / self._rref[k]
        viol = self.violations(o)
        reward = (math.exp(-self.delta * e_p) - 1) + (math.exp(-self.delta * e_r) - 1)
        reward -= self.beta * sum(viol.values())
        reward -= self.gamma_econ * (o["m_tf"] + o["m_to"])
        reward -= self.du_weight * du
        self._frames = [self._frame()] + self._frames[:-1]
        info = {"t": k * self.dt, "p_cc": o["p_cc"], "rof": o["rof"], "p_ref": self._pref[k], "rof_ref": self._rref[k],
                "x_tfv": o["x_tfv"], "x_tov": o["x_tov"], "u_tfv": u[0], "u_tov": u[1], "du": du,
                "t_turbine": o["t_rc"], "n_otp": o["n_otp"], "n_ftp": o["n_ftp"], "p_rc": o["p_rc"],
                "m_turbines": o["m_tf"] + o["m_to"], "violations": viol,
                "p_meas": self._meas[0], "rof_meas": self._meas[1]}
        truncated = k >= self.n_steps
        return self._obs(), float(reward), False, truncated, info

    # Used by the PI baseline, which sees the same measurements as the agent.
    @property
    def measurement(self):
        return self._meas

    @property
    def setpoint(self):
        """The set point for the coming interval, which is what the next reward is scored against."""
        return self._pref[self._k + 1], self._rref[self._k + 1]
