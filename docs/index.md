---
icon: re/engine
---

<div class="re-hero" markdown>

# RL for rocket engine control

<p>A literature review, a domain primer and a runnable CPU codebase for deep reinforcement learning control of liquid-propellant rocket engines. It is anchored on DLR's <strong>LUMEN Control Challenge</strong>: two turbine valves of a 25 kN LOX/methane expander-bleed engine must make chamber pressure and mixture ratio follow a reference, with the engine's limits respected.</p>

<div class="re-stats">
<div class="re-stat"><b>2 × 2</b><span>turbine valves in; chamber pressure and mixture ratio out (<a href="https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=55">benchmark design</a>)</span></div>
<div class="re-stat"><b>1.3 %</b><span>mean tracking error of DLR's SAC controller on the real engine (<a href="https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130">thesis Table 6.2</a>)</span></div>
<div class="re-stat"><b>0.5 s vs 20 s</b><span>settling after a TOV step against a TFV step: one fast valve, one slow (<a href="https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=91">Table 4.7</a>)</span></div>
<div class="re-stat"><b>2.61 → 1.04 %</b><span>chamber-pressure error, tuned PI against PPO at 20 Hz without preview, as in the challenge, on this site's surrogate engine (<a href="04a-surrogate-baselines/">baselines</a>)</span></div>
</div>

</div>

<div class="re-foundation" markdown>

<p class="re-eyebrow">Built on</p>

## The work this project stands on { #built-on }

This is an independent study. Its foundation is the research of **DLR's Institute of Space Propulsion** in Lampoldshausen:

