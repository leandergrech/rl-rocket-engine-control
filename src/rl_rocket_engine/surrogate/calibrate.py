"""Fit the surrogate to the numbers the Dresia (2025) thesis publishes about DLR's LUMEN model.

Stage 1 (steady state) fits flow coefficients, turbine torque constants, feed resistances and the
c*(ROF) curve to the reference point and the TFV/TOV columns of thesis Table 4.6 (static gains of a
10 % valve step at 40 bar). Stage 2 (dynamics) fits shaft inertias, hydraulic inertances, the thermal
mass and the injection-temperature lag to the TFV/TOV columns of Table 4.7 (2 % settling times) and to
the chamber-pressure overshoot of a TFV step quoted on p. 73 (6.5 bar peak against 3.7 bar final).

    python -m rl_rocket_engine.surrogate.calibrate            # both stages, writes calibrated.json
    python -m rl_rocket_engine.surrogate.calibrate --report   # print targets against the model
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import replace

import numpy as np
from scipy.optimize import least_squares

from .model import EngineModel, outputs, steady_state
from .params import CALIBRATED, Params

REF = dict(p_cc=40.0, rof=3.4, m_lox=3.8, m_lng=2.0, t_rc=473.0)
REF_SCALE = dict(p_cc=0.1, rof=0.01, m_lox=0.01, m_lng=0.01, t_rc=1.0)
# Thesis Table 4.6: change after a +0.1 step of TFV or TOV from (0.30, 0.21).
GAINS = {
    "TFV": dict(p_cc=3.7, rof=-0.6, m_lng=0.6, m_lox=0.1, m_rc=0.6, t_rc=-109.8),
    "TOV": dict(p_cc=2.7, rof=0.9, m_lng=0.0, m_lox=0.6, m_rc=0.0, t_rc=12.3),
}
GAIN_SCALE = dict(p_cc=0.25, rof=0.05, m_lng=0.05, m_lox=0.05, m_rc=0.05, t_rc=5.0)
# Thesis Table 4.7: settling time [s] into a 2 % band of the final value after the same steps.
SETTLE = {
    "TFV": dict(m_lng=15.5, m_lox=19.5, m_rc=14.9, p_cc=19.3, rof=5.4, t_lng=23.8),
    "TOV": dict(m_lng=0.5, m_lox=0.5, m_rc=0.5, p_cc=0.4, rof=0.6),
}
OVERSHOOT_TFV_PCC = 6.5  # peak rise of p_cc after the TFV step [bar] (thesis p. 73)

# Bounds keep the fit physical. k_tfv: the TFV alone passes k = 0.50-0.52 in the component tests of
# thesis Table 4.4 (m = k x^0.8 p0 / sqrt(T0)); the turbine nozzle in series can only lower it.
# k_bpv: the BPV tests give k = 0.06, i.e. 0.05 at the fixed opening 0.73. r_o: OCV (Table 4.4, about
# 0.5 bar/(kg/s)^2 at 75 %) plus an injector drop of about 20 % of p_cc. c* of LOX/methane peaks near ROF 3.
STATIC = dict(  # name: (lower, upper)
    k_tfv=(0.2, 0.52), k_tov=(0.1, 0.8), k_bpv=(0.02, 0.1), a_tf=(0.3, 30.0), b_tf=(1e-5, 0.05),
    a_to=(0.3, 30.0), b_to=(1e-5, 0.05), r_inj=(2.0, 50.0), r_rc=(1.5, 6.0), r_o=(0.5, 1.6),
    k_tlng=(0.01, 0.6), cstar_k=(1e-3, 0.2), cstar_r0=(2.8, 3.3), cp=(2400.0, 3800.0),
)
# Weak prior: total turbine flow about 0.59 kg/s (thesis p. 96: an offset of 0.026 kg/s is 4.4 %).
M_TURBINES, M_TURBINES_SCALE = 0.59, 0.1
DYNAMIC = dict(
    inertia_o=(2e-4, 0.05), inertia_f=(2e-4, 0.05), l_o=(0.02, 3.0), l_f=(0.02, 3.0),
    c_th=(1e4, 1e6), tau_lng=(0.2, 20.0),
)
STEPS = {"TFV": (0.40, 0.21), "TOV": (0.30, 0.31)}


def _pack(p: Params, names) -> np.ndarray:
    return np.array([math.log(getattr(p, n)) for n in names])


def _unpack(p: Params, names, z) -> Params:
    return replace(p, **{n: float(math.exp(v)) for n, v in zip(names, z)})


def _bounds(spec):
    lo = [math.log(spec[n][0]) for n in spec]
    hi = [math.log(spec[n][1]) for n in spec]
    return lo, hi


def static_report(p: Params) -> dict:
    s0 = steady_state(p.x_tfv_ref, p.x_tov_ref, p)
    o0 = outputs(s0, p)
    rep = {"reference": {k: o0[k] for k in REF}, "gains": {}, "m_turbines": o0["m_tf"] + o0["m_to"]}
    for name, (xt, xo) in STEPS.items():
        o1 = outputs(steady_state(xt, xo, p, guess=s0), p)
        rep["gains"][name] = {k: o1[k] - o0[k] for k in GAINS[name]}
    return rep


def static_residuals(z, base: Params) -> np.ndarray:
    p = _unpack(base, STATIC, z)
    try:
        rep = static_report(p)
    except (ValueError, OverflowError, ZeroDivisionError):
        return np.full(len(REF) + 13, 1e3)
    r = [(rep["reference"][k] - REF[k]) / REF_SCALE[k] for k in REF]
    r.append((rep["m_turbines"] - M_TURBINES) / M_TURBINES_SCALE)
    for name in GAINS:
        for k, target in GAINS[name].items():
            r.append((rep["gains"][name][k] - target) / GAIN_SCALE[k])
    r = np.array(r)
    return np.where(np.isfinite(r), r, 1e3)


def step_response(p: Params, valve: str, duration: float = 60.0, dt_out: float = 0.05):
    """Simulate a +0.1 step of one valve from the reference point; return times and output traces."""
    m = EngineModel(params=p, dt=0.002)
    m.reset()
    traces = {k: [] for k in ("p_cc", "rof", "m_lng", "m_lox", "m_rc", "t_lng", "t_rc")}
    xt, xo = STEPS[valve]
    m.command(xt, xo)
    times = []
    t = 0.0
    while t < duration - 1e-9:
        o = m.advance(dt_out)
        t += dt_out
        times.append(t)
        for k in traces:
            traces[k].append(o[k])
    return np.array(times), {k: np.array(v) for k, v in traces.items()}


def settling_time(t, y, final=None, band=0.02) -> float:
    final = y[-1] if final is None else final
    out = np.abs(y - final) > band * abs(final)
    if not out.any():
        return 0.0
    last = np.where(out)[0][-1]
    return float(t[last]) if last + 1 < len(t) else float(t[-1])


def dynamic_report(p: Params) -> dict:
    rep = {"settling": {}, "overshoot_tfv_pcc": None}
    s0 = steady_state(p.x_tfv_ref, p.x_tov_ref, p)
    o0 = outputs(s0, p)
    for valve in SETTLE:
        xt, xo = STEPS[valve]
        fin = outputs(steady_state(xt, xo, p, guess=s0), p)
        t, tr = step_response(p, valve)
        rep["settling"][valve] = {k: settling_time(t, tr[k], fin[k]) for k in SETTLE[valve]}
        if valve == "TFV":
            rep["overshoot_tfv_pcc"] = float(tr["p_cc"].max() - o0["p_cc"])
    return rep


def dynamic_residuals(z, base: Params) -> np.ndarray:
    p = _unpack(base, DYNAMIC, z)
    try:
        rep = dynamic_report(p)
    except (ValueError, OverflowError, ZeroDivisionError):
        return np.full(12, 1e3)
    r = []
    for valve, targets in SETTLE.items():
        for k, target in targets.items():
            # Log ratio: a factor of 1.5 off counts the same for 0.5 s and for 20 s.
            r.append(math.log((rep["settling"][valve][k] + 0.05) / (target + 0.05)) / math.log(1.5))
    r.append((rep["overshoot_tfv_pcc"] - OVERSHOOT_TFV_PCC) / 0.5)
    r = np.array(r)
    return np.where(np.isfinite(r), r, 1e3)


def calibrate(base: Params, max_nfev: int = 400) -> tuple[Params, dict]:
    t0 = time.time()
    lo, hi = _bounds(STATIC)
    z0 = np.clip(_pack(base, STATIC), lo, hi)
    res1 = least_squares(static_residuals, z0, bounds=(lo, hi), args=(base,), x_scale=1.0, max_nfev=max_nfev)
    p = _unpack(base, STATIC, res1.x)
    print(f"stage 1 (static): cost {res1.cost:.3f} after {res1.nfev} evaluations, {time.time() - t0:.0f} s", flush=True)
    lo, hi = _bounds(DYNAMIC)
    z0 = np.clip(_pack(p, DYNAMIC), lo, hi)
    res2 = least_squares(dynamic_residuals, z0, bounds=(lo, hi), args=(p,), diff_step=0.05, max_nfev=max_nfev // 4)
    p = _unpack(p, DYNAMIC, res2.x)
    print(f"stage 2 (dynamics): cost {res2.cost:.3f} after {res2.nfev} evaluations, {time.time() - t0:.0f} s", flush=True)
    s0 = steady_state(p.x_tfv_ref, p.x_tov_ref, p)
    p = replace(p, w_o_ref=s0[4], w_f_ref=s0[5], m_o_ref=s0[6], m_f_ref=s0[7])
    return p, {"static": static_report(p), "dynamic": dynamic_report(p)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", action="store_true", help="only print the current fit")
    ap.add_argument("--max-nfev", type=int, default=400)
    args = ap.parse_args()
    if args.report:
        from .params import DEFAULT_PARAMS

        print(json.dumps({"static": static_report(DEFAULT_PARAMS), "dynamic": dynamic_report(DEFAULT_PARAMS)}, indent=1))
        return
    p, report = calibrate(Params(), args.max_nfev)
    CALIBRATED.write_text(json.dumps({"params": p.to_dict(), "report": report,
                                      "targets": {"reference": REF, "gains": GAINS, "settling": SETTLE,
                                                  "overshoot_tfv_pcc": OVERSHOOT_TFV_PCC}}, indent=1))
    print(json.dumps(report, indent=1))
    from .env import TRIM_FILE
    from .trim import trim_table

    table = trim_table(np.arange(32.5, 52.6, 2.5), np.arange(2.8, 4.01, 0.2), p)
    TRIM_FILE.write_text(json.dumps(table, indent=0))
    print(f"wrote {CALIBRATED.name} and {TRIM_FILE.name}")


if __name__ == "__main__":
    main()
