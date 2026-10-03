---
hide:
  - navigation
  - toc
icon: re/lab
---

# :re-lab: The Engine Lab

!!! abstract "What this is"

    The 2×2 task of the LUMEN Control Challenge, rebuilt on a **surrogate engine** that runs in your browser. TFV and TOV are the actions; chamber pressure and mixture ratio follow set points every 0.1 s, under the constraints of [thesis Table 5.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=96).

    Presets are grouped by **who turns the knobs**:

    - a schedule (*open loop*);
    - a PI controller (*feedback*);
    - a network trained with PPO or SAC (*learned feedback*);
    - you (*sandbox*).

    Every controller runs live on the engine you see, so when you perturb the engine the controllers react. The episode code is the same as the Python environment the agents were trained in.

    **The surrogate is not DLR's simulator**, which is not public. It is a reduced model calibrated to the gains, settling times and overshoot DLR publishes for its LUMEN model ([model card](#model-card)). Use it to build intuition and test ideas, not to report a number about the challenge.

<div class="re-widget re-lab" data-widget="lab" data-title="The Engine Lab"></div>

## How to use it

- **Above: choose who turns the knobs.** The story under the presets explains what to look for.
- **On the test stand** shows the episode on an animated LUMEN, fired horizontally out of DLR's P8.3 cell as in the photos of Traudt et al. ([IAC 2024](https://elib.dlr.de/213229/1/IAC-24,C4,1,5,x86850%20manuscript.pdf#page=3)). *Hot fire* plays the episode in real time (or 2× / 4×). With *start-up and shutdown* on, it opens with a GN2 spin-up of the turbopumps, laser ignition and a pressure rise of about 1.5 s, and ends with a shutdown and an LN2 purge; both durations follow the shape of DLR's hot-fire traces (IAC 2024, Fig. 5). The time slider, or hovering any plot, shows one moment.
    - What moves with the simulation: chamber pressure, mixture ratio, pump speeds, valve openings, the flows in every line, the coolant and turbine-gas temperatures, and limit violations, which show as red outlines and in the badge.
    - What is a coarse guess: the flame and everything around it. Plume length and brightness grow with pressure. The colour runs from orange when fuel-rich to violet-blue towards stoichiometric. Shock diamonds spread with pressure. The jet starts to separate inside the nozzle below about 38 bar, while the real nozzle is designed for no separation at 60 bar ([Deeken et al. 2021](https://elib.dlr.de/142128/1/Paper.pdf#page=6)). Orange afterburning tongues grow with fuel-richness, and steam rises from the spray ring.
- **The side pane stays in view** while the plots scroll past it. From the top:
    - *Set points*: the 40 s evaluation profile used in [Baselines on the surrogate](../04a-surrogate-baselines.md), a pressure ladder, mixture-ratio steps, or a random profile like the training ones.
    - *Controller*: the PI gain multiplier, or in the sandbox your TFV and TOV sliders with *Play*.
    - *Engine and sensors*: perturbations the controllers were not trained on. *Heat flux ×* scales the wall heat (the slow loop); *fuel turbine ×* and *LOX turbine ×* scale each turbine's torque (DLR randomised turbine efficiencies for the same reason); *valve dead time* is the parameter behind DLR's first failed hot-fire test. You can also switch off sensor delays and noise.
    - *Outcome*: return, mean absolute percentage errors, constraint-violation steps and valve travel. **Pin** keeps a run as a grey line in every plot (up to three) and shows its scores in brackets.
- **The plots:** chamber pressure and mixture ratio against their set points (dashed); valve commands (dashed) and positions; a constrained variable of your choice with its limit; the reward per step. Hover any plot for the values at that time, including what the controller read.
- **Links can open the Lab in a given state**, for example `?preset=pi&heat=1.1`, `?preset=sac-preview&profile=rof&loxturbine=0.95`, `?preset=pi&delay=0.15&gain=1.5`, or `?sensors=ideal&noise=0`.

## Guided experiments

Each takes a few minutes. Predict first, then look.

1. **The slow channel.** Load the [TFV step](8-lab.md?preset=tfv_step) and the [TOV step](8-lab.md?preset=tov_step). *Predict:* which output settles first after TFV, and why? (Mixture ratio, in about 5 s: it depends on the ratio of the two flows, which the thermal sag changes less than their sum.)
2. **Feedforward is not control.** Load [feedforward only](8-lab.md?preset=feedforward), then set *heat flux ×* to 1.1. The commands do not change, so the error stays. Now load [PI](8-lab.md?preset=pi&heat=1.1) with the same perturbation.
3. **Where PI loses.** In [PI on the evaluation profile](8-lab.md?preset=pi), find the step at 27 s (50 → 38 bar while mixture ratio is held). *Predict* which output the PI gets wrong first. Pin the run, then load [PPO with preview](8-lab.md?preset=ppo-preview): what does it do with TOV *before* the step?
4. **What preview is worth.** Load [SAC, preview](8-lab.md?preset=sac-preview), pin it, then [SAC, no preview](8-lab.md?preset=sac-nopreview). Where in the profile do the two differ, at steps or during ramps?
5. **Break the valve model.** Raise *valve dead time* to 0.15 s under [PI](8-lab.md?preset=pi&delay=0.15), then under [PPO](8-lab.md?preset=ppo-preview&delay=0.15). Which one starts to oscillate, and in which output? This is the failure mode of DLR's first hot-fire test ([Valves are the actuators](3-valves.md#where-sim-to-real-broke)).
6. **Gain margin.** Under [PI](8-lab.md?preset=pi&gain=2), double the gains. Then halve them. Which loop is limited by the delay and which by the slow heat?
7. **Watch it burn.** Load [PPO with preview on the mixture-ratio steps](8-lab.md?preset=ppo-preview&profile=rof) and press *Hot fire*. *Predict* the flame colour at each step before it comes: 3.8 is the bluest, 3.0 the most orange. Then load the [TFV step](8-lab.md?preset=tfv_step) and watch the plume grow, overshoot and sag while the coolant line cools.
8. **Be the agent.** In the [sandbox](8-lab.md?preset=sandbox&profile=rof), follow the mixture-ratio steps at half speed with TOV alone, then with both valves. Pin your best run and compare it with PI's scores.
9. **Robustness, the challenge's test cases 3–4 in miniature.** Load [PPO with preview](8-lab.md?preset=ppo-preview) and set *LOX turbine ×* to 0.95. *Predict* what happens to the mixture ratio before you look. Then do the same under [PI](8-lab.md?preset=pi&loxturbine=0.95). (The network holds the mixture ratio about 3 % low at every set point; the PI's integrator removes the offset. [Baselines on the surrogate](../04a-surrogate-baselines.md#robustness) has the numbers.) Now try *fuel turbine ×* and *heat flux ×*: which parameters does the network tolerate?

## Model card {#model-card}

**What it is.** A lumped model of an expander-bleed engine with the structure the [Dresia thesis](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=71) describes for LUMEN. Its ten states are:

- the two valve positions and their velocities;
- two shaft speeds;
- the LOX and fuel pump flows (with hydraulic inertia);
- the cooling-channel outlet temperature, which stands in for the thermal mass of the wall;
- a lagged injection temperature.

The pumps follow DLR's dimensionless head map ([eq. 4.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=83)), with coefficients chosen to be consistent with the speeds, outlet pressures and flows the two turbopumps reached in their test campaign ([thesis p. 57](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=74)). The two impulse turbines have a torque that falls with blade speed. The hot-gas valves pass choked flow, with an opening law fitted to the TFV component tests ([Table 4.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=85)). Wall heat scales as $p_{cc}^{0.8}$ with 1.75 MW at 40 bar ([Fig. 4.6](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=80)). Chamber pressure is $c^*/A_t$ times the injected flow, with a mild $c^*(R_{OF})$ curve.

FCV, BPV, OCV and XCV are frozen at their positions at the 40 bar point of [Table 4.6](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=89). Every equation is on the [equation sheet](equations.md). The code is:

- `src/rl_rocket_engine/surrogate/model.py` (Python);
- `docs/javascripts/lumen-model.js` (the same equations, for the browser).

`tests/test_lab_model.py` runs both, in Python and in headless Chrome, and checks steady states, open-loop steps, the PI closed loop and every exported network against each other.

**How it was calibrated** (`python -m rl_rocket_engine.surrogate.calibrate`, about 2 minutes). The fit has two stages, each a bounded least-squares fit:

1. **Statics.** Fourteen parameters are fitted by steady-state solves: the valve flow coefficients, the turbine constants, the feed and cooling-channel resistances, the heat-flux dependence on injection temperature, the $c^*$ curve and the coolant heat capacity. The targets are the 40 bar reference point and the TFV and TOV columns of DLR's static gains ([Table 4.6](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=89)). A weak prior holds the total turbine flow near the 0.59 kg/s implied on [thesis p. 96](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=113).
2. **Dynamics.** Six parameters are fitted by 60 s step simulations: the shaft inertias, the hydraulic inertances, the thermal mass and the injection-temperature lag. The targets are the settling times of [Table 4.7](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=91) and the 6.5 bar overshoot after a TFV step ([p. 73](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=90)).

Bounds on the valve coefficients and the LOX-feed resistance come from the component tests in [Table 4.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=85); the others are wide physical ranges.

**How close it is.** Static gains for a +0.1 step from the 40 bar point (DLR: Table 4.6):

| Output | TFV: DLR | TFV: surrogate | TOV: DLR | TOV: surrogate |
|---|---|---|---|---|
| Chamber pressure [bar] | +3.7 | +3.3 | +2.7 | +2.5 |
| Mixture ratio | −0.6 | −0.55 | +0.9 | +0.93 |
| LNG pump flow [kg/s] | +0.6 | +0.68 | 0.0 | +0.01 |
| LOX pump flow [kg/s] | +0.1 | +0.11 | +0.6 | +0.67 |
| Coolant flow [kg/s] | +0.6 | +0.68 | 0.0 | +0.01 |
| Coolant outlet temperature [K] | −109.8 | −103.5 | +12.3 | +20.2 |

Settling times into a 2 % band after the same steps, in seconds (DLR: Table 4.7):

| Output | TFV: DLR | TFV: surrogate | TOV: DLR | TOV: surrogate |
|---|---|---|---|---|
| LNG pump flow | 15.5 | 17.5 | 0.5 | 0.3 |
| LOX pump flow | 19.5 | 16.9 | 0.5 | 0.5 |
| Coolant flow | 14.9 | 18.5 | 0.5 | 0.3 |
| Chamber pressure | 19.3 | 17.3 | 0.4 | 0.4 |
| Mixture ratio | 5.4 | 4.9 | 0.6 | 0.5 |
| Injection temperature | 23.8 | 23.9 | – | – |

Peak pressure rise after the TFV step: 6.5 bar on both.

```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": {"text": "Surrogate against DLR's LUMEN model", "subtitle": "Settling time after a +0.1 valve step, seconds, log scale. DLR: thesis Table 4.7; surrogate: calibrated.json"},
  "width": "container", "height": 260,
  "data": {"values": [
    {"step": "TFV", "output": "LNG pump flow", "dlr": 15.5, "sur": 17.5}, {"step": "TFV", "output": "LOX pump flow", "dlr": 19.5, "sur": 16.9},
    {"step": "TFV", "output": "Coolant flow", "dlr": 14.9, "sur": 18.5}, {"step": "TFV", "output": "Chamber pressure", "dlr": 19.3, "sur": 17.3},
    {"step": "TFV", "output": "Mixture ratio", "dlr": 5.4, "sur": 4.9}, {"step": "TFV", "output": "Injection temperature", "dlr": 23.8, "sur": 23.9},
    {"step": "TOV", "output": "LNG pump flow", "dlr": 0.5, "sur": 0.3}, {"step": "TOV", "output": "LOX pump flow", "dlr": 0.5, "sur": 0.5},
    {"step": "TOV", "output": "Coolant flow", "dlr": 0.5, "sur": 0.3}, {"step": "TOV", "output": "Chamber pressure", "dlr": 0.4, "sur": 0.4},
    {"step": "TOV", "output": "Mixture ratio", "dlr": 0.6, "sur": 0.5}
  ]},
  "transform": [{"calculate": "datum.step + ': ' + datum.output", "as": "row"}],
  "encoding": {"y": {"field": "row", "type": "nominal", "sort": null, "title": null, "axis": {"labelLimit": 220}}},
  "layer": [
    {"mark": {"type": "rule", "strokeWidth": 2, "color": "var(--viz-axis)"},
     "encoding": {"x": {"field": "dlr", "type": "quantitative", "scale": {"type": "log", "domain": [0.2, 40]}, "title": "Settling time (s)"}, "x2": {"field": "sur"}}},
    {"transform": [{"fold": ["dlr", "sur"], "as": ["who", "ts"]}, {"calculate": "datum.who === 'dlr' ? 'DLR LUMEN model' : 'Surrogate'", "as": "model"}],
     "mark": {"type": "point", "filled": true, "size": 90, "stroke": "var(--md-default-bg-color)", "strokeWidth": 2},
     "encoding": {"x": {"field": "ts", "type": "quantitative"}, "color": {"field": "model", "type": "nominal", "scale": {"domain": ["DLR LUMEN model", "Surrogate"]}, "legend": {"title": null}},
       "tooltip": [{"field": "row", "title": "step and output"}, {"field": "model"}, {"field": "ts", "title": "settling (s)"}]}}
  ]
}
```

**Where it is wrong, and why.**

- **Only the 40 bar neighbourhood is calibrated.** DLR publishes gains at one operating point. Away from it, the surrogate's gains follow from its physics, not from data. Its reachable envelope with two valves is about 32–52 bar; LUMEN's is 35–80 bar with all six valves.
- **The TOV effect on coolant temperature is too large** (+20 K against +12 K). The surrogate has no path by which more LOX flow cools the wall.
- **Four static parameters sit on their bounds**: the BPV coefficient, the cooling-channel and LOX-feed resistances, and the ROF of peak $c^*$. A reduced model needs some parameters to absorb physics it leaves out.
- **The hydraulic inertances are far larger than a real feed line's** (about 2 bar·s per kg/s, against roughly 0.04 for a 2 m line). They stand in for the feed-system and pump dynamics the model leaves out, and set the half-second TOV response.
- **The injection temperature is an empirical lag** tied to the coolant temperature (−47.8 K per −109.8 K, Table 4.6), not a mixer model. There is no injector, so no momentum flux ratio $J$; no ignition, start-up or shutdown; no two-phase flow; and no faults.
- **Sensors are simple**: a pure delay and Gaussian noise on chamber pressure and mixture ratio.

**What it is good for.**

- Intuition about the mechanisms: the coupling, the slow thermal channel, delays and the operating map.
- A runnable, CPU-cheap stand-in to develop and debug tooling: environment wrappers, baselines, metrics, notebooks and the browser Lab.
- Comparing controllers *on the surrogate*.

**What it is not good for.** Any claim about LUMEN or about the challenge's simulator. When access is granted, every baseline here should be rerun there.

See also the [equation sheet](equations.md).
