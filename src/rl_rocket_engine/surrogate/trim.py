"""Inverse steady-state map: which TFV/TOV openings hold a given chamber pressure and mixture ratio.

The PI baseline uses the trim table for feedforward and gain scheduling, the environment uses it to
start episodes in equilibrium, and the docs plot it as the surrogate's operating envelope.
"""

from __future__ import annotations

import math

from .model import outputs, steady_state
from .params import DEFAULT_PARAMS, Params


def trim(p_cc: float, rof: float, p: Params = DEFAULT_PARAMS, guess: tuple[float, float] | None = None,
         tol: float = 1e-6) -> tuple[float, float, list[float]]:
    """Valve openings (x_tfv, x_tov) and the steady state at which the engine sits at (p_cc, rof).

    Newton's method on the two openings, each evaluation a nested steady-state solve. Raises
    ValueError if the point is outside what the two valves can reach.
    """
    x = list(guess or (p.x_tfv_ref, p.x_tov_ref))
    s = steady_state(x[0], x[1], p)
    target = (p_cc / p.p_ref, rof / 3.4)
    for _ in range(40):
        o = outputs(s, p)
        f = (o["p_cc"] / p.p_ref - target[0], o["rof"] / 3.4 - target[1])
        if max(abs(v) for v in f) < tol:
            return x[0], x[1], s
        h = 1e-4
        cols = []
        for j in range(2):
            xp = list(x)
            xp[j] += h
            op = outputs(steady_state(xp[0], xp[1], p, guess=s), p)
            cols.append(((op["p_cc"] / p.p_ref - o["p_cc"] / p.p_ref) / h, (op["rof"] / 3.4 - o["rof"] / 3.4) / h))
        (a, c), (b, d) = cols  # Jacobian [[a, b], [c, d]] with columns per valve
        det = a * d - b * c
        if abs(det) < 1e-12:
            break
        dx = ((-f[0] * d + f[1] * b) / det, (f[0] * c - f[1] * a) / det)
        lam = 1.0
        while lam > 1e-3:
            xn = [min(max(x[0] + lam * dx[0], 0.02), 1.0), min(max(x[1] + lam * dx[1], 0.02), 1.0)]
            sn = steady_state(xn[0], xn[1], p, guess=s)
            on = outputs(sn, p)
            fn = (on["p_cc"] / p.p_ref - target[0], on["rof"] / 3.4 - target[1])
            if math.isfinite(fn[0]) and max(abs(v) for v in fn) < max(abs(v) for v in f):
                break
            lam *= 0.5
        x, s = xn, sn
    raise ValueError(f"no trim for p_cc={p_cc:.1f} bar, ROF={rof:.2f}")


def gains(x_tfv: float, x_tov: float, p: Params = DEFAULT_PARAMS, h: float = 0.01) -> list[list[float]]:
    """Static gain matrix d(p_cc, ROF)/d(TFV, TOV) at the given openings (central differences)."""
    s0 = steady_state(x_tfv, x_tov, p)
    cols = []
    for j in range(2):
        lo, hi = [x_tfv, x_tov], [x_tfv, x_tov]
        lo[j] -= h
        hi[j] += h
        o_lo = outputs(steady_state(lo[0], lo[1], p, guess=s0), p)
        o_hi = outputs(steady_state(hi[0], hi[1], p, guess=s0), p)
        cols.append(((o_hi["p_cc"] - o_lo["p_cc"]) / (2 * h), (o_hi["rof"] - o_lo["rof"]) / (2 * h)))
    return [[cols[0][0], cols[1][0]], [cols[0][1], cols[1][1]]]


def trim_table(pressures, ratios, p: Params = DEFAULT_PARAMS) -> dict:
    """Trim openings and static gains on a grid, by continuation from the reference point."""
    rows = []
    start = (p.x_tfv_ref, p.x_tov_ref)
    for pc in pressures:
        row = []
        guess = start
        for r in ratios:
            try:
                xt, xo, s = trim(pc, r, p, guess=guess)
                o = outputs(s, p)
                row.append(dict(x_tfv=xt, x_tov=xo, t_w=o["t_rc"], n_otp=o["n_otp"], n_ftp=o["n_ftp"],
                                p_rc=o["p_rc"], m_turbines=o["m_tf"] + o["m_to"], gain=gains(xt, xo, p)))
                guess = (xt, xo)
            except ValueError:
                row.append(None)
        if row and row[0]:
            start = (row[0]["x_tfv"], row[0]["x_tov"])
        rows.append(row)
    return dict(p_cc=list(pressures), rof=list(ratios), points=rows)
