---
icon: re/clock
---

# :re-clock: Fast chamber, slow heat

!!! abstract "The question"

    How fast does each output answer each valve, and why is one valve a hundred times slower than the other?

## Three layers of dynamics

Three layers of dynamics sit on top of each other:

| Process | Time scale | Source |
|---|---|---|
| Chamber filling and combustion delay | short compared with pump and thermal dynamics (first-order lag + dead time) | [thesis eq. 2.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=25) |
| Oxidiser-side valve steps (TOV, OCV) | "mostly … less than 1 s" (TOV 0.4–0.6 s on all outputs) | [thesis Table 4.7](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=91) |
| Fuel-side valve steps (TFV) | 5.4–23.8 s settling depending on output | same |
| Fuel injection temperature | mean 12.1 s settling | same |
| Expander-cycle start-up to equilibrium | up to 15 s | [thesis p. 10](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=27) |

DLR's full step-response table shows where the slow channel is: every output answers a TFV step in 5–24 s, and almost everything else within a few seconds.

```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": {"text": "Settling time after a 10 % valve step", "subtitle": "Seconds; blank cell = no response. Values of 15 s and more labelled. Dresia 2025, Table 4.7"},
  "width": "container", "height": 230,
  "data": {"values": [
    {"valve": "TOV", "output": "LNG flow", "ts": 0.5}, {"valve": "TOV", "output": "LOX flow", "ts": 0.5}, {"valve": "TOV", "output": "Coolant flow", "ts": 0.5}, {"valve": "TOV", "output": "Chamber pressure", "ts": 0.4}, {"valve": "TOV", "output": "Mixture ratio", "ts": 0.6},
    {"valve": "TFV", "output": "LNG flow", "ts": 15.5}, {"valve": "TFV", "output": "LOX flow", "ts": 19.5}, {"valve": "TFV", "output": "Coolant flow", "ts": 14.9}, {"valve": "TFV", "output": "Chamber pressure", "ts": 19.3}, {"valve": "TFV", "output": "Mixture ratio", "ts": 5.4}, {"valve": "TFV", "output": "Injection temp.", "ts": 23.8},
    {"valve": "FCV", "output": "LOX flow", "ts": 3.4}, {"valve": "FCV", "output": "Coolant flow", "ts": 0.5}, {"valve": "FCV", "output": "Chamber pressure", "ts": 1.5}, {"valve": "FCV", "output": "Mixture ratio", "ts": 4.4}, {"valve": "FCV", "output": "Injection temp.", "ts": 10.0},
    {"valve": "BPV", "output": "LNG flow", "ts": 1.4}, {"valve": "BPV", "output": "LOX flow", "ts": 7.4}, {"valve": "BPV", "output": "Coolant flow", "ts": 1.2}, {"valve": "BPV", "output": "Chamber pressure", "ts": 4.7}, {"valve": "BPV", "output": "Mixture ratio", "ts": 3.6}, {"valve": "BPV", "output": "Injection temp.", "ts": 18.9},
    {"valve": "OCV", "output": "LOX flow", "ts": 0.3}, {"valve": "OCV", "output": "Chamber pressure", "ts": 0.3}, {"valve": "OCV", "output": "Mixture ratio", "ts": 0.2}, {"valve": "OCV", "output": "Injection temp.", "ts": 4.7},
    {"valve": "XCV", "output": "LNG flow", "ts": 0.6}, {"valve": "XCV", "output": "LOX flow", "ts": 0.4}, {"valve": "XCV", "output": "Coolant flow", "ts": 0.6}, {"valve": "XCV", "output": "Chamber pressure", "ts": 0.5}, {"valve": "XCV", "output": "Mixture ratio", "ts": 0.6}, {"valve": "XCV", "output": "Injection temp.", "ts": 3.1}
  ]},
  "encoding": {
    "x": {"field": "valve", "type": "nominal", "sort": ["TOV", "TFV", "FCV", "BPV", "OCV", "XCV"], "title": "Valve stepped", "axis": {"orient": "top", "labelAngle": 0}, "scale": {"paddingInner": 0.06}},
    "y": {"field": "output", "type": "nominal", "sort": ["LNG flow", "LOX flow", "Coolant flow", "Chamber pressure", "Mixture ratio", "Injection temp."], "title": null, "scale": {"paddingInner": 0.06}}
  },
  "layer": [
    {"mark": {"type": "rect", "cornerRadius": 2},
     "encoding": {"color": {"field": "ts", "type": "quantitative", "title": "Settling time (s)", "scale": {"type": "sqrt"}, "legend": {"orient": "right", "gradientLength": 150}},
       "tooltip": [{"field": "valve"}, {"field": "output"}, {"field": "ts", "title": "settling (s)"}]}},
    {"transform": [{"filter": "datum.ts >= 15"}],
     "mark": {"type": "text", "color": "var(--viz-seq-label)", "fontWeight": 600},
     "encoding": {"text": {"field": "ts", "format": ".1f"}}}
  ]
}
```