- **The benchmark.** The LUMEN Control Challenge, designed by Vincent Bareiß, Kai Dresia, Günther Waxenegger-Wilfing and colleagues ([AI4Aerospace 2025](https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=55); [RL4AA'25](https://indico.kit.edu/event/4216/contributions/19241/contribution.pdf)).
- **The method and most of the numbers.** Kai Dresia's doctoral thesis, *Rocket Engine Control with Deep Reinforcement Learning* (RWTH Aachen, 2025; [DLR-FB-2025-16](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf)). It covers the LUMEN model, SAC against MPC, and the first RL controller to run the engine in a hot-fire test.
- **The engine.** LUMEN, designed, built and fired by DLR ([Deeken et al. 2021](https://elib.dlr.de/142128/1/Paper.pdf); [Traudt et al. 2022](https://elib.dlr.de/191316/1/Traudt%20IAC-22,C4,1,3,x73654.pdf), [2024](https://elib.dlr.de/213229/1/IAC-24,C4,1,5,x86850%20manuscript.pdf)). Also its validated simulation model ([Kurudzija et al. 2025](https://www.eucass.eu/doi/EUCASS2025-105.pdf)) and the safety work around its RL hot-fire tests ([Dauer et al. 2025](https://www.eucass.eu/doi/EUCASS2025-533.pdf)).

Every statement on this site about LUMEN, its model or DLR's controllers cites one of these works, usually with a page number. The surrogate engine, its baselines and the Engine Lab are this project's own; **they are not DLR's simulator**, and their numbers say nothing quantitative about the challenge.

??? quote "Cite the foundation (BibTeX)"

    ```bibtex
    @phdthesis{dresia2025thesis,
      author = {Dresia, Kai},
      title  = {Rocket Engine Control with Deep Reinforcement Learning},
      school = {RWTH Aachen University},
      year   = {2025},
      note   = {DLR-Forschungsbericht DLR-FB-2025-16},
      doi    = {10.18154/RWTH-2025-05076},
      url    = {https://elib.dlr.de/219040/}
    }
    @inproceedings{bareiss2025benchmark,
      author    = {Barei{\ss}, Vincent and Dresia, Kai and Waxenegger-Wilfing, G{\"u}nther},
      title     = {Development of a Benchmark for Deep Reinforcement Learning Based Control of Liquid Propellant Rocket Engines},
      booktitle = {5th AI4Aerospace Workshop (DLR--ONERA)},
      address   = {Toulouse},
      year      = {2025},
      pages     = {55--56},
      url       = {https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf}
    }
    @misc{dresia2025rl4aa,
      author       = {Dresia, Kai and Waxenegger-Wilfing, G{\"u}nther and Dauer, Jonas and Hirlaender, Simon and Barei{\ss}, Vincent},
      title        = {A Benchmark for Deep Reinforcement Learning-Based Control of Liquid-Propellant Rocket Engines},
      howpublished = {RL4AA'25 workshop, DESY Hamburg},
      year         = {2025},
      url          = {https://indico.kit.edu/event/4216/contributions/19241}
    }
    ```

</div>

!!! info "Status on 2026-10-08: the challenge is expected around the end of October 2026"
    DLR presented the LUMEN Control Challenge at the RL Bootcamp 2026 on 17 September, promising "Public access to generalized LUMEN simulator model" and "Automatic evaluation of your control performance". The organisers now expect to share a repository around the end of October 2026 ([personal communication](07-references.md#organisers2026)). They have confirmed:

    - control at 20 Hz;
    - episodes of 10–100 s;
    - no preview of future set points in the observation;
    - fine-tuning data from simulation with changed model parameters, not from hot fire.

    Until the release, this site runs a **surrogate**: a reduced LUMEN-like engine calibrated to the gains, settling times and overshoot DLR publishes for its model ([model card](primer/8-lab.md#model-card)). The primer's widgets, the [Engine Lab](primer/8-lab.md) and the [baselines](04a-surrogate-baselines.md) all run on it. The earlier search for a public release is logged in [§7.1](07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not).

## Five things to know before reading further

1. **The task is a coupled 2×2 tracking problem.** Two turbine valves (TFV, TOV) set chamber pressure, i.e. thrust, and mixture ratio, i.e. combustion temperature. Both valves move both outputs ([The engine as a control system](primer/1-engine.md)). Seven benchmark test cases add unknown references, parametric model error, slow drift and faults ([§1](01-problem.md)).
2. **One valve is fast and one is slow.** The oxidiser side settles in half a second. The fuel side settles over 5–24 s, because the fuel is also the coolant whose heat drives both turbines ([Fast chamber, slow heat](primer/4-time-scales.md)).
3. **RL has already flown on this engine, briefly.** DLR's SAC controller tracked four variables at a mean error of 1.3 % over more than 16 s of hot fire, zero-shot from simulation. In simulation the same controller reaches 0.4 % ([thesis Table 6.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130)). The first hardware deployment failed on a valve-model error ([Valves are the actuators](primer/3-valves.md#where-sim-to-real-broke)).
4. **In simulation, RL beat MPC on speed and constraints; MPC won on fuel.** On a shared 5-valve task SAC reached 0.3 % / 0.1 % tracking error against MPC's 1.4 % / 0.6 %, and settled in 0.7 s against 3.0 s. MPC used 0.38 % less propellant ([thesis p. 93–97](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=110)).
5. **On this site's surrogate, no controller wins every test case.** At 20 Hz without preview, as in the challenge, PPO tracks chamber pressure to 1.0 % against 2.6 % for a tuned PI, with no time over a limit. Preview, which the challenge excludes, halved that error for the earlier 10 Hz agents. But on the challenge's test cases in miniature the picture splits ([test cases](04a-surrogate-baselines.md#test-cases)):
    - the networks win nominal tracking;
    - when the engine changes, drifts or wears a bearing, they lose the mixture ratio and a PI does better;
    - when a valve sticks, everyone loses the mixture ratio.

    These are surrogate numbers, not LUMEN's. They show where to look: robustness and faults, which is what the challenge's test cases 3–7 probe. The [Engine Lab](primer/8-lab.md) runs the whole matrix live in your browser.

## The sources, curated

The papers this site leans on most, with the one result or sentence that makes each matter. Every one is open to read. Full details and verification status are in [§7 References](07-references.md).

### The challenge

<div class="grid cards re-sources" markdown>

-   :re-flag:{ .lg .middle } **The benchmark design**

    ---

    <span class="re-src-meta">Bareiß, Dresia, Waxenegger-Wilfing · AI4Aerospace workshop, Toulouse, 2025</span>

    *Development of a Benchmark for Deep Reinforcement Learning Based Control of Liquid Propellant Rocket Engines*

    > "the resulting LUMEN control task is a 2×2 MIMO problem"

    Seven test cases, from nominal tracking to faults without a detection signal, each a Gym environment.

    [:re-paper: Extended abstract, pp. 55–56](https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=55){ .re-src-link } [:re-external: elib record](https://elib.dlr.de/220065/){ .re-src-link }

-   :re-megaphone:{ .lg .middle } **The announcement**

    ---

    <span class="re-src-meta">Dresia, Waxenegger-Wilfing, Dauer, Hirlaender, Bareiß · RL4AA'25, DESY Hamburg</span>

    *A Benchmark for Deep Reinforcement Learning-Based Control of Liquid-Propellant Rocket Engines*

    > "will be made freely accessible to the RL community"

    Simulation software calibrated on experiments, a fine-tuning dataset, and sensor and system faults.

    [:re-paper: Abstract](https://indico.kit.edu/event/4216/contributions/19241/contribution.pdf){ .re-src-link } [:re-external: Indico](https://indico.kit.edu/event/4216/contributions/19241){ .re-src-link }

-   :re-video:{ .lg .middle } **The pitch**

    ---

    <span class="re-src-meta">DLR Institute of Space Propulsion · RL Bootcamp 2026, Salzburg, 17 Sep 2026</span>

    *LUMEN Control Challenge* slide and talk

    > "Public access to generalized LUMEN simulator model"

    PPO and SAC demos in simulation, and about 15 s of closed loop on the real engine.

    [:re-video: Livestream at 7:18:00](https://www.youtube.com/watch?v=CX8I88Pta_I&t=26280s){ .re-src-link }

</div>

### The research it rests on

<div class="grid cards re-sources" markdown>

-   :re-thesis:{ .lg .middle } **The doctoral thesis**

    ---

    <span class="re-src-meta">Kai Dresia · RWTH Aachen, 2025 · DLR-FB-2025-16</span>

    *Rocket Engine Control with Deep Reinforcement Learning*

    **1.3 %** mean tracking error on the real engine, zero-shot from simulation, against 0.4 % in simulation (Table 6.2). Also SAC against MPC, and the LUMEN model's step responses.

    [:re-paper: PDF](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf){ .re-src-link } [:re-external: RWTH record](https://publications.rwth-aachen.de/record/1012640){ .re-src-link }

-   :re-shield:{ .lg .middle } **Safety and the first hot-fire tests**

    ---

    <span class="re-src-meta">Dauer, Dresia, Deeken, Waxenegger-Wilfing · EUCASS 2025</span>

    *How to Guarantee Safety for Neural Network based Rocket Engine Controllers*

    > "likely attributable to an inaccurate model of the valve dynamics"

    Why the first RL hot-fire test oscillated, and an out-of-capability score to catch it.

    [:re-paper: Paper](https://www.eucass.eu/doi/EUCASS2025-533.pdf){ .re-src-link }

-   :re-paper:{ .lg .middle } **RL for engine transients**

    ---

    <span class="re-src-meta">Waxenegger-Wilfing, Dresia, Deeken, Oschwald · IEEE TAES 57(5), 2021</span>

    *A Reinforcement Learning Approach for Transient Control of Liquid Rocket Engines*

    An early deep-RL engine controller from the same group: TD3 on a gas-generator engine model wrapped as a Gym environment, compared with PID and open loop.

    [:re-paper: arXiv:2006.11108](https://arxiv.org/abs/2006.11108){ .re-src-link } [:re-external: doi](https://doi.org/10.1109/TAES.2021.3074134){ .re-src-link }

</div>

### The engine and its model

<div class="grid cards re-sources" markdown>

-   :re-engine:{ .lg .middle } **The demonstrator**

    ---

    <span class="re-src-meta">Deeken, Waxenegger-Wilfing, Oschwald, Schlechtriem · Space Propulsion 2020+1</span>

    *LUMEN Demonstrator – Project Overview*

    The project's goals, the operating envelope and nominal flows, the turbopumps, the laser igniter, and a nozzle extension designed for no flow separation at 60 bar.

    [:re-paper: Paper](https://elib.dlr.de/142128/1/Paper.pdf){ .re-src-link }

-   :re-hotfire:{ .lg .middle } **The hot-fire campaign**

    ---

    <span class="re-src-meta">Traudt et al. · IAC 2024, Milan</span>

    *LUMEN: A Versatile Test Bed for Rocket Engine Components: Hot-Fire Test Results*

    Nominal 60 bar at mixture ratio 3.4, throttled from 58 to 133 %, with four valves in closed loop at 20 Hz. Its photos are the model for the Lab's test stand.

    [:re-paper: Paper](https://elib.dlr.de/213229/1/IAC-24,C4,1,5,x86850%20manuscript.pdf){ .re-src-link }

-   :re-sim:{ .lg .middle } **The model, validated on hot fire**

    ---

    <span class="re-src-meta">Kurudzija, Dresia, Bareiß et al. · EUCASS 2025</span>

    *Validation of the LUMEN EcosimPro Model with Hot-Fire Test Data*

    Chamber pressure predicted to **2.4 %** and mixture ratio to **3.5 %** mean absolute error over a test run (Table 2).

    [:re-paper: Paper](https://www.eucass.eu/doi/EUCASS2025-105.pdf){ .re-src-link } [:re-external: Preprint on the transient model (2026)](https://doi.org/10.2139/ssrn.6806858){ .re-src-link }

</div>

## How to read this site

The left navigation tells one story, in this order. Each page's previous and next buttons follow it.

<div class="grid cards re-route" markdown>

-   :re-onramp:{ .lg .middle } **Start · For Leander**

    ---

    What transfers from an RL background, what is new, what the organisers have confirmed, and ten working days.

    [:re-play: The on-ramp](for-leander.md)

-   :re-loop:{ .lg .middle } **1 · The control problem**

    ---

    The task as an MDP, the seven test cases, and what "solved" should mean.

    [:re-play: The MDP](01-problem.md)

-   :re-primer:{ .lg .middle } **2 · The physics**

    ---

    Nine short chapters from thrust and mixture ratio to the reward, each with a widget. They build up to the Engine Lab and end with real hot fire and an equation sheet.

    [:re-play: The primer](02-primer.md) · [:re-lab: The Engine Lab](primer/8-lab.md)

-   :re-timeline:{ .lg .middle } **3 · Timeline 2018–2026**

    ---

    Who did what, in date order: the engine line and the adjacent fields.

    [:re-play: The field](03-timeline.md)

-   :re-results:{ .lg .middle } **4 · Designs and results**

    ---

    Published controllers side by side: SAC, TD3, MPC, PI and curriculum PPO.

    [:re-play: The literature](04-designs.md)

-   :re-surrogate:{ .lg .middle } **4a · Baselines on the surrogate**

    ---

    This repo's dry run at 20 Hz: PI (tuned or by bandwidth), PPO and SAC on the 2×2 task and the seven test cases with faults, and the networks live in the Lab.

    [:re-play: The dry run](04a-surrogate-baselines.md)

-   :re-warning:{ .lg .middle } **5 · Limitations**

    ---

    What fails and by how much: sim-to-real gaps, valve models, sensor noise, compute.

    [:re-play: The caveats](05-limitations.md)

-   :re-idea:{ .lg .middle } **6 · Open questions**

    ---

    Ranked research openings with effort estimates, starting with anticipation without preview.

    [:re-play: What to do next](06-open-questions.md)

-   :re-books:{ .lg .middle } **7 · References**

    ---

    Every source, how far it was verified, and the search log.

    [:re-play: The sources](07-references.md)

</div>

## Reproduce

```bash
git clone https://github.com/leandergrech/rl-rocket-engine-control && cd rl-rocket-engine-control
python3.12 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -e ".[dev,rl]"
bash scripts/reproduce.sh
```

`reproduce.sh` runs the tests, including the check that the browser model matches the Python one, and builds the docs strictly. It also re-evaluates every stored policy against `data/results/summary.json`; the environment is deterministic, so they must match. `bash scripts/reproduce.sh --full` also recalibrates the surrogate and retrains every baseline (about 3 hours on a laptop CPU). To check whether the challenge has gone public, run `python scripts/check_challenge.py`. [STATUS.md](https://github.com/leandergrech/rl-rocket-engine-control/blob/main/STATUS.md) tracks the build state.

## References { #references }

<div class="re-endrefs" markdown>

Every source used on this site, with how far it was verified (full text, abstract only, unverified or personal communication):

[:re-books: 7. References](07-references.md){ .md-button .md-button--primary } [:re-timeline: Timeline 2018–2026](03-timeline.md){ .md-button } [:re-glossary: Glossary](primer/9-field.md#glossary){ .md-button } [:re-quote: Cite the foundation](#built-on){ .md-button }

Key documents: [Dresia 2025 (thesis)](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf) · [Bareiß et al. 2025 (benchmark design)](https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=55) · [Dresia et al. 2025 (RL4AA'25)](https://indico.kit.edu/event/4216/contributions/19241/contribution.pdf) · [Dauer et al. 2025](https://www.eucass.eu/doi/EUCASS2025-533.pdf) · [Kurudzija et al. 2025](https://www.eucass.eu/doi/EUCASS2025-105.pdf) · [Traudt et al. 2024](https://elib.dlr.de/213229/1/IAC-24,C4,1,5,x86850%20manuscript.pdf) · [Deeken et al. 2021](https://elib.dlr.de/142128/1/Paper.pdf) · [Waxenegger-Wilfing et al. 2021](https://arxiv.org/abs/2006.11108)

</div>
