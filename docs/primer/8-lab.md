---
hide:
  - navigation
  - toc
icon: re/lab
---

# :re-lab: The Engine Lab

<p class="lab-disclaimer"><b>Surrogate engine, not DLR's simulator</b> (which is not public): a reduced model calibrated to the gains, settling times and overshoot DLR publishes for LUMEN (<a href="#model-card">model card</a>). Use it to build intuition and test ideas, not to report a number about the challenge.</p>

<div class="re-widget re-lab" data-widget="lab" data-title="The Engine Lab"></div>

??? abstract "What this is"

    The 2×2 task of the LUMEN Control Challenge, rebuilt on a **surrogate engine** that runs in your browser. TFV and TOV are the actions; chamber pressure and mixture ratio follow set points every 0.05 s (20 Hz, the challenge's rate), under the constraints of [thesis Table 5.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=96).

    Presets are grouped by **who turns the knobs**:

    - a schedule (*open loop*);
    - a PI controller (*feedback*);
    - a network trained with PPO or SAC at 20 Hz without preview, the challenge's setting (*learned feedback*), or one of the earlier 10 Hz networks, with and without preview;
    - you (*sandbox*).

    Every controller runs live on the engine you see, so when you perturb the engine the controllers react. The episode code is the same as the Python environment the agents were trained in.

## How to use it

- **The viewer is LUMEN on DLR's P8.3 test stand**, fired horizontally out of the open side of the cell as in the photos of Traudt et al. ([IAC 2024](https://elib.dlr.de/213229/1/IAC-24,C4,1,5,x86850%20manuscript.pdf#page=3)). On a wide screen the controls float over the scene; on a phone they sit under it. *Full screen* (the corner button, or <kbd>F</kbd>) works on both.
    - **Every panel folds to its title.** Click a title to fold it away and again to bring it back. Folded panels show a one-line summary, such as the scores or "perturbed".
    - **Information folds away too.** The buttons in the top-right corner open one card at a time. *Story* explains the preset. *Labels* switches the layers on the stand. *A–Z* spells out every acronym. *About* explains how to read the stand and lists the keys.
- **Controller (left): choose who turns the knobs** and the set points:
    - the 40 s evaluation profile used in [Baselines on the surrogate](../04a-surrogate-baselines.md);
    - a pressure ladder;
    - mixture-ratio steps;
    - a random profile like the training ones.

    **Under PI, choose how the gains are set:** *tuned* (Nelder–Mead on training episodes) or *by bandwidth*.
    - By bandwidth, one slider per loop sets its closed-loop bandwidth. The gains follow from a first-order-plus-dead-time model of each decoupled channel ([equation](equations.md#eq-pi-bandwidth)).
    - Underneath you see the gains, each loop's crossover frequency and phase margin (amber below 45°, red below 30°), and a plot of each loop's gain.
    - *Default* resets to the bandwidths that scored best on the training episodes.

    In the sandbox you get TFV and TOV sliders with *Play*. You can also drag the valves on the stand, or use the arrow keys.
- **Test cases and faults (left).**
    - **Test case:** run one of the challenge's seven test cases in miniature: nominal with a known or an unknown reference, an engine that varies or has changed, slow drift, and a fault with or without a detection signal. The test case sets the set points, the engine and the faults. Choose *free* to set them yourself.
    - **Add up to three faults** in free mode, each with its onset, size and how fast it comes on:
        - a stuck TFV or TOV, or valve actuators that lag;
        - a worn bearing on either turbopump;
        - a fuel or LOX leak;
        - a blocked turbine nozzle;
        - cooling degradation or turbine ageing;
        - a pressure sensor with an offset, a drift or a frozen reading, or a mixture-ratio sensor with a gain error.
    - **Test every controller** opens the scoreboard (below).
- **Engine and sensors (left): perturbations the controllers were not trained on.**
    - *Heat flux ×* scales the wall heat (the slow loop).
    - *Fuel turbine ×* and *LOX turbine ×* scale each turbine's torque. DLR randomised turbine efficiencies for the same reason.
    - *Valve dead time* stands in for the valve-model error that made DLR's first RL hot-fire test oscillate.
    - You can also switch off sensor delays and noise.

    Every change shows on the stand as an amber :re-gear: tag at the part it affects. A test case sets these itself.
- **Telemetry (right)** has two dials, chamber pressure and mixture ratio:
    - the needle is the engine;
    - the orange triangle is the set point;
    - the small tick is what the controller reads, late and noisy.

    Bars show each constrained variable against its limit (the red mark). They turn amber within 5 % of the limit and red beyond it. Active faults are listed with their severity. Two small trends show the whole episode.
- **Score (right)** shows the return, the mean absolute percentage errors (MAPE), the constraint-violation steps and the valve travel. **Pin** keeps a run as a grey line in every plot (up to three) and shows its scores in brackets.
- **At the bottom, a narration line says what is happening:**
    - a new set point and how the controller answers;
    - which output is off target and which valve is moving;
    - when the slow coolant temperature is still drifting;
    - when a limit is crossed;
    - when a fault starts, what it does to the engine, and how the controller answers.

    Below it, :re-play: *Hot fire* plays the episode in real time (or 2× / 4×). With *start-up and shutdown* on, it opens with a GN2 spin-up of the turbopumps, laser ignition and a pressure rise of about 1.5 s. It ends with a shutdown and an LN2 purge. Both durations follow the shape of DLR's hot-fire traces (IAC 2024, Fig. 5). The time slider, or hovering any plot under the viewer, shows one moment.
- **On the stand:**
    - **what moves with the simulation:** chamber pressure, mixture ratio, pump speeds (with a ring showing each pump's speed against its limit), valve openings (the dial, with the command as a tick), the flows in every line, the coolant moving back through the jacket, the coolant and turbine-gas temperatures, and limit violations, shown as pulsing red outlines;
    - **thrust**, in newtons, on a tag at the load cell where the engine pushes into the thrust frame. It is drawn as 25 kN × p_cc / 60 bar: thrust is proportional to chamber pressure, LUMEN's 35–80 bar envelope is 58–133 % of its nominal thrust ([thesis Table 4.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=75)), and the engine is "in the 25 kN thrust range" ([p. 5](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=22));
    - **the control loop:** the dashed wires from the sensor tap to the controller cabinet and on to the two valves carry one pulse per control step (0.05 s);
    - **callouts** mark the start-up phases, set-point steps and limits as they happen;
    - **malfunctions pop out** the moment they start: the stand jolts briefly, the view flashes red, a shockwave rings out from the failing part, and a red callout names the fault and what it does. While a fault lasts, its part shows it:
        - a worn bearing rattles its pump, glows and throws sparks;
        - a leak sprays vapour, and frost spreads on the floor;
        - a stuck valve turns red, with warning hatching and a padlock, and its tag says where it froze. Its actuator throws electric arcs while the command moves on, shown as a dashed ghost of the gate and a red gap on the dial;
        - a blocked turbine turns sooty, sparks at its inlet and puffs soot, with a red cross on the inlet;
        - cooling degradation shows a pulsing hot spot with heat shimmer;
        - ageing turns the turbines rusty, with the odd spark and falling flakes;
        - a faulty sensor blinks red, its reading and the true value are tagged side by side, and its signal travels as a red, jittering pulse.

      The status badge turns into striped red; in test case 6 a *fault flag* chip shows what the controller is told. Red marks on the time slider and red lines in the plots mark each onset.
    - **hover any part** (or tap it on a phone) for its name and live values. Zoom with the buttons, <kbd>+</kbd> / <kbd>−</kbd>, ctrl-scroll or a pinch, then drag to look around.
    - **what is a coarse guess:** the flame and everything around it. Plume length and brightness grow with pressure. The colour runs from orange when fuel-rich to violet-blue towards stoichiometric. Shock diamonds spread with pressure. The jet starts to separate inside the nozzle below about 38 bar, while the real nozzle is designed for no separation at 60 bar ([Deeken et al. 2021](https://elib.dlr.de/142128/1/Paper.pdf#page=6)). Orange afterburning tongues grow with fuel-richness, and steam rises from the spray ring.
- **The scoreboard** (the *Tests* button, or <kbd>T</kbd>) runs every controller through every test case, live in your browser: 9 controllers × 7 test cases, one episode each, in a few seconds.
    - Each cell shows the mean chamber-pressure error, the mixture-ratio error and the seconds spent over a limit, coloured from green to red. The best controller per test case is outlined.
    - Click a cell to watch that episode on the stand.
- **The plots under the viewer:**
    - chamber pressure and mixture ratio against their set points (dashed);
    - valve commands (dashed) and positions;
    - a constrained variable of your choice with its limit;
    - the reward per step.
- **Links can open the Lab in a given state**:
    - `?preset=pi&heat=1.1` or `?preset=sac&loxturbine=0.95` for a perturbed engine;
    - `?preset=pi&pbw=1.2&rbw=0.3` for a PI by bandwidth;
    - `?test=tc7&preset=ppo` for a test case;
    - `?fault=bearing_ftp@15,stuck_tov@25` for faults;
    - `?sensors=ideal&noise=0` for ideal sensors;
    - `&t=22` to open at a moment, and `&play=1` to start the hot fire straight away.

## Guided experiments

Each takes a few minutes. Predict first, then look.

1. **The slow channel.** Load the [TFV step](8-lab.md?preset=tfv_step) and the [TOV step](8-lab.md?preset=tov_step). *Predict:* which output settles first after TFV, and why? (Mixture ratio, in about 5 s: it depends on the ratio of the two flows, which the thermal sag changes less than their sum.)
2. **Feedforward is not control.** Load [feedforward only](8-lab.md?preset=feedforward), then set *heat flux ×* to 1.1. The commands do not change, so the error stays. Now load [PI](8-lab.md?preset=pi&heat=1.1) with the same perturbation.
3. **Where PI loses.** In [PI on the evaluation profile](8-lab.md?preset=pi), find the step at 27 s (50 → 38 bar while mixture ratio is held). *Predict* which output the PI gets wrong first. Pin the run, then load [PPO](8-lab.md?preset=ppo) at 20 Hz. Then load the earlier [PPO with preview](8-lab.md?preset=ppo-preview): what does it do with TOV *before* the step?
4. **What preview is worth.** Load [SAC, preview](8-lab.md?preset=sac-preview), pin it, then [SAC, no preview](8-lab.md?preset=sac-nopreview). Where in the profile do the two differ, at steps or during ramps? The challenge gives no preview ([organisers, Oct 2026](../07-references.md#organisers2026)), so the difference is what a challenge entry has to make up by other means.
5. **Break the valve model.** Raise *valve dead time* to 0.15 s under [PI](8-lab.md?preset=pi&delay=0.15), then under [PPO](8-lab.md?preset=ppo&delay=0.15). Which one starts to oscillate, and in which output? A valve-model error of this kind made DLR's first RL hot-fire test oscillate ([Valves are the actuators](3-valves.md#where-sim-to-real-broke)).
6. **Bandwidth and margin.** Load [PI by bandwidth](8-lab.md?preset=pi&pi=bw) and raise the mixture-ratio loop's bandwidth until its phase margin turns red. *Predict* the frequency it will ring at, then look. Do the same with the pressure loop. Which loop is limited by the delay, and which by the slow heat? Then switch to *tuned* and read off the margins of the gains Nelder–Mead chose.
7. **Watch it burn.** Load [PPO on the mixture-ratio steps](8-lab.md?preset=ppo&profile=rof) and press *Hot fire*. *Predict* the flame colour at each step before it comes: 3.8 is the bluest, 3.0 the most orange. Then load the [TFV step](8-lab.md?preset=tfv_step) and watch the plume grow, overshoot and sag while the coolant line cools.
8. **Be the agent.** In the [sandbox](8-lab.md?preset=sandbox&profile=rof), follow the mixture-ratio steps at half speed with TOV alone, then with both valves. Pin your best run and compare it with PI's scores.
9. **Robustness, the challenge's test cases 3–4 in miniature.** Load [PPO](8-lab.md?preset=ppo) and set *LOX turbine ×* to 0.95. *Predict* what happens to the mixture ratio before you look. Then do the same under [PI](8-lab.md?preset=pi&loxturbine=0.95). (The earlier 10 Hz networks held the mixture ratio about 3 % low at every set point; the PI's integrator removes the offset. [Baselines on the surrogate](../04a-surrogate-baselines.md#robustness) has the numbers.) Now try *fuel turbine ×* and *heat flux ×*: which parameters does the network tolerate?
10. **A fault the controller is told about, and one it is not.** Load [test case 6 under PI](8-lab.md?preset=pi&test=tc6&t=14&play=1). The fuel pump's bearing wears at 15 s. *Predict* which way the mixture ratio goes, and which valve the PI opens. Then load [test case 7](8-lab.md?preset=pi&test=tc7&t=19&play=1): TOV sticks at 20 s. What can the PI still control with one valve?
11. **Every controller, every test case.** Open the scoreboard (<kbd>T</kbd>) and run it. Which test case separates the controllers most? Is the controller that wins nominal tracking the one that wins under faults? Click the cell of the biggest loser and watch why it loses.
12. **Lie to the controller.** In free mode, add a *p_cc sensor drift* at 10 s under [PI](8-lab.md?preset=pi&fault=sensor_pcc_drift@10), then under [SAC](8-lab.md?preset=sac&fault=sensor_pcc_drift@10). Both follow the wrong number. Watch the true pressure and the reading part ways on the stand.

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
- **The injection temperature is an empirical lag** tied to the coolant temperature (−47.8 K per −109.8 K, Table 4.6), not a mixer model. There is no injector, so no momentum flux ratio $J$; no ignition, start-up or shutdown (the Lab draws them, it does not simulate them); and no two-phase flow.
- **Faults are simple by design** ([equation](equations.md#eq-faults)). A worn bearing adds friction torque, a leak removes a share of a pump's flow, a blockage shrinks a turbine path, and a stuck valve freezes. Sensor faults change the reading. Their sizes and onsets are this site's choices, after the kinds DLR simulated in DX'25. They show how a controller reacts, not how LUMEN fails.
- **Sensors are simple**: a pure delay and Gaussian noise on chamber pressure and mixture ratio.
- **The rate is the challenge's 20 Hz.** The earlier baselines ran at 10 Hz, the thesis's simulation setting, and still do in the Lab.

**What it is good for.**

- Intuition about the mechanisms: the coupling, the slow thermal channel, delays and the operating map.
- A runnable, CPU-cheap stand-in to develop and debug tooling: environment wrappers, baselines, metrics, notebooks and the browser Lab.
- Comparing controllers *on the surrogate*.

**What it is not good for.** Any claim about LUMEN or about the challenge's simulator. When access is granted, every baseline here should be rerun there.

See also the [equation sheet](equations.md).
