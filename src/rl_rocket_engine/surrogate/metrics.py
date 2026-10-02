"""Episode metrics shared by the baselines, the evaluation script and the tests."""

from __future__ import annotations

import numpy as np

DT = 0.1


def episode_metrics(log: list[dict], band: float = 0.02) -> dict:
    """MAPE and IAE per output, settling time after set-point steps, valve travel, constraint violations.

    Settling time: for each step in a reference (a jump of more than 1 % between two samples), the time
    until the output enters and stays in a band of +-2 % of the new set point, until the next change.
    """
    p = np.array([s["p_cc"] for s in log])
    pr = np.array([s["p_ref"] for s in log])
    r = np.array([s["rof"] for s in log])
    rr = np.array([s["rof_ref"] for s in log])
    out = dict(
        mape_p=float(100 * np.mean(np.abs(p - pr) / pr)),
        mape_rof=float(100 * np.mean(np.abs(r - rr) / rr)),
        iae_p=float(np.sum(np.abs(p - pr)) * DT),
        iae_rof=float(np.sum(np.abs(r - rr)) * DT),
        valve_travel=float(sum(s["du"] for s in log)),
        violations=int(sum(sum(s["violations"].values()) for s in log)),
        reward=float(sum(s.get("reward", 0.0) for s in log)),
    )
    for name, y, ref in (("p", p, pr), ("rof", r, rr)):
        jumps = np.where(np.abs(np.diff(ref)) / ref[:-1] > 0.01)[0] + 1
        changes = np.where(np.abs(np.diff(ref)) > 1e-9)[0] + 1
        times = []
        for j in jumps:
            nxt = changes[changes > j]
            end = nxt[0] if len(nxt) else len(ref)
            outside = np.abs(y[j:end] - ref[j:end]) > band * np.abs(ref[j:end])
            if outside[-1]:
                times.append(np.nan)  # never settled before the next change
            else:
                last = np.where(outside)[0]
                times.append(((last[-1] + 1) if len(last) else 0) * DT)
        out[f"settle_{name}"] = float(np.nanmean(times)) if times and not np.all(np.isnan(times)) else float("nan")
        out[f"unsettled_{name}"] = int(np.sum(np.isnan(times))) if times else 0
    return out


def summarise(rows: list[dict]) -> dict:
    keys = rows[0].keys()
    return {k: float(np.nanmean([r[k] for r in rows])) for k in keys}
