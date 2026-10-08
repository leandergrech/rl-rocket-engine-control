# Baselines on the LUMEN-like surrogate

Surrogate results (not DLR's simulator). Mean over 20 held-out 30 s episodes (seeds 1000-1019).

| Controller | MAPE p_cc [%] | MAPE ROF [%] | Return | Steps settled p_cc / ROF [%] | Settling p_cc / ROF [s] | Valve travel | Violations [s] | Randomised: MAPE p_cc / ROF [%] |
|---|---|---|---|---|---|---|---|---|
| Open-loop feedforward | 4.62 | 4.25 | -393.9 | 18 / 46 | 0.97 / 2.98 | 0.69 | 0.83 | 4.40 / 5.06 |
| Decoupled PI, tuned | 2.61 | 2.27 | -243.7 | 61 / 75 | 3.66 / 3.59 | 3.63 | 1.42 | 2.28 / 1.83 |
| Decoupled PI, bandwidth design | 2.30 | 3.14 | -274.8 | 54 / 43 | 3.08 / 4.04 | 3.25 | 1.91 | 2.01 / 2.63 |
| PPO, no preview (10 Hz), seed 1 | 1.07 | 0.46 | -41.3 | 96 / 96 | 0.90 / 0.96 | 2.77 | 0.00 | 1.08 / 1.75 |
| PPO, no preview (10 Hz) | 1.21 | 0.37 | -41.8 | 93 / 96 | 0.95 / 0.90 | 2.58 | 0.00 | 1.10 / 1.61 |
| PPO, preview (10 Hz), seed 1 | 0.50 | 0.34 | -25.2 | 96 / 82 | 0.66 / 0.37 | 2.42 | 0.00 | 0.94 / 1.80 |
| PPO, preview (10 Hz) | 0.52 | 0.33 | -26.4 | 96 / 75 | 0.52 / 1.68 | 2.15 | 0.00 | 0.92 / 1.90 |
| PPO (20 Hz) | 1.04 | 0.82 | -101.4 | 96 / 93 | 1.02 / 1.34 | 3.72 | 0.00 | 1.16 / 2.07 |
| SAC, no preview (10 Hz) | 0.79 | 0.31 | -28.6 | 96 / 96 | 0.77 / 0.41 | 3.59 | 0.02 | 1.14 / 1.88 |
| SAC, preview (10 Hz) | 0.54 | 0.26 | -25.0 | 96 / 71 | 0.55 / 1.24 | 2.33 | 0.00 | 0.89 / 1.88 |
| SAC (20 Hz) | 1.31 | 1.23 | -175.5 | 96 / 89 | 1.33 / 4.75 | 65.99 | 0.00 | 1.59 / 2.45 |
