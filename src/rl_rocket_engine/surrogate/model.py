"""A reduced, LUMEN-like model of a LOX/LNG expander-bleed engine.

This is a teaching and tooling surrogate, not DLR's simulator. DLR's LUMEN model is an EcosimPro/ESPSS
model with component maps that are not published. This model keeps the structure the Dresia (2025)
thesis describes and is calibrated to the numbers it publishes (see ``params.py`` and
``docs/primer/8-lab.md``, "Model card"):

* two independent turbopumps, each a shaft with an impulse turbine and a centrifugal pump
  (dimensionless pump head map, thesis eq. 4.4; turbine torque falling with blade speed, eq. 4.5);
* an expander-bleed fuel circuit: the fuel pump feeds a cold bypass (FCV, fixed) and the regenerative
  cooling channels; the warm methane drives both turbines (TFV, TOV) and is vented, part is vented by
  BPV, the rest is injected;
* the wall heat flux into the coolant scales as p_cc^0.8 (thesis Fig. 4.6) and is stored in a lumped
  thermal mass, which is what makes the fuel side slow;
* chamber pressure from the characteristic velocity, p_cc = (c*/A_t) * total injected flow;
* electromechanical valves with dead time, velocity and acceleration limits (thesis Fig. 4.10).

Pressures are in bar, flows in kg/s, temperatures in K, shaft speeds in rad/s.

The same equations are implemented in ``docs/javascripts/lumen-model.js`` for the in-browser Lab;
``tests/test_lab_model.py`` checks that the two agree.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

from .params import DEFAULT_PARAMS, Params

# State layout (a flat list keeps the Python and JavaScript ports line-for-line comparable).
X_TFV, V_TFV, X_TOV, V_TOV, W_O, W_F, M_O, M_F, T_W, T_LNG = range(10)
STATE_NAMES = ("x_tfv", "v_tfv", "x_tov", "v_tov", "w_o", "w_f", "m_o", "m_f", "t_w", "t_lng")
RPM = 60.0 / (2.0 * math.pi)


def valve_area(x: float, p: Params) -> float:
    """Relative effective area of a turbine valve at opening x (thesis Table 4.4 fits x**0.8)."""
    x = min(max(x, 0.0), 1.0)
    return x ** p.valve_exp


def cstar_factor(rof: float, p: Params) -> float:
    """c*(ROF) / c*(3.4): a parabola peaking at ROF = cstar_r0, equal to 1 at the reference ROF 3.4."""
    rof = min(max(rof, 1.5), 6.0)
    f = 1.0 - p.cstar_k * (rof - p.cstar_r0) ** 2
    f_ref = 1.0 - p.cstar_k * (3.4 - p.cstar_r0) ** 2
    return f / f_ref


def pump_dp(w: float, m: float, rho: float, p: Params) -> float:
    """Pump pressure rise [bar] from the head map psi+ = psi0 - psi1 * phi+ (thesis eq. 4.4)."""
    return (rho * p.psi0 * w * w - p.psi1 * w * m) * 1e-5


def algebraic(s: list[float], p: Params) -> dict:
    """Quantities that follow instantly from the state: injected fuel, pressures, turbine flows."""
    m_o, m_f, t_w = s[M_O], s[M_F], max(s[T_W], 150.0)
    root_t = math.sqrt(t_w)
    a_tfv, a_tov = valve_area(s[X_TFV], p), valve_area(s[X_TOV], p)
    # Bleed conductances: choked flow m = k * area * p_RC / sqrt(T_w).
    s_f = p.k_tfv * a_tfv / root_t
    s_o = p.k_tov * a_tov / root_t
    s_b = p.k_bpv / root_t
    s_tot = s_f + s_o + s_b
    # Injected fuel solves m_inj = m_f - s_tot * p_RC with p_RC = p_cc + R_inj m_inj^2 and
    # p_cc = Kc(ROF) (m_o + m_inj): a quadratic in m_inj for a given Kc. Kc depends weakly on the
    # mixture ratio (c* peaks near ROF 3 for LOX/methane), so two passes update it.
    kc = p.kc
    for _ in range(2):
        qa = s_tot * p.r_inj
        qb = 1.0 + s_tot * kc
        qc = m_f - s_tot * kc * m_o
        if qa > 1e-12:
            disc = max(qb * qb + 4.0 * qa * qc, 0.0)
            m_inj = (-qb + math.sqrt(disc)) / (2.0 * qa)
        else:
            m_inj = qc / qb
        m_inj = max(m_inj, 1e-6)
        kc = p.kc * cstar_factor(m_o / m_inj, p)
    p_cc = kc * (m_o + m_inj)
    p_rc = p_cc + p.r_inj * m_inj * m_inj
    m_tf, m_to, m_bpv = s_f * p_rc, s_o * p_rc, s_b * p_rc
    m_rc = m_f - p.m_byp
    # Turbine torque of an impulse turbine: proportional to flow times (jet speed - blade speed);
    # the jet speed scales with sqrt(T_w) and weakly with the pressure ratio to the vent.
    jet = root_t * math.sqrt(max(1.0 - (p.p_vent / max(p_rc, p.p_vent + 1e-3)) ** p.isen_exp, 0.0))
    tq_tf = m_tf * (p.a_tf * jet - p.b_tf * s[W_F])
    tq_to = m_to * (p.a_to * jet - p.b_to * s[W_O])
    dp_o = pump_dp(s[W_O], m_o, p.rho_lox, p)
    dp_f = pump_dp(s[W_F], m_f, p.rho_lng, p)
    tq_po = m_o * dp_o * 1e5 / (p.rho_lox * p.eta_po * max(s[W_O], 1.0))
    tq_pf = m_f * dp_f * 1e5 / (p.rho_lng * p.eta_pf * max(s[W_F], 1.0))
    q_wall = p.q_ref * (max(p_cc, 1.0) / p.p_ref) ** p.q_exp * (1.0 + p.k_tlng * (s[T_LNG] - p.t_lng_ref) / 100.0)
    return dict(m_inj=m_inj, p_cc=p_cc, p_rc=p_rc, m_tf=m_tf, m_to=m_to, m_bpv=m_bpv, m_rc=m_rc,
                tq_tf=tq_tf, tq_to=tq_to, tq_po=tq_po, tq_pf=tq_pf, dp_o=dp_o, dp_f=dp_f, q_wall=q_wall)


def derivatives(s: list[float], u_tfv: float, u_tov: float, p: Params) -> tuple[list[float], dict]:
    """Time derivatives of the state for valve targets (after dead time) u_tfv, u_tov."""
    a = algebraic(s, p)
    d = [0.0] * 10
    for xi, vi, u in ((X_TFV, V_TFV, u_tfv), (X_TOV, V_TOV, u_tov)):
        # Positioner: full speed far from the target, braking at a fraction of the maximum
        # deceleration, and a linear zone near the target so the valve settles without overshoot.
        err = u - s[xi]
        v_des = math.copysign(min(math.sqrt(2.0 * p.valve_brake * p.valve_amax * abs(err)), p.valve_vmax,
                                  abs(err) / p.valve_tau_pos), err)
        d[xi] = s[vi]
        d[vi] = max(-p.valve_amax, min(p.valve_amax, (v_des - s[vi]) / p.valve_tau))
    d[W_O] = (a["tq_to"] - a["tq_po"]) / p.inertia_o
    d[W_F] = (a["tq_tf"] - a["tq_pf"]) / p.inertia_f
    d[M_O] = (p.p_tank_o + a["dp_o"] - (a["p_cc"] + p.r_o * s[M_O] * abs(s[M_O]))) / p.l_o
    p_f_req = a["p_rc"] + p.r_rc * a["m_rc"] * abs(a["m_rc"])
    d[M_F] = (p.p_tank_f + a["dp_f"] - p_f_req) / p.l_f
    d[T_W] = (a["q_wall"] - a["m_rc"] * p.cp * (s[T_W] - p.t_in)) / p.c_th
    t_lng_ss = p.t_lng_ref + p.k_lng * (s[T_W] - p.t_w_ref)
    d[T_LNG] = (t_lng_ss - s[T_LNG]) / p.tau_lng
    return d, a


def outputs(s: list[float], p: Params, a: dict | None = None) -> dict:
    """Physical outputs a test bench would measure (before sensor dynamics and noise)."""
    a = a or algebraic(s, p)
    return dict(
        p_cc=a["p_cc"], rof=s[M_O] / a["m_inj"], m_lox=s[M_O], m_lng=s[M_F], m_inj=a["m_inj"],
        m_rc=a["m_rc"], t_rc=s[T_W], t_lng=s[T_LNG], n_otp=s[W_O] * RPM, n_ftp=s[W_F] * RPM,
        p_rc=a["p_rc"], m_tf=a["m_tf"], m_to=a["m_to"], m_bpv=a["m_bpv"], q_wall=a["q_wall"],
        x_tfv=s[X_TFV], x_tov=s[X_TOV],
    )


@dataclass
class EngineModel:
    """Integrates the surrogate between control steps; valve commands pass through a dead time."""

    params: Params = field(default_factory=lambda: DEFAULT_PARAMS)
    dt: float = 0.002
    state: list[float] = field(default_factory=list)
    t: float = 0.0
    _queue: list[tuple[float, float, float]] = field(default_factory=list)
    _u: tuple[float, float] = (0.3, 0.21)

    def reset(self, x_tfv: float | None = None, x_tov: float | None = None) -> dict:
        p = self.params
        x_tfv = p.x_tfv_ref if x_tfv is None else x_tfv
        x_tov = p.x_tov_ref if x_tov is None else x_tov
        self.state = steady_state(x_tfv, x_tov, p)
        self.t = 0.0
        self._queue = []
        self._u = (x_tfv, x_tov)
        return outputs(self.state, p)

    def command(self, u_tfv: float, u_tov: float) -> None:
        """Issue a valve command now; it takes effect after the valve dead time."""
        self._queue.append((self.t + self.params.valve_delay, min(max(u_tfv, 0.0), 1.0), min(max(u_tov, 0.0), 1.0)))

    def advance(self, duration: float) -> dict:
        n = max(1, int(round(duration / self.dt)))
        p, s = self.params, self.state
        a = None
        for _ in range(n):
            while self._queue and self._queue[0][0] <= self.t + 1e-12:
                _, ut, uo = self._queue.pop(0)
                self._u = (ut, uo)
            d, a = derivatives(s, self._u[0], self._u[1], p)
            # Semi-implicit update: velocities first, then positions with the new velocities.
            s[V_TFV] += self.dt * d[V_TFV]
            s[V_TOV] += self.dt * d[V_TOV]
            d[X_TFV], d[X_TOV] = s[V_TFV], s[V_TOV]
            for i in (X_TFV, X_TOV, W_O, W_F, M_O, M_F, T_W, T_LNG):
                s[i] += self.dt * d[i]
            for xi, vi in ((X_TFV, V_TFV), (X_TOV, V_TOV)):
                if s[xi] < 0.0 or s[xi] > 1.0:
                    s[xi] = min(max(s[xi], 0.0), 1.0)
                    s[vi] = 0.0
            self.t += self.dt
        return outputs(s, p)

    def with_params(self, **changes) -> "EngineModel":
        return EngineModel(params=replace(self.params, **changes), dt=self.dt)


def steady_state(x_tfv: float, x_tov: float, p: Params = DEFAULT_PARAMS, guess: list[float] | None = None) -> list[float]:
    """Steady state for fixed valve openings, by Newton's method on the five slow equations."""
    s = list(guess) if guess else [x_tfv, 0.0, x_tov, 0.0, p.w_o_ref, p.w_f_ref, p.m_o_ref, p.m_f_ref, p.t_w_ref, p.t_lng_ref]
    s[X_TFV], s[V_TFV], s[X_TOV], s[V_TOV] = x_tfv, 0.0, x_tov, 0.0
    idx = (W_O, W_F, M_O, M_F, T_W)
    scale = (100.0, 100.0, 0.05, 0.05, 5.0)
    for _ in range(80):
        s[T_LNG] = p.t_lng_ref + p.k_lng * (s[T_W] - p.t_w_ref)  # the lag has settled too
        d, _a = derivatives(s, x_tfv, x_tov, p)
        f = [d[i] for i in idx]
        if max(abs(v) for v in f) < 1e-9:
            break
        jac = []
        for j, sj in zip(idx, scale):
            sp = list(s)
            sp[j] += sj * 1e-4
            sp[T_LNG] = p.t_lng_ref + p.k_lng * (sp[T_W] - p.t_w_ref)
            dp, _ = derivatives(sp, x_tfv, x_tov, p)
            jac.append([(dp[i] - f[k]) / (sj * 1e-4) for k, i in enumerate(idx)])
        # jac[j][k] = d f_k / d s_j; solve J^T dx = -f.
        step = _solve([[jac[j][k] for j in range(5)] for k in range(5)], [-v for v in f])
        lam = 1.0
        for _ in range(20):
            trial = list(s)
            for j, sj in zip(idx, step):
                trial[j] += lam * sj
            if trial[T_W] > 150.0 and trial[M_F] > p.m_byp and trial[W_O] > 50.0 and trial[W_F] > 50.0:
                break
            lam *= 0.5
        s = trial
    s[T_LNG] = p.t_lng_ref + p.k_lng * (s[T_W] - p.t_w_ref)
    return s


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting (small dense systems; mirrored in JavaScript)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[piv] = m[piv], m[c]
        if abs(m[c][c]) < 1e-300:
            continue
        for r in range(c + 1, n):
            f = m[r][c] / m[c][c]
            for k in range(c, n + 1):
                m[r][k] -= f * m[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        acc = m[r][n] - sum(m[r][k] * x[k] for k in range(r + 1, n))
        x[r] = acc / m[r][r] if abs(m[r][r]) > 1e-300 else 0.0
    return x
