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
<div class="re-stat"><b>2.75 % → 0.5 %</b><span>chamber-pressure error, decoupled PI against PPO or SAC with preview, on this site's surrogate engine (<a href="04a-surrogate-baselines/">baselines</a>)</span></div>
</div>

</div>

!!! warning "Status on 2026-10-02: the challenge simulator is not public"
    DLR pitched the challenge at the RL Bootcamp 2026 on 17 September. The slide promises "Public access to generalized LUMEN simulator model" and "Automatic evaluation of your control performance". The speaker said release was waiting on "some legal issues" and asked interested people to email. A 30-minute search found no public simulator, package, dataset or evaluation service ([search log](07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not)); a [draft access request](https://github.com/leandergrech/rl-rocket-engine-control/blob/main/docs/email-to-dlr.md) is ready for Leander to send.

    In the meantime this site runs a **surrogate**: a reduced LUMEN-like engine calibrated to the gains, settling times and overshoot DLR publishes for its model ([model card](primer/8-lab.md#model-card)). The primer's widgets, the [Engine Lab](primer/8-lab.md) and the [baselines](04a-surrogate-baselines.md) all run on it. **It is not DLR's simulator**, and its numbers say nothing quantitative about the challenge.

## Five things to know before reading further

1. **The task is a coupled 2×2 tracking problem.** Two turbine valves (TFV, TOV) set chamber pressure, i.e. thrust, and mixture ratio, i.e. combustion temperature. Both valves move both outputs ([The engine as a control system](primer/1-engine.md)). Seven benchmark test cases add unknown references, parametric model error, slow drift and faults ([§1](01-problem.md)).
2. **One valve is fast and one is slow.** The oxidiser side settles in half a second. The fuel side settles over 5–24 s, because the fuel is also the coolant whose heat drives both turbines ([Fast chamber, slow heat](primer/4-time-scales.md)).
3. **RL has already flown on this engine, briefly.** DLR's SAC controller tracked four variables at a mean error of 1.3 % over more than 16 s of hot fire, zero-shot from simulation. In simulation the same controller reaches 0.4 % ([thesis Table 6.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130)). The first hardware deployment failed on a valve-model error ([Valves are the actuators](primer/3-valves.md#where-sim-to-real-broke)).
4. **In simulation, RL beat MPC on speed and constraints; MPC won on fuel.** On a shared 5-valve task SAC reached 0.3 % / 0.1 % tracking error against MPC's 1.4 % / 0.6 %, and settled in 0.7 s against 3.0 s. MPC used 0.38 % less propellant ([thesis p. 93–97](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=110)).
5. **On this site's surrogate, learned controllers beat a decoupled PI five-fold, until the engine changes.** PPO and SAC with set-point preview track chamber pressure to about 0.5 % against the PI's 2.75 %, with no constraint violations. Preview halves the pressure error. A 5 % weaker LOX turbine, which no controller was trained on, leaves the networks with a steady 3 % mixture-ratio offset that the PI's integrator removes ([Baselines on the surrogate](04a-surrogate-baselines.md)). These are surrogate numbers, not LUMEN's, but they show where to look: robustness to model error, which is exactly what the challenge's test cases 3–7 probe.

## How to read this site

<div class="grid cards" markdown>

-   :re-onramp:{ .lg .middle } **For Leander**

    ---

    What transfers from your RL background, what is new, and a two-week plan.

    [:octicons-arrow-right-24: Start here](for-leander.md)

-   :re-loop:{ .lg .middle } **The control problem**

    ---

    The task as an MDP, the seven test cases, and what "solved" should mean.

    [:octicons-arrow-right-24: The MDP](01-problem.md)

-   :re-primer:{ .lg .middle } **Domain primer**

    ---

    Nine short chapters from thrust and mixture ratio to the reward, each with a widget, and an equation sheet.

    [:octicons-arrow-right-24: The physics](02-primer.md) · [:re-lab: The Engine Lab](primer/8-lab.md)

-   :re-results:{ .lg .middle } **Designs and results**

    ---

    Published controllers side by side: SAC, TD3, MPC, PI and curriculum PPO.

    [:octicons-arrow-right-24: The literature](04-designs.md)

-   :re-surrogate:{ .lg .middle } **Baselines on the surrogate**

    ---

    PI, PPO and SAC, with and without reference preview, on the 2×2 task. Includes robustness tests and the networks running live in the Lab.

    [:octicons-arrow-right-24: The dry run](04a-surrogate-baselines.md)

-   :re-warning:{ .lg .middle } **Limitations**

    ---

    What fails and by how much: sim-to-real gaps, valve models, sensor noise.

    [:octicons-arrow-right-24: The caveats](05-limitations.md)

-   :re-idea:{ .lg .middle } **Open questions**

    ---

    Ranked research openings with effort estimates.

    [:octicons-arrow-right-24: What to do next](06-open-questions.md)

-   :re-timeline:{ .lg .middle } **Timeline and references**

    ---

    Who did what in 2018–2026, every source, how it was verified, and the search log.

    [:octicons-arrow-right-24: The field](03-timeline.md) · [:re-books: The sources](07-references.md)

</div>

Every number on this site links to the page it came from. Sources I could only read at abstract level, or not at all, are marked in [§7](07-references.md).

## Reproduce

```bash
git clone https://github.com/leandergrech/rl-rocket-engine-control && cd rl-rocket-engine-control
python3.12 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -e ".[dev,rl]"
bash scripts/reproduce.sh
```

`reproduce.sh` runs the tests, including the check that the browser model matches the Python one, and builds the docs strictly. It also re-evaluates every stored policy against `data/results/summary.json`; the environment is deterministic, so they must match. `bash scripts/reproduce.sh --full` also recalibrates the surrogate and retrains every baseline (about 3 hours on a laptop CPU). To check whether the challenge has gone public, run `python scripts/check_challenge.py`. [STATUS.md](https://github.com/leandergrech/rl-rocket-engine-control/blob/main/STATUS.md) tracks the build state.
