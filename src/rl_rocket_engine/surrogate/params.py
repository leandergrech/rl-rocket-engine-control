"""Parameters of the LUMEN-like surrogate, with where each number comes from.

"Thesis" is Dresia (2025), DLR-FB-2025-16, https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf
(printed page numbers). Values marked *calibrated* are fitted by ``calibrate.py`` to the thesis's
static gains (Table 4.6), settling times (Table 4.7) and TFV overshoot (p. 73); the numbers below are
the fit's starting points, and ``calibrated.json`` next to this file holds the fitted values, which
override them when present (written by ``python -m rl_rocket_engine.surrogate.calibrate``). Values
marked *assumed* are engineering guesses within the ranges the sources allow.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path


@dataclass(frozen=True)
class Params:
    # --- Reference operating point: thesis Table 4.6 (p. 72), the point the step tests start from.
    p_ref: float = 40.0          # chamber pressure [bar]
    x_tfv_ref: float = 0.30      # TFV opening
    x_tov_ref: float = 0.21      # TOV opening
    m_o_ref: float = 3.8         # LOX pump flow [kg/s]
    m_f_ref: float = 2.0         # LNG pump flow [kg/s]
    t_w_ref: float = 473.0       # cooling-channel outlet temperature [K]
    t_lng_ref: float = 280.0     # fuel injection temperature [K]
    w_o_ref: float = 1912.0      # OTP speed [rad/s]; this and the flows are reset to the calibrated
    w_f_ref: float = 3460.0      # steady state (Newton starting point only)

    # --- Propellants and pumps.
    rho_lox: float = 1140.0      # [kg/m^3]
    rho_lng: float = 422.0       # liquid methane near 112 K [kg/m^3]
    psi0: float = 1.45e-3        # pump head coefficient at zero flow [m^2]; with psi1, matches the OTP (22,000 rpm,
    psi1: float = 190.0          # 5.7 kg/s) and FTP (43,000 rpm, 3.5 kg/s) test points, thesis p. 57 and Fig. 4.8
    eta_po: float = 0.65         # pump efficiencies, assumed (peak about 68 %: Traudt et al. 2022, p. 7)
    eta_pf: float = 0.60
    p_tank_o: float = 6.0        # pump inlet pressures [bar], assumed
    p_tank_f: float = 6.0

    # --- Feed system resistances [bar / (kg/s)^2] and inertances [bar s / (kg/s)].
    r_o: float = 0.876           # LOX line + OCV + injector, calibrated (bounds: OCV tests, Table 4.4)
    r_inj: float = 15.0          # fuel mixer + injector, calibrated
    r_rc: float = 2.9            # cooling channels, calibrated
    l_o: float = 0.3             # effective inertances, calibrated; they stand in for feed and pump
    l_f: float = 0.3             # dynamics the model leaves out, so they are far above a real line's

    # --- Fuel circuit.
    m_byp: float = 0.4           # FCV bypass flow [kg/s], Table 4.6 (2.0 - 1.6)
    k_tfv: float = 0.4367        # choked-flow coefficients of the bleed paths, calibrated
    k_tov: float = 0.4256        # (TFV alone: 0.50-0.52 in the Table 4.4 tests; BPV about 0.05 at 0.73)
    k_bpv: float = 0.0379
    valve_exp: float = 0.8       # TFV area ~ opening**0.8 (fit to thesis Table 4.4, p. 68)

    # --- Turbines: torque = flow * (a * jet - b * omega), jet ~ sqrt(T) * sqrt(1 - (p_vent/p_RC)**0.23).
    a_tf: float = 3.09           # turbine constants, calibrated
    b_tf: float = 0.00583
    a_to: float = 3.85
    b_to: float = 0.01323
    p_vent: float = 1.5          # turbine exhaust [bar], assumed
    isen_exp: float = 0.23       # (gamma - 1) / gamma for warm methane, gamma about 1.3
    inertia_o: float = 0.003     # shaft inertias [kg m^2], calibrated
    inertia_f: float = 0.002

    # --- Chamber and heat budget.
    kc: float = 8.133            # c*/A_t [bar / (kg/s)] at ROF 3.4: 40 bar at 3.8 + 3.8/3.4 kg/s (Table 4.6)
    cstar_k: float = 0.03        # c* curvature in ROF, calibrated
    cstar_r0: float = 3.1        # ROF of peak c*, calibrated (LOX/methane c* peaks near ROF 3)
    q_ref: float = 1.751e6       # wall heat into the coolant at p_ref [W] (thesis Fig. 4.6 reads about 1.75 MW)
    q_exp: float = 0.8           # Q ~ p_cc^0.8 (thesis p. 63)
    k_tlng: float = 0.3          # heat-flux increase per 100 K of injection temperature (thesis eq. 4.2), calibrated
    cp: float = 3100.0           # effective coolant heat capacity [J/(kg K)], calibrated
    t_in: float = 120.0          # coolant inlet temperature [K] (thesis Table 4.4: 119-127 K at FCV)
    c_th: float = 1.1e5          # lumped thermal mass of wall, piping and valves [J/K], calibrated
    k_lng: float = 0.435         # injection temperature follows the coolant: -47.8 K per -109.8 K (Table 4.6)
    tau_lng: float = 4.0         # extra lag of the injection temperature [s], calibrated

    # --- Valves (thesis Fig. 4.10 and Table A.3).
    valve_delay: float = 0.05    # dead time [s], middle of the randomised 0.03-0.08 s
    valve_vmax: float = 2.0      # [1/s]: full stroke in about 0.5 s (Traudt et al. 2022, p. 8)
    valve_amax: float = 20.0     # [1/s^2], assumed
    valve_tau: float = 0.02      # velocity loop time constant [s], assumed
    valve_tau_pos: float = 0.05  # position loop time constant near the target [s], assumed: no overshoot,
    valve_brake: float = 0.5     # braking at this fraction of valve_amax (thesis p. 56: "no overshoot")

    # --- Malfunctions (faults.py). All zero on the healthy engine.
    drag_o: float = 0.0          # extra bearing friction on the LOX turbopump, as a fraction of its pump torque
    drag_f: float = 0.0          # the same on the fuel turbopump
    leak_o: float = 0.0          # fraction of the LOX pump flow lost before the injector
    leak_f: float = 0.0          # fraction of the fuel pump flow lost before the cooling channels
    stuck_tfv: float = 0.0       # 1: the valve is frozen where it is
    stuck_tov: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Params":
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


CALIBRATED = Path(__file__).with_name("calibrated.json")


def load_params() -> Params:
    if CALIBRATED.exists():
        return Params.from_dict(json.loads(CALIBRATED.read_text())["params"])
    return Params()


DEFAULT_PARAMS = load_params()