??? info "Table view: settling time in seconds (Dresia 2025, Table 4.7)"
    | Output \ valve | TOV | TFV | FCV | BPV | OCV | XCV |
    |---|---|---|---|---|---|---|
    | LNG flow | 0.5 | 15.5 | – | 1.4 | – | 0.6 |
    | LOX flow | 0.5 | 19.5 | 3.4 | 7.4 | 0.3 | 0.4 |
    | Coolant flow | 0.5 | 14.9 | 0.5 | 1.2 | – | 0.6 |
    | Chamber pressure | 0.4 | 19.3 | 1.5 | 4.7 | 0.3 | 0.5 |
    | Mixture ratio | 0.6 | 5.4 | 4.4 | 3.6 | 0.2 | 0.6 |
    | Injection temperature | – | 23.8 | 10.0 | 18.9 | 4.7 | 3.1 |

## Why TFV is slow

The TFV–TOV asymmetry comes from [the heat budget](2-cycle.md#one-heat-budget-two-turbines):

- **TOV** changes the LOX pump's speed and nothing else of note. The fuel side does not care how much oxygen is pumped, so the response is a shaft spinning up: half a second.
- **TFV** changes the fuel pump's speed, and the fuel *is the coolant*. More fuel through the channels means colder methane. That weakens both turbines, and the wall and the methane take tens of seconds to find their new temperature.

The pressure response to a TFV step therefore overshoots. DLR's model shows "a large overshoot of $\Delta p_{cc,\max}$ = 6.5 bar, which is 75 % larger than the static gain" of 3.7 bar ([thesis p. 73](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=90)). The surrogate was fitted to the overshoot and the settling times. Compare the two valves on it:

<div class="re-widget" data-widget="steps" data-title="Interactive: TFV and TOV steps on the surrogate"></div>

The thesis also notes that some engines are **non-minimum phase**: thrust can first drop when a valve opens, because a fast process with small gain precedes a slow process with large gain ([p. 20](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=37)). On LUMEN's model, "only a small non-minimum phase behavior is observed for XCV" ([p. 73](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=90)). The TFV overshoot is the mirror case: the fast effect is *larger* than the slow one, and of the same sign.

!!! tip "What it means for the agent"

    - **One action channel acts within the control horizon, the other far beyond it.** At 10 Hz, this repo's $\gamma$ = 0.98 gives an effective horizon of about 5 s; DLR's SAC used $\gamma$ = 0.9 ([thesis Table A.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=164)), about 1 s. The TFV sag lasts 20 s.
    - **History is state.** The observation has to contain enough of the recent past to tell where the thermal transient is. DLR stacks past observations, 84 numbers in all ([thesis p. 80–81](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=97)). This repo's environment stacks the current frame and three past ones.
    - **Fast gain ≠ static gain.** A linear controller tuned on the static gains overreacts in the first two seconds; one tuned on the fast response is too weak for the sag. The [PI baseline](8-lab.md?preset=pi) shows the compromise; the learned policies need not make it.
    - **Set-point preview helps the fast channel.** Knowing a step is coming 0.5 s early buys little against a 20 s sag. But it covers the valve and sensor delays (about 0.3 s together), so the agent can move the valves before a step arrives instead of after.

??? question "Check yourself (click to open)"

    1. Which valve would you use to correct a fast mixture-ratio error, and why? *TOV: it acts in about 0.5 s with little effect on the fuel side.*
    2. After a TFV opening, why does chamber pressure first rise and then fall back part of the way? *The fuel pump speeds up at once; the extra coolant flow then cools the methane, which weakens both turbines over 10–20 s.*
    3. Your PPO agent uses $\gamma$ = 0.9 at 10 Hz. What part of the TFV response can its value function see? *About 1 s: the spin-up and the start of the overshoot, not the sag.*
