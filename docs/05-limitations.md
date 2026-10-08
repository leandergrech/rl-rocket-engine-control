---
icon: re/warning
---

# :re-warning: 5. Limitations: what fails and by how much

Every number below links to its source. Where I state an interpretation rather than a reported fact, it says so.

## 5.1 Sim-to-real: 1.3 % on hardware against 0.4 % in simulation

| Evidence | Simulation | Hardware | Ratio | Source |
|---|---|---|---|---|
| LUMEN 4-valve SAC, mean tracking error | 0.4 % nominal, 0.5 % domain-randomised | 1.3 % (run 2) | ≈ 3× | [thesis Table 6.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130) |
| Same, mixture ratio only | 0.3 % / 0.5 % | 2.7 % (max 8.5 %) | 5–9× | same |
| Same, first attempt | — | 7.8 % mean, 64.7 % max, "unstable" | — | same; [p. 149](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=166) |
| Cold-gas chamber pressure SAC, trajectory RMSE | 0.36 bar | 1.15 bar | 3.2× | [Hörger et al. 2024, p. 9](https://elib.dlr.de/207225/1/Final_Acta_Astronautica.pdf#page=9) |
| 22 N thruster, $p_{cc}$ and $R_{OF}$ controller | — | "Control performance in simulation is better than at the real system" | — | [Hörger et al. 2025](https://elib.dlr.de/220009/) (abstract) |

```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": {"text": "How much worse on hardware than in simulation", "subtitle": "Hardware error ÷ simulation error (my derivation from thesis Table 6.2 and Hörger et al. 2024, p. 9)"},
  "width": "container", "height": 200,
  "layer": [
    {"data": {"values": [
        {"item": "LUMEN · chamber pressure", "ratio": 1.2, "calc": "0.7 % / 0.6 %"},
        {"item": "LUMEN · coolant flow", "ratio": 2.2, "calc": "1.1 % / 0.5 %"},
        {"item": "LUMEN · mean of four outputs", "ratio": 2.6, "calc": "1.3 % / 0.5 %"},
        {"item": "LUMEN · injection temperature", "ratio": 2.7, "calc": "0.8 % / 0.3 %"},
        {"item": "Cold-gas rig · trajectory RMSE", "ratio": 3.2, "calc": "1.15 bar / 0.36 bar"},
        {"item": "LUMEN · mixture ratio", "ratio": 5.4, "calc": "2.7 % / 0.5 %"}]},
     "layer": [
       {"mark": {"type": "bar", "cornerRadiusEnd": 4, "height": 16, "color": "var(--viz-s1)"},
        "encoding": {"y": {"field": "item", "type": "nominal", "sort": null, "title": null, "axis": {"labelLimit": 260}},
          "x": {"field": "ratio", "type": "quantitative", "title": "Hardware ÷ simulation", "scale": {"domain": [0, 6]}},
          "tooltip": [{"field": "item"}, {"field": "calc", "title": "hardware / simulation"}, {"field": "ratio", "title": "ratio"}]}},
       {"mark": {"type": "text", "align": "left", "dx": 5},
        "encoding": {"y": {"field": "item", "type": "nominal", "sort": null}, "x": {"field": "ratio", "type": "quantitative"}, "text": {"field": "ratio", "format": ".1f"}}}
     ]},
    {"data": {"values": [{"x": 1}]},
     "layer": [
       {"mark": {"type": "rule", "strokeWidth": 2, "color": "var(--viz-s2)"}, "encoding": {"x": {"field": "x", "type": "quantitative"}}},
       {"mark": {"type": "text", "align": "left", "dx": 5, "y": -6, "text": "1× = no loss"}, "encoding": {"x": {"field": "x", "type": "quantitative"}}}
     ]}
  ]
}
```

??? info "Table view: how the ratios are computed"
    Simulation reference for LUMEN is the domain-randomised closed-loop row of [thesis Table 6.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130); hardware is run 2.

    | Item | Hardware | Simulation | Ratio |
    |---|---|---|---|
    | LUMEN chamber pressure | 0.7 % | 0.6 % | 1.2× |
    | LUMEN coolant flow | 1.1 % | 0.5 % | 2.2× |
    | LUMEN mean of four outputs | 1.3 % | 0.5 % | 2.6× |
    | LUMEN injection temperature | 0.8 % | 0.3 % | 2.7× |
    | Cold-gas rig trajectory RMSE ([Hörger et al. 2024, p. 9](https://elib.dlr.de/207225/1/Final_Acta_Astronautica.pdf#page=9)) | 1.15 bar | 0.36 bar | 3.2× |
    | LUMEN mixture ratio | 2.7 % | 0.5 % | 5.4× |

Where the gap comes from, according to the authors:

- **Actuator models.** Twice the first hardware deployment failed on valve dynamics.
    - The thesis run 1 was "unstable due to a modeling error in the valve transfer function" ([p. 149](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=166)).
    - The EUCASS safety paper reports that the first test "induced oscillations … likely attributable to an inaccurate model of the valve dynamics" ([Dauer et al. 2025, p. 7](https://www.eucass.eu/doi/EUCASS2025-533.pdf#page=7)).
    - Domain randomisation of the plant did not cover this. The *structure* of the valve model was wrong, not just its parameters.
- **Plant model error larger than validation suggests.**
    - On the calibration run, the EcosimPro model has 2.4 % MAPE on $p_{cc}$ ([Kurudzija et al. 2025, Table 2](https://www.eucass.eu/doi/EUCASS2025-105.pdf#page=10)).
    - On the RL demonstration run the errors were 4.1 % mean on $p_{cc}$, 4.9 % on coolant flow and up to 10.6 % maximum ([thesis Table 6.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=131)).
    - A possible cause the author gives: "for the first time the turbines are driven by methane instead of nitrogen".
- **Randomisation that does not contain reality.** "Even with domain randomization, the controller seems to barely encounter the real-world characteristics during training" ([p. 117](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=134)). The randomisation ranges were ±1–10 % per parameter ([Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)); the observed model errors reached 10.6 %.
- **Noise out of distribution.** Real mixture-ratio noise was $\sigma$ = 3.0 %, against a maximum of 1.5 % during training ([p. 116](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=133)).
- **Unexplained residual.** "It is also not clear why small oscillations of about 0.5 Hz are still present" ([p. 116](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=133)).

```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": {"text": "Model error on the demonstration run vs the randomisation range", "subtitle": "Mean and maximum model error per output (thesis Table 6.3); vertical line: widest randomisation range (Table A.3)"},
  "width": "container", "height": 170,
  "layer": [
    {"data": {"values": [
        {"output": "Chamber pressure", "mean": 4.1, "max": 8.6},
        {"output": "Mixture ratio", "mean": 2.4, "max": 7.2},
        {"output": "Injection temperature", "mean": 3.9, "max": 7.7},
        {"output": "Coolant flow", "mean": 4.9, "max": 10.6}]},
     "encoding": {"y": {"field": "output", "type": "nominal", "sort": null, "title": null}},
     "layer": [
       {"mark": {"type": "rule", "strokeWidth": 2, "color": "var(--viz-axis)"},
        "encoding": {"x": {"field": "mean", "type": "quantitative", "title": "Model error (%)", "scale": {"domain": [0, 12]}}, "x2": {"field": "max"}}},
       {"transform": [{"fold": ["mean", "max"], "as": ["kind", "err"]},
                      {"calculate": "datum.kind === 'mean' ? 'Mean error' : 'Maximum error'", "as": "measure"}],
        "mark": {"type": "point", "filled": true, "size": 90, "stroke": "var(--md-default-bg-color)", "strokeWidth": 2},
        "encoding": {"x": {"field": "err", "type": "quantitative"},
          "color": {"field": "measure", "type": "nominal", "scale": {"domain": ["Mean error", "Maximum error"], "range": ["var(--viz-s1)", "var(--viz-s2)"]}, "legend": {"title": null}},
          "tooltip": [{"field": "output"}, {"field": "measure"}, {"field": "err", "title": "error (%)"}]}}
     ]},
    {"data": {"values": [{"x": 10}]},
     "layer": [
       {"mark": {"type": "rule", "strokeWidth": 2, "color": "var(--viz-ink-2)"}, "encoding": {"x": {"field": "x", "type": "quantitative"}}},
       {"mark": {"type": "text", "align": "right", "dx": -5, "y": -6, "text": "±10 %: widest randomisation"}, "encoding": {"x": {"field": "x", "type": "quantitative"}}}
     ]}
  ]
}
```

??? info "Table view: thesis Table 6.3, model errors on hot-fire run 2 (%)"
    | | $p_{cc}$ | $R_{OF}$ | $T_{LNG}$ | $\dot m_{RC}$ | TFV | TOV | FCV | BPV |
    |---|---|---|---|---|---|---|---|---|
    | Mean | 4.1 | 2.4 | 3.9 | 4.9 | 0.4 | 0.8 | 0.5 | 0.3 |
    | Max | 8.6 | 7.2 | 7.7 | 10.6 | 2.2 | 4.3 | 4.3 | 1.6 |

The positive side, in the author's summary: control was successful "even in the presence of modeling errors of up to 10.6 %" and without fine-tuning ([p. 118](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=135)). The 1.3 % result is a zero-shot transfer. The fine-tuning dataset announced for the benchmark ([RL4AA'25](https://indico.kit.edu/event/4216/contributions/19241/contribution.pdf)) is the obvious lever that DLR's own hardware controller did not use.

## 5.2 Safety: short tests, no guarantees

- **Closed-loop time on hardware is seconds.**
    - The successful run was "over 16 s" ([p. 117](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=134)).
    - "Both tests were terminated prematurely due to different limiting factors" ([Dauer et al. 2025, Fig. 4](https://www.eucass.eu/doi/EUCASS2025-533.pdf#page=8)).
    - The run shown at the RL Bootcamp 2026 tracked for about 15 s before "a sensor failure" ended it ([livestream](https://www.youtube.com/watch?v=CX8I88Pta_I&t=26200s)).

    No published result shows an RL engine controller over a full-duration test or across many tests.

- **No stability or constraint guarantee.**
    - The SAC controller satisfied all constraints in the simulated comparison, where MPC's soft constraints let coolant flow dip for 22 steps ([p. 95](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=112)).
    - That is an empirical result on one trajectory, not a guarantee.
    - The thesis outlook names "stability, robustness, and safety" as the open problem before flight use ([pp. 123–126](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=140)).
- **Faults outside the training distribution break the policy.** In simulation, DLR cut the oxidiser-turbopump efficiency to 80 % at $t$ = 27 s. The domain-randomised SAC agent was "unable to maintain the desired pressure level, as such a fault scenario was not included in the domain randomization" ([Dauer et al. 2025, p. 10](https://www.eucass.eu/doi/EUCASS2025-533.pdf#page=10)).
- **Knowing when not to trust the policy is at the first-step stage.**
    - DLR's out-of-capability detector, like the PEDM baseline, rises immediately at that fault onset.
    - Its thresholds are the 99th percentile of training-data scores.
    - The paper reports this through plots and a single fault case. It gives no detection-rate or false-alarm statistics, and calls itself "a crucial first step" ([Dauer et al. 2025](https://www.eucass.eu/doi/EUCASS2025-533.pdf)).
- **Aggressive actuation.**
    - The best simulated SAC controller used 60 % more valve motion than MPC (Δu 3.9 vs 2.4, [Table 5.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=114)).
    - It overdrove the turbine valves for about 1.1 s on large steps ([p. 86](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=103)).
    - The hardware controller showed ±2 % oscillations at 0.5 Hz ([p. 113](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130)).
    - Valve oscillation is itself a hazard: fatigue, pressure waves, chugging ([p. 60](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=77)).
- **The safety system can end the episode for the wrong reason.** Redline shutdowns fire on sensor readings, so a faulty sensor can abort a healthy test ([DX'25 LUMEN page](https://vehsys.gitlab-pages.liu.se/dx25benchmarks/lumen/lumen_index)).

## 5.3 Partial observability

- **Unmeasured internal state.**
    - Turbopump shaft torque is not measured.
    - Pump and turbine efficiencies are inferred indirectly.
    - The turbines were characterised on nitrogen, which has a speed of sound of about 350 m/s against about 500 m/s for hot methane ([p. 67](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=84)).
    - Wall and coolant thermal states are not observed at all.
- **Short memory against long time constants.**
    - DLR's policies see the last 3 observations, 0.15 s of history at 20 Hz.
    - The plant has fuel-side settling times of 5.4–23.8 s ([Table 4.7](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=91)).

    *My inference:* a feed-forward policy cannot recover slow thermal state from 0.15 s of history. It must rely on the extra temperature and pressure channels DLR added to the observation ([eq. 6.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=119)). With only TFV/TOV and a user-chosen observation in the 2×2 challenge, that choice becomes the user's problem.

- **Delays.**
    - Sensor filtering: the $p_{cc}$ moving-average window was randomised over 0.05–0.15 s.
    - Valve dead time: 0.03–0.08 s ([Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)).

    At 20 Hz these are 1–3 control steps.

- **Derived, noisy outputs.** $R_{OF}$ is a ratio of two flow-meter readings, so its noise (3.0 %) is ten times that of $p_{cc}$ (0.3 %) ([p. 116](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=133)).
```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": {"text": "What the policy remembers vs how slowly the plant moves", "subtitle": "Seconds, log scale. Thesis Table 4.7 (settling), Table A.3 (delays), p. 102 (3-step stacking at 20 Hz)"},
  "width": "container", "height": 190,
  "data": {"values": [
    {"item": "Valve dead time", "lo": 0.03, "hi": 0.08, "kind": "Plant and sensors"},
    {"item": "Sensor filter window, chamber pressure", "lo": 0.05, "hi": 0.15, "kind": "Plant and sensors"},
    {"item": "Policy history, 3 steps at 20 Hz", "lo": 0.15, "hi": 0.15, "kind": "What the policy sees"},
    {"item": "Settling after a TOV step", "lo": 0.4, "hi": 0.6, "kind": "Plant and sensors"},
    {"item": "Settling after a TFV step", "lo": 5.4, "hi": 23.8, "kind": "Plant and sensors"}
  ]},
  "encoding": {"y": {"field": "item", "type": "nominal", "sort": null, "title": null, "axis": {"labelLimit": 280}}},
  "layer": [
    {"mark": {"type": "rule", "strokeWidth": 4, "strokeCap": "round"},
     "encoding": {"x": {"field": "lo", "type": "quantitative", "scale": {"type": "log", "domain": [0.02, 40]}, "title": "Time (s, log scale)", "axis": {"values": [0.03, 0.1, 0.3, 1, 3, 10, 30]}}, "x2": {"field": "hi"},
       "color": {"field": "kind", "type": "nominal", "scale": {"domain": ["Plant and sensors", "What the policy sees"]}, "legend": {"title": null}}}},
    {"transform": [{"fold": ["lo", "hi"], "as": ["end", "t"]}],
     "mark": {"type": "point", "filled": true, "size": 70, "stroke": "var(--md-default-bg-color)", "strokeWidth": 2},
     "encoding": {"x": {"field": "t", "type": "quantitative"}, "color": {"field": "kind", "type": "nominal"},
       "tooltip": [{"field": "item"}, {"field": "lo", "title": "from (s)"}, {"field": "hi", "title": "to (s)"}]}}
  ]
}
```

- **No preview of the reference.**
    - Without future references in the observation, a policy can only react to a ramp. That is the lag visible in the bootcamp PPO demo, where the speaker attributed it to missing "future reference values" and valve delay ([livestream](https://www.youtube.com/watch?v=CX8I88Pta_I&t=26100s)).
    - With 4 steps of preview (D1 in [§4](04-designs.md)) the thesis reached 0.3 % / 0.1 %.
    - For a vehicle whose thrust demand comes from a guidance loop, preview is unavailable; the thesis's hardware controller did without it ([p. 102](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=119)).
    - **The challenge excludes preview too**: its targets are generated in real time ([organisers, Oct 2026](07-references.md#organisers2026)). The ramp lag is part of the task, not a design choice.

## 5.4 Data: minutes of reality, days of simulation

<div class="kpi-row">
  <div class="kpi"><div class="kpi__value">17</div><div class="kpi__label">ignitions of the whole engine, 2024–2025</div><div class="kpi__src"><a href="https://www.eucass.eu/doi/EUCASS2025-105.pdf#page=4">Kurudzija et al. 2025, p. 4</a></div></div>
  <div class="kpi"><div class="kpi__value">&gt; 20 min</div><div class="kpi__label">accumulated engine hot-fire time</div><div class="kpi__src"><a href="https://www.eucass.eu/doi/EUCASS2025-105.pdf#page=4">same</a></div></div>
  <div class="kpi"><div class="kpi__value">&gt; 16 s</div><div class="kpi__label">longest RL closed loop on the engine</div><div class="kpi__src"><a href="https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=134">thesis p. 117</a></div></div>
  <div class="kpi"><div class="kpi__value">≈ 1 M</div><div class="kpi__label">simulator steps per day on 10 instances</div><div class="kpi__src"><a href="https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=100">thesis p. 83</a></div></div>
  <div class="kpi"><div class="kpi__value">≈ 5 days</div><div class="kpi__label">to retrain the hardware controller</div><div class="kpi__src"><a href="https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=135">thesis p. 118</a></div></div>
</div>

- **Real data is scarce.**
    - LUMEN's two engine campaigns (2024, 2025) comprise 17 ignitions and "an accumulated hot-fire test duration of over 20 minutes" ([Kurudzija et al. 2025, p. 4](https://www.eucass.eu/doi/EUCASS2025-105.pdf#page=4)).
    - The turbopump campaigns add 88 min (oxidiser) and 44 min (fuel) of component runtime (same paper, [p. 3](https://www.eucass.eu/doi/EUCASS2025-105.pdf#page=3)).
    - Closed-loop RL hot fire on the whole engine totals well under a minute across the reported runs.
- **Simulation is slow.**
    - The thesis trained at "about one million training steps per day" on 10 parallel EcosimPro instances ([p. 83](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=100)).
    - The hardware controller needed about 5 M steps and about 5 days to retrain ([p. 118](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=135)).
    - Domain randomisation doubled the training steps, from 1.5 M to 2.9 M ([Table 5.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=108)).
    - The challenge's simulator runs at about real time, and several instances can run in parallel ([organisers, Oct 2026](07-references.md#organisers2026)).
    - *My extrapolation:* at 20 Hz and real time, one simulator instance gives about 7 × 10⁴ steps per CPU hour. A laptop running 8 instances gets about 6 × 10⁵ steps an hour: enough for SAC-sized runs, but a 3 M-step PPO run takes most of a working day.
- **The benchmark data is not yet available.**
    - The "dataset for fine-tuning" and the "simulated sensor and system errors" ([RL4AA'25](https://indico.kit.edu/event/4216/contributions/19241/contribution.pdf)) have not been published. Nor has anything else ([§7.1](07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not)); a repository is expected around the end of October 2026 ([organisers](07-references.md#organisers2026)).
    - The fine-tuning data will not contain real hot-fire runs, which are export-controlled; the sim-to-real test cases change model parameters instead (same source). Real valve and sensor behaviour therefore stays out of reach for participants.
    - DLR's previous LUMEN benchmark, for DX'25 diagnosis, was only distributed on request ([LiU page](https://vehsys.gitlab-pages.liu.se/dx25benchmarks/lumen/lumen_index)).
    - The underlying ESPSS library needs "prior approval from ESA" ([brochure](https://www.ecosimpro.com/wp-content/uploads/2015/02/ecosimpro_brochure_library_espss.pdf)).

## 5.5 Comparability: there is no common scale yet

The results in [§3](03-timeline.md) use at least six different metrics:

- mean absolute percentage error;
- integrated absolute error (IAE);
- RMSE in bar;
- summed episode reward;
- settling time in a 2 % band;
- success rate.

They also use at least five plants: a generic gas-generator model, three LUMEN model versions, the LUMEN engine, a cold-gas rig and a 22 N thruster. Only one DLR study (on the gas-generator model) reports a PID baseline, and only one reports MPC. For the challenge's own 2×2 task, no numbers of any kind are public. This is the gap the challenge's automatic evaluation is meant to close. Until it exists, cross-paper comparisons on this site are qualitative.

## 5.6 Limits of the benchmark as designed

These follow from the published design ([AI4Aerospace 2025](https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=55)). They may change when the environment is released.

- **Two actuators only.** With TFV and TOV as the only actions, coolant flow, injection temperature and the momentum-flux ratio are set by whatever fixed openings the other four valves have. The benchmark cannot test the multi-objective, constraint-boundary operation that D1 and D3 in [§4](04-designs.md) address.
- **Two faults.** Test cases 6–7 use "two faults … simulated based on hot run data". Generalisation to unseen fault types is not tested.
- **No hardware in the loop.** Public evaluation will be against simulators. The question that matters most, whether the controller works on the engine, stays with DLR.

## 5.7 Limits of this review

- **No numbers of my own on LUMEN.** The challenge environment was not available. The only results of my own are on a surrogate engine written for this site ([Baselines on the surrogate](04a-surrogate-baselines.md)), which is calibrated to DLR's published numbers but says nothing quantitative about LUMEN or the challenge. Every LUMEN result here is reported by others.
- **Unread sources.** Several DLR papers are DLR-internal or paywalled and were used at abstract level only ([§7.11](07-references.md#711-unverified-or-blocked)). The most important of these are:
    - the EUCASS 2025 model-validation paper, which I did read in full via eucass.eu;
    - the SciTech 2023 turbopump hardware paper, abstract only.
- **Speaker identity.** The auto-captions name the bootcamp speaker "Yonas", while my brief named Kai Dresia. I describe the pitch by content, not by speaker.
