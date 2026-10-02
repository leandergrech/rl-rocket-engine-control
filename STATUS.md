# STATUS
repo: https://github.com/leandergrech/rl-rocket-engine-control
pages: https://leandergrech.github.io/rl-rocket-engine-control/
step: 4
state: running
updated: 2026-10-02T15:58:19Z
blockers: LUMEN Control Challenge simulator, evaluation service and fine-tuning dataset not public; DLR grants access by email (legal issues pending per 17 Sep 2026 pitch)
next: finish SAC/PPO no-preview training, evaluate all controllers, write the surrogate-baselines page and home hero, commit docs and push
log:
- 2026-09-30T16:07:05Z step 0 done: gh logged in as leandergrech (repo, workflow scopes); git user.name "Leander Grech"; repo folder empty
- 2026-09-30T16:08:01Z step 1 done: skeleton committed, public repo created and pushed
- 2026-09-30T16:33:20Z step 2 blocked: 25 min direct search 16:08-16:33Z plus parallel subagent source checks (YouTube, bootcamp sites, GitHub incl. new DLR-RA org, Zenodo, elib, RL4AA'25/'26 Indico, arXiv, PyPI, HF, DLR pages); simulator not public
- 2026-09-30T16:47:09Z step 3 (docs, blocked branch): 07-references, 01-problem, 02-primer written; mkdocs build --strict passes
- 2026-09-30T17:05:25Z step 2 note: search continued to 16:38Z (30 min direct); found benchmark design (AI4Aerospace 2025, 7 Gym test cases), DX'25 LUMEN precedent (simulator on request by email), SSRN 2026 simulator preprint
- 2026-09-30T17:05:25Z steps 3-5 (blocked branch): all docs written (index, for-leander, 01-07), email-to-dlr.md drafted (not sent), release checker + tests + reproduce.sh; pytest 7 passed, reproduce.sh ok, mkdocs build --strict ok
- 2026-09-30T17:05:26Z step 6 done: Pages enabled (workflow build), site returns 200; stopped per brief (no stand-in simulator, no email sent)
- 2026-09-30T22:23:50Z docs visuals: Methalox Plume theme chosen by Leander from 4 rendered options; 13 Mermaid diagrams and 14 Vega-Lite charts added (each beside its table or a table view), themed light/dark; pytest 36 passed, mkdocs --strict ok, Pages redeployed
- 2026-10-02T14:54:47Z Leander asked for tokamak/flatland-style docs (primer chapters, Lab) and approved a clearly labelled dummy lab; thesis Table 4.6 gives the 2x2 static gains, Table 4.7 settling times: enough to calibrate a reduced model
- 2026-10-02T15:58:19Z surrogate calibrated (statics within ~13 % of Table 4.6 except TOV->T_RC; TFV settling within 25 %; overshoot 6.48 vs 6.5 bar); valve law fixed to settle without overshoot; PI tuned; PPO preview trained (3 M steps, 16.8 min); Python/JS parity test passes in headless Chrome; primer split into 9 chapters + equation sheet + Engine Lab
