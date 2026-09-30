# Deep RL for liquid rocket engine control

A personal literature review and (pending) codebase for deep reinforcement learning control of liquid-propellant rocket engines. It is anchored on the **LUMEN Control Challenge** of DLR's Institute of Space Propulsion in Lampoldshausen. The challenge centres on LUMEN, a 25 kN liquid-oxygen / methane expander-bleed engine fired on test bench P8.3. Participants get a generalised simulator of it and an automatic evaluation service for their controllers.

!!! warning "Status on 2026-09-30: the challenge simulator is not public"
    DLR pitched the challenge at the RL Bootcamp 2026 on 17 September. The slide promises "Public access to generalized LUMEN simulator model" and "Automatic evaluation of your control performance". The speaker said release was waiting on "some legal issues" and asked interested people to email.

    A 30-minute search found no public simulator, package, dataset or evaluation service. The places searched were:

    - YouTube and the bootcamp sites;
    - GitHub, including DLR's new `DLR-RA` organisation, created 2026-09-11 and still empty;
    - Zenodo, elib.dlr.de, RL4AA'25/'26 Indico, arXiv, PyPI and Hugging Face.

    The full log is in [§7.1](07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not). Consequences for this repository:

    - It holds the literature review only.
    - The environment wrapper, baselines and notebooks will be built when access is granted.
    - No stand-in simulator has been written.

<div class="kpi-row">
  <div class="kpi"><div class="kpi__value">25 kN</div><div class="kpi__label">LOX/methane expander-bleed demonstrator, test bench P8.3</div><div class="kpi__src"><a href="https://www.dlr.de/en/research-and-transfer/featured-topics/reusable-space-transportation/lumen">DLR</a></div></div>
  <div class="kpi"><div class="kpi__value">2 × 2</div><div class="kpi__label">turbine valves in, chamber pressure and mixture ratio out</div><div class="kpi__src"><a href="https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=55">benchmark design</a></div></div>
  <div class="kpi"><div class="kpi__value">7</div><div class="kpi__label">benchmark test cases, from nominal tracking to faults</div><div class="kpi__src"><a href="https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=56">benchmark design</a></div></div>
  <div class="kpi"><div class="kpi__value">1.3 %</div><div class="kpi__label">mean tracking error of DLR's RL controller on the real engine</div><div class="kpi__src"><a href="https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130">thesis Table 6.2</a></div></div>
  <div class="kpi"><div class="kpi__value">0</div><div class="kpi__label">public simulator releases found on 2026-09-30</div><div class="kpi__src"><a href="07-references/#71-search-log-where-the-lumen-control-challenge-simulator-is-not">search log</a></div></div>
</div>

## Five things to know before reading further

1. **The task is a coupled 2×2 tracking problem.** Two turbine valves (TFV, TOV) set chamber pressure, i.e. thrust, and mixture ratio, i.e. combustion temperature. Seven benchmark test cases add unknown references, parametric model error, slow drift and faults ([§1](01-problem.md)).
2. **RL has already flown on this engine, briefly.** DLR's SAC controller tracked four variables at a mean error of 1.3 % over more than 16 s of hot fire, zero-shot from simulation. In simulation the same controller reaches 0.4 % ([thesis Table 6.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=130)).
3. **In simulation, RL beat MPC on speed and constraints; MPC won on fuel.** On a shared 5-valve task SAC reached 0.3 % / 0.1 % tracking error against MPC's 1.4 % / 0.6 %, and settled in 0.7 s against 3.0 s. MPC used 0.38 % less propellant ([thesis p. 93–97](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=110)).
4. **Sim-to-real broke on actuators first.** The first hardware deployment was unstable because of a valve-model error ([thesis p. 149](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=166)). Model–plant errors reached 10.6 % even after the fix ([§5](05-limitations.md)).
5. **The benchmark is the first chance for anyone outside DLR to work on this plant.** Its fine-tuning dataset and its fault test cases are where the open research is ([§6](06-open-questions.md)).

## How to read this site

| If you want… | Read |
|---|---|
| The two-week plan and what transfers from ATC / CERN / EO work | [For Leander](for-leander.md) |
| The problem as an RL formulation, and what "solved" would mean | [1. The control problem](01-problem.md) |
| Enough rocket-engine physics to reason about the task | [2. Domain primer](02-primer.md) |
| Who did what, when, with which number | [3. Timeline 2018–2026](03-timeline.md) |
| Published controllers side by side (SAC, TD3, MPC, PI, curriculum PPO) | [4. Solution designs](04-designs.md) |
| What fails and by how much | [5. Limitations](05-limitations.md) |
| Ranked research openings with effort estimates | [6. Open questions](06-open-questions.md) |
| Every source, how it was verified, and the search log | [7. References](07-references.md) |

Every number on this site links to the page it came from. Sources I could only read at abstract level, or not at all, are marked in [§7](07-references.md).

## Repository

[github.com/leandergrech/rl-rocket-engine-control](https://github.com/leandergrech/rl-rocket-engine-control). To check whether the challenge has gone public, run:

```bash
python scripts/check_challenge.py
```

It queries the `DLR-RA` GitHub organisation and a few PyPI names. [STATUS.md](https://github.com/leandergrech/rl-rocket-engine-control/blob/main/STATUS.md) tracks the build state.
