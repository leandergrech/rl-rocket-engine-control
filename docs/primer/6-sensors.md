---
icon: re/sensor
---

# :re-sensor: Sensors, delays and noise

!!! abstract "The question"

    What does the controller actually read, how late, and how noisy?

## What LUMEN measures

LUMEN carries 40 thermocouples and 62 static and dynamic pressure sensors ([thesis p. 55](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=72)); mass flows come from Coriolis meters. The stated maximum uncertainties are ([Kurudzija et al. 2025, Table 1](https://www.eucass.eu/doi/EUCASS2025-105.pdf#page=5)):

- ±1 % of span for pressure (0–250 bar);
- ±0.03 kg/s for mass flow;
- ±1.5–2.5 K for temperature;
- ±0.2 % for rotational speed.

Two practical consequences:

- **$R_{OF}$ is not measured.** It is a ratio of two flow measurements, so its noise is much larger than that of $p_{cc}$. On the real engine the measured steady-state $\sigma$ was 3.0 % for $R_{OF}$ against 0.3 % for $p_{cc}$, and the 3.0 % exceeded the 1.5 % maximum injected during training ([thesis p. 116](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=133)).
- **Sensors have their own time constants and filtering.** DLR modelled a moving-average window on $p_{cc}$ and randomised it over 0.05–0.15 s, and the flow-meter delays over 0.1–0.25 s ([Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)).

```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": {"text": "Measured sensor noise on the real engine", "subtitle": "Steady-state standard deviation, % of value (Dresia 2025, Fig. 6.11). Orange line: most noise injected during training"},
  "width": "container", "height": 150,
  "layer": [
    {"data": {"values": [{"signal": "Mixture ratio", "sigma": 3.0}, {"signal": "Coolant flow", "sigma": 0.5}, {"signal": "Chamber pressure", "sigma": 0.3}, {"signal": "Injection temperature", "sigma": 0.1}]},
     "layer": [
       {"mark": {"type": "bar", "cornerRadiusEnd": 4, "height": 16, "color": "var(--viz-s1)"},
        "encoding": {"y": {"field": "signal", "type": "nominal", "sort": null, "title": null},
          "x": {"field": "sigma", "type": "quantitative", "title": "Standard deviation (%)", "scale": {"domain": [0, 3.5]}, "axis": {"tickCount": 4}},
          "tooltip": [{"field": "signal"}, {"field": "sigma", "title": "sigma (%)"}]}},
       {"mark": {"type": "text", "align": "left", "dx": 5},
        "encoding": {"y": {"field": "signal", "type": "nominal", "sort": null}, "x": {"field": "sigma", "type": "quantitative"}, "text": {"field": "sigma", "format": ".1f"}}}
     ]},
    {"data": {"values": [{"x": 1.5}]},
     "layer": [
       {"mark": {"type": "rule", "strokeWidth": 2, "color": "var(--viz-s2)"}, "encoding": {"x": {"field": "x", "type": "quantitative"}}},
       {"mark": {"type": "text", "align": "left", "dx": 5, "y": -6, "text": "training maximum, 1.5 %"}, "encoding": {"x": {"field": "x", "type": "quantitative"}}}
     ]}
  ]
}
```

??? info "Table view: measured noise (Dresia 2025, Fig. 6.11)"
    | Signal | Steady-state σ (% of value) |
    |---|---|
    | Mixture ratio | 3.0 |
    | Coolant flow | 0.5 |
    | Chamber pressure | 0.3 |
    | Injection temperature | 0.1 |

## What a controller sees

Put the delay and the noise together, and the mixture ratio the controller reads is a late, jittery copy of the real one:

<div class="re-widget" data-widget="sensors" data-title="Interactive: true and measured mixture ratio"></div>

This repo's environment, with its defaults (all switchable), works as follows:

- It delays chamber pressure by 0.1 s and mixture ratio by 0.2 s, the middles of DLR's randomisation ranges.
- It adds Gaussian noise of σ = 0.05 bar and 0.005, much less than the real engine's 3 % on $R_{OF}$.
- With domain randomisation on, it draws the delays from 0.05–0.15 s and 0.1–0.25 s.
- The valve positions and the constrained variables are observed without delay.

The PI baseline and the learned policies read exactly the same measurements.

This is the "sparse, noisy, delayed" setting you know from beamline instrumentation. The difference is that here the noisiest channel, $R_{OF}$, is also the one tied to the fastest safety constraint.

!!! tip "What it means for the agent"

    - **Delay is part of the plant.** With 0.05 s valve dead time and 0.2 s on the mixture-ratio reading, a command's effect on $R_{OF}$ is first visible two to three control steps later. Stacked observations let the agent learn this; a memoryless policy cannot.
    - **Train with more noise than you expect.** DLR's real-engine $R_{OF}$ noise was twice the training maximum ([thesis p. 116](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=133)).
    - **Do not differentiate a noisy ratio.** A controller with a derivative term, or a policy that reacts to sample-to-sample changes in $R_{OF}$, amplifies the flow-meter noise straight into valve chatter.

??? question "Check yourself (click to open)"

    1. Why is mixture ratio noisier than chamber pressure? *It is computed from two flow measurements, each with its own noise and delay; the ratio adds both.*
    2. In the widget, set the delay to 0.3 s. What would a PI controller with a high gain on the measured $R_{OF}$ do? *Overcorrect: by the time it sees the effect of a move it has already moved further, so it oscillates.*
    3. Which observations in this repo's environment are not delayed? *Valve positions, commands and the constrained variables.*
