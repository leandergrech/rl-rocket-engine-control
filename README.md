# rl-rocket-engine-control

A personal literature review and codebase for deep reinforcement learning control of liquid-propellant rocket engines, anchored on the LUMEN Control Challenge run by DLR's Institute of Space Propulsion (Lampoldshausen).

Work in progress; see [STATUS.md](STATUS.md) for the current step.

Docs site: https://leandergrech.github.io/rl-rocket-engine-control/ (not yet live)

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
pytest
mkdocs build --strict
```

Licence: MIT for the code in this repository. Third-party licences are listed in `docs/07-references.md`.
