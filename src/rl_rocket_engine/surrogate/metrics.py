"""Episode metrics shared by the baselines, the evaluation script and the tests."""

from __future__ import annotations

import numpy as np

def episode_metrics(log: list[dict], band: float = 0.02, dt: float | None = None) -> dict:
    """MAPE and IAE per output, settling time after set-point steps, valve travel, constraint violations.

    Settling time: for each step in a reference (a jump of more than 1 % between two samples, with the
    reference held on both sides, so samples of a ramp do not count), the time until the output enters
    and stays in a band of +-2 % of the new set point, until the next change.
    """
    if dt is None:  # the control interval, from the time stamps of the log
        dt = log[1]["t"] - log[0]["t"] if len(log) > 1 and "t" in log[0] else 0.05
    p = np.array([s["p_cc"] for s in log])
    pr = np.array([s["p_ref"] for s in log])
    r = np.array([s["rof"] for s in log])
    rr = np.array([s["rof_ref"] for s in log])
    out = dict(
        mape_p=float(100 * np.mean(np.abs(p - pr) / pr)),
        mape_rof=float(100 * np.mean(np.abs(r - rr) / rr)),
        iae_p=float(np.sum(np.abs(p - pr)) * dt),
        iae_rof=float(np.sum(np.abs(r - rr)) * dt),
        valve_travel=float(sum(s["du"] for s in log)),
        violations=int(sum(sum(s["violations"].values()) for s in log)),
        violation_s=float(sum(sum(s["violations"].values()) for s in log) * dt),  # comparable across rates
        reward=float(sum(s.get("reward", 0.0) for s in log)),
    )
    for name, y, ref in (("p", p, pr), ("rof", r, rr)):
        d = np.abs(np.diff(ref, prepend=ref[0], append=ref[-1]))  # d[i] = |ref[i] - ref[i-1]|, padded
        held = d < 1e-9
        jumps = np.array([i for i in range(1, len(ref)) if d[i] / ref[i - 1] > 0.01 and held[i - 1] and held[i + 1]], int)
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
                times.append(((last[-1] + 1) if len(last) else 0) * dt)
        out[f"settle_{name}"] = float(np.nanmean(times)) if times and not np.all(np.isnan(times)) else float("nan")
        out[f"unsettled_{name}"] = int(np.sum(np.isnan(times))) if times else 0
        out[f"steps_{name}"] = len(times)
    return out


def summarise(rows: list[dict]) -> dict:
    """Means over episodes; settled_* is the share of all set-point steps that settled (pooled)."""
    keys = rows[0].keys()
    out = {k: float(np.nanmean([r[k] for r in rows])) for k in keys}
    for name in ("p", "rof"):
        n = sum(r[f"steps_{name}"] for r in rows)
        out[f"settled_{name}"] = float(1 - sum(r[f"unsettled_{name}"] for r in rows) / n) if n else float("nan")
    return out
