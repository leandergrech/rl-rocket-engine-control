# rl-rocket-engine-control

A personal literature review and codebase for deep reinforcement learning control of liquid-propellant rocket engines. It is anchored on the **LUMEN Control Challenge** from DLR's Institute of Space Propulsion. LUMEN is a 25 kN liquid-oxygen / methane expander-bleed engine fired at test bench P8.3 in Lampoldshausen. The task is to drive two turbine valves so that chamber pressure (thrust) and mixture ratio track a reference, with constraints respected, under model error and faults.

DLR's own SAC controller has done this on the real engine at 1.3 % mean error, zero-shot from simulation. The challenge promises a generalised simulator and an automatic evaluation service so others can try.

**Docs site:** <https://leandergrech.github.io/rl-rocket-engine-control/>

## Status (2026-10-02): challenge access pending; a surrogate lab in the meantime

The challenge simulator, evaluation service and fine-tuning dataset are **not public**. At the RL Bootcamp 2026 (17 Sep) DLR said release was waiting on "some legal issues" and asked interested people to email. A 30-minute search found nothing public; every place checked is logged in [docs/07-references.md](docs/07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not).

What this repository contains:

- **The literature review** (`docs/`, published to the Pages site): the problem, a 2018–2026 timeline, designs side by side, limitations with numbers, ranked open questions, and verified references.
- **A domain primer** in nine chapters with interactive widgets, an equation sheet and a glossary.
- **A surrogate engine and the Engine Lab.** `src/rl_rocket_engine/surrogate/` is a reduced, LUMEN-like expander-bleed model. It is calibrated to the static gains, settling times and overshoot DLR publishes for its LUMEN model (Dresia 2025, Tables 4.6–4.7). Around it are a Gymnasium environment for the 2×2 task and a JavaScript port that runs in the browser. **It is not DLR's simulator**, and its numbers say nothing quantitative about the challenge.
- **Baselines on the surrogate:** open-loop feedforward, a decoupled gain-scheduled PI, and PPO and SAC with and without reference preview, each trained in under an hour on a CPU, plus robustness tests.
- **A draft access request** to DLR, [docs/email-to-dlr.md](docs/email-to-dlr.md), to be sent by Leander. It has not been sent.
- **A release checker**, `scripts/check_challenge.py`, which reports new public repositories in `DLR-RA` or LUMEN packages on PyPI.

When access is granted, the environment wrapper moves to DLR's simulator and every baseline is rerun there.

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
docs/                     literature review and primer (MkDocs Material); email-to-dlr.md is excluded from the site
docs/javascripts/         lumen-model.js (browser port of the surrogate), widgets.js, lab.js
src/rl_rocket_engine/     challenge_status.py (release checker)
  surrogate/              model.py, params.py, calibrate.py (+ calibrated.json), trim.py, env.py, pi.py, rl.py, metrics.py
scripts/                  train.py, evaluate.py, make_lab_data.py, check_challenge.py, reproduce.sh
tests/                    surrogate, environment, baselines, Python/JavaScript parity (headless Chrome), docs and charts
data/                     exported policies and results (surrogate only)
notebooks/                placeholders until access
STATUS.md                 machine-readable progress for the orchestrator
```

## Licence

MIT for the code in this repository. Third-party documents are cited, not redistributed; their licences, and those of the dependencies, are listed in [docs/07-references.md](docs/07-references.md#710-licences).
