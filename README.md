# rl-rocket-engine-control

A personal literature review and codebase for deep reinforcement learning control of liquid-propellant rocket engines. It is anchored on the **LUMEN Control Challenge** from DLR's Institute of Space Propulsion. LUMEN is a 25 kN liquid-oxygen / methane expander-bleed engine fired at test bench P8.3 in Lampoldshausen. The task is to drive two turbine valves so that chamber pressure (thrust) and mixture ratio track a reference, with constraints respected, under model error and faults.

DLR's own SAC controller has done this on the real engine at 1.3 % mean error, zero-shot from simulation. The challenge promises a generalised simulator and an automatic evaluation service so others can try.

**Docs site:** <https://leandergrech.github.io/rl-rocket-engine-control/>

## Built on

This project builds on the work of DLR's Institute of Space Propulsion, Lampoldshausen:

- **The LUMEN Control Challenge**: V. Bareiß, K. Dresia, G. Waxenegger-Wilfing et al., "Development of a Benchmark for Deep Reinforcement Learning Based Control of Liquid Propellant Rocket Engines", 5th AI4Aerospace workshop, 2025; K. Dresia et al., RL4AA'25.
- **The doctoral thesis**: K. Dresia, *Rocket Engine Control with Deep Reinforcement Learning*, DLR-FB-2025-16, RWTH Aachen, 2025 ([PDF](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf)).
- **The LUMEN engine and its model**: J. Deeken et al. 2021; T. Traudt et al., IAC 2022 and 2024; E. Kurudzija et al., EUCASS 2025; J. Dauer et al., EUCASS 2025.

Every statement about LUMEN on the site cites one of these, with page numbers. The surrogate, the baselines and the Engine Lab are this repository's own work. Full list: [docs/07-references.md](docs/07-references.md).

## Status (2026-10-10): the challenge release is expected around the end of October 2026; a surrogate lab in the meantime

The challenge simulator, evaluation service and fine-tuning dataset are **not public yet**. The organisers expect to share a repository around the end of October 2026, running at 20 Hz with no preview of future set points. Every place searched before then is logged in [docs/07-references.md](docs/07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not).

What this repository contains:

- **The literature review** (`docs/`, published to the Pages site): the problem, a 2018–2026 timeline, designs side by side, limitations with numbers, ranked open questions, and verified references.
- **A domain primer** in nine chapters with interactive widgets, an equation sheet and a glossary.
- **A surrogate engine and the Engine Lab.** `src/rl_rocket_engine/surrogate/` is a reduced, LUMEN-like expander-bleed model. It is calibrated to the static gains, settling times and overshoot DLR publishes for its LUMEN model (Dresia 2025, Tables 4.6–4.7). Around it are a Gymnasium environment for the 2×2 task and a JavaScript port that runs in the browser. **It is not DLR's simulator**, and its numbers say nothing quantitative about the challenge.
- **Baselines on the surrogate**, all trained in under an hour on a CPU:
    - open-loop feedforward;
    - a decoupled, gain-scheduled PI, tuned or designed for a chosen bandwidth;
    - PPO and SAC at 20 Hz without preview, the challenge's setting;
    - the earlier 10 Hz agents with and without preview, kept as an ablation.

  They are tested for robustness and on the challenge's seven test cases in miniature, including faults: stuck valves, worn bearings, leaks, blockages, sensor faults and drift. The Engine Lab can run every controller through every test case live.
- **The Engine Lab's test stand**: an animated LUMEN on DLR's P8.3 bench, drawn after DLR's photos (Traudt et al., IAC 2024). Pumps, valves, flows, temperatures and the plume follow the surrogate. Thrust reads in newtons at the load cell, as 25 kN × p_cc / 60 bar. Limits and malfunctions show on the failing part, with start-up, shutdown and purge sequences, in light and dark mode. The flame, steam and colours are coarse guesses.
- **A release checker**, `scripts/check_challenge.py`, which reports new public repositories in `DLR-RA` or LUMEN packages on PyPI.

When the challenge is released, the environment wrapper moves to DLR's simulator (20 Hz, no preview) and every baseline is rerun there.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # CPU-only PyTorch for the rl extra
pip install -e ".[dev,rl]"
pytest
bash scripts/reproduce.sh          # tests, strict docs build, re-evaluation of every stored policy
bash scripts/reproduce.sh --full   # also recalibrate the surrogate and retrain every baseline (about 3 h)
python scripts/check_challenge.py  # has the challenge gone public?
mkdocs serve                       # read the review and use the Engine Lab locally
```

## Layout

```
docs/                     literature review and primer (MkDocs Material)
includes/abbreviations.md acronyms spelled out as tooltips on every page
docs/javascripts/         lumen-model.js (browser port of the surrogate), teststand.js (the animated test stand), lab.js, widgets.js, charts.js
src/rl_rocket_engine/     challenge_status.py (release checker)
  surrogate/              model.py, params.py, calibrate.py (+ calibrated.json), trim.py, env.py, pi.py, rl.py, metrics.py,
                          faults.py and scenarios.py (+ scenarios.json: the seven test cases in miniature)
scripts/                  train.py, evaluate.py, make_baseline_docs.py, make_lab_data.py, check_challenge.py, reproduce.sh
tests/                    surrogate, environment, baselines, Python/JavaScript parity (headless Chrome), docs and charts
data/                     exported policies and results (surrogate only)
notebooks/                placeholders until access
STATUS.md                 machine-readable progress for the orchestrator
```

## Licence

MIT for the code in this repository. Third-party documents are cited, not redistributed; their licences, and those of the dependencies, are listed in [docs/07-references.md](docs/07-references.md#710-licences).
