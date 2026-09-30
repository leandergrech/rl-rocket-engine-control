# rl-rocket-engine-control

A personal literature review and (pending) codebase for deep reinforcement learning control of liquid-propellant rocket engines. It is anchored on the **LUMEN Control Challenge** from DLR's Institute of Space Propulsion. LUMEN is a 25 kN liquid-oxygen / methane expander-bleed engine fired at test bench P8.3 in Lampoldshausen. The task is to drive two turbine valves so that chamber pressure (thrust) and mixture ratio track a reference, with constraints respected, under model error and faults.

DLR's own SAC controller has done this on the real engine at 1.3 % mean error, zero-shot from simulation. The challenge promises a generalised simulator and an automatic evaluation service so others can try.

**Docs site:** <https://leandergrech.github.io/rl-rocket-engine-control/>

## Status (2026-09-30): blocked on access

The challenge simulator, evaluation service and fine-tuning dataset are **not public**. At the RL Bootcamp 2026 (17 Sep) DLR said release was waiting on "some legal issues" and asked interested people to email. A 30-minute search found nothing public:

- YouTube and the bootcamp sites;
- GitHub, including DLR's new, empty `DLR-RA` organisation;
- Zenodo, elib, RL4AA Indico, arXiv, PyPI and Hugging Face.

Every place checked is logged in [docs/07-references.md](docs/07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not).

What this repository therefore contains:

- **The literature review** (`docs/`, published to the Pages site): the problem, a domain primer, a 2018–2026 timeline, designs side by side, limitations with numbers, ranked open questions, and verified references.
- **A draft access request** to DLR, [docs/email-to-dlr.md](docs/email-to-dlr.md), to be sent by Leander. It has not been sent.
- **A release checker**, `scripts/check_challenge.py`, which reports new public repositories in `DLR-RA` or LUMEN packages on PyPI.

What it does not contain yet:

- the environment wrapper;
- the PID, PPO, SAC and MBPO baselines;
- the robustness evaluation;
- the notebooks and sample data.

These need the challenge environment. No stand-in simulator has been built.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
pytest
bash scripts/reproduce.sh          # tests, strict docs build, release check
python scripts/check_challenge.py  # has the challenge gone public?
mkdocs serve                       # read the review locally
```

## Layout

```
docs/        literature review (MkDocs Material); email-to-dlr.md is excluded from the site
src/rl_rocket_engine/   challenge_status.py (release checker); env and baselines once access exists
scripts/     check_challenge.py, reproduce.sh
tests/       release-checker and docs tests
data/, notebooks/       placeholders until access
STATUS.md    machine-readable progress for the orchestrator
```

## Licence

MIT for the code in this repository. Third-party documents are cited, not redistributed; their licences, and those of the dependencies, are listed in [docs/07-references.md](docs/07-references.md#710-licences).
