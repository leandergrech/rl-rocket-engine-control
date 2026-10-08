"""Write the 20 Hz result tables and charts into docs/04a-surrogate-baselines.md from data/results/.

    python scripts/make_baseline_docs.py      # after scripts/evaluate.py

The blocks between ``<!-- BEGIN generated: NAME -->`` and ``<!-- END generated: NAME -->`` are replaced;
the prose around them is written by hand. Surrogate results, not DLR's simulator.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from evaluate import label  # noqa: E402
from rl_rocket_engine.surrogate.scenarios import load as load_scenarios  # noqa: E402

PAGE = ROOT / "docs" / "04a-surrogate-baselines.md"
RESULTS = ROOT / "data" / "results"
CURRENT = ["open-loop", "pi", "pi-bw", "ppo", "sac"]
LEGACY = ["ppo-preview", "ppo-nopreview", "sac-preview", "sac-nopreview"]


def f(v, d=2):
    return "–" if v is None or (isinstance(v, float) and not math.isfinite(v)) else f"{v:.{d}f}"


def chart(spec: dict) -> str:
    return "```vegalite\n" + json.dumps(spec, indent=1) + "\n```"


def results_block(summary: dict, bw: dict) -> str:
    rows = ["| Controller | MAPE $p_{cc}$ [%] | MAPE $R_{OF}$ [%] | Steps settled $p_{cc}$ / $R_{OF}$ | Settling $p_{cc}$ / $R_{OF}$ [s] "
            "| Valve travel | Over a limit [s] | Randomised MAPE $p_{cc}$ / $R_{OF}$ [%] | Training |", "|---|---|---|---|---|---|---|---|---|"]
    for name in CURRENT:
        r = summary[name]
        t, d = r["test"], r["test_randomised"]
        train = r.get("training")
        if name == "pi":
            how = "Nelder–Mead, 12 episodes"
        elif name == "pi-bw":
            how = f"SIMC rules at {bw['default'][0]:.2f} / {bw['default'][1]:.2f} Hz"
        elif train:
            steps = train["steps"]
            how = f"{steps / 1e6:.1f} M steps, {train['wall_min']:.0f} min" if steps >= 1e6 else f"{steps / 1e3:.0f} k steps, {train['wall_min']:.0f} min"
        else:
            how = "–"
        rows.append(f"| {label(name)} | {f(t['mape_p'])} | {f(t['mape_rof'])} | {100 * t['settled_p']:.0f} % / {100 * t['settled_rof']:.0f} % "
                    f"| {f(t['settle_p'], 1)} / {f(t['settle_rof'], 1)} | {f(t['valve_travel'])} | {f(t['violation_s'], 2)} "
                    f"| {f(d['mape_p'])} / {f(d['mape_rof'])} | {how} |")
    values = []
    for name in CURRENT + LEGACY:
        r = summary[name]
        for cond, block in (("nominal", "test"), ("randomised", "test_randomised")):
            values.append(dict(controller=label(name), rate="10 Hz (earlier)" if name in LEGACY else "20 Hz",
                               condition=cond, mape_p=round(r[block]["mape_p"], 3), mape_rof=round(r[block]["mape_rof"], 3)))
    spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
        "title": {"text": "Chamber-pressure error at 20 Hz, and the earlier 10 Hz agents",
                  "subtitle": "MAPE on 20 held-out episodes, log scale. Filled: nominal engine; hollow: domain-randomised (thesis Table A.3). Surrogate, not DLR's simulator; data/results/summary.json"},
        "width": "container", "height": 300,
        "data": {"values": values},
        "encoding": {
            "y": {"field": "controller", "type": "nominal", "sort": None, "title": None, "axis": {"labelLimit": 240}},
            "x": {"field": "mape_p", "type": "quantitative", "scale": {"type": "log", "domain": [0.2, 10]}, "title": "MAPE p_cc (%), log scale"},
            "color": {"field": "rate", "type": "nominal", "scale": {"domain": ["20 Hz", "10 Hz (earlier)"], "range": ["var(--viz-s1)", "var(--viz-muted)"]}, "legend": {"title": None}},
            "tooltip": [{"field": "controller"}, {"field": "condition"}, {"field": "mape_p", "title": "MAPE p_cc (%)"}, {"field": "mape_rof", "title": "MAPE ROF (%)"}],
        },
        "layer": [
            {"transform": [{"pivot": "condition", "value": "mape_p", "groupby": ["controller", "rate"]}],
             "mark": {"type": "rule", "strokeWidth": 2, "color": "var(--viz-axis)"},
             "encoding": {"x": {"field": "nominal", "type": "quantitative"}, "x2": {"field": "randomised"}, "color": {"value": "var(--viz-axis)"}}},
            {"transform": [{"filter": "datum.condition == 'nominal'"}], "mark": {"type": "point", "filled": True, "size": 110, "stroke": "var(--md-default-bg-color)", "strokeWidth": 2}},
            {"transform": [{"filter": "datum.condition == 'randomised'"}], "mark": {"type": "point", "filled": False, "size": 110, "strokeWidth": 2}},
        ],
    }
    return "\n".join(rows) + "\n\nMean over the same 20 held-out episodes as before (seeds 1000–1019). Settling: time to stay within ±2 % of a new set point after a step. Over a limit: seconds per episode with at least one constraint of thesis Table 5.1 broken (seconds, not steps, so the 10 and 20 Hz rows compare). Randomised: the same episodes with the engine and sensors drawn from DLR's ranges.\n{: .caption }\n\n" + chart(spec)


def scenarios_block(summary: dict) -> str:
    scen = load_scenarios()
    tcs = list(scen)
    names = CURRENT + LEGACY
    head = "| Controller | " + " | ".join(f"{scen[k]['test_case']}. {scen[k]['label']}" for k in tcs) + " |"
    rows = [head, "|---|" + "---|" * len(tcs)]
    best = {k: min(names, key=lambda n: summary[n]["scenarios"][k]["mape_p"]) for k in tcs}
    values = []
    for name in names:
        cells = []
        for k in tcs:
            m = summary[name]["scenarios"][k]
            txt = f"{m['mape_p']:.2f} / {m['mape_rof']:.2f}" + (f" · {m['violation_s']:.1f} s" if m["violation_s"] > 0.05 else "")
            cells.append(f"**{txt}**" if best[k] == name else txt)
            values.append(dict(controller=label(name), case=f"{scen[k]['test_case']}. {scen[k]['label']}", mape_p=round(m["mape_p"], 2),
                               mape_rof=round(m["mape_rof"], 2), over_s=round(m["violation_s"], 2)))
        rows.append(f"| {label(name)} | " + " | ".join(cells) + " |")
    spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
        "title": {"text": "Every controller through the challenge's seven test cases",
                  "subtitle": "Chamber-pressure MAPE (%) of one episode per cell; darker is worse. Test cases in miniature on the surrogate, not DLR's simulator; scenarios.json, data/results/summary.json"},
        "width": "container", "height": 330,
        "data": {"values": values},
        "encoding": {
            "x": {"field": "case", "type": "nominal", "sort": None, "title": None, "axis": {"labelAngle": -30, "labelLimit": 180}},
            "y": {"field": "controller", "type": "nominal", "sort": None, "title": None, "axis": {"labelLimit": 220}},
            "tooltip": [{"field": "controller"}, {"field": "case", "title": "test case"}, {"field": "mape_p", "title": "MAPE p_cc (%)"},
                        {"field": "mape_rof", "title": "MAPE ROF (%)"}, {"field": "over_s", "title": "over a limit (s)"}],
        },
        "layer": [
            {"mark": {"type": "rect", "stroke": "var(--md-default-bg-color)", "strokeWidth": 2},
             "encoding": {"color": {"field": "mape_p", "type": "quantitative", "scale": {"type": "log", "range": ["var(--viz-ord-3)", "var(--viz-ord-1)"]}, "legend": {"title": "MAPE p_cc (%)"}}}},
            {"mark": {"type": "text", "fontSize": 11},
             "encoding": {"text": {"field": "mape_p", "type": "quantitative", "format": ".2f"},
                          "color": {"condition": {"test": "datum.mape_p > 2", "value": "var(--viz-seq-label)"}, "value": "var(--viz-ink)"}}},
        ],
    }
    return ("\n".join(rows) + "\n\nOne episode per cell, sensor noise on (seed 0): mean chamber-pressure / mixture-ratio error in percent, and the seconds spent over a limit when there were any. "
            "**Bold**: the lowest pressure error in the column. The 10 Hz agents run at their own rate; the others at 20 Hz.\n{: .caption }\n\n" + chart(spec))


def bandwidth_block(bw: dict) -> str:
    values = []
    for loop, name in (("p", "pressure loop swept"), ("rof", "mixture-ratio loop swept")):
        for fb, m in bw[loop].items():
            pm = m[f"margin_{loop}"]["pm"]
            for out, key in (("chamber pressure", "mape_p"), ("mixture ratio", "mape_rof")):
                values.append(dict(sweep=name, bandwidth=float(fb), output=out, mape=round(m[key], 3), pm=round(pm, 1)))
    d_p, d_r = bw["default"]
    spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
        "title": {"text": "The PI's bandwidth: faster loops, until the delay bites",
                  "subtitle": f"MAPE on 10 held-out episodes, one loop's bandwidth swept, the other at its default ({d_p:.2f} / {d_r:.2f} Hz). Surrogate, not DLR's simulator; data/results/pi_bandwidth.json"},
        "width": "container", "height": 220,
        "data": {"values": values},
        "facet": {"column": {"field": "sweep", "type": "nominal", "title": None, "sort": ["pressure loop swept", "mixture-ratio loop swept"]}},
        "spec": {
            "width": 300, "height": 200,
            "layer": [
                {"mark": {"type": "line", "point": {"filled": True, "size": 60}, "strokeWidth": 2},
                 "encoding": {"x": {"field": "bandwidth", "type": "quantitative", "scale": {"type": "log"}, "title": "closed-loop bandwidth (Hz), log scale"},
                              "y": {"field": "mape", "type": "quantitative", "scale": {"type": "log"}, "title": "MAPE (%), log scale"},
                              "color": {"field": "output", "type": "nominal", "scale": {"domain": ["chamber pressure", "mixture ratio"], "range": ["var(--viz-s1)", "var(--viz-s2)"]}, "legend": {"title": None}},
                              "tooltip": [{"field": "bandwidth", "title": "bandwidth (Hz)"}, {"field": "output"}, {"field": "mape", "title": "MAPE (%)"}, {"field": "pm", "title": "phase margin of the swept loop (°)"}]}},
            ],
        },
    }
    return chart(spec)


def curves_block() -> str:
    values = []
    for name in ("ppo", "sac"):
        meta = json.loads((ROOT / "data" / "policies" / f"{name}.train.json").read_text())
        curve = meta["curve"]
        step = max(1, len(curve) // 120)
        for i in range(0, len(curve), step):
            window = [c[1] for c in curve[max(0, i - step * 3):i + 1]]
            values.append(dict(agent=label(name), minutes=round(curve[i][2] / 60, 2), steps=curve[i][0], ret=round(sum(window) / len(window), 1)))
    spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
        "title": {"text": "Learning at 20 Hz, against the wall clock",
                  "subtitle": "Training episode return (30 s, 600 steps), smoothed; laptop CPU. Surrogate, not DLR's simulator; data/policies/{ppo,sac}.train.json"},
        "width": "container", "height": 220,
        "data": {"values": values},
        "mark": {"type": "line", "strokeWidth": 2, "interpolate": "monotone"},
        "encoding": {
            "x": {"field": "minutes", "type": "quantitative", "title": "wall-clock minutes"},
            "y": {"field": "ret", "type": "quantitative", "title": "episode return", "scale": {"zero": False}},
            "color": {"field": "agent", "type": "nominal", "scale": {"range": ["var(--viz-s1)", "var(--viz-s2)"]}, "legend": {"title": None}},
            "tooltip": [{"field": "agent"}, {"field": "minutes"}, {"field": "steps", "title": "environment steps"}, {"field": "ret", "title": "return"}],
        },
    }
    return chart(spec)


def main() -> None:
    summary = json.loads((RESULTS / "summary.json").read_text())
    bw = json.loads((RESULTS / "pi_bandwidth.json").read_text())
    blocks = {"results20": results_block(summary, bw), "curves20": curves_block(), "scenarios": scenarios_block(summary), "bandwidth": bandwidth_block(bw)}
    text = PAGE.read_text()
    for name, body in blocks.items():
        begin, end = f"<!-- BEGIN generated: {name} -->", f"<!-- END generated: {name} -->"
        pat = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.S)
        if not pat.search(text):
            raise SystemExit(f"marker for {name} not found in {PAGE.name}")
        text = pat.sub(lambda m: f"{begin}\n{body}\n{end}", text)
    PAGE.write_text(text)
    print(f"updated {', '.join(blocks)} in {PAGE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
