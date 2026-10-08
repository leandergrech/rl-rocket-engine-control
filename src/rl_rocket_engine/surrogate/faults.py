"""Malfunctions of the surrogate engine, and the LUMEN Control Challenge's test cases in miniature.

A fault is a dict ``{"kind": ..., "t0": onset [s], "mag": magnitude, "ramp": seconds (optional)}``. Its
severity is 0 before ``t0`` and then 1, or rises linearly to 1 over ``ramp`` seconds; it scales ``mag``.
The kinds follow what DLR simulated in its LUMEN diagnosis benchmark (DX'25: pump bearing failure,
turbine nozzle blockage, pump leak, stuck valve, multiplicative sensor faults; Pill et al. 2025 and the
LiU benchmark page) and the challenge's test cases 5-7 (slow drift; a fault with and without a
detection signal; Bareiss et al. 2025). Magnitudes and onsets are this repo's choices, not DLR's.

``scenarios.json`` defines the seven test cases as concrete episodes on the surrogate. Both files are
mirrored in docs/javascripts/lumen-model.js; tests/test_lab_model.py checks the two agree.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

from .params import Params

# kind: (label, part of the engine it hits, default magnitude, what the magnitude means)
KINDS = {
    "stuck_tfv": ("TFV stuck", "tfv", 1.0, "the valve freezes at its opening"),
    "stuck_tov": ("TOV stuck", "tov", 1.0, "the valve freezes at its opening"),
    "actuator_delay": ("Valve actuators lag", "valves", 0.1, "extra dead time [s]"),
    "bearing_ftp": ("FTP bearing wear", "ftp", 0.25, "extra friction, share of the pump torque"),
    "bearing_otp": ("OTP bearing wear", "otp", 0.25, "extra friction, share of the pump torque"),
    "leak_fuel": ("Fuel leak", "lng", 0.12, "share of the fuel flow lost after the pump"),
    "leak_lox": ("LOX leak", "lox", 0.08, "share of the LOX flow lost after the pump"),
    "block_ft": ("Fuel turbine blockage", "ft", 0.3, "share of the nozzle area blocked"),
    "block_ot": ("LOX turbine blockage", "ot", 0.3, "share of the nozzle area blocked"),
    "heat": ("Cooling degradation", "jacket", 0.15, "extra wall heat, share"),
    "ageing": ("Turbine ageing", "turbines", 0.12, "loss of turbine torque, share"),
    "sensor_pcc_bias": ("p_cc sensor offset", "sensor", 2.0, "offset [bar]"),
    "sensor_pcc_drift": ("p_cc sensor drift", "sensor", 0.25, "drift [bar/s]"),
    "sensor_pcc_frozen": ("p_cc sensor frozen", "sensor", 1.0, "the reading stops changing"),
    "sensor_rof_gain": ("ROF sensor gain error", "sensor", 0.1, "relative error"),
}
SCENARIOS_FILE = Path(__file__).with_name("scenarios.json")


def severity(fault: dict, t: float) -> float:
    t0, ramp = fault.get("t0", 0.0), fault.get("ramp", 0.0)
    if t < t0 - 1e-9:
        return 0.0
    if ramp <= 0:
        return 1.0
    return min(1.0, (t - t0) / ramp)


def engine_params(base: Params, faults: list, t: float) -> Params:
    """The engine's parameters at time t with the faults that have started by then."""
    ch: dict = {}
    for f in faults:
        s = severity(f, t)
        if s <= 0:
            continue
        k, m = f["kind"], f["mag"] * s
        if k == "stuck_tfv":
            ch["stuck_tfv"] = 1.0
        elif k == "stuck_tov":
            ch["stuck_tov"] = 1.0
        elif k == "actuator_delay":
            ch["valve_delay"] = base.valve_delay + m
        elif k == "bearing_ftp":
            ch["drag_f"] = base.drag_f + m
        elif k == "bearing_otp":
            ch["drag_o"] = base.drag_o + m
        elif k == "leak_fuel":
            ch["leak_f"] = m
        elif k == "leak_lox":
            ch["leak_o"] = m
        elif k == "block_ft":
            ch["k_tfv"] = base.k_tfv * (1.0 - m)
        elif k == "block_ot":
            ch["k_tov"] = base.k_tov * (1.0 - m)
        elif k == "heat":
            ch["q_ref"] = base.q_ref * (1.0 + m)
        elif k == "ageing":
            ch["a_tf"] = base.a_tf * (1.0 - m)
            ch["a_to"] = base.a_to * (1.0 - m)
    return replace(base, **ch) if ch else base


def sensor_reading(faults: list, t: float, p: float, r: float, memo: dict) -> tuple[float, float]:
    """What faulty sensors report at time t, given the delayed (and noisy) readings p_cc and ROF."""
    for f in faults:
        s = severity(f, t)
        if s <= 0:
            continue
        k, m = f["kind"], f["mag"]
        if k == "sensor_pcc_bias":
            p += m * s
        elif k == "sensor_pcc_drift":
            p += m * max(0.0, t - f.get("t0", 0.0))
        elif k == "sensor_pcc_frozen":
            p = memo.setdefault("p_cc", p)
        elif k == "sensor_rof_gain":
            r *= 1.0 + m * s
    return p, r


def load_scenarios() -> dict:
    return json.loads(SCENARIOS_FILE.read_text())
