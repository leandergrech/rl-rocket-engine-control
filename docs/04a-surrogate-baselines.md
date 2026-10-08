---
icon: re/surrogate
---

# :re-surrogate: 4a. Baselines on the surrogate

!!! warning "These are surrogate results, not DLR's simulator"
    DLR's LUMEN Control Challenge simulator is not public yet ([§7.1](07-references.md#71-search-log-where-the-lumen-control-challenge-simulator-is-not)). Everything on this page runs on this repo's surrogate: a reduced expander-bleed engine calibrated to the gains, settling times and overshoot DLR publishes for its LUMEN model ([model card](primer/8-lab.md#model-card)). The page is a dry run of the baseline set [§4.8](04-designs.md#48-what-this-means-for-the-challenge) calls for. It tests the code, the metrics and the questions, not the numbers. Rankings may transfer to the real task; magnitudes will not.

!!! info "Since October 2026: 20 Hz and no preview, as in the challenge"
    The challenge runs at **20 Hz** and gives **no preview** of future set points ([organisers, Oct 2026](07-references.md#organisers2026)). The baselines now do the same:
    - the [results at 20 Hz](#results-20-hz) and the [seven test cases](#test-cases) are the ones comparable to a challenge entry;
    - the PI can also be [designed for a bandwidth](#pi-bandwidth);
    - the [earlier baselines](#earlier-10-hz) ran at 10 Hz, the thesis's simulation setting, with and without preview. They stay as an ablation of what preview is worth, and they still run in the Lab.

!!! abstract "In short"

    - **At 20 Hz without preview, the challenge's setting, both networks more than halve the PI's error:** SAC reaches 0.97 % on pressure and 0.38 % on mixture ratio, PPO 1.15 % and 1.01 %, against 2.61 % and 2.27 % for the reward-tuned PI, and they spend under 0.1 s per episode over a limit against the PI's 1.4 s. SAC, the algorithm DLR used on LUMEN, is the best 20 Hz controller here once it gets its full 600 k steps.
    - **A PI designed for a bandwidth beats the reward-tuned one on pressure** (2.30 % against 2.61 %) but loses on mixture ratio (3.14 % against 2.27 %). The tuned gains run the mixture-ratio loop at about 18° of phase margin: aggressive, and it pays off on this noise level. Textbook SIMC tuning on each loop's first-order model would put the pressure loop at 0.72 Hz, which is far too fast here; the best bandwidth on the training episodes is 0.15 Hz.
    - **No controller wins every test case.** The networks win nominal tracking (cases 1–2), by a factor of about 2 on pressure and up to 7 on mixture ratio. When the engine changes, drifts or wears a bearing (cases 4–6), the bandwidth-designed PI holds pressure as well as or better than they do, while the networks lose the mixture ratio (3.5–7.5 %): they have no integral action. When TOV sticks (case 7), every controller loses the mixture ratio, and the PIs also lose pressure.
    - **The earlier 10 Hz agents** keep their lesson: preview halves the pressure error (PPO 1.21 % → 0.52 %).

## Setup

**Task.** The 2×2 task of [From physics to reward](primer/7-reward.md#this-repos-22-environment):

- TFV and TOV commands every 0.05 s (20 Hz; the earlier baselines every 0.1 s);
- 30 s episodes of random holds, steps and ramps in 35–50 bar and $R_{OF}$ 3.0–3.8;
- DLR's exponential tracking reward ($\delta$ = 12), a 0.5 penalty per violated constraint (thesis Table 5.1) and a valve-travel penalty;
- sensor delays of 0.1 s on chamber pressure and 0.2 s on mixture ratio, plus small measurement noise.

The code is `src/rl_rocket_engine/surrogate/env.py`.

**Controllers.**

| Controller | What it reads | How it was made |
|---|---|---|
| Feedforward only | the set point | valves from the trim table (the steady-state inverse of the engine); no measurement |
| Decoupled PI, tuned | measured $p_{cc}$, $R_{OF}$, set point | feedforward plus two PI loops behind a static, gain-scheduled decoupler, with anti-windup ([equation](primer/equations.md#eq-pi)); four gains tuned by Nelder–Mead on 12 training episodes at 20 Hz |
| Decoupled PI, bandwidth design | same | the same structure, gains from each loop's first-order-plus-dead-time model and a chosen bandwidth (SIMC; [equation](primer/equations.md#eq-pi-bandwidth)); here the bandwidths that scored best on the training episodes, 0.15 / 0.47 Hz |
| PPO, SAC (20 Hz) | 4 stacked frames of 15 normalised values, no preview | SB3 PPO (2×128 tanh, 6 environments) and SAC (2×128 ReLU, 4 environments), $\gamma$ = 0.99; PPO 6 M steps, SAC 600 k steps, each capped at 55 min |
| Earlier: PPO, SAC (10 Hz), no preview / preview | 4 stacked frames of 15 / 23 values; preview adds the next 0.5 s of set points | the same networks at 0.1 s, $\gamma$ = 0.98; PPO 3 M steps, SAC 450–500 k steps |

Every learned policy was trained on the nominal engine, on a CPU, in under an hour: the 10 Hz agents on a laptop, the 20 Hz PPO and SAC side by side on one rented 32-thread desktop CPU (Intel i9-14900KF), in 21 and 24 min. The tables and charts show seed 0; PPO was also trained with a second seed ([below](#a-second-seed)). All controllers are evaluated deterministically on the same 20 held-out episodes (seeds 1000–1019) with `python scripts/evaluate.py`. The networks run in the [Engine Lab](primer/8-lab.md), in your browser, with the same arithmetic.

## Results at 20 Hz, no preview {#results-20-hz}

<!-- BEGIN generated: results20 -->
| Controller | MAPE $p_{cc}$ [%] | MAPE $R_{OF}$ [%] | Steps settled $p_{cc}$ / $R_{OF}$ | Settling $p_{cc}$ / $R_{OF}$ [s] | Valve travel | Over a limit [s] | Randomised MAPE $p_{cc}$ / $R_{OF}$ [%] | Training |
|---|---|---|---|---|---|---|---|---|
| Open-loop feedforward | 4.62 | 4.25 | 18 % / 46 % | 1.0 / 3.0 | 0.69 | 0.83 | 4.40 / 5.06 | – |
| Decoupled PI, tuned | 2.61 | 2.27 | 61 % / 75 % | 3.7 / 3.6 | 3.63 | 1.42 | 2.28 / 1.83 | Nelder–Mead, 12 episodes |
| Decoupled PI, bandwidth design | 2.30 | 3.14 | 54 % / 43 % | 3.1 / 4.0 | 3.25 | 1.91 | 2.01 / 2.63 | SIMC rules at 0.15 / 0.47 Hz |
| PPO (20 Hz) | 1.15 | 1.01 | 96 % / 89 % | 1.0 / 1.7 | 3.21 | 0.07 | 1.24 / 2.56 | 6.0 M steps, 21 min |
| SAC (20 Hz) | 0.97 | 0.38 | 96 % / 96 % | 0.8 / 0.9 | 6.29 | 0.02 | 1.47 / 1.93 | 600 k steps, 24 min |

Mean over the same 20 held-out episodes as before (seeds 1000–1019). Settling: time to stay within ±2 % of a new set point after a step. Over a limit: seconds per episode with at least one constraint of thesis Table 5.1 broken (seconds, not steps, so the 10 and 20 Hz rows compare). Randomised: the same episodes with the engine and sensors drawn from DLR's ranges.
{: .caption }

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Chamber-pressure error at 20 Hz, and the earlier 10 Hz agents",
  "subtitle": "MAPE on 20 held-out episodes, log scale. Filled: nominal engine; hollow: domain-randomised (thesis Table A.3). Surrogate, not DLR's simulator; data/results/summary.json"
 },
 "width": "container",
 "height": 300,
 "data": {
  "values": [
   {
    "controller": "Open-loop feedforward",
    "rate": "20 Hz",
    "condition": "nominal",
    "mape_p": 4.62,
    "mape_rof": 4.255
   },
   {
    "controller": "Open-loop feedforward",
    "rate": "20 Hz",
    "condition": "randomised",
    "mape_p": 4.402,
    "mape_rof": 5.061
   },
   {
    "controller": "Decoupled PI, tuned",
    "rate": "20 Hz",
    "condition": "nominal",
    "mape_p": 2.609,
    "mape_rof": 2.27
   },
   {
    "controller": "Decoupled PI, tuned",
    "rate": "20 Hz",
    "condition": "randomised",
    "mape_p": 2.279,
    "mape_rof": 1.834
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "rate": "20 Hz",
    "condition": "nominal",
    "mape_p": 2.301,
    "mape_rof": 3.143
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "rate": "20 Hz",
    "condition": "randomised",
    "mape_p": 2.009,
    "mape_rof": 2.628
   },
   {
    "controller": "PPO (20 Hz)",
    "rate": "20 Hz",
    "condition": "nominal",
    "mape_p": 1.149,
    "mape_rof": 1.014
   },
   {
    "controller": "PPO (20 Hz)",
    "rate": "20 Hz",
    "condition": "randomised",
    "mape_p": 1.242,
    "mape_rof": 2.555
   },
   {
    "controller": "SAC (20 Hz)",
    "rate": "20 Hz",
    "condition": "nominal",
    "mape_p": 0.973,
    "mape_rof": 0.383
   },
   {
    "controller": "SAC (20 Hz)",
    "rate": "20 Hz",
    "condition": "randomised",
    "mape_p": 1.469,
    "mape_rof": 1.926
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "nominal",
    "mape_p": 0.525,
    "mape_rof": 0.333
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "randomised",
    "mape_p": 0.922,
    "mape_rof": 1.903
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "nominal",
    "mape_p": 1.21,
    "mape_rof": 0.366
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "randomised",
    "mape_p": 1.097,
    "mape_rof": 1.609
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "nominal",
    "mape_p": 0.542,
    "mape_rof": 0.261
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "randomised",
    "mape_p": 0.886,
    "mape_rof": 1.883
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "nominal",
    "mape_p": 0.792,
    "mape_rof": 0.312
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "rate": "10 Hz (earlier)",
    "condition": "randomised",
    "mape_p": 1.136,
    "mape_rof": 1.881
   }
  ]
 },
 "encoding": {
  "y": {
   "field": "controller",
   "type": "nominal",
   "sort": null,
   "title": null,
   "axis": {
    "labelLimit": 240
   }
  },
  "x": {
   "field": "mape_p",
   "type": "quantitative",
   "scale": {
    "type": "log",
    "domain": [
     0.2,
     10
    ]
   },
   "title": "MAPE p_cc (%), log scale"
  },
  "color": {
   "field": "rate",
   "type": "nominal",
   "scale": {
    "domain": [
     "20 Hz",
     "10 Hz (earlier)"
    ],
    "range": [
     "var(--viz-s1)",
     "var(--viz-muted)"
    ]
   },
   "legend": {
    "title": null
   }
  },
  "tooltip": [
   {
    "field": "controller"
   },
   {
    "field": "condition"
   },
   {
    "field": "mape_p",
    "title": "MAPE p_cc (%)"
   },
   {
    "field": "mape_rof",
    "title": "MAPE ROF (%)"
   }
  ]
 },
 "layer": [
  {
   "transform": [
    {
     "pivot": "condition",
     "value": "mape_p",
     "groupby": [
      "controller",
      "rate"
     ]
    }
   ],
   "mark": {
    "type": "rule",
    "strokeWidth": 2,
    "color": "var(--viz-axis)"
   },
   "encoding": {
    "x": {
     "field": "nominal",
     "type": "quantitative"
    },
    "x2": {
     "field": "randomised"
    },
    "color": {
     "value": "var(--viz-axis)"
    }
   }
  },
  {
   "transform": [
    {
     "filter": "datum.condition == 'nominal'"
    }
   ],
   "mark": {
    "type": "point",
    "filled": true,
    "size": 110,
    "stroke": "var(--md-default-bg-color)",
    "strokeWidth": 2
   }
  },
  {
   "transform": [
    {
     "filter": "datum.condition == 'randomised'"
    }
   ],
   "mark": {
    "type": "point",
    "filled": false,
    "size": 110,
    "strokeWidth": 2
   }
  }
 ]
}
```
<!-- END generated: results20 -->

<!-- BEGIN generated: curves20 -->
```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Learning at 20 Hz, against the wall clock",
  "subtitle": "Training episode return (30 s, 600 steps), smoothed; laptop CPU. Surrogate, not DLR's simulator; data/policies/{ppo,sac}.train.json"
 },
 "width": "container",
 "height": 220,
 "data": {
  "values": [
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.04,
    "steps": 3600,
    "ret": -500.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.12,
    "steps": 32400,
    "ret": -663.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.22,
    "steps": 61200,
    "ret": -630.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.33,
    "steps": 93600,
    "ret": -686.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.43,
    "steps": 122400,
    "ret": -639.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.53,
    "steps": 151200,
    "ret": -502.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.64,
    "steps": 183600,
    "ret": -424.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.74,
    "steps": 212400,
    "ret": -280.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.85,
    "steps": 241200,
    "ret": -257.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 0.96,
    "steps": 273600,
    "ret": -252.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.06,
    "steps": 302400,
    "ret": -232.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.16,
    "steps": 331200,
    "ret": -204.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.27,
    "steps": 363600,
    "ret": -193.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.37,
    "steps": 392400,
    "ret": -163.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.47,
    "steps": 421200,
    "ret": -160.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.58,
    "steps": 453600,
    "ret": -164.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.68,
    "steps": 482400,
    "ret": -162.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.78,
    "steps": 511200,
    "ret": -156.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.89,
    "steps": 543600,
    "ret": -147.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 1.99,
    "steps": 572400,
    "ret": -132.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.09,
    "steps": 601200,
    "ret": -119.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.21,
    "steps": 633600,
    "ret": -118.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.31,
    "steps": 662400,
    "ret": -121.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.4,
    "steps": 691200,
    "ret": -118.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.52,
    "steps": 723600,
    "ret": -120.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.62,
    "steps": 752400,
    "ret": -126.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.72,
    "steps": 781200,
    "ret": -117.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.83,
    "steps": 813600,
    "ret": -116.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 2.93,
    "steps": 842400,
    "ret": -113.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.03,
    "steps": 871200,
    "ret": -105.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.14,
    "steps": 903600,
    "ret": -106.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.24,
    "steps": 932400,
    "ret": -110.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.34,
    "steps": 961200,
    "ret": -111.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.45,
    "steps": 993600,
    "ret": -117.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.55,
    "steps": 1022400,
    "ret": -113.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.65,
    "steps": 1051200,
    "ret": -107.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.76,
    "steps": 1083600,
    "ret": -115.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.86,
    "steps": 1112400,
    "ret": -105.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 3.96,
    "steps": 1141200,
    "ret": -104.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.07,
    "steps": 1173600,
    "ret": -108.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.17,
    "steps": 1202400,
    "ret": -93.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.27,
    "steps": 1231200,
    "ret": -94.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.38,
    "steps": 1263600,
    "ret": -97.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.48,
    "steps": 1292400,
    "ret": -85.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.58,
    "steps": 1321200,
    "ret": -92.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.69,
    "steps": 1353600,
    "ret": -93.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.79,
    "steps": 1382400,
    "ret": -95.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 4.89,
    "steps": 1411200,
    "ret": -100.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.0,
    "steps": 1443600,
    "ret": -103.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.1,
    "steps": 1472400,
    "ret": -105.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.2,
    "steps": 1501200,
    "ret": -117.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.31,
    "steps": 1533600,
    "ret": -117.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.41,
    "steps": 1562400,
    "ret": -117.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.51,
    "steps": 1591200,
    "ret": -116.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.62,
    "steps": 1623600,
    "ret": -100.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.72,
    "steps": 1652400,
    "ret": -102.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.82,
    "steps": 1681200,
    "ret": -107.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 5.94,
    "steps": 1713600,
    "ret": -107.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.04,
    "steps": 1742400,
    "ret": -105.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.13,
    "steps": 1771200,
    "ret": -115.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.24,
    "steps": 1803600,
    "ret": -99.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.35,
    "steps": 1832400,
    "ret": -111.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.44,
    "steps": 1861200,
    "ret": -111.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.56,
    "steps": 1893600,
    "ret": -100.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.66,
    "steps": 1922400,
    "ret": -116.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.76,
    "steps": 1951200,
    "ret": -107.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.87,
    "steps": 1983600,
    "ret": -119.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 6.97,
    "steps": 2012400,
    "ret": -124.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.07,
    "steps": 2041200,
    "ret": -123.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.18,
    "steps": 2073600,
    "ret": -115.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.28,
    "steps": 2102400,
    "ret": -109.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.38,
    "steps": 2131200,
    "ret": -114.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.49,
    "steps": 2163600,
    "ret": -113.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.59,
    "steps": 2192400,
    "ret": -118.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.69,
    "steps": 2221200,
    "ret": -114.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.8,
    "steps": 2253600,
    "ret": -101.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 7.9,
    "steps": 2282400,
    "ret": -102.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.0,
    "steps": 2311200,
    "ret": -97.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.11,
    "steps": 2343600,
    "ret": -100.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.21,
    "steps": 2372400,
    "ret": -100.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.31,
    "steps": 2401200,
    "ret": -105.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.43,
    "steps": 2433600,
    "ret": -119.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.53,
    "steps": 2462400,
    "ret": -129.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.63,
    "steps": 2491200,
    "ret": -135.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.74,
    "steps": 2523600,
    "ret": -121.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.84,
    "steps": 2552400,
    "ret": -121.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 8.94,
    "steps": 2581200,
    "ret": -100.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.05,
    "steps": 2613600,
    "ret": -99.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.15,
    "steps": 2642400,
    "ret": -106.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.25,
    "steps": 2671200,
    "ret": -115.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.37,
    "steps": 2703600,
    "ret": -126.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.47,
    "steps": 2732400,
    "ret": -126.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.56,
    "steps": 2761200,
    "ret": -112.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.68,
    "steps": 2793600,
    "ret": -90.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.78,
    "steps": 2822400,
    "ret": -86.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.87,
    "steps": 2851200,
    "ret": -84.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 9.98,
    "steps": 2883600,
    "ret": -93.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.09,
    "steps": 2912400,
    "ret": -97.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.19,
    "steps": 2941200,
    "ret": -111.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.3,
    "steps": 2973600,
    "ret": -132.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.4,
    "steps": 3002400,
    "ret": -130.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.49,
    "steps": 3031200,
    "ret": -138.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.61,
    "steps": 3063600,
    "ret": -123.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.71,
    "steps": 3092400,
    "ret": -107.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.8,
    "steps": 3121200,
    "ret": -107.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 10.91,
    "steps": 3153600,
    "ret": -119.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.01,
    "steps": 3182400,
    "ret": -129.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.11,
    "steps": 3211200,
    "ret": -136.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.22,
    "steps": 3243600,
    "ret": -138.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.32,
    "steps": 3272400,
    "ret": -147.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.42,
    "steps": 3301200,
    "ret": -152.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.54,
    "steps": 3333600,
    "ret": -151.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.64,
    "steps": 3362400,
    "ret": -164.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.74,
    "steps": 3391200,
    "ret": -159.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.85,
    "steps": 3423600,
    "ret": -163.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 11.94,
    "steps": 3452400,
    "ret": -157.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.05,
    "steps": 3481200,
    "ret": -145.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.16,
    "steps": 3513600,
    "ret": -120.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.26,
    "steps": 3542400,
    "ret": -102.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.36,
    "steps": 3571200,
    "ret": -91.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.47,
    "steps": 3603600,
    "ret": -110.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.57,
    "steps": 3632400,
    "ret": -116.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.67,
    "steps": 3661200,
    "ret": -126.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.78,
    "steps": 3693600,
    "ret": -142.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.88,
    "steps": 3722400,
    "ret": -115.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 12.98,
    "steps": 3751200,
    "ret": -112.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.09,
    "steps": 3783600,
    "ret": -99.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.19,
    "steps": 3812400,
    "ret": -111.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.29,
    "steps": 3841200,
    "ret": -108.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.4,
    "steps": 3873600,
    "ret": -115.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.5,
    "steps": 3902400,
    "ret": -119.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.6,
    "steps": 3931200,
    "ret": -93.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.72,
    "steps": 3963600,
    "ret": -111.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.82,
    "steps": 3992400,
    "ret": -112.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 13.91,
    "steps": 4021200,
    "ret": -131.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.03,
    "steps": 4053600,
    "ret": -142.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.13,
    "steps": 4082400,
    "ret": -143.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.23,
    "steps": 4111200,
    "ret": -139.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.34,
    "steps": 4143600,
    "ret": -126.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.44,
    "steps": 4172400,
    "ret": -127.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.54,
    "steps": 4201200,
    "ret": -140.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.65,
    "steps": 4233600,
    "ret": -138.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.75,
    "steps": 4262400,
    "ret": -149.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.85,
    "steps": 4291200,
    "ret": -154.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 14.97,
    "steps": 4323600,
    "ret": -128.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.06,
    "steps": 4352400,
    "ret": -127.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.17,
    "steps": 4381200,
    "ret": -118.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.28,
    "steps": 4413600,
    "ret": -106.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.38,
    "steps": 4442400,
    "ret": -107.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.48,
    "steps": 4471200,
    "ret": -106.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.59,
    "steps": 4503600,
    "ret": -91.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.69,
    "steps": 4532400,
    "ret": -106.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.79,
    "steps": 4561200,
    "ret": -110.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 15.9,
    "steps": 4593600,
    "ret": -115.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.0,
    "steps": 4622400,
    "ret": -142.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.1,
    "steps": 4651200,
    "ret": -147.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.22,
    "steps": 4683600,
    "ret": -139.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.31,
    "steps": 4712400,
    "ret": -137.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.42,
    "steps": 4741200,
    "ret": -134.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.53,
    "steps": 4773600,
    "ret": -118.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.63,
    "steps": 4802400,
    "ret": -121.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.73,
    "steps": 4831200,
    "ret": -123.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.84,
    "steps": 4863600,
    "ret": -102.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 16.94,
    "steps": 4892400,
    "ret": -105.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.04,
    "steps": 4921200,
    "ret": -116.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.15,
    "steps": 4953600,
    "ret": -121.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.25,
    "steps": 4982400,
    "ret": -132.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.35,
    "steps": 5011200,
    "ret": -124.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.46,
    "steps": 5043600,
    "ret": -122.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.57,
    "steps": 5072400,
    "ret": -106.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.66,
    "steps": 5101200,
    "ret": -95.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.78,
    "steps": 5133600,
    "ret": -131.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.88,
    "steps": 5162400,
    "ret": -122.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 17.98,
    "steps": 5191200,
    "ret": -136.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.09,
    "steps": 5223600,
    "ret": -133.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.19,
    "steps": 5252400,
    "ret": -104.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.29,
    "steps": 5281200,
    "ret": -120.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.4,
    "steps": 5313600,
    "ret": -107.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.5,
    "steps": 5342400,
    "ret": -144.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.6,
    "steps": 5371200,
    "ret": -158.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.71,
    "steps": 5403600,
    "ret": -153.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.81,
    "steps": 5432400,
    "ret": -153.1
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 18.91,
    "steps": 5461200,
    "ret": -118.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.03,
    "steps": 5493600,
    "ret": -112.0
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.13,
    "steps": 5522400,
    "ret": -112.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.23,
    "steps": 5551200,
    "ret": -109.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.34,
    "steps": 5583600,
    "ret": -108.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.44,
    "steps": 5612400,
    "ret": -101.8
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.54,
    "steps": 5641200,
    "ret": -108.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.65,
    "steps": 5673600,
    "ret": -112.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.75,
    "steps": 5702400,
    "ret": -130.5
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.85,
    "steps": 5731200,
    "ret": -128.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 19.96,
    "steps": 5763600,
    "ret": -113.7
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.06,
    "steps": 5792400,
    "ret": -130.4
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.16,
    "steps": 5821200,
    "ret": -116.3
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.27,
    "steps": 5853600,
    "ret": -126.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.37,
    "steps": 5882400,
    "ret": -142.6
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.47,
    "steps": 5911200,
    "ret": -143.9
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.58,
    "steps": 5943600,
    "ret": -144.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.68,
    "steps": 5972400,
    "ret": -138.2
   },
   {
    "agent": "PPO (20 Hz)",
    "minutes": 20.78,
    "steps": 6001200,
    "ret": -122.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.03,
    "steps": 2400,
    "ret": -707.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.04,
    "steps": 4800,
    "ret": -809.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.12,
    "steps": 7200,
    "ret": -765.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.21,
    "steps": 9600,
    "ret": -719.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.4,
    "steps": 14400,
    "ret": -692.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.5,
    "steps": 16800,
    "ret": -570.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.6,
    "steps": 19200,
    "ret": -496.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.7,
    "steps": 21600,
    "ret": -431.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 0.9,
    "steps": 26400,
    "ret": -354.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.0,
    "steps": 28800,
    "ret": -319.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.1,
    "steps": 31200,
    "ret": -291.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.2,
    "steps": 33600,
    "ret": -283.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.41,
    "steps": 38400,
    "ret": -266.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.5,
    "steps": 40800,
    "ret": -257.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.6,
    "steps": 43200,
    "ret": -247.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.7,
    "steps": 45600,
    "ret": -233.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.9,
    "steps": 50400,
    "ret": -239.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 1.99,
    "steps": 52800,
    "ret": -229.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.09,
    "steps": 55200,
    "ret": -235.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.19,
    "steps": 57600,
    "ret": -246.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.39,
    "steps": 62400,
    "ret": -252.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.49,
    "steps": 64800,
    "ret": -259.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.58,
    "steps": 67200,
    "ret": -250.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.68,
    "steps": 69600,
    "ret": -235.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.87,
    "steps": 74400,
    "ret": -219.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 2.97,
    "steps": 76800,
    "ret": -219.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.06,
    "steps": 79200,
    "ret": -228.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.16,
    "steps": 81600,
    "ret": -224.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.35,
    "steps": 86400,
    "ret": -223.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.45,
    "steps": 88800,
    "ret": -215.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.55,
    "steps": 91200,
    "ret": -201.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.65,
    "steps": 93600,
    "ret": -200.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.85,
    "steps": 98400,
    "ret": -213.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 3.94,
    "steps": 100800,
    "ret": -214.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.04,
    "steps": 103200,
    "ret": -222.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.13,
    "steps": 105600,
    "ret": -222.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.33,
    "steps": 110400,
    "ret": -211.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.43,
    "steps": 112800,
    "ret": -212.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.53,
    "steps": 115200,
    "ret": -205.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.63,
    "steps": 117600,
    "ret": -201.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.83,
    "steps": 122400,
    "ret": -194.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 4.93,
    "steps": 124800,
    "ret": -187.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.03,
    "steps": 127200,
    "ret": -184.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.13,
    "steps": 129600,
    "ret": -194.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.33,
    "steps": 134400,
    "ret": -192.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.43,
    "steps": 136800,
    "ret": -192.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.53,
    "steps": 139200,
    "ret": -193.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.63,
    "steps": 141600,
    "ret": -189.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.83,
    "steps": 146400,
    "ret": -194.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 5.93,
    "steps": 148800,
    "ret": -198.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.03,
    "steps": 151200,
    "ret": -197.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.13,
    "steps": 153600,
    "ret": -189.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.33,
    "steps": 158400,
    "ret": -188.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.43,
    "steps": 160800,
    "ret": -191.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.53,
    "steps": 163200,
    "ret": -195.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.63,
    "steps": 165600,
    "ret": -205.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.82,
    "steps": 170400,
    "ret": -202.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 6.92,
    "steps": 172800,
    "ret": -202.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.01,
    "steps": 175200,
    "ret": -192.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.11,
    "steps": 177600,
    "ret": -190.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.29,
    "steps": 182400,
    "ret": -197.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.39,
    "steps": 184800,
    "ret": -200.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.48,
    "steps": 187200,
    "ret": -196.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.57,
    "steps": 189600,
    "ret": -188.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.77,
    "steps": 194400,
    "ret": -184.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.86,
    "steps": 196800,
    "ret": -173.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 7.96,
    "steps": 199200,
    "ret": -167.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.06,
    "steps": 201600,
    "ret": -171.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.25,
    "steps": 206400,
    "ret": -162.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.35,
    "steps": 208800,
    "ret": -155.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.44,
    "steps": 211200,
    "ret": -160.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.54,
    "steps": 213600,
    "ret": -159.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.74,
    "steps": 218400,
    "ret": -166.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.84,
    "steps": 220800,
    "ret": -170.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 8.94,
    "steps": 223200,
    "ret": -184.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.03,
    "steps": 225600,
    "ret": -176.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.24,
    "steps": 230400,
    "ret": -164.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.33,
    "steps": 232800,
    "ret": -175.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.44,
    "steps": 235200,
    "ret": -164.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.54,
    "steps": 237600,
    "ret": -164.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.74,
    "steps": 242400,
    "ret": -170.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.83,
    "steps": 244800,
    "ret": -166.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 9.92,
    "steps": 247200,
    "ret": -177.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.02,
    "steps": 249600,
    "ret": -178.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.22,
    "steps": 254400,
    "ret": -188.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.32,
    "steps": 256800,
    "ret": -187.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.43,
    "steps": 259200,
    "ret": -179.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.52,
    "steps": 261600,
    "ret": -173.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.71,
    "steps": 266400,
    "ret": -169.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.81,
    "steps": 268800,
    "ret": -159.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 10.91,
    "steps": 271200,
    "ret": -158.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.01,
    "steps": 273600,
    "ret": -163.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.22,
    "steps": 278400,
    "ret": -155.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.31,
    "steps": 280800,
    "ret": -154.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.41,
    "steps": 283200,
    "ret": -149.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.51,
    "steps": 285600,
    "ret": -149.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.71,
    "steps": 290400,
    "ret": -144.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.81,
    "steps": 292800,
    "ret": -140.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 11.9,
    "steps": 295200,
    "ret": -155.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.0,
    "steps": 297600,
    "ret": -149.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.2,
    "steps": 302400,
    "ret": -160.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.29,
    "steps": 304800,
    "ret": -175.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.39,
    "steps": 307200,
    "ret": -165.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.5,
    "steps": 309600,
    "ret": -168.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.69,
    "steps": 314400,
    "ret": -157.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.79,
    "steps": 316800,
    "ret": -149.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.89,
    "steps": 319200,
    "ret": -157.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 12.99,
    "steps": 321600,
    "ret": -157.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.18,
    "steps": 326400,
    "ret": -160.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.28,
    "steps": 328800,
    "ret": -154.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.38,
    "steps": 331200,
    "ret": -141.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.48,
    "steps": 333600,
    "ret": -142.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.67,
    "steps": 338400,
    "ret": -148.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.77,
    "steps": 340800,
    "ret": -151.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.87,
    "steps": 343200,
    "ret": -161.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 13.96,
    "steps": 345600,
    "ret": -163.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.16,
    "steps": 350400,
    "ret": -152.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.26,
    "steps": 352800,
    "ret": -159.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.35,
    "steps": 355200,
    "ret": -165.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.45,
    "steps": 357600,
    "ret": -167.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.66,
    "steps": 362400,
    "ret": -166.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.76,
    "steps": 364800,
    "ret": -171.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.86,
    "steps": 367200,
    "ret": -155.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 14.95,
    "steps": 369600,
    "ret": -161.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.15,
    "steps": 374400,
    "ret": -175.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.25,
    "steps": 376800,
    "ret": -163.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.35,
    "steps": 379200,
    "ret": -177.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.46,
    "steps": 381600,
    "ret": -158.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.64,
    "steps": 386400,
    "ret": -139.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.74,
    "steps": 388800,
    "ret": -129.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.84,
    "steps": 391200,
    "ret": -123.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 15.93,
    "steps": 393600,
    "ret": -133.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.13,
    "steps": 398400,
    "ret": -143.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.23,
    "steps": 400800,
    "ret": -155.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.32,
    "steps": 403200,
    "ret": -146.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.42,
    "steps": 405600,
    "ret": -147.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.62,
    "steps": 410400,
    "ret": -135.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.72,
    "steps": 412800,
    "ret": -127.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.82,
    "steps": 415200,
    "ret": -126.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 16.91,
    "steps": 417600,
    "ret": -114.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.1,
    "steps": 422400,
    "ret": -118.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.2,
    "steps": 424800,
    "ret": -117.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.29,
    "steps": 427200,
    "ret": -120.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.39,
    "steps": 429600,
    "ret": -122.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.59,
    "steps": 434400,
    "ret": -121.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.69,
    "steps": 436800,
    "ret": -123.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.79,
    "steps": 439200,
    "ret": -126.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 17.89,
    "steps": 441600,
    "ret": -133.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.09,
    "steps": 446400,
    "ret": -140.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.19,
    "steps": 448800,
    "ret": -135.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.29,
    "steps": 451200,
    "ret": -126.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.38,
    "steps": 453600,
    "ret": -125.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.58,
    "steps": 458400,
    "ret": -116.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.68,
    "steps": 460800,
    "ret": -122.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.78,
    "steps": 463200,
    "ret": -122.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 18.87,
    "steps": 465600,
    "ret": -112.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.07,
    "steps": 470400,
    "ret": -115.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.17,
    "steps": 472800,
    "ret": -112.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.27,
    "steps": 475200,
    "ret": -119.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.37,
    "steps": 477600,
    "ret": -118.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.57,
    "steps": 482400,
    "ret": -119.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.67,
    "steps": 484800,
    "ret": -126.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.77,
    "steps": 487200,
    "ret": -133.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 19.87,
    "steps": 489600,
    "ret": -141.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.06,
    "steps": 494400,
    "ret": -148.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.16,
    "steps": 496800,
    "ret": -142.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.26,
    "steps": 499200,
    "ret": -131.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.37,
    "steps": 501600,
    "ret": -127.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.56,
    "steps": 506400,
    "ret": -121.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.66,
    "steps": 508800,
    "ret": -112.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.76,
    "steps": 511200,
    "ret": -120.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 20.84,
    "steps": 513600,
    "ret": -116.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.0,
    "steps": 518400,
    "ret": -109.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.08,
    "steps": 520800,
    "ret": -119.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.15,
    "steps": 523200,
    "ret": -103.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.22,
    "steps": 525600,
    "ret": -113.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.37,
    "steps": 530400,
    "ret": -115.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.44,
    "steps": 532800,
    "ret": -110.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.52,
    "steps": 535200,
    "ret": -118.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.6,
    "steps": 537600,
    "ret": -120.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.75,
    "steps": 542400,
    "ret": -120.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.83,
    "steps": 544800,
    "ret": -126.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.91,
    "steps": 547200,
    "ret": -126.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 21.99,
    "steps": 549600,
    "ret": -121.8
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.14,
    "steps": 554400,
    "ret": -122.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.23,
    "steps": 556800,
    "ret": -121.4
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.3,
    "steps": 559200,
    "ret": -113.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.38,
    "steps": 561600,
    "ret": -105.3
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.52,
    "steps": 566400,
    "ret": -111.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.6,
    "steps": 568800,
    "ret": -107.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.67,
    "steps": 571200,
    "ret": -115.5
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.74,
    "steps": 573600,
    "ret": -124.0
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.89,
    "steps": 578400,
    "ret": -121.6
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 22.96,
    "steps": 580800,
    "ret": -123.2
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 23.03,
    "steps": 583200,
    "ret": -132.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 23.11,
    "steps": 585600,
    "ret": -138.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 23.25,
    "steps": 590400,
    "ret": -137.9
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 23.32,
    "steps": 592800,
    "ret": -140.1
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 23.4,
    "steps": 595200,
    "ret": -124.7
   },
   {
    "agent": "SAC (20 Hz)",
    "minutes": 23.47,
    "steps": 597600,
    "ret": -117.9
   }
  ]
 },
 "mark": {
  "type": "line",
  "strokeWidth": 2,
  "interpolate": "monotone"
 },
 "encoding": {
  "x": {
   "field": "minutes",
   "type": "quantitative",
   "title": "wall-clock minutes"
  },
  "y": {
   "field": "ret",
   "type": "quantitative",
   "title": "episode return",
   "scale": {
    "zero": false
   }
  },
  "color": {
   "field": "agent",
   "type": "nominal",
   "scale": {
    "range": [
     "var(--viz-s1)",
     "var(--viz-s2)"
    ]
   },
   "legend": {
    "title": null
   }
  },
  "tooltip": [
   {
    "field": "agent"
   },
   {
    "field": "minutes"
   },
   {
    "field": "steps",
    "title": "environment steps"
   },
   {
    "field": "ret",
    "title": "return"
   }
  ]
 }
}
```
<!-- END generated: curves20 -->

1. **PPO at 20 Hz is about as good as PPO at 10 Hz without preview** on pressure (1.15 % against 1.21 %), worse on mixture ratio (1.01 % against 0.37 %), and nowhere near the preview agents. Twice the control rate does not buy what anticipation buys. Nor did more training: its 6 M steps are 83 h of engine time, the same as the 10 Hz PPO's 3 M, and an earlier run stopped at 2.7 M steps ([commit 43856e2](https://github.com/leandergrech/rl-rocket-engine-control/commit/43856e2)) scored 1.04 / 0.82 %. That gap is about the spread between two seeds ([below](#a-second-seed)).
2. **SAC at 20 Hz is the best 20 Hz controller once it gets its full budget:** 0.97 % on pressure and 0.38 % on mixture ratio, close to the 10 Hz SAC without preview (0.79 / 0.31 %). Its 600 k steps, 8.3 h of engine time, took 24 min on the rented desktop CPU. On the laptop, sharing the CPU with other jobs, the same 55-minute cap had bought only 170 k steps, and that policy chattered (valve travel 66 per episode). The trained one moves its valves about twice as much as PPO (6.3 against 3.2). Compute, not the algorithm, was the bottleneck; the challenge's simulator, which runs at real time, will make that plainer ([§5.4](05-limitations.md#54-data-minutes-of-reality-days-of-simulation)).
3. **Both PIs violate constraints that no learned controller touches**: 1.4–1.9 s per 30 s episode over a limit, mostly the cooling-channel pressure at low set points and mixture-ratio overshoot.

## The seven test cases {#test-cases}

The challenge's seven test cases ([§1.3](01-problem.md#13-the-seven-test-cases-as-rl-problem-classes)) in miniature, one episode each. The engine changes, faults, onsets and sizes are this site's choices ([scenarios.json](https://github.com/leandergrech/rl-rocket-engine-control/blob/main/src/rl_rocket_engine/surrogate/scenarios.json)). The [Engine Lab](primer/8-lab.md) runs the same matrix live: open the *Tests* card, or a single case such as [test case 7 under PPO](primer/8-lab.md?preset=ppo&test=tc7&t=19&play=1).

<!-- BEGIN generated: scenarios -->
| Controller | 1. Nominal, known reference | 2. Nominal, unknown reference | 3. Engine varies, distribution known | 4. Engine changed, nothing known | 5. Slow drift (ageing) | 6. Fault, with a detection signal | 7. Fault, no detection signal |
|---|---|---|---|---|---|---|---|
| Open-loop feedforward | 4.71 / 4.49 · 3.6 s | 5.22 / 4.61 · 2.4 s | 5.45 / 5.74 · 7.6 s | 5.58 / 6.47 · 6.5 s | 6.84 / 5.42 · 9.6 s | 9.31 / 12.85 · 25.2 s | 5.11 / 18.35 · 14.8 s |
| Decoupled PI, tuned | 2.79 / 2.83 · 2.0 s | 2.41 / 1.98 · 0.6 s | 3.31 / 3.42 · 2.0 s | 3.39 / 3.44 · 2.2 s | 3.78 / 2.64 · 4.4 s | 3.62 / 4.09 · 3.7 s | 7.40 / 12.58 · 11.9 s |
| Decoupled PI, bandwidth design | 2.28 / 3.25 · 2.0 s | 1.83 / 2.71 · 0.5 s | 2.66 / 3.77 · 2.4 s | 2.69 / 3.96 · 3.4 s | **2.78 / 3.65 · 4.0 s** | **2.53 / 3.63 · 2.9 s** | 5.85 / 12.76 · 12.0 s |
| PPO (20 Hz) | 1.35 / 1.12 | 0.68 / 0.49 | 2.03 / 1.42 | 3.24 / 7.48 | 3.71 / 5.38 · 1.6 s | 3.62 / 5.39 · 2.0 s | 2.95 / 14.05 · 12.4 s |
| SAC (20 Hz) | 1.44 / 0.43 | 0.71 / 0.28 | 2.97 / 1.33 | 4.46 / 6.60 | 4.46 / 4.93 · 2.2 s | 3.46 / 3.50 · 2.5 s | 3.46 / 12.34 · 12.2 s |
| PPO, preview (10 Hz) | **0.63 / 0.36** | 0.29 / 0.28 | 1.86 / 0.57 | 3.13 / 6.74 | 3.56 / 5.10 · 2.0 s | 3.76 / 3.68 · 2.8 s | **2.75 / 14.07 · 12.8 s** |
| PPO, no preview (10 Hz) | 1.43 / 0.37 | 0.78 / 0.27 | 2.03 / 0.57 | **2.64 / 5.52** | 2.99 / 4.05 | 3.76 / 4.01 · 2.2 s | 3.42 / 13.43 · 12.2 s |
| SAC, preview (10 Hz) | 0.68 / 0.34 | **0.25 / 0.17** | **1.81 / 0.55** | 3.40 / 6.79 | 3.58 / 5.00 · 2.2 s | 3.55 / 4.13 · 2.9 s | 3.01 / 13.88 · 12.7 s |
| SAC, no preview (10 Hz) | 1.07 / 0.41 | 0.40 / 0.20 | 2.22 / 0.68 | 2.83 / 6.87 | 3.10 / 4.91 · 0.4 s | 3.53 / 3.96 · 2.6 s | 3.91 / 12.60 · 12.3 s |

One episode per cell, sensor noise on (seed 0): mean chamber-pressure / mixture-ratio error in percent, and the seconds spent over a limit when there were any. **Bold**: the lowest pressure error in the column. The 10 Hz agents run at their own rate; the others at 20 Hz.
{: .caption }

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Every controller through the challenge's seven test cases",
  "subtitle": "Chamber-pressure MAPE (%) of one episode per cell; darker is worse. Test cases in miniature on the surrogate, not DLR's simulator; scenarios.json, data/results/summary.json"
 },
 "width": "container",
 "height": 330,
 "data": {
  "values": [
   {
    "controller": "Open-loop feedforward",
    "case": "1. Nominal, known reference",
    "mape_p": 4.71,
    "mape_rof": 4.49,
    "over_s": 3.55
   },
   {
    "controller": "Open-loop feedforward",
    "case": "2. Nominal, unknown reference",
    "mape_p": 5.22,
    "mape_rof": 4.61,
    "over_s": 2.35
   },
   {
    "controller": "Open-loop feedforward",
    "case": "3. Engine varies, distribution known",
    "mape_p": 5.45,
    "mape_rof": 5.74,
    "over_s": 7.6
   },
   {
    "controller": "Open-loop feedforward",
    "case": "4. Engine changed, nothing known",
    "mape_p": 5.58,
    "mape_rof": 6.47,
    "over_s": 6.45
   },
   {
    "controller": "Open-loop feedforward",
    "case": "5. Slow drift (ageing)",
    "mape_p": 6.84,
    "mape_rof": 5.42,
    "over_s": 9.6
   },
   {
    "controller": "Open-loop feedforward",
    "case": "6. Fault, with a detection signal",
    "mape_p": 9.31,
    "mape_rof": 12.85,
    "over_s": 25.2
   },
   {
    "controller": "Open-loop feedforward",
    "case": "7. Fault, no detection signal",
    "mape_p": 5.11,
    "mape_rof": 18.35,
    "over_s": 14.8
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "1. Nominal, known reference",
    "mape_p": 2.79,
    "mape_rof": 2.83,
    "over_s": 1.95
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "2. Nominal, unknown reference",
    "mape_p": 2.41,
    "mape_rof": 1.98,
    "over_s": 0.55
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "3. Engine varies, distribution known",
    "mape_p": 3.31,
    "mape_rof": 3.42,
    "over_s": 2.0
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "4. Engine changed, nothing known",
    "mape_p": 3.39,
    "mape_rof": 3.44,
    "over_s": 2.25
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "5. Slow drift (ageing)",
    "mape_p": 3.78,
    "mape_rof": 2.64,
    "over_s": 4.35
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.62,
    "mape_rof": 4.09,
    "over_s": 3.65
   },
   {
    "controller": "Decoupled PI, tuned",
    "case": "7. Fault, no detection signal",
    "mape_p": 7.4,
    "mape_rof": 12.58,
    "over_s": 11.9
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "1. Nominal, known reference",
    "mape_p": 2.28,
    "mape_rof": 3.25,
    "over_s": 1.95
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "2. Nominal, unknown reference",
    "mape_p": 1.83,
    "mape_rof": 2.71,
    "over_s": 0.5
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "3. Engine varies, distribution known",
    "mape_p": 2.66,
    "mape_rof": 3.77,
    "over_s": 2.35
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "4. Engine changed, nothing known",
    "mape_p": 2.69,
    "mape_rof": 3.96,
    "over_s": 3.35
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "5. Slow drift (ageing)",
    "mape_p": 2.78,
    "mape_rof": 3.65,
    "over_s": 4.05
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "6. Fault, with a detection signal",
    "mape_p": 2.53,
    "mape_rof": 3.63,
    "over_s": 2.85
   },
   {
    "controller": "Decoupled PI, bandwidth design",
    "case": "7. Fault, no detection signal",
    "mape_p": 5.85,
    "mape_rof": 12.76,
    "over_s": 12.0
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "1. Nominal, known reference",
    "mape_p": 1.35,
    "mape_rof": 1.12,
    "over_s": 0.0
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "2. Nominal, unknown reference",
    "mape_p": 0.68,
    "mape_rof": 0.49,
    "over_s": 0.0
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "3. Engine varies, distribution known",
    "mape_p": 2.03,
    "mape_rof": 1.42,
    "over_s": 0.0
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "4. Engine changed, nothing known",
    "mape_p": 3.24,
    "mape_rof": 7.48,
    "over_s": 0.0
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "5. Slow drift (ageing)",
    "mape_p": 3.71,
    "mape_rof": 5.38,
    "over_s": 1.55
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.62,
    "mape_rof": 5.39,
    "over_s": 1.95
   },
   {
    "controller": "PPO (20 Hz)",
    "case": "7. Fault, no detection signal",
    "mape_p": 2.95,
    "mape_rof": 14.05,
    "over_s": 12.35
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "1. Nominal, known reference",
    "mape_p": 1.44,
    "mape_rof": 0.43,
    "over_s": 0.0
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "2. Nominal, unknown reference",
    "mape_p": 0.71,
    "mape_rof": 0.28,
    "over_s": 0.0
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "3. Engine varies, distribution known",
    "mape_p": 2.97,
    "mape_rof": 1.33,
    "over_s": 0.0
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "4. Engine changed, nothing known",
    "mape_p": 4.46,
    "mape_rof": 6.6,
    "over_s": 0.0
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "5. Slow drift (ageing)",
    "mape_p": 4.46,
    "mape_rof": 4.93,
    "over_s": 2.25
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.46,
    "mape_rof": 3.5,
    "over_s": 2.5
   },
   {
    "controller": "SAC (20 Hz)",
    "case": "7. Fault, no detection signal",
    "mape_p": 3.46,
    "mape_rof": 12.34,
    "over_s": 12.15
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "1. Nominal, known reference",
    "mape_p": 0.63,
    "mape_rof": 0.36,
    "over_s": 0.0
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "2. Nominal, unknown reference",
    "mape_p": 0.29,
    "mape_rof": 0.28,
    "over_s": 0.0
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "3. Engine varies, distribution known",
    "mape_p": 1.86,
    "mape_rof": 0.57,
    "over_s": 0.0
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "4. Engine changed, nothing known",
    "mape_p": 3.13,
    "mape_rof": 6.74,
    "over_s": 0.0
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "5. Slow drift (ageing)",
    "mape_p": 3.56,
    "mape_rof": 5.1,
    "over_s": 2.0
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.76,
    "mape_rof": 3.68,
    "over_s": 2.8
   },
   {
    "controller": "PPO, preview (10 Hz)",
    "case": "7. Fault, no detection signal",
    "mape_p": 2.75,
    "mape_rof": 14.07,
    "over_s": 12.8
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "1. Nominal, known reference",
    "mape_p": 1.43,
    "mape_rof": 0.37,
    "over_s": 0.0
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "2. Nominal, unknown reference",
    "mape_p": 0.78,
    "mape_rof": 0.27,
    "over_s": 0.0
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "3. Engine varies, distribution known",
    "mape_p": 2.03,
    "mape_rof": 0.57,
    "over_s": 0.0
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "4. Engine changed, nothing known",
    "mape_p": 2.64,
    "mape_rof": 5.52,
    "over_s": 0.0
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "5. Slow drift (ageing)",
    "mape_p": 2.99,
    "mape_rof": 4.05,
    "over_s": 0.0
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.76,
    "mape_rof": 4.01,
    "over_s": 2.2
   },
   {
    "controller": "PPO, no preview (10 Hz)",
    "case": "7. Fault, no detection signal",
    "mape_p": 3.42,
    "mape_rof": 13.43,
    "over_s": 12.2
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "1. Nominal, known reference",
    "mape_p": 0.68,
    "mape_rof": 0.34,
    "over_s": 0.0
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "2. Nominal, unknown reference",
    "mape_p": 0.25,
    "mape_rof": 0.17,
    "over_s": 0.0
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "3. Engine varies, distribution known",
    "mape_p": 1.81,
    "mape_rof": 0.55,
    "over_s": 0.0
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "4. Engine changed, nothing known",
    "mape_p": 3.4,
    "mape_rof": 6.79,
    "over_s": 0.0
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "5. Slow drift (ageing)",
    "mape_p": 3.58,
    "mape_rof": 5.0,
    "over_s": 2.2
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.55,
    "mape_rof": 4.13,
    "over_s": 2.9
   },
   {
    "controller": "SAC, preview (10 Hz)",
    "case": "7. Fault, no detection signal",
    "mape_p": 3.01,
    "mape_rof": 13.88,
    "over_s": 12.7
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "1. Nominal, known reference",
    "mape_p": 1.07,
    "mape_rof": 0.41,
    "over_s": 0.0
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "2. Nominal, unknown reference",
    "mape_p": 0.4,
    "mape_rof": 0.2,
    "over_s": 0.0
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "3. Engine varies, distribution known",
    "mape_p": 2.22,
    "mape_rof": 0.68,
    "over_s": 0.0
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "4. Engine changed, nothing known",
    "mape_p": 2.83,
    "mape_rof": 6.87,
    "over_s": 0.0
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "5. Slow drift (ageing)",
    "mape_p": 3.1,
    "mape_rof": 4.91,
    "over_s": 0.4
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "6. Fault, with a detection signal",
    "mape_p": 3.53,
    "mape_rof": 3.96,
    "over_s": 2.6
   },
   {
    "controller": "SAC, no preview (10 Hz)",
    "case": "7. Fault, no detection signal",
    "mape_p": 3.91,
    "mape_rof": 12.6,
    "over_s": 12.3
   }
  ]
 },
 "encoding": {
  "x": {
   "field": "case",
   "type": "nominal",
   "sort": null,
   "title": null,
   "axis": {
    "labelAngle": -30,
    "labelLimit": 180
   }
  },
  "y": {
   "field": "controller",
   "type": "nominal",
   "sort": null,
   "title": null,
   "axis": {
    "labelLimit": 220
   }
  },
  "tooltip": [
   {
    "field": "controller"
   },
   {
    "field": "case",
    "title": "test case"
   },
   {
    "field": "mape_p",
    "title": "MAPE p_cc (%)"
   },
   {
    "field": "mape_rof",
    "title": "MAPE ROF (%)"
   },
   {
    "field": "over_s",
    "title": "over a limit (s)"
   }
  ]
 },
 "layer": [
  {
   "mark": {
    "type": "rect",
    "stroke": "var(--md-default-bg-color)",
    "strokeWidth": 2
   },
   "encoding": {
    "color": {
     "field": "mape_p",
     "type": "quantitative",
     "scale": {
      "type": "log",
      "range": [
       "var(--viz-ord-3)",
       "var(--viz-ord-1)"
      ]
     },
     "legend": {
      "title": "MAPE p_cc (%)"
     }
    }
   }
  },
  {
   "mark": {
    "type": "text",
    "fontSize": 11
   },
   "encoding": {
    "text": {
     "field": "mape_p",
     "type": "quantitative",
     "format": ".2f"
    },
    "color": {
     "condition": {
      "test": "datum.mape_p > 2",
      "value": "var(--viz-seq-label)"
     },
     "value": "var(--viz-ink)"
    }
   }
  }
 ]
}
```
<!-- END generated: scenarios -->

What the matrix says:

- **Nominal tracking (1–2) is the networks' game.** The 20 Hz networks track pressure to 0.7–1.4 % and mixture ratio to under 1.2 %, against 1.8–2.8 % and 2–3.3 % for the PIs. With preview, the 10 Hz agents halve that again.
- **Model error (3–4) splits pressure from mixture ratio.** On a randomised engine (3) the networks still lead on mixture ratio, but on pressure SAC at 20 Hz falls behind the bandwidth-designed PI (2.97 % against 2.66 %). On the changed engine (4) their mixture ratio sits 5.5–7.5 % off, the steady offset of a controller without integral action, while the PIs stay at 3.4–4.0 %.
- **Drift and the bearing fault (5–6) favour the bandwidth-designed PI** on pressure (2.5–2.8 %), and its mixture-ratio error stays under 3.7 %. The networks keep pressure within 3–4.5 % but lose the mixture ratio to 3.5–5.4 %, and spend up to 2.9 s over a limit.
- **A stuck TOV (7) breaks everyone's mixture ratio** (12–14 %): with TOV frozen, TFV alone cannot hold two outputs. The networks keep pressure at 2.8–3.9 %, by trading away the mixture ratio. The PIs, whose mixture-ratio loop keeps pushing a valve that does not move, lose both (5.9–7.4 % on pressure). This is why the challenge pairs a fault with a detection signal (6) against one without (7). A controller told that TOV is stuck could give up the mixture ratio on purpose; none of these is told, and none could use the signal yet.

## The PI's bandwidth {#pi-bandwidth}

<!-- BEGIN generated: bandwidth -->
```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "The PI's bandwidth: faster loops, until the delay bites",
  "subtitle": "MAPE on 10 held-out episodes, one loop's bandwidth swept, the other at its default (0.15 / 0.47 Hz). Surrogate, not DLR's simulator; data/results/pi_bandwidth.json"
 },
 "width": "container",
 "height": 220,
 "data": {
  "values": [
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.1,
    "output": "chamber pressure",
    "mape": 2.924,
    "pm": 83.0
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.1,
    "output": "mixture ratio",
    "mape": 3.059,
    "pm": 83.0
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.2,
    "output": "chamber pressure",
    "mape": 2.351,
    "pm": 77.5
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.2,
    "output": "mixture ratio",
    "mape": 3.844,
    "pm": 77.5
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.3,
    "output": "chamber pressure",
    "mape": 2.519,
    "pm": 73.1
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.3,
    "output": "mixture ratio",
    "mape": 4.912,
    "pm": 73.1
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.5,
    "output": "chamber pressure",
    "mape": 3.334,
    "pm": 66.5
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.5,
    "output": "mixture ratio",
    "mape": 7.361,
    "pm": 66.5
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.75,
    "output": "chamber pressure",
    "mape": 3.941,
    "pm": 60.7
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 0.75,
    "output": "mixture ratio",
    "mape": 8.69,
    "pm": 60.7
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 1.0,
    "output": "chamber pressure",
    "mape": 4.624,
    "pm": 56.6
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 1.0,
    "output": "mixture ratio",
    "mape": 10.235,
    "pm": 56.6
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 1.5,
    "output": "chamber pressure",
    "mape": 5.691,
    "pm": 50.8
   },
   {
    "sweep": "pressure loop swept",
    "bandwidth": 1.5,
    "output": "mixture ratio",
    "mape": 12.595,
    "pm": 50.8
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.1,
    "output": "chamber pressure",
    "mape": 2.367,
    "pm": 80.0
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.1,
    "output": "mixture ratio",
    "mape": 4.85,
    "pm": 80.0
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.2,
    "output": "chamber pressure",
    "mape": 2.438,
    "pm": 73.0
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.2,
    "output": "mixture ratio",
    "mape": 4.163,
    "pm": 73.0
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.3,
    "output": "chamber pressure",
    "mape": 2.472,
    "pm": 67.8
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.3,
    "output": "mixture ratio",
    "mape": 3.793,
    "pm": 67.8
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.5,
    "output": "chamber pressure",
    "mape": 2.52,
    "pm": 60.5
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.5,
    "output": "mixture ratio",
    "mape": 3.42,
    "pm": 60.5
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.75,
    "output": "chamber pressure",
    "mape": 2.567,
    "pm": 54.9
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 0.75,
    "output": "mixture ratio",
    "mape": 3.272,
    "pm": 54.9
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 1.0,
    "output": "chamber pressure",
    "mape": 2.598,
    "pm": 51.1
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 1.0,
    "output": "mixture ratio",
    "mape": 3.22,
    "pm": 51.1
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 1.5,
    "output": "chamber pressure",
    "mape": 2.649,
    "pm": 46.4
   },
   {
    "sweep": "mixture-ratio loop swept",
    "bandwidth": 1.5,
    "output": "mixture ratio",
    "mape": 3.229,
    "pm": 46.4
   }
  ]
 },
 "facet": {
  "column": {
   "field": "sweep",
   "type": "nominal",
   "title": null,
   "sort": [
    "pressure loop swept",
    "mixture-ratio loop swept"
   ]
  }
 },
 "spec": {
  "width": 300,
  "height": 200,
  "layer": [
   {
    "mark": {
     "type": "line",
     "point": {
      "filled": true,
      "size": 60
     },
     "strokeWidth": 2
    },
    "encoding": {
     "x": {
      "field": "bandwidth",
      "type": "quantitative",
      "scale": {
       "type": "log"
      },
      "title": "closed-loop bandwidth (Hz), log scale"
     },
     "y": {
      "field": "mape",
      "type": "quantitative",
      "scale": {
       "type": "log"
      },
      "title": "MAPE (%), log scale"
     },
     "color": {
      "field": "output",
      "type": "nominal",
      "scale": {
       "domain": [
        "chamber pressure",
        "mixture ratio"
       ],
       "range": [
        "var(--viz-s1)",
        "var(--viz-s2)"
       ]
      },
      "legend": {
       "title": null
      }
     },
     "tooltip": [
      {
       "field": "bandwidth",
       "title": "bandwidth (Hz)"
      },
      {
       "field": "output"
      },
      {
       "field": "mape",
       "title": "MAPE (%)"
      },
      {
       "field": "pm",
       "title": "phase margin of the swept loop (\u00b0)"
      }
     ]
    }
   }
  ]
 }
}
```
<!-- END generated: bandwidth -->

The PI by bandwidth uses each decoupled loop's first-order-plus-dead-time model and the SIMC rules ([equation](primer/equations.md#eq-pi-bandwidth)). In the Lab, choose *set by bandwidth* under [PI](primer/8-lab.md?preset=pi&pi=bw) to move the two sliders and watch the margins and the loop gain change.

- **The pressure loop has an optimum** near 0.15–0.2 Hz. Faster loops excite the thermal sag and the coupling to the mixture ratio, which the first-order model does not see. At 0.5 Hz and above both errors climb steeply, although the model still promises over 60° of phase margin.
- **The mixture-ratio loop keeps improving up to about 1 Hz**, past what its model calls tight ($\lambda = \theta$, 0.47 Hz). Its identified dead time is conservative.
- **The tuned PI sits elsewhere**: a slow pressure loop (crossover 0.07 Hz) and a fast, lightly damped mixture-ratio loop (crossover 0.43 Hz, 18° of margin). It trades a little pressure error for a much better mixture ratio, which the reward's two equal terms favour.

## Earlier baselines at 10 Hz {#earlier-10-hz}

These ran at 0.1 s, the thesis's simulation setting, before the challenge's 20 Hz and no-preview rules were known. The PI here is the 10 Hz PI. Read the preview rows as an ablation: they show what anticipating set-point changes is worth.

### Results at 10 Hz

| Controller | MAPE $p_{cc}$ [%] | MAPE $R_{OF}$ [%] | Return | Steps settled $p_{cc}$ / $R_{OF}$ | Settling $p_{cc}$ / $R_{OF}$ [s] | Valve travel | Violation steps | Randomised MAPE $p_{cc}$ / $R_{OF}$ [%] | Training |
|---|---|---|---|---|---|---|---|---|---|
| Feedforward only | 4.59 | 4.25 | -196.9 | 18 % / 46 % | 1.0 / 3.0 | 0.69 | 8.2 | 4.38 / 5.06 | – |
| Decoupled PI | 2.75 | 2.48 | -130.1 | 46 % / 64 % | 3.3 / 3.8 | 3.42 | 14.8 | 2.43 / 1.98 | Nelder–Mead, 8 min |
| PPO, no preview | 1.21 | 0.37 | -41.8 | 93 % / 96 % | 1.0 / 0.9 | 2.58 | 0.0 | 1.10 / 1.61 | 3.0 M steps, 27 min |
| PPO, preview | 0.52 | 0.33 | -26.4 | 96 % / 75 % | 0.5 / 1.7 | 2.15 | 0.0 | 0.92 / 1.90 | 3.0 M steps, 17 min |
| SAC, no preview | 0.79 | 0.31 | -28.6 | 96 % / 96 % | 0.8 / 0.4 | 3.59 | 0.1 | 1.14 / 1.88 | 500 k steps, 50 min |
| SAC, preview | 0.54 | 0.26 | -25.0 | 96 % / 71 % | 0.5 / 1.2 | 2.33 | 0.0 | 0.89 / 1.88 | 450 k steps, 55 min |

Mean over the 20 episodes. Settling: time to stay within ±2 % of the new set point after a step of more than 1 %. Valve travel: summed absolute command change per episode. Violation steps: 0.1 s steps with at least one constraint of thesis Table 5.1 broken, summed over constraints. Randomised: the same episodes with the engine and sensors drawn from DLR's domain-randomisation ranges (thesis Table A.3), which no controller was trained on.
{: .caption }

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Tracking error on 20 held-out episodes",
  "subtitle": "MAPE, log scale. Filled: nominal engine; hollow: domain-randomised (thesis Table A.3 ranges). This repo's surrogate (not DLR's simulator); data/results/summary.json"
 },
 "width": "container",
 "height": 260,
 "data": {
  "values": [{"controller":"Feedforward only","condition":"nominal","output":"chamber pressure","mape":4.589},{"controller":"Feedforward only","condition":"nominal","output":"mixture ratio","mape":4.254},{"controller":"Feedforward only","condition":"randomised","output":"chamber pressure","mape":4.375},{"controller":"Feedforward only","condition":"randomised","output":"mixture ratio","mape":5.06},{"controller":"Decoupled PI","condition":"nominal","output":"chamber pressure","mape":2.748},{"controller":"Decoupled PI","condition":"nominal","output":"mixture ratio","mape":2.482},{"controller":"Decoupled PI","condition":"randomised","output":"chamber pressure","mape":2.429},{"controller":"Decoupled PI","condition":"randomised","output":"mixture ratio","mape":1.981},{"controller":"PPO, no preview","condition":"nominal","output":"chamber pressure","mape":1.21},{"controller":"PPO, no preview","condition":"nominal","output":"mixture ratio","mape":0.366},{"controller":"PPO, no preview","condition":"randomised","output":"chamber pressure","mape":1.097},{"controller":"PPO, no preview","condition":"randomised","output":"mixture ratio","mape":1.609},{"controller":"PPO, preview","condition":"nominal","output":"chamber pressure","mape":0.525},{"controller":"PPO, preview","condition":"nominal","output":"mixture ratio","mape":0.333},{"controller":"PPO, preview","condition":"randomised","output":"chamber pressure","mape":0.922},{"controller":"PPO, preview","condition":"randomised","output":"mixture ratio","mape":1.903},{"controller":"SAC, no preview","condition":"nominal","output":"chamber pressure","mape":0.792},{"controller":"SAC, no preview","condition":"nominal","output":"mixture ratio","mape":0.312},{"controller":"SAC, no preview","condition":"randomised","output":"chamber pressure","mape":1.136},{"controller":"SAC, no preview","condition":"randomised","output":"mixture ratio","mape":1.881},{"controller":"SAC, preview","condition":"nominal","output":"chamber pressure","mape":0.542},{"controller":"SAC, preview","condition":"nominal","output":"mixture ratio","mape":0.261},{"controller":"SAC, preview","condition":"randomised","output":"chamber pressure","mape":0.886},{"controller":"SAC, preview","condition":"randomised","output":"mixture ratio","mape":1.883}]
 },
 "layer": [
  {
   "transform": [
    {
     "pivot": "condition",
     "value": "mape",
     "groupby": [
      "controller",
      "output"
     ]
    }
   ],
   "mark": {
    "type": "rule",
    "strokeWidth": 2,
    "opacity": 0.6
   },
   "encoding": {
    "y": {
     "field": "controller",
     "type": "nominal",
     "sort": [
      "Feedforward only",
      "Decoupled PI",
      "PPO, no preview",
      "PPO, preview",
      "SAC, no preview",
      "SAC, preview"
     ],
     "title": null,
     "scale": {
      "paddingInner": 0.25
     }
    },
    "yOffset": {
     "field": "output",
     "type": "nominal",
     "sort": [
      "chamber pressure",
      "mixture ratio"
     ]
    },
    "x": {
     "field": "nominal",
     "type": "quantitative",
     "scale": {
      "type": "log"
     }
    },
    "x2": {
     "field": "randomised"
    },
    "color": {
     "field": "output",
     "type": "nominal",
     "scale": {
      "domain": [
       "chamber pressure",
       "mixture ratio"
      ],
      "range": [
       "var(--viz-s1)",
       "var(--viz-s2)"
      ]
     },
     "legend": null
    }
   }
  },
  {
   "transform": [
    {
     "filter": "datum.condition === 'nominal'"
    }
   ],
   "mark": {
    "type": "point",
    "size": 80,
    "filled": true,
    "opacity": 1
   },
   "encoding": {
    "y": {
     "field": "controller",
     "type": "nominal",
     "sort": [
      "Feedforward only",
      "Decoupled PI",
      "PPO, no preview",
      "PPO, preview",
      "SAC, no preview",
      "SAC, preview"
     ],
     "title": null,
     "scale": {
      "paddingInner": 0.25
     }
    },
    "yOffset": {
     "field": "output",
     "type": "nominal",
     "sort": [
      "chamber pressure",
      "mixture ratio"
     ]
    },
    "x": {
     "field": "mape",
     "type": "quantitative",
     "scale": {
      "type": "log"
     },
     "title": "MAPE (%)"
    },
    "color": {
     "field": "output",
     "type": "nominal",
     "scale": {
      "domain": [
       "chamber pressure",
       "mixture ratio"
      ],
      "range": [
       "var(--viz-s1)",
       "var(--viz-s2)"
      ]
     },
     "legend": {
      "title": null
     }
    },
    "tooltip": [
     {
      "field": "controller"
     },
     {
      "field": "output"
     },
     {
      "field": "condition"
     },
     {
      "field": "mape",
      "title": "MAPE (%)",
      "format": ".2f"
     }
    ]
   }
  },
  {
   "transform": [
    {
     "filter": "datum.condition === 'randomised'"
    }
   ],
   "mark": {
    "type": "point",
    "size": 80,
    "filled": false,
    "strokeWidth": 2,
    "opacity": 1
   },
   "encoding": {
    "y": {
     "field": "controller",
     "type": "nominal",
     "sort": [
      "Feedforward only",
      "Decoupled PI",
      "PPO, no preview",
      "PPO, preview",
      "SAC, no preview",
      "SAC, preview"
     ],
     "title": null,
     "scale": {
      "paddingInner": 0.25
     }
    },
    "yOffset": {
     "field": "output",
     "type": "nominal",
     "sort": [
      "chamber pressure",
      "mixture ratio"
     ]
    },
    "x": {
     "field": "mape",
     "type": "quantitative",
     "scale": {
      "type": "log"
     }
    },
    "color": {
     "field": "output",
     "type": "nominal",
     "scale": {
      "domain": [
       "chamber pressure",
       "mixture ratio"
      ],
      "range": [
       "var(--viz-s1)",
       "var(--viz-s2)"
      ]
     }
    },
    "tooltip": [
     {
      "field": "controller"
     },
     {
      "field": "output"
     },
     {
      "field": "condition"
     },
     {
      "field": "mape",
      "title": "MAPE (%)",
      "format": ".2f"
     }
    ]
   }
  }
 ]
}
```

Three readings:

1. **Feedback is necessary, but static linear feedback is not enough.** Feedforward from the trim table is right only once the slow thermal transient has settled; it settles 18 % of pressure steps within their hold. The PI fixes the steady state but is slow: 46 % of pressure steps settle within the hold, after 3.3 s on average. Its overshoots break the mixture-ratio limit, and its undershoots at low set points drop the cooling-channel pressure below 46 bar: together about 15 violation steps per episode. The static decoupler cannot undo the [TFV overshoot](primer/4-time-scales.md#why-tfv-is-slow), whose fast gain is about twice its static gain.
2. **The learned controllers are fast and clean on the plant they were trained on.** They settle 93–96 % of pressure steps, in 0.5–1.0 s, and all but SAC without preview use less valve travel than the PI, which hunts. PPO and SAC end up within about 0.1 % of each other when both have preview; SAC is better without it.
3. **Domain randomisation exposes them.** With engine and sensor parameters drawn from DLR's Table A.3 ranges, the networks' mixture-ratio error rises five- to sixfold, to 1.6–1.9 %, close to the PI's 2.0 % (the PI improves slightly under randomisation, partly because some draws shorten the sensor delays). Pressure error only doubles. The [robustness section](#robustness) shows where this comes from.

### On the evaluation profile

A fixed 40 s profile with steps and ramps in both outputs. It is the Lab's default, so you can replay each controller there ([PI](primer/8-lab.md?preset=pi), [PPO](primer/8-lab.md?preset=ppo-preview), [SAC](primer/8-lab.md?preset=sac-preview)).

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Chamber pressure on the evaluation profile",
  "subtitle": "Sensor delays and noise on, nominal engine. This repo's surrogate (not DLR's simulator); data/results/eval_traces.json"
 },
 "width": "container",
 "height": 220,
 "data": {
  "values": [{"t":0.2,"series":"set point","y":40.0},{"t":0.4,"series":"set point","y":40.0},{"t":0.6,"series":"set point","y":40.0},{"t":0.8,"series":"set point","y":40.0},{"t":1.0,"series":"set point","y":40.0},{"t":1.2,"series":"set point","y":40.0},{"t":1.4,"series":"set point","y":40.0},{"t":1.6,"series":"set point","y":40.0},{"t":1.8,"series":"set point","y":40.0},{"t":2.0,"series":"set point","y":40.0},{"t":2.2,"series":"set point","y":40.0},{"t":2.4,"series":"set point","y":40.0},{"t":2.6,"series":"set point","y":40.0},{"t":2.8,"series":"set point","y":40.0},{"t":3.0,"series":"set point","y":40.0},{"t":3.2,"series":"set point","y":40.0},{"t":3.4,"series":"set point","y":40.0},{"t":3.6,"series":"set point","y":40.0},{"t":3.8,"series":"set point","y":40.0},{"t":4.0,"series":"set point","y":40.0},{"t":4.2,"series":"set point","y":40.0},{"t":4.4,"series":"set point","y":40.0},{"t":4.6,"series":"set point","y":40.0},{"t":4.8,"series":"set point","y":40.0},{"t":5.0,"series":"set point","y":40.0},{"t":5.2,"series":"set point","y":45.0},{"t":5.4,"series":"set point","y":45.0},{"t":5.6,"series":"set point","y":45.0},{"t":5.8,"series":"set point","y":45.0},{"t":6.0,"series":"set point","y":45.0},{"t":6.2,"series":"set point","y":45.0},{"t":6.4,"series":"set point","y":45.0},{"t":6.6,"series":"set point","y":45.0},{"t":6.8,"series":"set point","y":45.0},{"t":7.0,"series":"set point","y":45.0},{"t":7.2,"series":"set point","y":45.0},{"t":7.4,"series":"set point","y":45.0},{"t":7.6,"series":"set point","y":45.0},{"t":7.8,"series":"set point","y":45.0},{"t":8.0,"series":"set point","y":45.0},{"t":8.2,"series":"set point","y":45.0},{"t":8.4,"series":"set point","y":45.0},{"t":8.6,"series":"set point","y":45.0},{"t":8.8,"series":"set point","y":45.0},{"t":9.0,"series":"set point","y":45.0},{"t":9.2,"series":"set point","y":45.0},{"t":9.4,"series":"set point","y":45.0},{"t":9.6,"series":"set point","y":45.0},{"t":9.8,"series":"set point","y":45.0},{"t":10.0,"series":"set point","y":45.0},{"t":10.2,"series":"set point","y":45.0},{"t":10.4,"series":"set point","y":45.0},{"t":10.6,"series":"set point","y":45.0},{"t":10.8,"series":"set point","y":45.0},{"t":11.0,"series":"set point","y":45.0},{"t":11.2,"series":"set point","y":45.0},{"t":11.4,"series":"set point","y":45.0},{"t":11.6,"series":"set point","y":45.0},{"t":11.8,"series":"set point","y":45.0},{"t":12.0,"series":"set point","y":45.0},{"t":12.2,"series":"set point","y":45.0},{"t":12.4,"series":"set point","y":45.0},{"t":12.6,"series":"set point","y":45.0},{"t":12.8,"series":"set point","y":45.0},{"t":13.0,"series":"set point","y":45.0},{"t":13.2,"series":"set point","y":45.0},{"t":13.4,"series":"set point","y":45.0},{"t":13.6,"series":"set point","y":45.0},{"t":13.8,"series":"set point","y":45.0},{"t":14.0,"series":"set point","y":45.0},{"t":14.2,"series":"set point","y":45.0},{"t":14.4,"series":"set point","y":45.0},{"t":14.6,"series":"set point","y":45.0},{"t":14.8,"series":"set point","y":45.0},{"t":15.0,"series":"set point","y":45.0},{"t":15.2,"series":"set point","y":45.3333},{"t":15.4,"series":"set point","y":45.6667},{"t":15.6,"series":"set point","y":46.0},{"t":15.8,"series":"set point","y":46.3333},{"t":16.0,"series":"set point","y":46.6667},{"t":16.2,"series":"set point","y":47.0},{"t":16.4,"series":"set point","y":47.3333},{"t":16.6,"series":"set point","y":47.6667},{"t":16.8,"series":"set point","y":48.0},{"t":17.0,"series":"set point","y":48.3333},{"t":17.2,"series":"set point","y":48.6667},{"t":17.4,"series":"set point","y":49.0},{"t":17.6,"series":"set point","y":49.3333},{"t":17.8,"series":"set point","y":49.6667},{"t":18.0,"series":"set point","y":50.0},{"t":18.2,"series":"set point","y":50.0},{"t":18.4,"series":"set point","y":50.0},{"t":18.6,"series":"set point","y":50.0},{"t":18.8,"series":"set point","y":50.0},{"t":19.0,"series":"set point","y":50.0},{"t":19.2,"series":"set point","y":50.0},{"t":19.4,"series":"set point","y":50.0},{"t":19.6,"series":"set point","y":50.0},{"t":19.8,"series":"set point","y":50.0},{"t":20.0,"series":"set point","y":50.0},{"t":20.2,"series":"set point","y":50.0},{"t":20.4,"series":"set point","y":50.0},{"t":20.6,"series":"set point","y":50.0},{"t":20.8,"series":"set point","y":50.0},{"t":21.0,"series":"set point","y":50.0},{"t":21.2,"series":"set point","y":50.0},{"t":21.4,"series":"set point","y":50.0},{"t":21.6,"series":"set point","y":50.0},{"t":21.8,"series":"set point","y":50.0},{"t":22.0,"series":"set point","y":50.0},{"t":22.2,"series":"set point","y":50.0},{"t":22.4,"series":"set point","y":50.0},{"t":22.6,"series":"set point","y":50.0},{"t":22.8,"series":"set point","y":50.0},{"t":23.0,"series":"set point","y":50.0},{"t":23.2,"series":"set point","y":50.0},{"t":23.4,"series":"set point","y":50.0},{"t":23.6,"series":"set point","y":50.0},{"t":23.8,"series":"set point","y":50.0},{"t":24.0,"series":"set point","y":50.0},{"t":24.2,"series":"set point","y":50.0},{"t":24.4,"series":"set point","y":50.0},{"t":24.6,"series":"set point","y":50.0},{"t":24.8,"series":"set point","y":50.0},{"t":25.0,"series":"set point","y":50.0},{"t":25.2,"series":"set point","y":50.0},{"t":25.4,"series":"set point","y":50.0},{"t":25.6,"series":"set point","y":50.0},{"t":25.8,"series":"set point","y":50.0},{"t":26.0,"series":"set point","y":50.0},{"t":26.2,"series":"set point","y":50.0},{"t":26.4,"series":"set point","y":50.0},{"t":26.6,"series":"set point","y":50.0},{"t":26.8,"series":"set point","y":50.0},{"t":27.0,"series":"set point","y":50.0},{"t":27.2,"series":"set point","y":38.0},{"t":27.4,"series":"set point","y":38.0},{"t":27.6,"series":"set point","y":38.0},{"t":27.8,"series":"set point","y":38.0},{"t":28.0,"series":"set point","y":38.0},{"t":28.2,"series":"set point","y":38.0},{"t":28.4,"series":"set point","y":38.0},{"t":28.6,"series":"set point","y":38.0},{"t":28.8,"series":"set point","y":38.0},{"t":29.0,"series":"set point","y":38.0},{"t":29.2,"series":"set point","y":38.0},{"t":29.4,"series":"set point","y":38.0},{"t":29.6,"series":"set point","y":38.0},{"t":29.8,"series":"set point","y":38.0},{"t":30.0,"series":"set point","y":38.0},{"t":30.2,"series":"set point","y":38.0},{"t":30.4,"series":"set point","y":38.0},{"t":30.6,"series":"set point","y":38.0},{"t":30.8,"series":"set point","y":38.0},{"t":31.0,"series":"set point","y":38.0},{"t":31.2,"series":"set point","y":38.0},{"t":31.4,"series":"set point","y":38.0},{"t":31.6,"series":"set point","y":38.0},{"t":31.8,"series":"set point","y":38.0},{"t":32.0,"series":"set point","y":38.0},{"t":32.2,"series":"set point","y":38.0},{"t":32.4,"series":"set point","y":38.0},{"t":32.6,"series":"set point","y":38.0},{"t":32.8,"series":"set point","y":38.0},{"t":33.0,"series":"set point","y":38.0},{"t":33.2,"series":"set point","y":38.0},{"t":33.4,"series":"set point","y":38.0},{"t":33.6,"series":"set point","y":38.0},{"t":33.8,"series":"set point","y":38.0},{"t":34.0,"series":"set point","y":38.0},{"t":34.2,"series":"set point","y":38.0},{"t":34.4,"series":"set point","y":38.0},{"t":34.6,"series":"set point","y":38.0},{"t":34.8,"series":"set point","y":38.0},{"t":35.0,"series":"set point","y":38.0},{"t":35.2,"series":"set point","y":38.0},{"t":35.4,"series":"set point","y":38.0},{"t":35.6,"series":"set point","y":38.0},{"t":35.8,"series":"set point","y":38.0},{"t":36.0,"series":"set point","y":38.0},{"t":36.2,"series":"set point","y":37.7},{"t":36.4,"series":"set point","y":37.4},{"t":36.6,"series":"set point","y":37.1},{"t":36.8,"series":"set point","y":36.8},{"t":37.0,"series":"set point","y":36.5},{"t":37.2,"series":"set point","y":36.2},{"t":37.4,"series":"set point","y":35.9},{"t":37.6,"series":"set point","y":35.6},{"t":37.8,"series":"set point","y":35.3},{"t":38.0,"series":"set point","y":35.0},{"t":38.2,"series":"set point","y":35.0},{"t":38.4,"series":"set point","y":35.0},{"t":38.6,"series":"set point","y":35.0},{"t":38.8,"series":"set point","y":35.0},{"t":39.0,"series":"set point","y":35.0},{"t":39.2,"series":"set point","y":35.0},{"t":39.4,"series":"set point","y":35.0},{"t":39.6,"series":"set point","y":35.0},{"t":39.8,"series":"set point","y":35.0},{"t":40.0,"series":"set point","y":35.0},{"t":0.2,"series":"Decoupled PI","y":40.0015},{"t":0.4,"series":"Decoupled PI","y":40.001},{"t":0.6,"series":"Decoupled PI","y":39.9914},{"t":0.8,"series":"Decoupled PI","y":40.0092},{"t":1.0,"series":"Decoupled PI","y":40.0324},{"t":1.2,"series":"Decoupled PI","y":40.0102},{"t":1.4,"series":"Decoupled PI","y":39.9862},{"t":1.6,"series":"Decoupled PI","y":39.9851},{"t":1.8,"series":"Decoupled PI","y":40.0056},{"t":2.0,"series":"Decoupled PI","y":40.0185},{"t":2.2,"series":"Decoupled PI","y":40.0187},{"t":2.4,"series":"Decoupled PI","y":40.0063},{"t":2.6,"series":"Decoupled PI","y":39.9799},{"t":2.8,"series":"Decoupled PI","y":39.983},{"t":3.0,"series":"Decoupled PI","y":40.0109},{"t":3.2,"series":"Decoupled PI","y":40.0447},{"t":3.4,"series":"Decoupled PI","y":40.0348},{"t":3.6,"series":"Decoupled PI","y":40.0003},{"t":3.8,"series":"Decoupled PI","y":39.9878},{"t":4.0,"series":"Decoupled PI","y":39.9756},{"t":4.2,"series":"Decoupled PI","y":39.9742},{"t":4.4,"series":"Decoupled PI","y":39.9936},{"t":4.6,"series":"Decoupled PI","y":39.9889},{"t":4.8,"series":"Decoupled PI","y":39.9824},{"t":5.0,"series":"Decoupled PI","y":39.9734},{"t":5.2,"series":"Decoupled PI","y":39.689},{"t":5.4,"series":"Decoupled PI","y":42.1659},{"t":5.6,"series":"Decoupled PI","y":43.8564},{"t":5.8,"series":"Decoupled PI","y":43.9379},{"t":6.0,"series":"Decoupled PI","y":42.314},{"t":6.2,"series":"Decoupled PI","y":41.0555},{"t":6.4,"series":"Decoupled PI","y":42.9627},{"t":6.6,"series":"Decoupled PI","y":46.9582},{"t":6.8,"series":"Decoupled PI","y":49.4298},{"t":7.0,"series":"Decoupled PI","y":49.235},{"t":7.2,"series":"Decoupled PI","y":47.6999},{"t":7.4,"series":"Decoupled PI","y":46.502},{"t":7.6,"series":"Decoupled PI","y":46.4557},{"t":7.8,"series":"Decoupled PI","y":46.9061},{"t":8.0,"series":"Decoupled PI","y":47.0299},{"t":8.2,"series":"Decoupled PI","y":46.6468},{"t":8.4,"series":"Decoupled PI","y":46.0051},{"t":8.6,"series":"Decoupled PI","y":45.5296},{"t":8.8,"series":"Decoupled PI","y":45.4444},{"t":9.0,"series":"Decoupled PI","y":45.6936},{"t":9.2,"series":"Decoupled PI","y":46.0272},{"t":9.4,"series":"Decoupled PI","y":46.1307},{"t":9.6,"series":"Decoupled PI","y":46.0331},{"t":9.8,"series":"Decoupled PI","y":45.9348},{"t":10.0,"series":"Decoupled PI","y":45.9002},{"t":10.2,"series":"Decoupled PI","y":46.1094},{"t":10.4,"series":"Decoupled PI","y":47.0034},{"t":10.6,"series":"Decoupled PI","y":47.2368},{"t":10.8,"series":"Decoupled PI","y":46.6906},{"t":11.0,"series":"Decoupled PI","y":45.7802},{"t":11.2,"series":"Decoupled PI","y":44.9899},{"t":11.4,"series":"Decoupled PI","y":44.6872},{"t":11.6,"series":"Decoupled PI","y":44.8336},{"t":11.8,"series":"Decoupled PI","y":45.1684},{"t":12.0,"series":"Decoupled PI","y":45.3699},{"t":12.2,"series":"Decoupled PI","y":45.3782},{"t":12.4,"series":"Decoupled PI","y":45.1747},{"t":12.6,"series":"Decoupled PI","y":45.0369},{"t":12.8,"series":"Decoupled PI","y":45.0945},{"t":13.0,"series":"Decoupled PI","y":45.2547},{"t":13.2,"series":"Decoupled PI","y":45.3931},{"t":13.4,"series":"Decoupled PI","y":45.4143},{"t":13.6,"series":"Decoupled PI","y":45.3464},{"t":13.8,"series":"Decoupled PI","y":45.1958},{"t":14.0,"series":"Decoupled PI","y":45.1593},{"t":14.2,"series":"Decoupled PI","y":45.1986},{"t":14.4,"series":"Decoupled PI","y":45.2556},{"t":14.6,"series":"Decoupled PI","y":45.2826},{"t":14.8,"series":"Decoupled PI","y":45.2437},{"t":15.0,"series":"Decoupled PI","y":45.1707},{"t":15.2,"series":"Decoupled PI","y":45.0873},{"t":15.4,"series":"Decoupled PI","y":45.2584},{"t":15.6,"series":"Decoupled PI","y":45.6049},{"t":15.8,"series":"Decoupled PI","y":45.9321},{"t":16.0,"series":"Decoupled PI","y":46.1124},{"t":16.2,"series":"Decoupled PI","y":46.2562},{"t":16.4,"series":"Decoupled PI","y":46.5066},{"t":16.6,"series":"Decoupled PI","y":46.9594},{"t":16.8,"series":"Decoupled PI","y":47.6626},{"t":17.0,"series":"Decoupled PI","y":48.4457},{"t":17.2,"series":"Decoupled PI","y":49.0849},{"t":17.4,"series":"Decoupled PI","y":49.4506},{"t":17.6,"series":"Decoupled PI","y":49.7134},{"t":17.8,"series":"Decoupled PI","y":50.1718},{"t":18.0,"series":"Decoupled PI","y":50.8291},{"t":18.2,"series":"Decoupled PI","y":51.5904},{"t":18.4,"series":"Decoupled PI","y":51.7865},{"t":18.6,"series":"Decoupled PI","y":51.4355},{"t":18.8,"series":"Decoupled PI","y":51.2228},{"t":19.0,"series":"Decoupled PI","y":51.6769},{"t":19.2,"series":"Decoupled PI","y":52.2173},{"t":19.4,"series":"Decoupled PI","y":52.1981},{"t":19.6,"series":"Decoupled PI","y":51.438},{"t":19.8,"series":"Decoupled PI","y":50.5548},{"t":20.0,"series":"Decoupled PI","y":50.5085},{"t":20.2,"series":"Decoupled PI","y":51.176},{"t":20.4,"series":"Decoupled PI","y":51.7017},{"t":20.6,"series":"Decoupled PI","y":51.343},{"t":20.8,"series":"Decoupled PI","y":50.2785},{"t":21.0,"series":"Decoupled PI","y":49.9806},{"t":21.2,"series":"Decoupled PI","y":50.8547},{"t":21.4,"series":"Decoupled PI","y":51.8046},{"t":21.6,"series":"Decoupled PI","y":51.8512},{"t":21.8,"series":"Decoupled PI","y":50.6272},{"t":22.0,"series":"Decoupled PI","y":49.6096},{"t":22.2,"series":"Decoupled PI","y":50.1631},{"t":22.4,"series":"Decoupled PI","y":51.2209},{"t":22.6,"series":"Decoupled PI","y":51.3724},{"t":22.8,"series":"Decoupled PI","y":49.9829},{"t":23.0,"series":"Decoupled PI","y":48.5283},{"t":23.2,"series":"Decoupled PI","y":49.0893},{"t":23.4,"series":"Decoupled PI","y":51.059},{"t":23.6,"series":"Decoupled PI","y":52.0738},{"t":23.8,"series":"Decoupled PI","y":51.148},{"t":24.0,"series":"Decoupled PI","y":49.3943},{"t":24.2,"series":"Decoupled PI","y":49.5911},{"t":24.4,"series":"Decoupled PI","y":51.7222},{"t":24.6,"series":"Decoupled PI","y":53.2854},{"t":24.8,"series":"Decoupled PI","y":52.7586},{"t":25.0,"series":"Decoupled PI","y":51.0212},{"t":25.2,"series":"Decoupled PI","y":50.3115},{"t":25.4,"series":"Decoupled PI","y":50.967},{"t":25.6,"series":"Decoupled PI","y":51.4822},{"t":25.8,"series":"Decoupled PI","y":50.9805},{"t":26.0,"series":"Decoupled PI","y":49.7851},{"t":26.2,"series":"Decoupled PI","y":49.2263},{"t":26.4,"series":"Decoupled PI","y":49.8337},{"t":26.6,"series":"Decoupled PI","y":50.7517},{"t":26.8,"series":"Decoupled PI","y":51.0905},{"t":27.0,"series":"Decoupled PI","y":50.7524},{"t":27.2,"series":"Decoupled PI","y":50.9736},{"t":27.4,"series":"Decoupled PI","y":45.0986},{"t":27.6,"series":"Decoupled PI","y":41.3435},{"t":27.8,"series":"Decoupled PI","y":41.9432},{"t":28.0,"series":"Decoupled PI","y":42.8438},{"t":28.2,"series":"Decoupled PI","y":41.8432},{"t":28.4,"series":"Decoupled PI","y":40.1691},{"t":28.6,"series":"Decoupled PI","y":38.6756},{"t":28.8,"series":"Decoupled PI","y":37.5642},{"t":29.0,"series":"Decoupled PI","y":36.7321},{"t":29.2,"series":"Decoupled PI","y":36.0441},{"t":29.4,"series":"Decoupled PI","y":35.4625},{"t":29.6,"series":"Decoupled PI","y":35.0093},{"t":29.8,"series":"Decoupled PI","y":34.7343},{"t":30.0,"series":"Decoupled PI","y":34.6555},{"t":30.2,"series":"Decoupled PI","y":34.7999},{"t":30.4,"series":"Decoupled PI","y":35.0495},{"t":30.6,"series":"Decoupled PI","y":35.315},{"t":30.8,"series":"Decoupled PI","y":35.5263},{"t":31.0,"series":"Decoupled PI","y":35.6624},{"t":31.2,"series":"Decoupled PI","y":35.7029},{"t":31.4,"series":"Decoupled PI","y":35.695},{"t":31.6,"series":"Decoupled PI","y":35.7079},{"t":31.8,"series":"Decoupled PI","y":35.7506},{"t":32.0,"series":"Decoupled PI","y":35.8002},{"t":32.2,"series":"Decoupled PI","y":35.8684},{"t":32.4,"series":"Decoupled PI","y":35.9705},{"t":32.6,"series":"Decoupled PI","y":36.0577},{"t":32.8,"series":"Decoupled PI","y":36.1126},{"t":33.0,"series":"Decoupled PI","y":36.1316},{"t":33.2,"series":"Decoupled PI","y":36.3756},{"t":33.4,"series":"Decoupled PI","y":37.1904},{"t":33.6,"series":"Decoupled PI","y":37.5683},{"t":33.8,"series":"Decoupled PI","y":37.359},{"t":34.0,"series":"Decoupled PI","y":36.8218},{"t":34.2,"series":"Decoupled PI","y":36.1986},{"t":34.4,"series":"Decoupled PI","y":35.6368},{"t":34.6,"series":"Decoupled PI","y":35.2817},{"t":34.8,"series":"Decoupled PI","y":35.2667},{"t":35.0,"series":"Decoupled PI","y":35.4951},{"t":35.2,"series":"Decoupled PI","y":35.8199},{"t":35.4,"series":"Decoupled PI","y":36.0958},{"t":35.6,"series":"Decoupled PI","y":36.2064},{"t":35.8,"series":"Decoupled PI","y":36.1832},{"t":36.0,"series":"Decoupled PI","y":36.1047},{"t":36.2,"series":"Decoupled PI","y":36.0366},{"t":36.4,"series":"Decoupled PI","y":35.9162},{"t":36.6,"series":"Decoupled PI","y":35.8041},{"t":36.8,"series":"Decoupled PI","y":35.7352},{"t":37.0,"series":"Decoupled PI","y":35.7155},{"t":37.2,"series":"Decoupled PI","y":35.6836},{"t":37.4,"series":"Decoupled PI","y":35.5647},{"t":37.6,"series":"Decoupled PI","y":35.364},{"t":37.8,"series":"Decoupled PI","y":35.0806},{"t":38.0,"series":"Decoupled PI","y":34.7423},{"t":38.2,"series":"Decoupled PI","y":34.3946},{"t":38.4,"series":"Decoupled PI","y":34.1516},{"t":38.6,"series":"Decoupled PI","y":34.0013},{"t":38.8,"series":"Decoupled PI","y":33.8783},{"t":39.0,"series":"Decoupled PI","y":33.7427},{"t":39.2,"series":"Decoupled PI","y":33.5842},{"t":39.4,"series":"Decoupled PI","y":33.4252},{"t":39.6,"series":"Decoupled PI","y":33.2864},{"t":39.8,"series":"Decoupled PI","y":33.1913},{"t":40.0,"series":"Decoupled PI","y":33.1567},{"t":0.2,"series":"PPO, preview","y":40.0071},{"t":0.4,"series":"PPO, preview","y":39.9933},{"t":0.6,"series":"PPO, preview","y":39.9717},{"t":0.8,"series":"PPO, preview","y":39.9778},{"t":1.0,"series":"PPO, preview","y":40.0062},{"t":1.2,"series":"PPO, preview","y":39.9899},{"t":1.4,"series":"PPO, preview","y":39.9984},{"t":1.6,"series":"PPO, preview","y":39.9841},{"t":1.8,"series":"PPO, preview","y":39.9916},{"t":2.0,"series":"PPO, preview","y":39.9952},{"t":2.2,"series":"PPO, preview","y":39.9876},{"t":2.4,"series":"PPO, preview","y":39.9905},{"t":2.6,"series":"PPO, preview","y":39.9557},{"t":2.8,"series":"PPO, preview","y":39.9539},{"t":3.0,"series":"PPO, preview","y":39.9606},{"t":3.2,"series":"PPO, preview","y":40.0004},{"t":3.4,"series":"PPO, preview","y":39.9795},{"t":3.6,"series":"PPO, preview","y":39.9681},{"t":3.8,"series":"PPO, preview","y":39.9592},{"t":4.0,"series":"PPO, preview","y":39.9404},{"t":4.2,"series":"PPO, preview","y":39.962},{"t":4.4,"series":"PPO, preview","y":39.9757},{"t":4.6,"series":"PPO, preview","y":39.9781},{"t":4.8,"series":"PPO, preview","y":39.6708},{"t":5.0,"series":"PPO, preview","y":40.0528},{"t":5.2,"series":"PPO, preview","y":42.1727},{"t":5.4,"series":"PPO, preview","y":44.8273},{"t":5.6,"series":"PPO, preview","y":45.5354},{"t":5.8,"series":"PPO, preview","y":45.2946},{"t":6.0,"series":"PPO, preview","y":45.1276},{"t":6.2,"series":"PPO, preview","y":45.0994},{"t":6.4,"series":"PPO, preview","y":45.1179},{"t":6.6,"series":"PPO, preview","y":45.1089},{"t":6.8,"series":"PPO, preview","y":45.0887},{"t":7.0,"series":"PPO, preview","y":45.0746},{"t":7.2,"series":"PPO, preview","y":45.1003},{"t":7.4,"series":"PPO, preview","y":45.0822},{"t":7.6,"series":"PPO, preview","y":45.1049},{"t":7.8,"series":"PPO, preview","y":45.1029},{"t":8.0,"series":"PPO, preview","y":45.1005},{"t":8.2,"series":"PPO, preview","y":45.1095},{"t":8.4,"series":"PPO, preview","y":45.0869},{"t":8.6,"series":"PPO, preview","y":45.0824},{"t":8.8,"series":"PPO, preview","y":45.0652},{"t":9.0,"series":"PPO, preview","y":45.0515},{"t":9.2,"series":"PPO, preview","y":45.1028},{"t":9.4,"series":"PPO, preview","y":45.0844},{"t":9.6,"series":"PPO, preview","y":45.0932},{"t":9.8,"series":"PPO, preview","y":45.1418},{"t":10.0,"series":"PPO, preview","y":45.2303},{"t":10.2,"series":"PPO, preview","y":45.1663},{"t":10.4,"series":"PPO, preview","y":45.0214},{"t":10.6,"series":"PPO, preview","y":45.2077},{"t":10.8,"series":"PPO, preview","y":45.3019},{"t":11.0,"series":"PPO, preview","y":45.3062},{"t":11.2,"series":"PPO, preview","y":45.254},{"t":11.4,"series":"PPO, preview","y":45.2293},{"t":11.6,"series":"PPO, preview","y":45.231},{"t":11.8,"series":"PPO, preview","y":45.2211},{"t":12.0,"series":"PPO, preview","y":45.2219},{"t":12.2,"series":"PPO, preview","y":45.2533},{"t":12.4,"series":"PPO, preview","y":45.2283},{"t":12.6,"series":"PPO, preview","y":45.2263},{"t":12.8,"series":"PPO, preview","y":45.2282},{"t":13.0,"series":"PPO, preview","y":45.2093},{"t":13.2,"series":"PPO, preview","y":45.2137},{"t":13.4,"series":"PPO, preview","y":45.2289},{"t":13.6,"series":"PPO, preview","y":45.258},{"t":13.8,"series":"PPO, preview","y":45.2233},{"t":14.0,"series":"PPO, preview","y":45.2418},{"t":14.2,"series":"PPO, preview","y":45.2263},{"t":14.4,"series":"PPO, preview","y":45.2273},{"t":14.6,"series":"PPO, preview","y":45.2444},{"t":14.8,"series":"PPO, preview","y":45.2241},{"t":15.0,"series":"PPO, preview","y":45.2003},{"t":15.2,"series":"PPO, preview","y":45.3183},{"t":15.4,"series":"PPO, preview","y":45.673},{"t":15.6,"series":"PPO, preview","y":46.0823},{"t":15.8,"series":"PPO, preview","y":46.4855},{"t":16.0,"series":"PPO, preview","y":46.8168},{"t":16.2,"series":"PPO, preview","y":47.1619},{"t":16.4,"series":"PPO, preview","y":47.4919},{"t":16.6,"series":"PPO, preview","y":47.8159},{"t":16.8,"series":"PPO, preview","y":48.1485},{"t":17.0,"series":"PPO, preview","y":48.4577},{"t":17.2,"series":"PPO, preview","y":48.771},{"t":17.4,"series":"PPO, preview","y":49.0815},{"t":17.6,"series":"PPO, preview","y":49.3905},{"t":17.8,"series":"PPO, preview","y":49.7166},{"t":18.0,"series":"PPO, preview","y":50.0438},{"t":18.2,"series":"PPO, preview","y":50.2649},{"t":18.4,"series":"PPO, preview","y":50.3116},{"t":18.6,"series":"PPO, preview","y":50.2523},{"t":18.8,"series":"PPO, preview","y":50.1899},{"t":19.0,"series":"PPO, preview","y":50.1733},{"t":19.2,"series":"PPO, preview","y":50.1499},{"t":19.4,"series":"PPO, preview","y":50.1497},{"t":19.6,"series":"PPO, preview","y":50.1492},{"t":19.8,"series":"PPO, preview","y":50.149},{"t":20.0,"series":"PPO, preview","y":50.1479},{"t":20.2,"series":"PPO, preview","y":50.1193},{"t":20.4,"series":"PPO, preview","y":50.1073},{"t":20.6,"series":"PPO, preview","y":50.1189},{"t":20.8,"series":"PPO, preview","y":50.1333},{"t":21.0,"series":"PPO, preview","y":50.1229},{"t":21.2,"series":"PPO, preview","y":50.1031},{"t":21.4,"series":"PPO, preview","y":50.1015},{"t":21.6,"series":"PPO, preview","y":50.0983},{"t":21.8,"series":"PPO, preview","y":50.0633},{"t":22.0,"series":"PPO, preview","y":50.0189},{"t":22.2,"series":"PPO, preview","y":50.0495},{"t":22.4,"series":"PPO, preview","y":50.0261},{"t":22.6,"series":"PPO, preview","y":50.0362},{"t":22.8,"series":"PPO, preview","y":50.0007},{"t":23.0,"series":"PPO, preview","y":49.9547},{"t":23.2,"series":"PPO, preview","y":49.9016},{"t":23.4,"series":"PPO, preview","y":49.8296},{"t":23.6,"series":"PPO, preview","y":49.756},{"t":23.8,"series":"PPO, preview","y":49.6857},{"t":24.0,"series":"PPO, preview","y":49.6009},{"t":24.2,"series":"PPO, preview","y":49.575},{"t":24.4,"series":"PPO, preview","y":49.6094},{"t":24.6,"series":"PPO, preview","y":49.6461},{"t":24.8,"series":"PPO, preview","y":49.6579},{"t":25.0,"series":"PPO, preview","y":49.6491},{"t":25.2,"series":"PPO, preview","y":49.6354},{"t":25.4,"series":"PPO, preview","y":49.6356},{"t":25.6,"series":"PPO, preview","y":49.6272},{"t":25.8,"series":"PPO, preview","y":49.622},{"t":26.0,"series":"PPO, preview","y":49.5998},{"t":26.2,"series":"PPO, preview","y":49.6077},{"t":26.4,"series":"PPO, preview","y":49.6031},{"t":26.6,"series":"PPO, preview","y":49.577},{"t":26.8,"series":"PPO, preview","y":50.1957},{"t":27.0,"series":"PPO, preview","y":49.5612},{"t":27.2,"series":"PPO, preview","y":46.4195},{"t":27.4,"series":"PPO, preview","y":42.9868},{"t":27.6,"series":"PPO, preview","y":41.0331},{"t":27.8,"series":"PPO, preview","y":39.5073},{"t":28.0,"series":"PPO, preview","y":38.4943},{"t":28.2,"series":"PPO, preview","y":38.0431},{"t":28.4,"series":"PPO, preview","y":37.9227},{"t":28.6,"series":"PPO, preview","y":37.8363},{"t":28.8,"series":"PPO, preview","y":37.7994},{"t":29.0,"series":"PPO, preview","y":37.8019},{"t":29.2,"series":"PPO, preview","y":37.819},{"t":29.4,"series":"PPO, preview","y":37.8243},{"t":29.6,"series":"PPO, preview","y":37.8293},{"t":29.8,"series":"PPO, preview","y":37.8683},{"t":30.0,"series":"PPO, preview","y":37.8481},{"t":30.2,"series":"PPO, preview","y":37.8738},{"t":30.4,"series":"PPO, preview","y":37.8475},{"t":30.6,"series":"PPO, preview","y":37.8666},{"t":30.8,"series":"PPO, preview","y":37.8574},{"t":31.0,"series":"PPO, preview","y":37.867},{"t":31.2,"series":"PPO, preview","y":37.8457},{"t":31.4,"series":"PPO, preview","y":37.8487},{"t":31.6,"series":"PPO, preview","y":37.8316},{"t":31.8,"series":"PPO, preview","y":37.8465},{"t":32.0,"series":"PPO, preview","y":37.835},{"t":32.2,"series":"PPO, preview","y":37.8262},{"t":32.4,"series":"PPO, preview","y":37.8467},{"t":32.6,"series":"PPO, preview","y":37.8217},{"t":32.8,"series":"PPO, preview","y":37.8862},{"t":33.0,"series":"PPO, preview","y":37.9815},{"t":33.2,"series":"PPO, preview","y":38.2441},{"t":33.4,"series":"PPO, preview","y":38.0181},{"t":33.6,"series":"PPO, preview","y":38.1601},{"t":33.8,"series":"PPO, preview","y":38.169},{"t":34.0,"series":"PPO, preview","y":38.051},{"t":34.2,"series":"PPO, preview","y":37.9795},{"t":34.4,"series":"PPO, preview","y":37.962},{"t":34.6,"series":"PPO, preview","y":37.9364},{"t":34.8,"series":"PPO, preview","y":37.9617},{"t":35.0,"series":"PPO, preview","y":37.9503},{"t":35.2,"series":"PPO, preview","y":37.9549},{"t":35.4,"series":"PPO, preview","y":37.9799},{"t":35.6,"series":"PPO, preview","y":37.9699},{"t":35.8,"series":"PPO, preview","y":37.9971},{"t":36.0,"series":"PPO, preview","y":37.9927},{"t":36.2,"series":"PPO, preview","y":37.8752},{"t":36.4,"series":"PPO, preview","y":37.5523},{"t":36.6,"series":"PPO, preview","y":37.2085},{"t":36.8,"series":"PPO, preview","y":36.8656},{"t":37.0,"series":"PPO, preview","y":36.5911},{"t":37.2,"series":"PPO, preview","y":36.3092},{"t":37.4,"series":"PPO, preview","y":36.0216},{"t":37.6,"series":"PPO, preview","y":35.7314},{"t":37.8,"series":"PPO, preview","y":35.4134},{"t":38.0,"series":"PPO, preview","y":35.0788},{"t":38.2,"series":"PPO, preview","y":34.892},{"t":38.4,"series":"PPO, preview","y":34.8595},{"t":38.6,"series":"PPO, preview","y":34.8957},{"t":38.8,"series":"PPO, preview","y":34.9212},{"t":39.0,"series":"PPO, preview","y":34.945},{"t":39.2,"series":"PPO, preview","y":34.9589},{"t":39.4,"series":"PPO, preview","y":34.9658},{"t":39.6,"series":"PPO, preview","y":34.9728},{"t":39.8,"series":"PPO, preview","y":34.9588},{"t":40.0,"series":"PPO, preview","y":34.9497},{"t":0.2,"series":"SAC, preview","y":39.9709},{"t":0.4,"series":"SAC, preview","y":40.0121},{"t":0.6,"series":"SAC, preview","y":40.0383},{"t":0.8,"series":"SAC, preview","y":40.0551},{"t":1.0,"series":"SAC, preview","y":40.065},{"t":1.2,"series":"SAC, preview","y":40.0705},{"t":1.4,"series":"SAC, preview","y":40.0953},{"t":1.6,"series":"SAC, preview","y":40.1016},{"t":1.8,"series":"SAC, preview","y":40.0868},{"t":2.0,"series":"SAC, preview","y":40.101},{"t":2.2,"series":"SAC, preview","y":40.084},{"t":2.4,"series":"SAC, preview","y":40.101},{"t":2.6,"series":"SAC, preview","y":40.0764},{"t":2.8,"series":"SAC, preview","y":40.0975},{"t":3.0,"series":"SAC, preview","y":40.0594},{"t":3.2,"series":"SAC, preview","y":40.0971},{"t":3.4,"series":"SAC, preview","y":40.0897},{"t":3.6,"series":"SAC, preview","y":40.1046},{"t":3.8,"series":"SAC, preview","y":40.0812},{"t":4.0,"series":"SAC, preview","y":40.0725},{"t":4.2,"series":"SAC, preview","y":40.0549},{"t":4.4,"series":"SAC, preview","y":40.0771},{"t":4.6,"series":"SAC, preview","y":40.057},{"t":4.8,"series":"SAC, preview","y":39.4107},{"t":5.0,"series":"SAC, preview","y":40.3258},{"t":5.2,"series":"SAC, preview","y":43.4809},{"t":5.4,"series":"SAC, preview","y":45.0094},{"t":5.6,"series":"SAC, preview","y":45.1431},{"t":5.8,"series":"SAC, preview","y":45.0971},{"t":6.0,"series":"SAC, preview","y":45.1474},{"t":6.2,"series":"SAC, preview","y":45.1331},{"t":6.4,"series":"SAC, preview","y":45.1348},{"t":6.6,"series":"SAC, preview","y":45.1229},{"t":6.8,"series":"SAC, preview","y":45.1121},{"t":7.0,"series":"SAC, preview","y":45.1209},{"t":7.2,"series":"SAC, preview","y":45.1417},{"t":7.4,"series":"SAC, preview","y":45.13},{"t":7.6,"series":"SAC, preview","y":45.1324},{"t":7.8,"series":"SAC, preview","y":45.1298},{"t":8.0,"series":"SAC, preview","y":45.1327},{"t":8.2,"series":"SAC, preview","y":45.1452},{"t":8.4,"series":"SAC, preview","y":45.1239},{"t":8.6,"series":"SAC, preview","y":45.1322},{"t":8.8,"series":"SAC, preview","y":45.1192},{"t":9.0,"series":"SAC, preview","y":45.0999},{"t":9.2,"series":"SAC, preview","y":45.1094},{"t":9.4,"series":"SAC, preview","y":45.111},{"t":9.6,"series":"SAC, preview","y":45.1164},{"t":9.8,"series":"SAC, preview","y":45.2416},{"t":10.0,"series":"SAC, preview","y":45.0942},{"t":10.2,"series":"SAC, preview","y":45.1336},{"t":10.4,"series":"SAC, preview","y":45.1755},{"t":10.6,"series":"SAC, preview","y":45.1732},{"t":10.8,"series":"SAC, preview","y":45.1494},{"t":11.0,"series":"SAC, preview","y":45.1695},{"t":11.2,"series":"SAC, preview","y":45.1609},{"t":11.4,"series":"SAC, preview","y":45.1438},{"t":11.6,"series":"SAC, preview","y":45.1498},{"t":11.8,"series":"SAC, preview","y":45.1254},{"t":12.0,"series":"SAC, preview","y":45.1401},{"t":12.2,"series":"SAC, preview","y":45.1373},{"t":12.4,"series":"SAC, preview","y":45.1611},{"t":12.6,"series":"SAC, preview","y":45.1503},{"t":12.8,"series":"SAC, preview","y":45.1387},{"t":13.0,"series":"SAC, preview","y":45.1288},{"t":13.2,"series":"SAC, preview","y":45.119},{"t":13.4,"series":"SAC, preview","y":45.1276},{"t":13.6,"series":"SAC, preview","y":45.1579},{"t":13.8,"series":"SAC, preview","y":45.1393},{"t":14.0,"series":"SAC, preview","y":45.1399},{"t":14.2,"series":"SAC, preview","y":45.1268},{"t":14.4,"series":"SAC, preview","y":45.1413},{"t":14.6,"series":"SAC, preview","y":45.1229},{"t":14.8,"series":"SAC, preview","y":45.0981},{"t":15.0,"series":"SAC, preview","y":45.1051},{"t":15.2,"series":"SAC, preview","y":45.3422},{"t":15.4,"series":"SAC, preview","y":45.728},{"t":15.6,"series":"SAC, preview","y":46.0668},{"t":15.8,"series":"SAC, preview","y":46.4176},{"t":16.0,"series":"SAC, preview","y":46.7571},{"t":16.2,"series":"SAC, preview","y":47.0957},{"t":16.4,"series":"SAC, preview","y":47.4471},{"t":16.6,"series":"SAC, preview","y":47.792},{"t":16.8,"series":"SAC, preview","y":48.1309},{"t":17.0,"series":"SAC, preview","y":48.4625},{"t":17.2,"series":"SAC, preview","y":48.7884},{"t":17.4,"series":"SAC, preview","y":49.1042},{"t":17.6,"series":"SAC, preview","y":49.4219},{"t":17.8,"series":"SAC, preview","y":49.8005},{"t":18.0,"series":"SAC, preview","y":50.0889},{"t":18.2,"series":"SAC, preview","y":50.16},{"t":18.4,"series":"SAC, preview","y":50.1365},{"t":18.6,"series":"SAC, preview","y":50.1023},{"t":18.8,"series":"SAC, preview","y":50.069},{"t":19.0,"series":"SAC, preview","y":50.0799},{"t":19.2,"series":"SAC, preview","y":50.0713},{"t":19.4,"series":"SAC, preview","y":50.0643},{"t":19.6,"series":"SAC, preview","y":50.0689},{"t":19.8,"series":"SAC, preview","y":50.0667},{"t":20.0,"series":"SAC, preview","y":50.0677},{"t":20.2,"series":"SAC, preview","y":50.0538},{"t":20.4,"series":"SAC, preview","y":50.0429},{"t":20.6,"series":"SAC, preview","y":50.051},{"t":20.8,"series":"SAC, preview","y":50.0716},{"t":21.0,"series":"SAC, preview","y":50.0667},{"t":21.2,"series":"SAC, preview","y":50.0528},{"t":21.4,"series":"SAC, preview","y":50.0431},{"t":21.6,"series":"SAC, preview","y":50.0739},{"t":21.8,"series":"SAC, preview","y":50.0337},{"t":22.0,"series":"SAC, preview","y":49.986},{"t":22.2,"series":"SAC, preview","y":49.992},{"t":22.4,"series":"SAC, preview","y":50.0135},{"t":22.6,"series":"SAC, preview","y":50.0501},{"t":22.8,"series":"SAC, preview","y":50.0317},{"t":23.0,"series":"SAC, preview","y":50.0449},{"t":23.2,"series":"SAC, preview","y":50.054},{"t":23.4,"series":"SAC, preview","y":50.0288},{"t":23.6,"series":"SAC, preview","y":50.0384},{"t":23.8,"series":"SAC, preview","y":50.0841},{"t":24.0,"series":"SAC, preview","y":50.1226},{"t":24.2,"series":"SAC, preview","y":50.1854},{"t":24.4,"series":"SAC, preview","y":50.2678},{"t":24.6,"series":"SAC, preview","y":50.2715},{"t":24.8,"series":"SAC, preview","y":50.2918},{"t":25.0,"series":"SAC, preview","y":50.2653},{"t":25.2,"series":"SAC, preview","y":50.2518},{"t":25.4,"series":"SAC, preview","y":50.275},{"t":25.6,"series":"SAC, preview","y":50.2745},{"t":25.8,"series":"SAC, preview","y":50.2715},{"t":26.0,"series":"SAC, preview","y":50.2363},{"t":26.2,"series":"SAC, preview","y":50.2766},{"t":26.4,"series":"SAC, preview","y":50.2678},{"t":26.6,"series":"SAC, preview","y":50.2475},{"t":26.8,"series":"SAC, preview","y":51.1549},{"t":27.0,"series":"SAC, preview","y":50.9322},{"t":27.2,"series":"SAC, preview","y":46.8474},{"t":27.4,"series":"SAC, preview","y":44.196},{"t":27.6,"series":"SAC, preview","y":41.8602},{"t":27.8,"series":"SAC, preview","y":39.7546},{"t":28.0,"series":"SAC, preview","y":38.4562},{"t":28.2,"series":"SAC, preview","y":38.1877},{"t":28.4,"series":"SAC, preview","y":38.2151},{"t":28.6,"series":"SAC, preview","y":38.202},{"t":28.8,"series":"SAC, preview","y":38.2005},{"t":29.0,"series":"SAC, preview","y":38.1783},{"t":29.2,"series":"SAC, preview","y":38.1777},{"t":29.4,"series":"SAC, preview","y":38.1801},{"t":29.6,"series":"SAC, preview","y":38.1651},{"t":29.8,"series":"SAC, preview","y":38.204},{"t":30.0,"series":"SAC, preview","y":38.196},{"t":30.2,"series":"SAC, preview","y":38.2115},{"t":30.4,"series":"SAC, preview","y":38.1771},{"t":30.6,"series":"SAC, preview","y":38.2134},{"t":30.8,"series":"SAC, preview","y":38.1884},{"t":31.0,"series":"SAC, preview","y":38.2128},{"t":31.2,"series":"SAC, preview","y":38.1639},{"t":31.4,"series":"SAC, preview","y":38.1989},{"t":31.6,"series":"SAC, preview","y":38.1528},{"t":31.8,"series":"SAC, preview","y":38.1644},{"t":32.0,"series":"SAC, preview","y":38.1678},{"t":32.2,"series":"SAC, preview","y":38.1615},{"t":32.4,"series":"SAC, preview","y":38.1723},{"t":32.6,"series":"SAC, preview","y":38.1348},{"t":32.8,"series":"SAC, preview","y":38.2608},{"t":33.0,"series":"SAC, preview","y":38.0929},{"t":33.2,"series":"SAC, preview","y":38.2273},{"t":33.4,"series":"SAC, preview","y":38.1105},{"t":33.6,"series":"SAC, preview","y":38.1793},{"t":33.8,"series":"SAC, preview","y":38.1965},{"t":34.0,"series":"SAC, preview","y":38.1758},{"t":34.2,"series":"SAC, preview","y":38.1784},{"t":34.4,"series":"SAC, preview","y":38.1582},{"t":34.6,"series":"SAC, preview","y":38.1401},{"t":34.8,"series":"SAC, preview","y":38.1341},{"t":35.0,"series":"SAC, preview","y":38.1056},{"t":35.2,"series":"SAC, preview","y":38.1289},{"t":35.4,"series":"SAC, preview","y":38.1352},{"t":35.6,"series":"SAC, preview","y":38.1274},{"t":35.8,"series":"SAC, preview","y":38.1704},{"t":36.0,"series":"SAC, preview","y":38.1973},{"t":36.2,"series":"SAC, preview","y":37.937},{"t":36.4,"series":"SAC, preview","y":37.6007},{"t":36.6,"series":"SAC, preview","y":37.2952},{"t":36.8,"series":"SAC, preview","y":36.9925},{"t":37.0,"series":"SAC, preview","y":36.6956},{"t":37.2,"series":"SAC, preview","y":36.4016},{"t":37.4,"series":"SAC, preview","y":36.1398},{"t":37.6,"series":"SAC, preview","y":35.8581},{"t":37.8,"series":"SAC, preview","y":35.5428},{"t":38.0,"series":"SAC, preview","y":35.2547},{"t":38.2,"series":"SAC, preview","y":35.1779},{"t":38.4,"series":"SAC, preview","y":35.1421},{"t":38.6,"series":"SAC, preview","y":35.1564},{"t":38.8,"series":"SAC, preview","y":35.1262},{"t":39.0,"series":"SAC, preview","y":35.1249},{"t":39.2,"series":"SAC, preview","y":35.1582},{"t":39.4,"series":"SAC, preview","y":35.1488},{"t":39.6,"series":"SAC, preview","y":35.1602},{"t":39.8,"series":"SAC, preview","y":35.1428},{"t":40.0,"series":"SAC, preview","y":35.1315}]
 },
 "mark": {
  "type": "line",
  "strokeWidth": 1.8,
  "interpolate": "linear"
 },
 "encoding": {
  "x": {
   "field": "t",
   "type": "quantitative",
   "title": "time (s)"
  },
  "y": {
   "field": "y",
   "type": "quantitative",
   "title": "bar",
   "scale": {
    "zero": false
   }
  },
  "color": {
   "field": "series",
   "type": "nominal",
   "scale": {
    "domain": [
     "set point",
     "Decoupled PI",
     "PPO, preview",
     "SAC, preview"
    ],
    "range": [
     "var(--viz-ink-2)",
     "var(--viz-s1)",
     "var(--viz-s2)",
     "var(--viz-s3)"
    ]
   },
   "legend": {
    "title": null
   }
  },
  "strokeDash": {
   "field": "series",
   "type": "nominal",
   "scale": {
    "domain": [
     "set point",
     "Decoupled PI",
     "PPO, preview",
     "SAC, preview"
    ],
    "range": [
     [
      5,
      4
     ],
     [
      1,
      0
     ],
     [
      1,
      0
     ],
     [
      1,
      0
     ]
    ]
   },
   "legend": null
  },
  "tooltip": [
   {
    "field": "series"
   },
   {
    "field": "t",
    "title": "t (s)"
   },
   {
    "field": "y",
    "format": ".2f"
   }
  ]
 }
}
```

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Mixture ratio on the evaluation profile",
  "subtitle": "Sensor delays and noise on, nominal engine. This repo's surrogate (not DLR's simulator); data/results/eval_traces.json"
 },
 "width": "container",
 "height": 220,
 "data": {
  "values": [{"t":0.2,"series":"set point","y":3.4},{"t":0.4,"series":"set point","y":3.4},{"t":0.6,"series":"set point","y":3.4},{"t":0.8,"series":"set point","y":3.4},{"t":1.0,"series":"set point","y":3.4},{"t":1.2,"series":"set point","y":3.4},{"t":1.4,"series":"set point","y":3.4},{"t":1.6,"series":"set point","y":3.4},{"t":1.8,"series":"set point","y":3.4},{"t":2.0,"series":"set point","y":3.4},{"t":2.2,"series":"set point","y":3.4},{"t":2.4,"series":"set point","y":3.4},{"t":2.6,"series":"set point","y":3.4},{"t":2.8,"series":"set point","y":3.4},{"t":3.0,"series":"set point","y":3.4},{"t":3.2,"series":"set point","y":3.4},{"t":3.4,"series":"set point","y":3.4},{"t":3.6,"series":"set point","y":3.4},{"t":3.8,"series":"set point","y":3.4},{"t":4.0,"series":"set point","y":3.4},{"t":4.2,"series":"set point","y":3.4},{"t":4.4,"series":"set point","y":3.4},{"t":4.6,"series":"set point","y":3.4},{"t":4.8,"series":"set point","y":3.4},{"t":5.0,"series":"set point","y":3.4},{"t":5.2,"series":"set point","y":3.4},{"t":5.4,"series":"set point","y":3.4},{"t":5.6,"series":"set point","y":3.4},{"t":5.8,"series":"set point","y":3.4},{"t":6.0,"series":"set point","y":3.4},{"t":6.2,"series":"set point","y":3.4},{"t":6.4,"series":"set point","y":3.4},{"t":6.6,"series":"set point","y":3.4},{"t":6.8,"series":"set point","y":3.4},{"t":7.0,"series":"set point","y":3.4},{"t":7.2,"series":"set point","y":3.4},{"t":7.4,"series":"set point","y":3.4},{"t":7.6,"series":"set point","y":3.4},{"t":7.8,"series":"set point","y":3.4},{"t":8.0,"series":"set point","y":3.4},{"t":8.2,"series":"set point","y":3.4},{"t":8.4,"series":"set point","y":3.4},{"t":8.6,"series":"set point","y":3.4},{"t":8.8,"series":"set point","y":3.4},{"t":9.0,"series":"set point","y":3.4},{"t":9.2,"series":"set point","y":3.4},{"t":9.4,"series":"set point","y":3.4},{"t":9.6,"series":"set point","y":3.4},{"t":9.8,"series":"set point","y":3.4},{"t":10.0,"series":"set point","y":3.4},{"t":10.2,"series":"set point","y":3.7},{"t":10.4,"series":"set point","y":3.7},{"t":10.6,"series":"set point","y":3.7},{"t":10.8,"series":"set point","y":3.7},{"t":11.0,"series":"set point","y":3.7},{"t":11.2,"series":"set point","y":3.7},{"t":11.4,"series":"set point","y":3.7},{"t":11.6,"series":"set point","y":3.7},{"t":11.8,"series":"set point","y":3.7},{"t":12.0,"series":"set point","y":3.7},{"t":12.2,"series":"set point","y":3.7},{"t":12.4,"series":"set point","y":3.7},{"t":12.6,"series":"set point","y":3.7},{"t":12.8,"series":"set point","y":3.7},{"t":13.0,"series":"set point","y":3.7},{"t":13.2,"series":"set point","y":3.7},{"t":13.4,"series":"set point","y":3.7},{"t":13.6,"series":"set point","y":3.7},{"t":13.8,"series":"set point","y":3.7},{"t":14.0,"series":"set point","y":3.7},{"t":14.2,"series":"set point","y":3.7},{"t":14.4,"series":"set point","y":3.7},{"t":14.6,"series":"set point","y":3.7},{"t":14.8,"series":"set point","y":3.7},{"t":15.0,"series":"set point","y":3.7},{"t":15.2,"series":"set point","y":3.7},{"t":15.4,"series":"set point","y":3.7},{"t":15.6,"series":"set point","y":3.7},{"t":15.8,"series":"set point","y":3.7},{"t":16.0,"series":"set point","y":3.7},{"t":16.2,"series":"set point","y":3.7},{"t":16.4,"series":"set point","y":3.7},{"t":16.6,"series":"set point","y":3.7},{"t":16.8,"series":"set point","y":3.7},{"t":17.0,"series":"set point","y":3.7},{"t":17.2,"series":"set point","y":3.7},{"t":17.4,"series":"set point","y":3.7},{"t":17.6,"series":"set point","y":3.7},{"t":17.8,"series":"set point","y":3.7},{"t":18.0,"series":"set point","y":3.7},{"t":18.2,"series":"set point","y":3.7},{"t":18.4,"series":"set point","y":3.7},{"t":18.6,"series":"set point","y":3.7},{"t":18.8,"series":"set point","y":3.7},{"t":19.0,"series":"set point","y":3.7},{"t":19.2,"series":"set point","y":3.7},{"t":19.4,"series":"set point","y":3.7},{"t":19.6,"series":"set point","y":3.7},{"t":19.8,"series":"set point","y":3.7},{"t":20.0,"series":"set point","y":3.7},{"t":20.2,"series":"set point","y":3.7},{"t":20.4,"series":"set point","y":3.7},{"t":20.6,"series":"set point","y":3.7},{"t":20.8,"series":"set point","y":3.7},{"t":21.0,"series":"set point","y":3.7},{"t":21.2,"series":"set point","y":3.7},{"t":21.4,"series":"set point","y":3.7},{"t":21.6,"series":"set point","y":3.7},{"t":21.8,"series":"set point","y":3.7},{"t":22.0,"series":"set point","y":3.7},{"t":22.2,"series":"set point","y":3.64},{"t":22.4,"series":"set point","y":3.58},{"t":22.6,"series":"set point","y":3.52},{"t":22.8,"series":"set point","y":3.46},{"t":23.0,"series":"set point","y":3.4},{"t":23.2,"series":"set point","y":3.34},{"t":23.4,"series":"set point","y":3.28},{"t":23.6,"series":"set point","y":3.22},{"t":23.8,"series":"set point","y":3.16},{"t":24.0,"series":"set point","y":3.1},{"t":24.2,"series":"set point","y":3.1},{"t":24.4,"series":"set point","y":3.1},{"t":24.6,"series":"set point","y":3.1},{"t":24.8,"series":"set point","y":3.1},{"t":25.0,"series":"set point","y":3.1},{"t":25.2,"series":"set point","y":3.1},{"t":25.4,"series":"set point","y":3.1},{"t":25.6,"series":"set point","y":3.1},{"t":25.8,"series":"set point","y":3.1},{"t":26.0,"series":"set point","y":3.1},{"t":26.2,"series":"set point","y":3.1},{"t":26.4,"series":"set point","y":3.1},{"t":26.6,"series":"set point","y":3.1},{"t":26.8,"series":"set point","y":3.1},{"t":27.0,"series":"set point","y":3.1},{"t":27.2,"series":"set point","y":3.1},{"t":27.4,"series":"set point","y":3.1},{"t":27.6,"series":"set point","y":3.1},{"t":27.8,"series":"set point","y":3.1},{"t":28.0,"series":"set point","y":3.1},{"t":28.2,"series":"set point","y":3.1},{"t":28.4,"series":"set point","y":3.1},{"t":28.6,"series":"set point","y":3.1},{"t":28.8,"series":"set point","y":3.1},{"t":29.0,"series":"set point","y":3.1},{"t":29.2,"series":"set point","y":3.1},{"t":29.4,"series":"set point","y":3.1},{"t":29.6,"series":"set point","y":3.1},{"t":29.8,"series":"set point","y":3.1},{"t":30.0,"series":"set point","y":3.1},{"t":30.2,"series":"set point","y":3.1},{"t":30.4,"series":"set point","y":3.1},{"t":30.6,"series":"set point","y":3.1},{"t":30.8,"series":"set point","y":3.1},{"t":31.0,"series":"set point","y":3.1},{"t":31.2,"series":"set point","y":3.1},{"t":31.4,"series":"set point","y":3.1},{"t":31.6,"series":"set point","y":3.1},{"t":31.8,"series":"set point","y":3.1},{"t":32.0,"series":"set point","y":3.1},{"t":32.2,"series":"set point","y":3.1},{"t":32.4,"series":"set point","y":3.1},{"t":32.6,"series":"set point","y":3.1},{"t":32.8,"series":"set point","y":3.1},{"t":33.0,"series":"set point","y":3.1},{"t":33.2,"series":"set point","y":3.5},{"t":33.4,"series":"set point","y":3.5},{"t":33.6,"series":"set point","y":3.5},{"t":33.8,"series":"set point","y":3.5},{"t":34.0,"series":"set point","y":3.5},{"t":34.2,"series":"set point","y":3.5},{"t":34.4,"series":"set point","y":3.5},{"t":34.6,"series":"set point","y":3.5},{"t":34.8,"series":"set point","y":3.5},{"t":35.0,"series":"set point","y":3.5},{"t":35.2,"series":"set point","y":3.5},{"t":35.4,"series":"set point","y":3.5},{"t":35.6,"series":"set point","y":3.5},{"t":35.8,"series":"set point","y":3.5},{"t":36.0,"series":"set point","y":3.5},{"t":36.2,"series":"set point","y":3.5},{"t":36.4,"series":"set point","y":3.5},{"t":36.6,"series":"set point","y":3.5},{"t":36.8,"series":"set point","y":3.5},{"t":37.0,"series":"set point","y":3.5},{"t":37.2,"series":"set point","y":3.5},{"t":37.4,"series":"set point","y":3.5},{"t":37.6,"series":"set point","y":3.5},{"t":37.8,"series":"set point","y":3.5},{"t":38.0,"series":"set point","y":3.5},{"t":38.2,"series":"set point","y":3.5},{"t":38.4,"series":"set point","y":3.5},{"t":38.6,"series":"set point","y":3.5},{"t":38.8,"series":"set point","y":3.5},{"t":39.0,"series":"set point","y":3.5},{"t":39.2,"series":"set point","y":3.5},{"t":39.4,"series":"set point","y":3.5},{"t":39.6,"series":"set point","y":3.5},{"t":39.8,"series":"set point","y":3.5},{"t":40.0,"series":"set point","y":3.5},{"t":0.2,"series":"Decoupled PI","y":3.3995},{"t":0.4,"series":"Decoupled PI","y":3.3984},{"t":0.6,"series":"Decoupled PI","y":3.3992},{"t":0.8,"series":"Decoupled PI","y":3.403},{"t":1.0,"series":"Decoupled PI","y":3.405},{"t":1.2,"series":"Decoupled PI","y":3.4012},{"t":1.4,"series":"Decoupled PI","y":3.3954},{"t":1.6,"series":"Decoupled PI","y":3.3944},{"t":1.8,"series":"Decoupled PI","y":3.396},{"t":2.0,"series":"Decoupled PI","y":3.3976},{"t":2.2,"series":"Decoupled PI","y":3.3966},{"t":2.4,"series":"Decoupled PI","y":3.3941},{"t":2.6,"series":"Decoupled PI","y":3.3912},{"t":2.8,"series":"Decoupled PI","y":3.3947},{"t":3.0,"series":"Decoupled PI","y":3.4009},{"t":3.2,"series":"Decoupled PI","y":3.4052},{"t":3.4,"series":"Decoupled PI","y":3.4065},{"t":3.6,"series":"Decoupled PI","y":3.4039},{"t":3.8,"series":"Decoupled PI","y":3.4004},{"t":4.0,"series":"Decoupled PI","y":3.4009},{"t":4.2,"series":"Decoupled PI","y":3.4003},{"t":4.4,"series":"Decoupled PI","y":3.4016},{"t":4.6,"series":"Decoupled PI","y":3.3996},{"t":4.8,"series":"Decoupled PI","y":3.3947},{"t":5.0,"series":"Decoupled PI","y":3.3936},{"t":5.2,"series":"Decoupled PI","y":3.724},{"t":5.4,"series":"Decoupled PI","y":4.0575},{"t":5.6,"series":"Decoupled PI","y":4.0483},{"t":5.8,"series":"Decoupled PI","y":3.5813},{"t":6.0,"series":"Decoupled PI","y":2.9619},{"t":6.2,"series":"Decoupled PI","y":2.6064},{"t":6.4,"series":"Decoupled PI","y":2.7402},{"t":6.6,"series":"Decoupled PI","y":3.1903},{"t":6.8,"series":"Decoupled PI","y":3.4784},{"t":7.0,"series":"Decoupled PI","y":3.4737},{"t":7.2,"series":"Decoupled PI","y":3.3371},{"t":7.4,"series":"Decoupled PI","y":3.2773},{"t":7.6,"series":"Decoupled PI","y":3.3626},{"t":7.8,"series":"Decoupled PI","y":3.5062},{"t":8.0,"series":"Decoupled PI","y":3.5842},{"t":8.2,"series":"Decoupled PI","y":3.5543},{"t":8.4,"series":"Decoupled PI","y":3.4605},{"t":8.6,"series":"Decoupled PI","y":3.3778},{"t":8.8,"series":"Decoupled PI","y":3.3507},{"t":9.0,"series":"Decoupled PI","y":3.3757},{"t":9.2,"series":"Decoupled PI","y":3.4049},{"t":9.4,"series":"Decoupled PI","y":3.409},{"t":9.6,"series":"Decoupled PI","y":3.3899},{"t":9.8,"series":"Decoupled PI","y":3.3715},{"t":10.0,"series":"Decoupled PI","y":3.3699},{"t":10.2,"series":"Decoupled PI","y":3.5026},{"t":10.4,"series":"Decoupled PI","y":3.8149},{"t":10.6,"series":"Decoupled PI","y":3.9881},{"t":10.8,"series":"Decoupled PI","y":3.9709},{"t":11.0,"series":"Decoupled PI","y":3.8361},{"t":11.2,"series":"Decoupled PI","y":3.6999},{"t":11.4,"series":"Decoupled PI","y":3.6436},{"t":11.6,"series":"Decoupled PI","y":3.6744},{"t":11.8,"series":"Decoupled PI","y":3.7312},{"t":12.0,"series":"Decoupled PI","y":3.7572},{"t":12.2,"series":"Decoupled PI","y":3.7285},{"t":12.4,"series":"Decoupled PI","y":3.6752},{"t":12.6,"series":"Decoupled PI","y":3.6422},{"t":12.8,"series":"Decoupled PI","y":3.6541},{"t":13.0,"series":"Decoupled PI","y":3.6919},{"t":13.2,"series":"Decoupled PI","y":3.7221},{"t":13.4,"series":"Decoupled PI","y":3.7256},{"t":13.6,"series":"Decoupled PI","y":3.7038},{"t":13.8,"series":"Decoupled PI","y":3.6874},{"t":14.0,"series":"Decoupled PI","y":3.6864},{"t":14.2,"series":"Decoupled PI","y":3.696},{"t":14.4,"series":"Decoupled PI","y":3.7117},{"t":14.6,"series":"Decoupled PI","y":3.7176},{"t":14.8,"series":"Decoupled PI","y":3.7078},{"t":15.0,"series":"Decoupled PI","y":3.6933},{"t":15.2,"series":"Decoupled PI","y":3.7102},{"t":15.4,"series":"Decoupled PI","y":3.7708},{"t":15.6,"series":"Decoupled PI","y":3.8333},{"t":15.8,"series":"Decoupled PI","y":3.8447},{"t":16.0,"series":"Decoupled PI","y":3.7981},{"t":16.2,"series":"Decoupled PI","y":3.7214},{"t":16.4,"series":"Decoupled PI","y":3.6594},{"t":16.6,"series":"Decoupled PI","y":3.6504},{"t":16.8,"series":"Decoupled PI","y":3.6882},{"t":17.0,"series":"Decoupled PI","y":3.7231},{"t":17.2,"series":"Decoupled PI","y":3.7154},{"t":17.4,"series":"Decoupled PI","y":3.6705},{"t":17.6,"series":"Decoupled PI","y":3.6317},{"t":17.8,"series":"Decoupled PI","y":3.6358},{"t":18.0,"series":"Decoupled PI","y":3.6837},{"t":18.2,"series":"Decoupled PI","y":3.6741},{"t":18.4,"series":"Decoupled PI","y":3.5884},{"t":18.6,"series":"Decoupled PI","y":3.5133},{"t":18.8,"series":"Decoupled PI","y":3.5655},{"t":19.0,"series":"Decoupled PI","y":3.7226},{"t":19.2,"series":"Decoupled PI","y":3.8312},{"t":19.4,"series":"Decoupled PI","y":3.7858},{"t":19.6,"series":"Decoupled PI","y":3.6537},{"t":19.8,"series":"Decoupled PI","y":3.6056},{"t":20.0,"series":"Decoupled PI","y":3.7172},{"t":20.2,"series":"Decoupled PI","y":3.8597},{"t":20.4,"series":"Decoupled PI","y":3.8366},{"t":20.6,"series":"Decoupled PI","y":3.649},{"t":20.8,"series":"Decoupled PI","y":3.5},{"t":21.0,"series":"Decoupled PI","y":3.5685},{"t":21.2,"series":"Decoupled PI","y":3.7926},{"t":21.4,"series":"Decoupled PI","y":3.8885},{"t":21.6,"series":"Decoupled PI","y":3.7396},{"t":21.8,"series":"Decoupled PI","y":3.5283},{"t":22.0,"series":"Decoupled PI","y":3.5087},{"t":22.2,"series":"Decoupled PI","y":3.7122},{"t":22.4,"series":"Decoupled PI","y":3.8101},{"t":22.6,"series":"Decoupled PI","y":3.6262},{"t":22.8,"series":"Decoupled PI","y":3.2961},{"t":23.0,"series":"Decoupled PI","y":3.1009},{"t":23.2,"series":"Decoupled PI","y":3.1897},{"t":23.4,"series":"Decoupled PI","y":3.3416},{"t":23.6,"series":"Decoupled PI","y":3.2723},{"t":23.8,"series":"Decoupled PI","y":3.0159},{"t":24.0,"series":"Decoupled PI","y":2.8146},{"t":24.2,"series":"Decoupled PI","y":2.8447},{"t":24.4,"series":"Decoupled PI","y":3.0486},{"t":24.6,"series":"Decoupled PI","y":3.1271},{"t":24.8,"series":"Decoupled PI","y":3.0389},{"t":25.0,"series":"Decoupled PI","y":2.9754},{"t":25.2,"series":"Decoupled PI","y":3.0689},{"t":25.4,"series":"Decoupled PI","y":3.2555},{"t":25.6,"series":"Decoupled PI","y":3.3359},{"t":25.8,"series":"Decoupled PI","y":3.2519},{"t":26.0,"series":"Decoupled PI","y":3.1153},{"t":26.2,"series":"Decoupled PI","y":3.0517},{"t":26.4,"series":"Decoupled PI","y":3.0818},{"t":26.6,"series":"Decoupled PI","y":3.1049},{"t":26.8,"series":"Decoupled PI","y":3.0522},{"t":27.0,"series":"Decoupled PI","y":2.9826},{"t":27.2,"series":"Decoupled PI","y":2.5735},{"t":27.4,"series":"Decoupled PI","y":2.2031},{"t":27.6,"series":"Decoupled PI","y":2.1459},{"t":27.8,"series":"Decoupled PI","y":2.5171},{"t":28.0,"series":"Decoupled PI","y":2.9711},{"t":28.2,"series":"Decoupled PI","y":3.1922},{"t":28.4,"series":"Decoupled PI","y":3.3013},{"t":28.6,"series":"Decoupled PI","y":3.3684},{"t":28.8,"series":"Decoupled PI","y":3.4161},{"t":29.0,"series":"Decoupled PI","y":3.4255},{"t":29.2,"series":"Decoupled PI","y":3.3863},{"t":29.4,"series":"Decoupled PI","y":3.301},{"t":29.6,"series":"Decoupled PI","y":3.1952},{"t":29.8,"series":"Decoupled PI","y":3.0993},{"t":30.0,"series":"Decoupled PI","y":3.0418},{"t":30.2,"series":"Decoupled PI","y":3.0274},{"t":30.4,"series":"Decoupled PI","y":3.0436},{"t":30.6,"series":"Decoupled PI","y":3.0736},{"t":30.8,"series":"Decoupled PI","y":3.1029},{"t":31.0,"series":"Decoupled PI","y":3.1201},{"t":31.2,"series":"Decoupled PI","y":3.1192},{"t":31.4,"series":"Decoupled PI","y":3.107},{"t":31.6,"series":"Decoupled PI","y":3.0981},{"t":31.8,"series":"Decoupled PI","y":3.0894},{"t":32.0,"series":"Decoupled PI","y":3.0847},{"t":32.2,"series":"Decoupled PI","y":3.0876},{"t":32.4,"series":"Decoupled PI","y":3.0964},{"t":32.6,"series":"Decoupled PI","y":3.1066},{"t":32.8,"series":"Decoupled PI","y":3.1083},{"t":33.0,"series":"Decoupled PI","y":3.1064},{"t":33.2,"series":"Decoupled PI","y":3.181},{"t":33.4,"series":"Decoupled PI","y":3.4936},{"t":33.6,"series":"Decoupled PI","y":3.763},{"t":33.8,"series":"Decoupled PI","y":3.8923},{"t":34.0,"series":"Decoupled PI","y":3.8572},{"t":34.2,"series":"Decoupled PI","y":3.7138},{"t":34.4,"series":"Decoupled PI","y":3.542},{"t":34.6,"series":"Decoupled PI","y":3.4128},{"t":34.8,"series":"Decoupled PI","y":3.3648},{"t":35.0,"series":"Decoupled PI","y":3.3953},{"t":35.2,"series":"Decoupled PI","y":3.4684},{"t":35.4,"series":"Decoupled PI","y":3.5358},{"t":35.6,"series":"Decoupled PI","y":3.5707},{"t":35.8,"series":"Decoupled PI","y":3.5645},{"t":36.0,"series":"Decoupled PI","y":3.532},{"t":36.2,"series":"Decoupled PI","y":3.4791},{"t":36.4,"series":"Decoupled PI","y":3.4267},{"t":36.6,"series":"Decoupled PI","y":3.387},{"t":36.8,"series":"Decoupled PI","y":3.3787},{"t":37.0,"series":"Decoupled PI","y":3.3998},{"t":37.2,"series":"Decoupled PI","y":3.436},{"t":37.4,"series":"Decoupled PI","y":3.4723},{"t":37.6,"series":"Decoupled PI","y":3.4954},{"t":37.8,"series":"Decoupled PI","y":3.5018},{"t":38.0,"series":"Decoupled PI","y":3.4965},{"t":38.2,"series":"Decoupled PI","y":3.4973},{"t":38.4,"series":"Decoupled PI","y":3.5168},{"t":38.6,"series":"Decoupled PI","y":3.5517},{"t":38.8,"series":"Decoupled PI","y":3.5874},{"t":39.0,"series":"Decoupled PI","y":3.606},{"t":39.2,"series":"Decoupled PI","y":3.5972},{"t":39.4,"series":"Decoupled PI","y":3.5687},{"t":39.6,"series":"Decoupled PI","y":3.5316},{"t":39.8,"series":"Decoupled PI","y":3.4988},{"t":40.0,"series":"Decoupled PI","y":3.483},{"t":0.2,"series":"PPO, preview","y":3.3988},{"t":0.4,"series":"PPO, preview","y":3.3994},{"t":0.6,"series":"PPO, preview","y":3.4032},{"t":0.8,"series":"PPO, preview","y":3.4031},{"t":1.0,"series":"PPO, preview","y":3.3972},{"t":1.2,"series":"PPO, preview","y":3.3986},{"t":1.4,"series":"PPO, preview","y":3.4006},{"t":1.6,"series":"PPO, preview","y":3.4017},{"t":1.8,"series":"PPO, preview","y":3.399},{"t":2.0,"series":"PPO, preview","y":3.3984},{"t":2.2,"series":"PPO, preview","y":3.3979},{"t":2.4,"series":"PPO, preview","y":3.3984},{"t":2.6,"series":"PPO, preview","y":3.4013},{"t":2.8,"series":"PPO, preview","y":3.4065},{"t":3.0,"series":"PPO, preview","y":3.4027},{"t":3.2,"series":"PPO, preview","y":3.3972},{"t":3.4,"series":"PPO, preview","y":3.3988},{"t":3.6,"series":"PPO, preview","y":3.4034},{"t":3.8,"series":"PPO, preview","y":3.4009},{"t":4.0,"series":"PPO, preview","y":3.4049},{"t":4.2,"series":"PPO, preview","y":3.403},{"t":4.4,"series":"PPO, preview","y":3.4},{"t":4.6,"series":"PPO, preview","y":3.3993},{"t":4.8,"series":"PPO, preview","y":3.4813},{"t":5.0,"series":"PPO, preview","y":3.4092},{"t":5.2,"series":"PPO, preview","y":3.411},{"t":5.4,"series":"PPO, preview","y":3.4008},{"t":5.6,"series":"PPO, preview","y":3.3576},{"t":5.8,"series":"PPO, preview","y":3.36},{"t":6.0,"series":"PPO, preview","y":3.3829},{"t":6.2,"series":"PPO, preview","y":3.3985},{"t":6.4,"series":"PPO, preview","y":3.4015},{"t":6.6,"series":"PPO, preview","y":3.3957},{"t":6.8,"series":"PPO, preview","y":3.3912},{"t":7.0,"series":"PPO, preview","y":3.3944},{"t":7.2,"series":"PPO, preview","y":3.3915},{"t":7.4,"series":"PPO, preview","y":3.3957},{"t":7.6,"series":"PPO, preview","y":3.3931},{"t":7.8,"series":"PPO, preview","y":3.3929},{"t":8.0,"series":"PPO, preview","y":3.3964},{"t":8.2,"series":"PPO, preview","y":3.3958},{"t":8.4,"series":"PPO, preview","y":3.3949},{"t":8.6,"series":"PPO, preview","y":3.3956},{"t":8.8,"series":"PPO, preview","y":3.397},{"t":9.0,"series":"PPO, preview","y":3.3992},{"t":9.2,"series":"PPO, preview","y":3.3921},{"t":9.4,"series":"PPO, preview","y":3.3932},{"t":9.6,"series":"PPO, preview","y":3.3958},{"t":9.8,"series":"PPO, preview","y":3.3883},{"t":10.0,"series":"PPO, preview","y":3.4521},{"t":10.2,"series":"PPO, preview","y":3.6716},{"t":10.4,"series":"PPO, preview","y":3.6897},{"t":10.6,"series":"PPO, preview","y":3.6813},{"t":10.8,"series":"PPO, preview","y":3.6816},{"t":11.0,"series":"PPO, preview","y":3.681},{"t":11.2,"series":"PPO, preview","y":3.681},{"t":11.4,"series":"PPO, preview","y":3.6815},{"t":11.6,"series":"PPO, preview","y":3.6863},{"t":11.8,"series":"PPO, preview","y":3.6862},{"t":12.0,"series":"PPO, preview","y":3.6879},{"t":12.2,"series":"PPO, preview","y":3.6795},{"t":12.4,"series":"PPO, preview","y":3.6826},{"t":12.6,"series":"PPO, preview","y":3.6852},{"t":12.8,"series":"PPO, preview","y":3.6845},{"t":13.0,"series":"PPO, preview","y":3.6853},{"t":13.2,"series":"PPO, preview","y":3.6837},{"t":13.4,"series":"PPO, preview","y":3.6824},{"t":13.6,"series":"PPO, preview","y":3.6797},{"t":13.8,"series":"PPO, preview","y":3.6865},{"t":14.0,"series":"PPO, preview","y":3.6852},{"t":14.2,"series":"PPO, preview","y":3.6826},{"t":14.4,"series":"PPO, preview","y":3.6854},{"t":14.6,"series":"PPO, preview","y":3.6828},{"t":14.8,"series":"PPO, preview","y":3.6872},{"t":15.0,"series":"PPO, preview","y":3.6929},{"t":15.2,"series":"PPO, preview","y":3.6975},{"t":15.4,"series":"PPO, preview","y":3.7004},{"t":15.6,"series":"PPO, preview","y":3.6975},{"t":15.8,"series":"PPO, preview","y":3.694},{"t":16.0,"series":"PPO, preview","y":3.6962},{"t":16.2,"series":"PPO, preview","y":3.6936},{"t":16.4,"series":"PPO, preview","y":3.6924},{"t":16.6,"series":"PPO, preview","y":3.6956},{"t":16.8,"series":"PPO, preview","y":3.6956},{"t":17.0,"series":"PPO, preview","y":3.6953},{"t":17.2,"series":"PPO, preview","y":3.694},{"t":17.4,"series":"PPO, preview","y":3.6931},{"t":17.6,"series":"PPO, preview","y":3.6902},{"t":17.8,"series":"PPO, preview","y":3.6841},{"t":18.0,"series":"PPO, preview","y":3.6819},{"t":18.2,"series":"PPO, preview","y":3.6757},{"t":18.4,"series":"PPO, preview","y":3.6749},{"t":18.6,"series":"PPO, preview","y":3.6725},{"t":18.8,"series":"PPO, preview","y":3.6728},{"t":19.0,"series":"PPO, preview","y":3.6726},{"t":19.2,"series":"PPO, preview","y":3.6753},{"t":19.4,"series":"PPO, preview","y":3.6743},{"t":19.6,"series":"PPO, preview","y":3.6721},{"t":19.8,"series":"PPO, preview","y":3.6732},{"t":20.0,"series":"PPO, preview","y":3.6743},{"t":20.2,"series":"PPO, preview","y":3.6745},{"t":20.4,"series":"PPO, preview","y":3.6705},{"t":20.6,"series":"PPO, preview","y":3.669},{"t":20.8,"series":"PPO, preview","y":3.6732},{"t":21.0,"series":"PPO, preview","y":3.6717},{"t":21.2,"series":"PPO, preview","y":3.6713},{"t":21.4,"series":"PPO, preview","y":3.6733},{"t":21.6,"series":"PPO, preview","y":3.6735},{"t":21.8,"series":"PPO, preview","y":3.6756},{"t":22.0,"series":"PPO, preview","y":3.6691},{"t":22.2,"series":"PPO, preview","y":3.625},{"t":22.4,"series":"PPO, preview","y":3.569},{"t":22.6,"series":"PPO, preview","y":3.5123},{"t":22.8,"series":"PPO, preview","y":3.4564},{"t":23.0,"series":"PPO, preview","y":3.3975},{"t":23.2,"series":"PPO, preview","y":3.3399},{"t":23.4,"series":"PPO, preview","y":3.2811},{"t":23.6,"series":"PPO, preview","y":3.2278},{"t":23.8,"series":"PPO, preview","y":3.1648},{"t":24.0,"series":"PPO, preview","y":3.1162},{"t":24.2,"series":"PPO, preview","y":3.0973},{"t":24.4,"series":"PPO, preview","y":3.1009},{"t":24.6,"series":"PPO, preview","y":3.1022},{"t":24.8,"series":"PPO, preview","y":3.1033},{"t":25.0,"series":"PPO, preview","y":3.1046},{"t":25.2,"series":"PPO, preview","y":3.1024},{"t":25.4,"series":"PPO, preview","y":3.1011},{"t":25.6,"series":"PPO, preview","y":3.1023},{"t":25.8,"series":"PPO, preview","y":3.102},{"t":26.0,"series":"PPO, preview","y":3.1025},{"t":26.2,"series":"PPO, preview","y":3.1025},{"t":26.4,"series":"PPO, preview","y":3.0998},{"t":26.6,"series":"PPO, preview","y":3.1007},{"t":26.8,"series":"PPO, preview","y":2.9774},{"t":27.0,"series":"PPO, preview","y":3.0602},{"t":27.2,"series":"PPO, preview","y":3.0318},{"t":27.4,"series":"PPO, preview","y":2.9588},{"t":27.6,"series":"PPO, preview","y":3.0469},{"t":27.8,"series":"PPO, preview","y":3.1132},{"t":28.0,"series":"PPO, preview","y":3.1238},{"t":28.2,"series":"PPO, preview","y":3.1228},{"t":28.4,"series":"PPO, preview","y":3.1135},{"t":28.6,"series":"PPO, preview","y":3.1073},{"t":28.8,"series":"PPO, preview","y":3.107},{"t":29.0,"series":"PPO, preview","y":3.1039},{"t":29.2,"series":"PPO, preview","y":3.1026},{"t":29.4,"series":"PPO, preview","y":3.1039},{"t":29.6,"series":"PPO, preview","y":3.1039},{"t":29.8,"series":"PPO, preview","y":3.0983},{"t":30.0,"series":"PPO, preview","y":3.1035},{"t":30.2,"series":"PPO, preview","y":3.1009},{"t":30.4,"series":"PPO, preview","y":3.0986},{"t":30.6,"series":"PPO, preview","y":3.1009},{"t":30.8,"series":"PPO, preview","y":3.1025},{"t":31.0,"series":"PPO, preview","y":3.1019},{"t":31.2,"series":"PPO, preview","y":3.0994},{"t":31.4,"series":"PPO, preview","y":3.1044},{"t":31.6,"series":"PPO, preview","y":3.1073},{"t":31.8,"series":"PPO, preview","y":3.1005},{"t":32.0,"series":"PPO, preview","y":3.1007},{"t":32.2,"series":"PPO, preview","y":3.1068},{"t":32.4,"series":"PPO, preview","y":3.1048},{"t":32.6,"series":"PPO, preview","y":3.1045},{"t":32.8,"series":"PPO, preview","y":3.0912},{"t":33.0,"series":"PPO, preview","y":3.1859},{"t":33.2,"series":"PPO, preview","y":3.4731},{"t":33.4,"series":"PPO, preview","y":3.4974},{"t":33.6,"series":"PPO, preview","y":3.4813},{"t":33.8,"series":"PPO, preview","y":3.4972},{"t":34.0,"series":"PPO, preview","y":3.4933},{"t":34.2,"series":"PPO, preview","y":3.4921},{"t":34.4,"series":"PPO, preview","y":3.4947},{"t":34.6,"series":"PPO, preview","y":3.4998},{"t":34.8,"series":"PPO, preview","y":3.4946},{"t":35.0,"series":"PPO, preview","y":3.4945},{"t":35.2,"series":"PPO, preview","y":3.4982},{"t":35.4,"series":"PPO, preview","y":3.4922},{"t":35.6,"series":"PPO, preview","y":3.4934},{"t":35.8,"series":"PPO, preview","y":3.4897},{"t":36.0,"series":"PPO, preview","y":3.4857},{"t":36.2,"series":"PPO, preview","y":3.4814},{"t":36.4,"series":"PPO, preview","y":3.4891},{"t":36.6,"series":"PPO, preview","y":3.4907},{"t":36.8,"series":"PPO, preview","y":3.4979},{"t":37.0,"series":"PPO, preview","y":3.4983},{"t":37.2,"series":"PPO, preview","y":3.4933},{"t":37.4,"series":"PPO, preview","y":3.4949},{"t":37.6,"series":"PPO, preview","y":3.4941},{"t":37.8,"series":"PPO, preview","y":3.4989},{"t":38.0,"series":"PPO, preview","y":3.5088},{"t":38.2,"series":"PPO, preview","y":3.5147},{"t":38.4,"series":"PPO, preview","y":3.5099},{"t":38.6,"series":"PPO, preview","y":3.5058},{"t":38.8,"series":"PPO, preview","y":3.504},{"t":39.0,"series":"PPO, preview","y":3.4993},{"t":39.2,"series":"PPO, preview","y":3.4984},{"t":39.4,"series":"PPO, preview","y":3.4977},{"t":39.6,"series":"PPO, preview","y":3.4974},{"t":39.8,"series":"PPO, preview","y":3.4998},{"t":40.0,"series":"PPO, preview","y":3.5048},{"t":0.2,"series":"SAC, preview","y":3.3974},{"t":0.4,"series":"SAC, preview","y":3.3916},{"t":0.6,"series":"SAC, preview","y":3.3937},{"t":0.8,"series":"SAC, preview","y":3.3932},{"t":1.0,"series":"SAC, preview","y":3.3888},{"t":1.2,"series":"SAC, preview","y":3.3912},{"t":1.4,"series":"SAC, preview","y":3.3939},{"t":1.6,"series":"SAC, preview","y":3.3934},{"t":1.8,"series":"SAC, preview","y":3.3907},{"t":2.0,"series":"SAC, preview","y":3.3902},{"t":2.2,"series":"SAC, preview","y":3.3906},{"t":2.4,"series":"SAC, preview","y":3.3916},{"t":2.6,"series":"SAC, preview","y":3.3962},{"t":2.8,"series":"SAC, preview","y":3.3966},{"t":3.0,"series":"SAC, preview","y":3.3928},{"t":3.2,"series":"SAC, preview","y":3.3904},{"t":3.4,"series":"SAC, preview","y":3.3927},{"t":3.6,"series":"SAC, preview","y":3.3955},{"t":3.8,"series":"SAC, preview","y":3.3948},{"t":4.0,"series":"SAC, preview","y":3.3943},{"t":4.2,"series":"SAC, preview","y":3.3935},{"t":4.4,"series":"SAC, preview","y":3.391},{"t":4.6,"series":"SAC, preview","y":3.3899},{"t":4.8,"series":"SAC, preview","y":3.4895},{"t":5.0,"series":"SAC, preview","y":3.3792},{"t":5.2,"series":"SAC, preview","y":3.389},{"t":5.4,"series":"SAC, preview","y":3.3836},{"t":5.6,"series":"SAC, preview","y":3.3944},{"t":5.8,"series":"SAC, preview","y":3.394},{"t":6.0,"series":"SAC, preview","y":3.3985},{"t":6.2,"series":"SAC, preview","y":3.4005},{"t":6.4,"series":"SAC, preview","y":3.4005},{"t":6.6,"series":"SAC, preview","y":3.3971},{"t":6.8,"series":"SAC, preview","y":3.395},{"t":7.0,"series":"SAC, preview","y":3.3978},{"t":7.2,"series":"SAC, preview","y":3.3954},{"t":7.4,"series":"SAC, preview","y":3.3978},{"t":7.6,"series":"SAC, preview","y":3.3961},{"t":7.8,"series":"SAC, preview","y":3.3968},{"t":8.0,"series":"SAC, preview","y":3.4004},{"t":8.2,"series":"SAC, preview","y":3.3988},{"t":8.4,"series":"SAC, preview","y":3.3991},{"t":8.6,"series":"SAC, preview","y":3.3999},{"t":8.8,"series":"SAC, preview","y":3.4002},{"t":9.0,"series":"SAC, preview","y":3.4006},{"t":9.2,"series":"SAC, preview","y":3.3957},{"t":9.4,"series":"SAC, preview","y":3.3962},{"t":9.6,"series":"SAC, preview","y":3.3986},{"t":9.8,"series":"SAC, preview","y":3.3787},{"t":10.0,"series":"SAC, preview","y":3.5145},{"t":10.2,"series":"SAC, preview","y":3.6902},{"t":10.4,"series":"SAC, preview","y":3.7019},{"t":10.6,"series":"SAC, preview","y":3.697},{"t":10.8,"series":"SAC, preview","y":3.6974},{"t":11.0,"series":"SAC, preview","y":3.6983},{"t":11.2,"series":"SAC, preview","y":3.6978},{"t":11.4,"series":"SAC, preview","y":3.6986},{"t":11.6,"series":"SAC, preview","y":3.7027},{"t":11.8,"series":"SAC, preview","y":3.7036},{"t":12.0,"series":"SAC, preview","y":3.7027},{"t":12.2,"series":"SAC, preview","y":3.6973},{"t":12.4,"series":"SAC, preview","y":3.7},{"t":12.6,"series":"SAC, preview","y":3.7007},{"t":12.8,"series":"SAC, preview","y":3.7008},{"t":13.0,"series":"SAC, preview","y":3.7009},{"t":13.2,"series":"SAC, preview","y":3.6996},{"t":13.4,"series":"SAC, preview","y":3.6994},{"t":13.6,"series":"SAC, preview","y":3.6976},{"t":13.8,"series":"SAC, preview","y":3.7031},{"t":14.0,"series":"SAC, preview","y":3.7017},{"t":14.2,"series":"SAC, preview","y":3.699},{"t":14.4,"series":"SAC, preview","y":3.7006},{"t":14.6,"series":"SAC, preview","y":3.7},{"t":14.8,"series":"SAC, preview","y":3.7079},{"t":15.0,"series":"SAC, preview","y":3.7097},{"t":15.2,"series":"SAC, preview","y":3.7057},{"t":15.4,"series":"SAC, preview","y":3.706},{"t":15.6,"series":"SAC, preview","y":3.7041},{"t":15.8,"series":"SAC, preview","y":3.7028},{"t":16.0,"series":"SAC, preview","y":3.7065},{"t":16.2,"series":"SAC, preview","y":3.7057},{"t":16.4,"series":"SAC, preview","y":3.7043},{"t":16.6,"series":"SAC, preview","y":3.7077},{"t":16.8,"series":"SAC, preview","y":3.7093},{"t":17.0,"series":"SAC, preview","y":3.711},{"t":17.2,"series":"SAC, preview","y":3.7125},{"t":17.4,"series":"SAC, preview","y":3.7147},{"t":17.6,"series":"SAC, preview","y":3.7143},{"t":17.8,"series":"SAC, preview","y":3.7047},{"t":18.0,"series":"SAC, preview","y":3.7091},{"t":18.2,"series":"SAC, preview","y":3.7144},{"t":18.4,"series":"SAC, preview","y":3.715},{"t":18.6,"series":"SAC, preview","y":3.7147},{"t":18.8,"series":"SAC, preview","y":3.7157},{"t":19.0,"series":"SAC, preview","y":3.7135},{"t":19.2,"series":"SAC, preview","y":3.7154},{"t":19.4,"series":"SAC, preview","y":3.7148},{"t":19.6,"series":"SAC, preview","y":3.7124},{"t":19.8,"series":"SAC, preview","y":3.7142},{"t":20.0,"series":"SAC, preview","y":3.7156},{"t":20.2,"series":"SAC, preview","y":3.7156},{"t":20.4,"series":"SAC, preview","y":3.711},{"t":20.6,"series":"SAC, preview","y":3.7093},{"t":20.8,"series":"SAC, preview","y":3.7148},{"t":21.0,"series":"SAC, preview","y":3.7132},{"t":21.2,"series":"SAC, preview","y":3.714},{"t":21.4,"series":"SAC, preview","y":3.7179},{"t":21.6,"series":"SAC, preview","y":3.7169},{"t":21.8,"series":"SAC, preview","y":3.719},{"t":22.0,"series":"SAC, preview","y":3.7052},{"t":22.2,"series":"SAC, preview","y":3.6475},{"t":22.4,"series":"SAC, preview","y":3.5895},{"t":22.6,"series":"SAC, preview","y":3.5279},{"t":22.8,"series":"SAC, preview","y":3.4686},{"t":23.0,"series":"SAC, preview","y":3.408},{"t":23.2,"series":"SAC, preview","y":3.3471},{"t":23.4,"series":"SAC, preview","y":3.2875},{"t":23.6,"series":"SAC, preview","y":3.233},{"t":23.8,"series":"SAC, preview","y":3.1662},{"t":24.0,"series":"SAC, preview","y":3.1311},{"t":24.2,"series":"SAC, preview","y":3.1169},{"t":24.4,"series":"SAC, preview","y":3.1198},{"t":24.6,"series":"SAC, preview","y":3.1207},{"t":24.8,"series":"SAC, preview","y":3.1212},{"t":25.0,"series":"SAC, preview","y":3.1245},{"t":25.2,"series":"SAC, preview","y":3.1229},{"t":25.4,"series":"SAC, preview","y":3.1208},{"t":25.6,"series":"SAC, preview","y":3.1229},{"t":25.8,"series":"SAC, preview","y":3.1225},{"t":26.0,"series":"SAC, preview","y":3.1264},{"t":26.2,"series":"SAC, preview","y":3.1236},{"t":26.4,"series":"SAC, preview","y":3.1209},{"t":26.6,"series":"SAC, preview","y":3.1245},{"t":26.8,"series":"SAC, preview","y":3.0826},{"t":27.0,"series":"SAC, preview","y":3.1824},{"t":27.2,"series":"SAC, preview","y":3.1061},{"t":27.4,"series":"SAC, preview","y":3.055},{"t":27.6,"series":"SAC, preview","y":3.0573},{"t":27.8,"series":"SAC, preview","y":3.0858},{"t":28.0,"series":"SAC, preview","y":3.091},{"t":28.2,"series":"SAC, preview","y":3.0894},{"t":28.4,"series":"SAC, preview","y":3.0865},{"t":28.6,"series":"SAC, preview","y":3.0888},{"t":28.8,"series":"SAC, preview","y":3.0928},{"t":29.0,"series":"SAC, preview","y":3.0909},{"t":29.2,"series":"SAC, preview","y":3.0913},{"t":29.4,"series":"SAC, preview","y":3.0927},{"t":29.6,"series":"SAC, preview","y":3.0931},{"t":29.8,"series":"SAC, preview","y":3.0878},{"t":30.0,"series":"SAC, preview","y":3.0929},{"t":30.2,"series":"SAC, preview","y":3.0884},{"t":30.4,"series":"SAC, preview","y":3.0876},{"t":30.6,"series":"SAC, preview","y":3.0901},{"t":30.8,"series":"SAC, preview","y":3.0924},{"t":31.0,"series":"SAC, preview","y":3.0895},{"t":31.2,"series":"SAC, preview","y":3.0891},{"t":31.4,"series":"SAC, preview","y":3.0943},{"t":31.6,"series":"SAC, preview","y":3.0973},{"t":31.8,"series":"SAC, preview","y":3.0901},{"t":32.0,"series":"SAC, preview","y":3.0912},{"t":32.2,"series":"SAC, preview","y":3.097},{"t":32.4,"series":"SAC, preview","y":3.0938},{"t":32.6,"series":"SAC, preview","y":3.0951},{"t":32.8,"series":"SAC, preview","y":3.046},{"t":33.0,"series":"SAC, preview","y":3.2319},{"t":33.2,"series":"SAC, preview","y":3.4715},{"t":33.4,"series":"SAC, preview","y":3.4983},{"t":33.6,"series":"SAC, preview","y":3.4888},{"t":33.8,"series":"SAC, preview","y":3.4904},{"t":34.0,"series":"SAC, preview","y":3.49},{"t":34.2,"series":"SAC, preview","y":3.4895},{"t":34.4,"series":"SAC, preview","y":3.4925},{"t":34.6,"series":"SAC, preview","y":3.4977},{"t":34.8,"series":"SAC, preview","y":3.4927},{"t":35.0,"series":"SAC, preview","y":3.4937},{"t":35.2,"series":"SAC, preview","y":3.4953},{"t":35.4,"series":"SAC, preview","y":3.4903},{"t":35.6,"series":"SAC, preview","y":3.4919},{"t":35.8,"series":"SAC, preview","y":3.4898},{"t":36.0,"series":"SAC, preview","y":3.483},{"t":36.2,"series":"SAC, preview","y":3.4879},{"t":36.4,"series":"SAC, preview","y":3.4886},{"t":36.6,"series":"SAC, preview","y":3.4845},{"t":36.8,"series":"SAC, preview","y":3.4851},{"t":37.0,"series":"SAC, preview","y":3.4839},{"t":37.2,"series":"SAC, preview","y":3.4825},{"t":37.4,"series":"SAC, preview","y":3.4856},{"t":37.6,"series":"SAC, preview","y":3.4845},{"t":37.8,"series":"SAC, preview","y":3.4885},{"t":38.0,"series":"SAC, preview","y":3.4885},{"t":38.2,"series":"SAC, preview","y":3.4857},{"t":38.4,"series":"SAC, preview","y":3.4885},{"t":38.6,"series":"SAC, preview","y":3.4889},{"t":38.8,"series":"SAC, preview","y":3.4924},{"t":39.0,"series":"SAC, preview","y":3.4921},{"t":39.2,"series":"SAC, preview","y":3.4895},{"t":39.4,"series":"SAC, preview","y":3.4892},{"t":39.6,"series":"SAC, preview","y":3.489},{"t":39.8,"series":"SAC, preview","y":3.4911},{"t":40.0,"series":"SAC, preview","y":3.4965}]
 },
 "mark": {
  "type": "line",
  "strokeWidth": 1.8,
  "interpolate": "linear"
 },
 "encoding": {
  "x": {
   "field": "t",
   "type": "quantitative",
   "title": "time (s)"
  },
  "y": {
   "field": "y",
   "type": "quantitative",
   "title": "ROF",
   "scale": {
    "zero": false
   }
  },
  "color": {
   "field": "series",
   "type": "nominal",
   "scale": {
    "domain": [
     "set point",
     "Decoupled PI",
     "PPO, preview",
     "SAC, preview"
    ],
    "range": [
     "var(--viz-ink-2)",
     "var(--viz-s1)",
     "var(--viz-s2)",
     "var(--viz-s3)"
    ]
   },
   "legend": {
    "title": null
   }
  },
  "strokeDash": {
   "field": "series",
   "type": "nominal",
   "scale": {
    "domain": [
     "set point",
     "Decoupled PI",
     "PPO, preview",
     "SAC, preview"
    ],
    "range": [
     [
      5,
      4
     ],
     [
      1,
      0
     ],
     [
      1,
      0
     ],
     [
      1,
      0
     ]
    ]
   },
   "legend": null
  },
  "tooltip": [
   {
    "field": "series"
   },
   {
    "field": "t",
    "title": "t (s)"
   },
   {
    "field": "y",
    "format": ".2f"
   }
  ]
 }
}
```

??? info "Table view: the evaluation profile"
    | Controller | MAPE $p_{cc}$ [%] | MAPE $R_{OF}$ [%] | Return | Violation steps | Valve travel |
    |---|---|---|---|---|---|
    | Feedforward only | 4.70 | 4.48 | -304.3 | 36 | 1.07 |
    | Decoupled PI | 3.13 | 3.09 | -215.7 | 26 | 6.52 |
    | PPO, no preview | 1.43 | 0.37 | -59.6 | 0 | 3.87 |
    | PPO, preview | 0.63 | 0.36 | -39.9 | 0 | 3.35 |
    | SAC, no preview | 1.07 | 0.41 | -47.0 | 0 | 5.46 |
    | SAC, preview | 0.68 | 0.34 | -40.2 | 0 | 3.62 |

On the profile, the PI's slow pressure loop and its limit cycle at 50 bar are visible between 18 s and 27 s, where the plant's fast gain is highest. At the 50 → 38 bar step at 27 s, PPO and SAC with preview cut TFV at 26.7 s, before the step arrives, while the PI reacts at 27.3 s; in the Lab, compare the [PI](primer/8-lab.md?preset=pi) and [PPO](primer/8-lab.md?preset=ppo-preview) valve panels around 27 s.

### Robustness {#robustness}

The heat flux into the cooling channels drives the slow loop, and it is the kind of parameter the challenge's test cases 3–4 perturb: DLR randomised its heat-flux factor by ±4 % ([Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)). Here it is scaled by up to ±10 %, with every controller left as tuned or trained.

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Chamber-pressure error when the wall heat flux is wrong",
  "subtitle": "MAPE on 10 held-out episodes per point, log scale; controllers tuned and trained at 1.0. This repo's surrogate (not DLR's simulator); data/results/summary.json"
 },
 "width": "container",
 "height": 240,
 "data": {
  "values": [{"controller":"Feedforward only","heat":0.9,"mape":5.942},{"controller":"Feedforward only","heat":0.95,"mape":5.332},{"controller":"Feedforward only","heat":1.0,"mape":5.26},{"controller":"Feedforward only","heat":1.05,"mape":6.316},{"controller":"Feedforward only","heat":1.1,"mape":7.711},{"controller":"Decoupled PI","heat":0.9,"mape":3.366},{"controller":"Decoupled PI","heat":0.95,"mape":3.15},{"controller":"Decoupled PI","heat":1.0,"mape":3.051},{"controller":"Decoupled PI","heat":1.05,"mape":3.236},{"controller":"Decoupled PI","heat":1.1,"mape":3.482},{"controller":"PPO, no preview","heat":0.9,"mape":1.376},{"controller":"PPO, no preview","heat":0.95,"mape":1.297},{"controller":"PPO, no preview","heat":1.0,"mape":1.29},{"controller":"PPO, no preview","heat":1.05,"mape":1.391},{"controller":"PPO, no preview","heat":1.1,"mape":1.545},{"controller":"PPO, preview","heat":0.9,"mape":0.71},{"controller":"PPO, preview","heat":0.95,"mape":0.576},{"controller":"PPO, preview","heat":1.0,"mape":0.518},{"controller":"PPO, preview","heat":1.05,"mape":0.544},{"controller":"PPO, preview","heat":1.1,"mape":0.579},{"controller":"SAC, no preview","heat":0.9,"mape":0.996},{"controller":"SAC, no preview","heat":0.95,"mape":0.881},{"controller":"SAC, no preview","heat":1.0,"mape":0.827},{"controller":"SAC, no preview","heat":1.05,"mape":0.886},{"controller":"SAC, no preview","heat":1.1,"mape":0.986},{"controller":"SAC, preview","heat":0.9,"mape":0.557},{"controller":"SAC, preview","heat":0.95,"mape":0.541},{"controller":"SAC, preview","heat":1.0,"mape":0.527},{"controller":"SAC, preview","heat":1.05,"mape":0.561},{"controller":"SAC, preview","heat":1.1,"mape":0.598}]
 },
 "mark": {
  "type": "line",
  "point": true,
  "strokeWidth": 2
 },
 "encoding": {
  "x": {
   "field": "heat",
   "type": "quantitative",
   "title": "heat flux × (1 = calibrated)",
   "scale": {
    "domain": [
     0.88,
     1.12
    ]
   }
  },
  "y": {
   "field": "mape",
   "type": "quantitative",
   "scale": {
    "type": "log"
   },
   "title": "MAPE chamber pressure (%)"
  },
  "color": {
   "field": "controller",
   "type": "nominal",
   "sort": [
    "Feedforward only",
    "Decoupled PI",
    "PPO, no preview",
    "PPO, preview",
    "SAC, no preview",
    "SAC, preview"
   ],
   "scale": {
    "domain": [
     "Feedforward only",
     "Decoupled PI",
     "PPO, no preview",
     "PPO, preview",
     "SAC, no preview",
     "SAC, preview"
    ],
    "range": [
     "var(--viz-s1)",
     "var(--viz-s2)",
     "var(--viz-s3)",
     "var(--viz-s4)",
     "var(--viz-s5)",
     "var(--viz-s6)"
    ]
   },
   "legend": {
    "title": null
   }
  },
  "tooltip": [
   {
    "field": "controller"
   },
   {
    "field": "heat",
    "title": "heat flux ×"
   },
   {
    "field": "mape",
    "title": "MAPE (%)",
    "format": ".2f"
   }
  ]
 }
}
```

??? info "Table view: MAPE of chamber pressure [%] against the heat-flux factor"
    | Controller | × 0.9 | × 0.95 | × 1.0 | × 1.05 | × 1.1 |
    |---|---|---|---|---|---|
    | Feedforward only | 5.94 | 5.33 | 5.26 | 6.32 | 7.71 |
    | Decoupled PI | 3.37 | 3.15 | 3.05 | 3.24 | 3.48 |
    | PPO, no preview | 1.38 | 1.30 | 1.29 | 1.39 | 1.54 |
    | PPO, preview | 0.71 | 0.58 | 0.52 | 0.54 | 0.58 |
    | SAC, no preview | 1.00 | 0.88 | 0.83 | 0.89 | 0.99 |
    | SAC, preview | 0.56 | 0.54 | 0.53 | 0.56 | 0.60 |

The heat flux, which drives the slow loop, turns out to matter little: every controller degrades by less than half over ±10 %, and the learned ones stay two to six times better than the PI.

The randomised results point elsewhere. Perturbing one parameter at a time, at the edge of DLR's ranges, on six held-out episodes with PPO with preview:

| Perturbation (thesis Table A.3 range) | PPO MAPE $p_{cc}$ / $R_{OF}$ [%] | PI MAPE $p_{cc}$ / $R_{OF}$ [%] |
|---|---|---|
| none | 0.43 / 0.30 | 2.94 / 2.26 |
| heat-flux factor × 0.96 | 0.48 / 0.31 | 3.03 / 2.27 |
| LOX tank pressure × 0.95 | 0.46 / 0.38 | 2.96 / 2.26 |
| LOX feed loss × 1.03 | 0.53 / 0.72 | 2.96 / 2.25 |
| $c^*$ × 0.986 | 0.81 / 0.73 | 3.07 / 2.24 |
| LOX pump efficiency × 0.96 | 0.91 / 2.29 | 3.17 / 2.29 |
| TOV flow coefficient × 0.95 | 0.84 / 3.04 | 3.19 / 2.34 |

The oxidiser side dominates. With the TOV flow coefficient 5 % low, PPO holds the mixture ratio 3.1 % below its set point on average in the holds (more than 3 s after a change), while the PI's integrator brings it to −0.15 %. The networks have learned the nominal map from TOV to mixture ratio; when the LOX turbine gets less power than that map assumes, nothing in the policy integrates the error away. In the Lab, set *LOX turbine ×* to 0.95: on the evaluation profile the mixture-ratio error of [PPO](primer/8-lab.md?preset=ppo-preview&loxturbine=0.95) and [SAC](primer/8-lab.md?preset=sac-preview&loxturbine=0.95) rises to 5.7–5.8 %, against 2.8 % for the [PI](primer/8-lab.md?preset=pi&loxturbine=0.95).

This is the same lesson as DLR's. With the fuel-turbopump efficiency 5 % lower than in training, its SAC controller reached 1.7 % error; trained with domain randomisation, 0.3 % ([thesis p. 91 and Table 5.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=108)). The obvious next experiments are training with randomisation, giving the network an integrator (an error-integral observation, or a residual policy on top of PI, [open question 3](06-open-questions.md#3-residual-rl-on-a-decoupled-pi-baseline-with-a-bounded-envelope)), or both.

### A second seed {#a-second-seed}

One training run per configuration says little about an algorithm. PPO is cheap enough here to train twice; SAC, at about an hour per run, was trained once.

| Policy | Seed | MAPE $p_{cc}$ [%] | MAPE $R_{OF}$ [%] | Return | Randomised MAPE $p_{cc}$ / $R_{OF}$ [%] | Training |
|---|---|---|---|---|---|---|
| PPO, preview | 0 | 0.52 | 0.33 | -26.4 | 0.92 / 1.90 | 17 min |
| PPO, preview | 1 | 0.50 | 0.34 | -25.2 | 0.94 / 1.80 | 27 min |
| PPO, no preview | 0 | 1.21 | 0.37 | -41.8 | 1.10 / 1.61 | 27 min |
| PPO, no preview | 1 | 1.07 | 0.46 | -41.3 | 1.08 / 1.75 | 19 min |
| SAC, preview | 0 | 0.54 | 0.26 | -25.0 | 0.89 / 1.88 | 55 min |
| SAC, no preview | 0 | 0.79 | 0.31 | -28.6 | 1.14 / 1.88 | 50 min |

The preview effect is larger than the seed-to-seed spread: both PPO seeds with preview land at 0.50–0.52 % pressure error, and both without at 1.07–1.21 %. Two seeds do not give a spread estimate, but they rule out the effect being one lucky run.

### Learning curves

```vegalite
{
 "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
 "title": {
  "text": "Learning curves",
  "subtitle": "Training-episode return (stochastic policy), running mean; dashed: PI on the held-out episodes (-130). This repo's surrogate (not DLR's simulator); data/results/policies/*.train.json"
 },
 "width": "container",
 "height": 240,
 "layer": [
  {
   "data": {
    "values": [{"run":"PPO, no preview","steps":1800,"ret":-254.82,"minutes":0.06},{"run":"PPO, no preview","steps":16200,"ret":-315.32,"minutes":0.15},{"run":"PPO, no preview","steps":30600,"ret":-345.24,"minutes":0.24},{"run":"PPO, no preview","steps":46800,"ret":-332.27,"minutes":0.37},{"run":"PPO, no preview","steps":61200,"ret":-318.92,"minutes":0.48},{"run":"PPO, no preview","steps":75600,"ret":-309.28,"minutes":0.57},{"run":"PPO, no preview","steps":91800,"ret":-289.17,"minutes":0.68},{"run":"PPO, no preview","steps":106200,"ret":-270.79,"minutes":0.78},{"run":"PPO, no preview","steps":120600,"ret":-258.4,"minutes":0.87},{"run":"PPO, no preview","steps":136800,"ret":-245.92,"minutes":1.17},{"run":"PPO, no preview","steps":151200,"ret":-236.42,"minutes":1.94},{"run":"PPO, no preview","steps":165600,"ret":-227.12,"minutes":2.73},{"run":"PPO, no preview","steps":181800,"ret":-218.74,"minutes":3.6},{"run":"PPO, no preview","steps":196200,"ret":-210.17,"minutes":4.32},{"run":"PPO, no preview","steps":210600,"ret":-202.81,"minutes":5.01},{"run":"PPO, no preview","steps":226800,"ret":-196.14,"minutes":5.88},{"run":"PPO, no preview","steps":241200,"ret":-190.32,"minutes":6.18},{"run":"PPO, no preview","steps":255600,"ret":-184.22,"minutes":6.25},{"run":"PPO, no preview","steps":271800,"ret":-179.75,"minutes":6.33},{"run":"PPO, no preview","steps":286200,"ret":-174.56,"minutes":6.41},{"run":"PPO, no preview","steps":300600,"ret":-166.39,"minutes":6.48},{"run":"PPO, no preview","steps":316800,"ret":-152.7,"minutes":6.57},{"run":"PPO, no preview","steps":331200,"ret":-136.25,"minutes":6.65},{"run":"PPO, no preview","steps":345600,"ret":-125.6,"minutes":6.73},{"run":"PPO, no preview","steps":361800,"ret":-115.66,"minutes":6.83},{"run":"PPO, no preview","steps":376200,"ret":-106.3,"minutes":6.92},{"run":"PPO, no preview","steps":390600,"ret":-102.59,"minutes":7.0},{"run":"PPO, no preview","steps":406800,"ret":-99.54,"minutes":7.1},{"run":"PPO, no preview","steps":421200,"ret":-95.13,"minutes":7.19},{"run":"PPO, no preview","steps":435600,"ret":-91.53,"minutes":7.28},{"run":"PPO, no preview","steps":451800,"ret":-87.82,"minutes":7.38},{"run":"PPO, no preview","steps":466200,"ret":-84.77,"minutes":7.46},{"run":"PPO, no preview","steps":480600,"ret":-82.07,"minutes":7.55},{"run":"PPO, no preview","steps":496800,"ret":-79.91,"minutes":7.64},{"run":"PPO, no preview","steps":511200,"ret":-77.72,"minutes":7.73},{"run":"PPO, no preview","steps":525600,"ret":-77.23,"minutes":7.82},{"run":"PPO, no preview","steps":541800,"ret":-74.79,"minutes":7.91},{"run":"PPO, no preview","steps":556200,"ret":-73.46,"minutes":8.0},{"run":"PPO, no preview","steps":570600,"ret":-72.88,"minutes":8.08},{"run":"PPO, no preview","steps":586800,"ret":-72.18,"minutes":8.18},{"run":"PPO, no preview","steps":601200,"ret":-69.95,"minutes":8.27},{"run":"PPO, no preview","steps":615600,"ret":-67.42,"minutes":8.36},{"run":"PPO, no preview","steps":631800,"ret":-65.67,"minutes":8.46},{"run":"PPO, no preview","steps":646200,"ret":-64.58,"minutes":8.55},{"run":"PPO, no preview","steps":660600,"ret":-63.97,"minutes":8.64},{"run":"PPO, no preview","steps":676800,"ret":-62.83,"minutes":8.74},{"run":"PPO, no preview","steps":691200,"ret":-60.58,"minutes":8.82},{"run":"PPO, no preview","steps":705600,"ret":-60.24,"minutes":8.91},{"run":"PPO, no preview","steps":721800,"ret":-59.95,"minutes":9.01},{"run":"PPO, no preview","steps":736200,"ret":-59.38,"minutes":9.09},{"run":"PPO, no preview","steps":750600,"ret":-57.75,"minutes":9.18},{"run":"PPO, no preview","steps":766800,"ret":-58.8,"minutes":9.28},{"run":"PPO, no preview","steps":781200,"ret":-57.73,"minutes":9.37},{"run":"PPO, no preview","steps":795600,"ret":-56.71,"minutes":9.46},{"run":"PPO, no preview","steps":811800,"ret":-57.18,"minutes":9.56},{"run":"PPO, no preview","steps":826200,"ret":-55.68,"minutes":9.65},{"run":"PPO, no preview","steps":840600,"ret":-56.32,"minutes":9.73},{"run":"PPO, no preview","steps":856800,"ret":-56.12,"minutes":9.84},{"run":"PPO, no preview","steps":871200,"ret":-54.33,"minutes":9.92},{"run":"PPO, no preview","steps":885600,"ret":-53.91,"minutes":10.01},{"run":"PPO, no preview","steps":901800,"ret":-53.91,"minutes":10.11},{"run":"PPO, no preview","steps":916200,"ret":-53.6,"minutes":10.19},{"run":"PPO, no preview","steps":930600,"ret":-54.41,"minutes":10.27},{"run":"PPO, no preview","steps":946800,"ret":-54.14,"minutes":10.37},{"run":"PPO, no preview","steps":961200,"ret":-55.22,"minutes":10.45},{"run":"PPO, no preview","steps":975600,"ret":-54.57,"minutes":10.55},{"run":"PPO, no preview","steps":991800,"ret":-53.88,"minutes":10.65},{"run":"PPO, no preview","steps":1006200,"ret":-52.46,"minutes":10.74},{"run":"PPO, no preview","steps":1020600,"ret":-51.72,"minutes":10.83},{"run":"PPO, no preview","steps":1036800,"ret":-51.04,"minutes":10.93},{"run":"PPO, no preview","steps":1051200,"ret":-51.18,"minutes":11.02},{"run":"PPO, no preview","steps":1065600,"ret":-48.83,"minutes":11.1},{"run":"PPO, no preview","steps":1081800,"ret":-48.95,"minutes":11.2},{"run":"PPO, no preview","steps":1096200,"ret":-49.46,"minutes":11.29},{"run":"PPO, no preview","steps":1110600,"ret":-48.84,"minutes":11.39},{"run":"PPO, no preview","steps":1126800,"ret":-49.5,"minutes":11.51},{"run":"PPO, no preview","steps":1141200,"ret":-48.73,"minutes":11.6},{"run":"PPO, no preview","steps":1155600,"ret":-48.25,"minutes":11.7},{"run":"PPO, no preview","steps":1171800,"ret":-48.64,"minutes":11.8},{"run":"PPO, no preview","steps":1186200,"ret":-47.49,"minutes":12.0},{"run":"PPO, no preview","steps":1200600,"ret":-47.89,"minutes":12.65},{"run":"PPO, no preview","steps":1216800,"ret":-48.19,"minutes":13.47},{"run":"PPO, no preview","steps":1231200,"ret":-47.58,"minutes":14.12},{"run":"PPO, no preview","steps":1245600,"ret":-46.74,"minutes":14.75},{"run":"PPO, no preview","steps":1261800,"ret":-45.24,"minutes":14.84},{"run":"PPO, no preview","steps":1276200,"ret":-45.63,"minutes":14.93},{"run":"PPO, no preview","steps":1290600,"ret":-46.78,"minutes":15.02},{"run":"PPO, no preview","steps":1306800,"ret":-46.77,"minutes":15.1},{"run":"PPO, no preview","steps":1321200,"ret":-46.23,"minutes":15.17},{"run":"PPO, no preview","steps":1335600,"ret":-47.22,"minutes":15.24},{"run":"PPO, no preview","steps":1351800,"ret":-47.25,"minutes":15.33},{"run":"PPO, no preview","steps":1366200,"ret":-47.65,"minutes":15.4},{"run":"PPO, no preview","steps":1380600,"ret":-47.24,"minutes":15.48},{"run":"PPO, no preview","steps":1396800,"ret":-46.85,"minutes":15.57},{"run":"PPO, no preview","steps":1411200,"ret":-46.27,"minutes":15.65},{"run":"PPO, no preview","steps":1425600,"ret":-45.48,"minutes":15.73},{"run":"PPO, no preview","steps":1441800,"ret":-45.53,"minutes":15.82},{"run":"PPO, no preview","steps":1456200,"ret":-46.52,"minutes":15.91},{"run":"PPO, no preview","steps":1470600,"ret":-45.52,"minutes":15.99},{"run":"PPO, no preview","steps":1486800,"ret":-46.79,"minutes":16.08},{"run":"PPO, no preview","steps":1501200,"ret":-46.4,"minutes":16.15},{"run":"PPO, no preview","steps":1515600,"ret":-47.26,"minutes":16.23},{"run":"PPO, no preview","steps":1531800,"ret":-47.63,"minutes":16.32},{"run":"PPO, no preview","steps":1546200,"ret":-48.34,"minutes":16.41},{"run":"PPO, no preview","steps":1560600,"ret":-48.6,"minutes":16.5},{"run":"PPO, no preview","steps":1576800,"ret":-48.33,"minutes":16.59},{"run":"PPO, no preview","steps":1591200,"ret":-48.65,"minutes":16.67},{"run":"PPO, no preview","steps":1605600,"ret":-48.89,"minutes":16.76},{"run":"PPO, no preview","steps":1621800,"ret":-50.21,"minutes":16.85},{"run":"PPO, no preview","steps":1636200,"ret":-50.08,"minutes":16.94},{"run":"PPO, no preview","steps":1650600,"ret":-50.74,"minutes":17.02},{"run":"PPO, no preview","steps":1666800,"ret":-50.82,"minutes":17.1},{"run":"PPO, no preview","steps":1681200,"ret":-51.29,"minutes":17.18},{"run":"PPO, no preview","steps":1695600,"ret":-51.63,"minutes":17.26},{"run":"PPO, no preview","steps":1711800,"ret":-52.17,"minutes":17.35},{"run":"PPO, no preview","steps":1726200,"ret":-51.93,"minutes":17.43},{"run":"PPO, no preview","steps":1740600,"ret":-51.94,"minutes":17.52},{"run":"PPO, no preview","steps":1756800,"ret":-51.89,"minutes":17.61},{"run":"PPO, no preview","steps":1771200,"ret":-53.58,"minutes":17.7},{"run":"PPO, no preview","steps":1785600,"ret":-54.23,"minutes":17.78},{"run":"PPO, no preview","steps":1801800,"ret":-53.5,"minutes":17.88},{"run":"PPO, no preview","steps":1816200,"ret":-51.86,"minutes":17.96},{"run":"PPO, no preview","steps":1830600,"ret":-50.46,"minutes":18.04},{"run":"PPO, no preview","steps":1846800,"ret":-51.08,"minutes":18.13},{"run":"PPO, no preview","steps":1861200,"ret":-50.17,"minutes":18.21},{"run":"PPO, no preview","steps":1875600,"ret":-51.68,"minutes":18.29},{"run":"PPO, no preview","steps":1891800,"ret":-51.11,"minutes":18.39},{"run":"PPO, no preview","steps":1906200,"ret":-50.93,"minutes":18.47},{"run":"PPO, no preview","steps":1920600,"ret":-50.42,"minutes":18.56},{"run":"PPO, no preview","steps":1936800,"ret":-50.04,"minutes":18.65},{"run":"PPO, no preview","steps":1951200,"ret":-50.09,"minutes":18.74},{"run":"PPO, no preview","steps":1965600,"ret":-50.26,"minutes":18.83},{"run":"PPO, no preview","steps":1981800,"ret":-51.08,"minutes":18.92},{"run":"PPO, no preview","steps":1996200,"ret":-50.74,"minutes":19.0},{"run":"PPO, no preview","steps":2010600,"ret":-50.34,"minutes":19.09},{"run":"PPO, no preview","steps":2026800,"ret":-50.37,"minutes":19.19},{"run":"PPO, no preview","steps":2041200,"ret":-49.93,"minutes":19.27},{"run":"PPO, no preview","steps":2055600,"ret":-48.77,"minutes":19.36},{"run":"PPO, no preview","steps":2071800,"ret":-47.77,"minutes":19.45},{"run":"PPO, no preview","steps":2086200,"ret":-46.88,"minutes":19.54},{"run":"PPO, no preview","steps":2100600,"ret":-47.64,"minutes":19.62},{"run":"PPO, no preview","steps":2116800,"ret":-48.82,"minutes":19.72},{"run":"PPO, no preview","steps":2131200,"ret":-49.09,"minutes":20.2},{"run":"PPO, no preview","steps":2145600,"ret":-47.33,"minutes":20.78},{"run":"PPO, no preview","steps":2161800,"ret":-47.75,"minutes":21.45},{"run":"PPO, no preview","steps":2176200,"ret":-46.61,"minutes":22.08},{"run":"PPO, no preview","steps":2190600,"ret":-45.38,"minutes":22.15},{"run":"PPO, no preview","steps":2206800,"ret":-45.39,"minutes":22.23},{"run":"PPO, no preview","steps":2221200,"ret":-45.7,"minutes":22.3},{"run":"PPO, no preview","steps":2235600,"ret":-45.2,"minutes":22.37},{"run":"PPO, no preview","steps":2251800,"ret":-45.65,"minutes":22.45},{"run":"PPO, no preview","steps":2266200,"ret":-45.59,"minutes":22.52},{"run":"PPO, no preview","steps":2280600,"ret":-45.39,"minutes":22.59},{"run":"PPO, no preview","steps":2296800,"ret":-45.51,"minutes":22.67},{"run":"PPO, no preview","steps":2311200,"ret":-46.28,"minutes":22.75},{"run":"PPO, no preview","steps":2325600,"ret":-45.72,"minutes":22.84},{"run":"PPO, no preview","steps":2341800,"ret":-46.09,"minutes":22.94},{"run":"PPO, no preview","steps":2356200,"ret":-46.13,"minutes":23.03},{"run":"PPO, no preview","steps":2370600,"ret":-45.79,"minutes":23.11},{"run":"PPO, no preview","steps":2386800,"ret":-44.91,"minutes":23.2},{"run":"PPO, no preview","steps":2401200,"ret":-44.86,"minutes":23.28},{"run":"PPO, no preview","steps":2415600,"ret":-44.29,"minutes":23.37},{"run":"PPO, no preview","steps":2431800,"ret":-44.47,"minutes":23.47},{"run":"PPO, no preview","steps":2446200,"ret":-45.74,"minutes":23.55},{"run":"PPO, no preview","steps":2460600,"ret":-44.85,"minutes":23.63},{"run":"PPO, no preview","steps":2476800,"ret":-44.03,"minutes":23.73},{"run":"PPO, no preview","steps":2491200,"ret":-44.04,"minutes":23.8},{"run":"PPO, no preview","steps":2505600,"ret":-44.68,"minutes":23.88},{"run":"PPO, no preview","steps":2521800,"ret":-44.31,"minutes":23.97},{"run":"PPO, no preview","steps":2536200,"ret":-44.96,"minutes":24.06},{"run":"PPO, no preview","steps":2550600,"ret":-44.24,"minutes":24.14},{"run":"PPO, no preview","steps":2566800,"ret":-45.09,"minutes":24.22},{"run":"PPO, no preview","steps":2581200,"ret":-44.53,"minutes":24.31},{"run":"PPO, no preview","steps":2595600,"ret":-43.95,"minutes":24.38},{"run":"PPO, no preview","steps":2611800,"ret":-43.81,"minutes":24.47},{"run":"PPO, no preview","steps":2626200,"ret":-45.27,"minutes":24.56},{"run":"PPO, no preview","steps":2640600,"ret":-45.77,"minutes":24.63},{"run":"PPO, no preview","steps":2656800,"ret":-46.82,"minutes":24.72},{"run":"PPO, no preview","steps":2671200,"ret":-48.02,"minutes":24.81},{"run":"PPO, no preview","steps":2685600,"ret":-48.61,"minutes":24.9},{"run":"PPO, no preview","steps":2701800,"ret":-48.5,"minutes":24.99},{"run":"PPO, no preview","steps":2716200,"ret":-49.31,"minutes":25.08},{"run":"PPO, no preview","steps":2730600,"ret":-50.81,"minutes":25.16},{"run":"PPO, no preview","steps":2746800,"ret":-49.93,"minutes":25.26},{"run":"PPO, no preview","steps":2761200,"ret":-50.84,"minutes":25.35},{"run":"PPO, no preview","steps":2775600,"ret":-51.11,"minutes":25.42},{"run":"PPO, no preview","steps":2791800,"ret":-51.36,"minutes":25.51},{"run":"PPO, no preview","steps":2806200,"ret":-50.03,"minutes":25.59},{"run":"PPO, no preview","steps":2820600,"ret":-49.14,"minutes":25.67},{"run":"PPO, no preview","steps":2836800,"ret":-48.62,"minutes":25.76},{"run":"PPO, no preview","steps":2851200,"ret":-49.28,"minutes":25.85},{"run":"PPO, no preview","steps":2865600,"ret":-48.19,"minutes":25.93},{"run":"PPO, no preview","steps":2881800,"ret":-48.48,"minutes":26.02},{"run":"PPO, no preview","steps":2896200,"ret":-50.3,"minutes":26.1},{"run":"PPO, no preview","steps":2910600,"ret":-49.07,"minutes":26.18},{"run":"PPO, no preview","steps":2926800,"ret":-48.19,"minutes":26.27},{"run":"PPO, no preview","steps":2941200,"ret":-47.67,"minutes":26.35},{"run":"PPO, no preview","steps":2955600,"ret":-46.84,"minutes":26.43},{"run":"PPO, no preview","steps":2971800,"ret":-45.34,"minutes":26.52},{"run":"PPO, no preview","steps":2986200,"ret":-44.82,"minutes":26.61},{"run":"PPO, no preview","steps":3000600,"ret":-45.26,"minutes":26.68},{"run":"PPO, preview","steps":1800,"ret":-300.08,"minutes":0.06},{"run":"PPO, preview","steps":16200,"ret":-324.38,"minutes":0.16},{"run":"PPO, preview","steps":30600,"ret":-347.58,"minutes":0.26},{"run":"PPO, preview","steps":46800,"ret":-326.4,"minutes":0.38},{"run":"PPO, preview","steps":61200,"ret":-310.13,"minutes":0.48},{"run":"PPO, preview","steps":75600,"ret":-293.2,"minutes":0.59},{"run":"PPO, preview","steps":91800,"ret":-274.5,"minutes":0.7},{"run":"PPO, preview","steps":106200,"ret":-256.96,"minutes":0.81},{"run":"PPO, preview","steps":120600,"ret":-244.69,"minutes":0.91},{"run":"PPO, preview","steps":136800,"ret":-233.31,"minutes":1.02},{"run":"PPO, preview","steps":151200,"ret":-222.85,"minutes":1.13},{"run":"PPO, preview","steps":165600,"ret":-213.86,"minutes":1.22},{"run":"PPO, preview","steps":181800,"ret":-204.98,"minutes":1.33},{"run":"PPO, preview","steps":196200,"ret":-196.59,"minutes":1.43},{"run":"PPO, preview","steps":210600,"ret":-190.08,"minutes":1.53},{"run":"PPO, preview","steps":226800,"ret":-184.19,"minutes":1.64},{"run":"PPO, preview","steps":241200,"ret":-177.75,"minutes":1.73},{"run":"PPO, preview","steps":255600,"ret":-172.05,"minutes":1.83},{"run":"PPO, preview","steps":271800,"ret":-167.19,"minutes":1.93},{"run":"PPO, preview","steps":286200,"ret":-162.26,"minutes":2.03},{"run":"PPO, preview","steps":300600,"ret":-150.89,"minutes":2.13},{"run":"PPO, preview","steps":316800,"ret":-137.34,"minutes":2.25},{"run":"PPO, preview","steps":331200,"ret":-120.76,"minutes":2.35},{"run":"PPO, preview","steps":345600,"ret":-110.62,"minutes":2.45},{"run":"PPO, preview","steps":361800,"ret":-101.2,"minutes":2.55},{"run":"PPO, preview","steps":376200,"ret":-93.39,"minutes":2.65},{"run":"PPO, preview","steps":390600,"ret":-88.77,"minutes":2.74},{"run":"PPO, preview","steps":406800,"ret":-84.78,"minutes":2.84},{"run":"PPO, preview","steps":421200,"ret":-80.19,"minutes":2.93},{"run":"PPO, preview","steps":435600,"ret":-76.01,"minutes":3.02},{"run":"PPO, preview","steps":451800,"ret":-72.57,"minutes":3.13},{"run":"PPO, preview","steps":466200,"ret":-69.3,"minutes":3.23},{"run":"PPO, preview","steps":480600,"ret":-67.12,"minutes":3.32},{"run":"PPO, preview","steps":496800,"ret":-64.73,"minutes":3.42},{"run":"PPO, preview","steps":511200,"ret":-61.99,"minutes":3.5},{"run":"PPO, preview","steps":525600,"ret":-60.43,"minutes":3.6},{"run":"PPO, preview","steps":541800,"ret":-58.64,"minutes":3.7},{"run":"PPO, preview","steps":556200,"ret":-57.03,"minutes":3.77},{"run":"PPO, preview","steps":570600,"ret":-56.08,"minutes":3.86},{"run":"PPO, preview","steps":586800,"ret":-54.89,"minutes":3.94},{"run":"PPO, preview","steps":601200,"ret":-53.11,"minutes":4.03},{"run":"PPO, preview","steps":615600,"ret":-51.11,"minutes":4.11},{"run":"PPO, preview","steps":631800,"ret":-49.46,"minutes":4.2},{"run":"PPO, preview","steps":646200,"ret":-48.87,"minutes":4.28},{"run":"PPO, preview","steps":660600,"ret":-48.41,"minutes":4.37},{"run":"PPO, preview","steps":676800,"ret":-47.76,"minutes":4.47},{"run":"PPO, preview","steps":691200,"ret":-46.78,"minutes":4.55},{"run":"PPO, preview","steps":705600,"ret":-46.54,"minutes":4.64},{"run":"PPO, preview","steps":721800,"ret":-46.51,"minutes":4.72},{"run":"PPO, preview","steps":736200,"ret":-46.15,"minutes":4.8},{"run":"PPO, preview","steps":750600,"ret":-45.65,"minutes":4.88},{"run":"PPO, preview","steps":766800,"ret":-46.21,"minutes":4.97},{"run":"PPO, preview","steps":781200,"ret":-45.15,"minutes":5.05},{"run":"PPO, preview","steps":795600,"ret":-44.55,"minutes":5.13},{"run":"PPO, preview","steps":811800,"ret":-44.69,"minutes":5.24},{"run":"PPO, preview","steps":826200,"ret":-43.73,"minutes":5.32},{"run":"PPO, preview","steps":840600,"ret":-44.01,"minutes":5.39},{"run":"PPO, preview","steps":856800,"ret":-43.53,"minutes":5.48},{"run":"PPO, preview","steps":871200,"ret":-42.33,"minutes":5.57},{"run":"PPO, preview","steps":885600,"ret":-42.14,"minutes":5.64},{"run":"PPO, preview","steps":901800,"ret":-42.56,"minutes":5.73},{"run":"PPO, preview","steps":916200,"ret":-42.46,"minutes":5.82},{"run":"PPO, preview","steps":930600,"ret":-43.1,"minutes":5.91},{"run":"PPO, preview","steps":946800,"ret":-42.78,"minutes":6.01},{"run":"PPO, preview","steps":961200,"ret":-42.9,"minutes":6.08},{"run":"PPO, preview","steps":975600,"ret":-42.7,"minutes":6.17},{"run":"PPO, preview","steps":991800,"ret":-41.75,"minutes":6.27},{"run":"PPO, preview","steps":1006200,"ret":-41.07,"minutes":6.34},{"run":"PPO, preview","steps":1020600,"ret":-40.18,"minutes":6.42},{"run":"PPO, preview","steps":1036800,"ret":-39.82,"minutes":6.51},{"run":"PPO, preview","steps":1051200,"ret":-39.47,"minutes":6.59},{"run":"PPO, preview","steps":1065600,"ret":-37.95,"minutes":6.67},{"run":"PPO, preview","steps":1081800,"ret":-37.9,"minutes":6.76},{"run":"PPO, preview","steps":1096200,"ret":-38.19,"minutes":6.84},{"run":"PPO, preview","steps":1110600,"ret":-37.9,"minutes":6.93},{"run":"PPO, preview","steps":1126800,"ret":-38.4,"minutes":7.02},{"run":"PPO, preview","steps":1141200,"ret":-37.93,"minutes":7.1},{"run":"PPO, preview","steps":1155600,"ret":-38.0,"minutes":7.17},{"run":"PPO, preview","steps":1171800,"ret":-38.86,"minutes":7.27},{"run":"PPO, preview","steps":1186200,"ret":-39.25,"minutes":7.34},{"run":"PPO, preview","steps":1200600,"ret":-39.05,"minutes":7.41},{"run":"PPO, preview","steps":1216800,"ret":-39.28,"minutes":7.48},{"run":"PPO, preview","steps":1231200,"ret":-39.0,"minutes":7.55},{"run":"PPO, preview","steps":1245600,"ret":-38.45,"minutes":7.62},{"run":"PPO, preview","steps":1261800,"ret":-37.48,"minutes":7.7},{"run":"PPO, preview","steps":1276200,"ret":-37.53,"minutes":7.77},{"run":"PPO, preview","steps":1290600,"ret":-38.46,"minutes":7.84},{"run":"PPO, preview","steps":1306800,"ret":-38.62,"minutes":7.92},{"run":"PPO, preview","steps":1321200,"ret":-41.3,"minutes":7.98},{"run":"PPO, preview","steps":1335600,"ret":-42.14,"minutes":8.05},{"run":"PPO, preview","steps":1351800,"ret":-42.1,"minutes":8.13},{"run":"PPO, preview","steps":1366200,"ret":-42.53,"minutes":8.2},{"run":"PPO, preview","steps":1380600,"ret":-42.52,"minutes":8.27},{"run":"PPO, preview","steps":1396800,"ret":-42.57,"minutes":8.36},{"run":"PPO, preview","steps":1411200,"ret":-42.39,"minutes":8.43},{"run":"PPO, preview","steps":1425600,"ret":-42.79,"minutes":8.51},{"run":"PPO, preview","steps":1441800,"ret":-42.95,"minutes":8.59},{"run":"PPO, preview","steps":1456200,"ret":-43.21,"minutes":8.67},{"run":"PPO, preview","steps":1470600,"ret":-42.11,"minutes":8.74},{"run":"PPO, preview","steps":1486800,"ret":-41.0,"minutes":8.82},{"run":"PPO, preview","steps":1501200,"ret":-40.5,"minutes":8.9},{"run":"PPO, preview","steps":1515600,"ret":-41.0,"minutes":8.97},{"run":"PPO, preview","steps":1531800,"ret":-41.25,"minutes":9.05},{"run":"PPO, preview","steps":1546200,"ret":-41.38,"minutes":9.12},{"run":"PPO, preview","steps":1560600,"ret":-41.66,"minutes":9.19},{"run":"PPO, preview","steps":1576800,"ret":-42.25,"minutes":9.27},{"run":"PPO, preview","steps":1591200,"ret":-41.46,"minutes":9.34},{"run":"PPO, preview","steps":1605600,"ret":-41.6,"minutes":9.41},{"run":"PPO, preview","steps":1621800,"ret":-39.42,"minutes":9.49},{"run":"PPO, preview","steps":1636200,"ret":-38.74,"minutes":9.56},{"run":"PPO, preview","steps":1650600,"ret":-38.87,"minutes":9.63},{"run":"PPO, preview","steps":1666800,"ret":-38.92,"minutes":9.71},{"run":"PPO, preview","steps":1681200,"ret":-38.97,"minutes":9.78},{"run":"PPO, preview","steps":1695600,"ret":-38.92,"minutes":9.85},{"run":"PPO, preview","steps":1711800,"ret":-38.69,"minutes":9.92},{"run":"PPO, preview","steps":1726200,"ret":-37.34,"minutes":9.99},{"run":"PPO, preview","steps":1740600,"ret":-37.38,"minutes":10.06},{"run":"PPO, preview","steps":1756800,"ret":-37.18,"minutes":10.14},{"run":"PPO, preview","steps":1771200,"ret":-37.47,"minutes":10.21},{"run":"PPO, preview","steps":1785600,"ret":-38.11,"minutes":10.28},{"run":"PPO, preview","steps":1801800,"ret":-37.75,"minutes":10.36},{"run":"PPO, preview","steps":1816200,"ret":-36.76,"minutes":10.43},{"run":"PPO, preview","steps":1830600,"ret":-35.75,"minutes":10.5},{"run":"PPO, preview","steps":1846800,"ret":-36.41,"minutes":10.58},{"run":"PPO, preview","steps":1861200,"ret":-35.95,"minutes":10.65},{"run":"PPO, preview","steps":1875600,"ret":-35.51,"minutes":10.72},{"run":"PPO, preview","steps":1891800,"ret":-35.62,"minutes":10.8},{"run":"PPO, preview","steps":1906200,"ret":-35.11,"minutes":10.88},{"run":"PPO, preview","steps":1920600,"ret":-34.64,"minutes":10.95},{"run":"PPO, preview","steps":1936800,"ret":-34.28,"minutes":11.03},{"run":"PPO, preview","steps":1951200,"ret":-33.99,"minutes":11.1},{"run":"PPO, preview","steps":1965600,"ret":-33.6,"minutes":11.17},{"run":"PPO, preview","steps":1981800,"ret":-34.41,"minutes":11.25},{"run":"PPO, preview","steps":1996200,"ret":-34.13,"minutes":11.32},{"run":"PPO, preview","steps":2010600,"ret":-34.03,"minutes":11.39},{"run":"PPO, preview","steps":2026800,"ret":-33.93,"minutes":11.47},{"run":"PPO, preview","steps":2041200,"ret":-33.16,"minutes":11.54},{"run":"PPO, preview","steps":2055600,"ret":-32.76,"minutes":11.61},{"run":"PPO, preview","steps":2071800,"ret":-32.63,"minutes":11.69},{"run":"PPO, preview","steps":2086200,"ret":-32.23,"minutes":11.76},{"run":"PPO, preview","steps":2100600,"ret":-32.52,"minutes":11.83},{"run":"PPO, preview","steps":2116800,"ret":-32.76,"minutes":11.9},{"run":"PPO, preview","steps":2131200,"ret":-32.78,"minutes":11.97},{"run":"PPO, preview","steps":2145600,"ret":-31.82,"minutes":12.04},{"run":"PPO, preview","steps":2161800,"ret":-31.94,"minutes":12.12},{"run":"PPO, preview","steps":2176200,"ret":-31.52,"minutes":12.2},{"run":"PPO, preview","steps":2190600,"ret":-30.78,"minutes":12.27},{"run":"PPO, preview","steps":2206800,"ret":-30.86,"minutes":12.35},{"run":"PPO, preview","steps":2221200,"ret":-31.02,"minutes":12.42},{"run":"PPO, preview","steps":2235600,"ret":-31.72,"minutes":12.49},{"run":"PPO, preview","steps":2251800,"ret":-32.74,"minutes":12.57},{"run":"PPO, preview","steps":2266200,"ret":-33.21,"minutes":12.64},{"run":"PPO, preview","steps":2280600,"ret":-32.92,"minutes":12.71},{"run":"PPO, preview","steps":2296800,"ret":-32.78,"minutes":12.78},{"run":"PPO, preview","steps":2311200,"ret":-33.43,"minutes":12.86},{"run":"PPO, preview","steps":2325600,"ret":-33.14,"minutes":12.93},{"run":"PPO, preview","steps":2341800,"ret":-33.57,"minutes":13.01},{"run":"PPO, preview","steps":2356200,"ret":-33.69,"minutes":13.08},{"run":"PPO, preview","steps":2370600,"ret":-33.68,"minutes":13.16},{"run":"PPO, preview","steps":2386800,"ret":-33.74,"minutes":13.24},{"run":"PPO, preview","steps":2401200,"ret":-34.35,"minutes":13.31},{"run":"PPO, preview","steps":2415600,"ret":-34.22,"minutes":13.38},{"run":"PPO, preview","steps":2431800,"ret":-35.3,"minutes":13.45},{"run":"PPO, preview","steps":2446200,"ret":-36.01,"minutes":13.52},{"run":"PPO, preview","steps":2460600,"ret":-35.72,"minutes":13.59},{"run":"PPO, preview","steps":2476800,"ret":-35.37,"minutes":13.67},{"run":"PPO, preview","steps":2491200,"ret":-35.81,"minutes":13.74},{"run":"PPO, preview","steps":2505600,"ret":-36.0,"minutes":13.81},{"run":"PPO, preview","steps":2521800,"ret":-35.89,"minutes":13.89},{"run":"PPO, preview","steps":2536200,"ret":-35.11,"minutes":13.97},{"run":"PPO, preview","steps":2550600,"ret":-34.25,"minutes":14.06},{"run":"PPO, preview","steps":2566800,"ret":-34.36,"minutes":14.15},{"run":"PPO, preview","steps":2581200,"ret":-33.92,"minutes":14.25},{"run":"PPO, preview","steps":2595600,"ret":-33.74,"minutes":14.33},{"run":"PPO, preview","steps":2611800,"ret":-34.11,"minutes":14.42},{"run":"PPO, preview","steps":2626200,"ret":-34.93,"minutes":14.5},{"run":"PPO, preview","steps":2640600,"ret":-34.71,"minutes":14.58},{"run":"PPO, preview","steps":2656800,"ret":-35.45,"minutes":14.67},{"run":"PPO, preview","steps":2671200,"ret":-36.7,"minutes":14.75},{"run":"PPO, preview","steps":2685600,"ret":-36.46,"minutes":14.83},{"run":"PPO, preview","steps":2701800,"ret":-35.76,"minutes":14.92},{"run":"PPO, preview","steps":2716200,"ret":-36.56,"minutes":15.0},{"run":"PPO, preview","steps":2730600,"ret":-36.67,"minutes":15.08},{"run":"PPO, preview","steps":2746800,"ret":-36.38,"minutes":15.17},{"run":"PPO, preview","steps":2761200,"ret":-36.69,"minutes":15.25},{"run":"PPO, preview","steps":2775600,"ret":-37.22,"minutes":15.32},{"run":"PPO, preview","steps":2791800,"ret":-37.03,"minutes":15.41},{"run":"PPO, preview","steps":2806200,"ret":-36.9,"minutes":15.48},{"run":"PPO, preview","steps":2820600,"ret":-36.56,"minutes":15.56},{"run":"PPO, preview","steps":2836800,"ret":-36.67,"minutes":15.66},{"run":"PPO, preview","steps":2851200,"ret":-37.79,"minutes":15.76},{"run":"PPO, preview","steps":2865600,"ret":-37.43,"minutes":15.87},{"run":"PPO, preview","steps":2881800,"ret":-37.1,"minutes":15.97},{"run":"PPO, preview","steps":2896200,"ret":-38.06,"minutes":16.06},{"run":"PPO, preview","steps":2910600,"ret":-36.55,"minutes":16.15},{"run":"PPO, preview","steps":2926800,"ret":-36.34,"minutes":16.3},{"run":"PPO, preview","steps":2941200,"ret":-36.76,"minutes":16.39},{"run":"PPO, preview","steps":2955600,"ret":-36.19,"minutes":16.47},{"run":"PPO, preview","steps":2971800,"ret":-34.84,"minutes":16.58},{"run":"PPO, preview","steps":2986200,"ret":-35.04,"minutes":16.68},{"run":"PPO, preview","steps":3000600,"ret":-35.38,"minutes":16.76},{"run":"SAC, no preview","steps":1200,"ret":-375.25,"minutes":0.47},{"run":"SAC, no preview","steps":3600,"ret":-438.43,"minutes":0.6},{"run":"SAC, no preview","steps":6000,"ret":-435.13,"minutes":1.36},{"run":"SAC, no preview","steps":8400,"ret":-423.81,"minutes":2.13},{"run":"SAC, no preview","steps":10800,"ret":-398.93,"minutes":2.29},{"run":"SAC, no preview","steps":13200,"ret":-374.81,"minutes":2.47},{"run":"SAC, no preview","steps":15600,"ret":-350.79,"minutes":2.66},{"run":"SAC, no preview","steps":18000,"ret":-333.52,"minutes":2.83},{"run":"SAC, no preview","steps":20400,"ret":-320.56,"minutes":3.0},{"run":"SAC, no preview","steps":22800,"ret":-305.37,"minutes":3.17},{"run":"SAC, no preview","steps":25200,"ret":-288.87,"minutes":3.35},{"run":"SAC, no preview","steps":27600,"ret":-274.23,"minutes":3.54},{"run":"SAC, no preview","steps":30000,"ret":-262.2,"minutes":3.72},{"run":"SAC, no preview","steps":32400,"ret":-249.72,"minutes":3.9},{"run":"SAC, no preview","steps":34800,"ret":-239.61,"minutes":4.07},{"run":"SAC, no preview","steps":37200,"ret":-228.87,"minutes":4.24},{"run":"SAC, no preview","steps":39600,"ret":-220.33,"minutes":4.41},{"run":"SAC, no preview","steps":42000,"ret":-212.69,"minutes":4.58},{"run":"SAC, no preview","steps":44400,"ret":-205.85,"minutes":4.74},{"run":"SAC, no preview","steps":46800,"ret":-198.88,"minutes":4.89},{"run":"SAC, no preview","steps":49200,"ret":-183.51,"minutes":5.05},{"run":"SAC, no preview","steps":51600,"ret":-161.97,"minutes":5.22},{"run":"SAC, no preview","steps":54000,"ret":-144.51,"minutes":5.38},{"run":"SAC, no preview","steps":56400,"ret":-128.92,"minutes":5.59},{"run":"SAC, no preview","steps":58800,"ret":-117.32,"minutes":6.05},{"run":"SAC, no preview","steps":61200,"ret":-107.92,"minutes":7.6},{"run":"SAC, no preview","steps":63600,"ret":-100.38,"minutes":8.77},{"run":"SAC, no preview","steps":66000,"ret":-93.34,"minutes":8.92},{"run":"SAC, no preview","steps":68400,"ret":-86.0,"minutes":9.08},{"run":"SAC, no preview","steps":70800,"ret":-80.65,"minutes":9.25},{"run":"SAC, no preview","steps":73200,"ret":-77.77,"minutes":9.42},{"run":"SAC, no preview","steps":75600,"ret":-75.11,"minutes":9.6},{"run":"SAC, no preview","steps":78000,"ret":-72.98,"minutes":9.79},{"run":"SAC, no preview","steps":80400,"ret":-72.45,"minutes":9.97},{"run":"SAC, no preview","steps":82800,"ret":-70.65,"minutes":10.15},{"run":"SAC, no preview","steps":85200,"ret":-70.78,"minutes":10.33},{"run":"SAC, no preview","steps":87600,"ret":-69.7,"minutes":10.52},{"run":"SAC, no preview","steps":90000,"ret":-69.01,"minutes":10.7},{"run":"SAC, no preview","steps":92400,"ret":-68.36,"minutes":10.9},{"run":"SAC, no preview","steps":94800,"ret":-69.93,"minutes":11.08},{"run":"SAC, no preview","steps":97200,"ret":-69.83,"minutes":11.25},{"run":"SAC, no preview","steps":99600,"ret":-69.45,"minutes":11.41},{"run":"SAC, no preview","steps":102000,"ret":-69.08,"minutes":11.59},{"run":"SAC, no preview","steps":104400,"ret":-69.41,"minutes":11.75},{"run":"SAC, no preview","steps":106800,"ret":-69.54,"minutes":11.9},{"run":"SAC, no preview","steps":109200,"ret":-69.93,"minutes":12.07},{"run":"SAC, no preview","steps":111600,"ret":-71.0,"minutes":12.23},{"run":"SAC, no preview","steps":114000,"ret":-70.85,"minutes":13.37},{"run":"SAC, no preview","steps":116400,"ret":-70.93,"minutes":14.91},{"run":"SAC, no preview","steps":118800,"ret":-71.41,"minutes":15.41},{"run":"SAC, no preview","steps":121200,"ret":-71.64,"minutes":15.59},{"run":"SAC, no preview","steps":123600,"ret":-72.34,"minutes":15.77},{"run":"SAC, no preview","steps":126000,"ret":-71.66,"minutes":15.96},{"run":"SAC, no preview","steps":128400,"ret":-70.75,"minutes":16.14},{"run":"SAC, no preview","steps":130800,"ret":-70.78,"minutes":16.34},{"run":"SAC, no preview","steps":133200,"ret":-70.23,"minutes":16.53},{"run":"SAC, no preview","steps":135600,"ret":-70.1,"minutes":16.71},{"run":"SAC, no preview","steps":138000,"ret":-70.15,"minutes":16.89},{"run":"SAC, no preview","steps":140400,"ret":-69.95,"minutes":17.07},{"run":"SAC, no preview","steps":142800,"ret":-68.18,"minutes":17.25},{"run":"SAC, no preview","steps":145200,"ret":-68.58,"minutes":17.43},{"run":"SAC, no preview","steps":147600,"ret":-68.0,"minutes":17.61},{"run":"SAC, no preview","steps":150000,"ret":-68.65,"minutes":17.77},{"run":"SAC, no preview","steps":152400,"ret":-68.98,"minutes":17.93},{"run":"SAC, no preview","steps":154800,"ret":-70.61,"minutes":18.09},{"run":"SAC, no preview","steps":157200,"ret":-70.31,"minutes":18.28},{"run":"SAC, no preview","steps":159600,"ret":-70.1,"minutes":18.44},{"run":"SAC, no preview","steps":162000,"ret":-70.66,"minutes":18.6},{"run":"SAC, no preview","steps":164400,"ret":-70.61,"minutes":18.76},{"run":"SAC, no preview","steps":166800,"ret":-70.23,"minutes":18.92},{"run":"SAC, no preview","steps":169200,"ret":-70.21,"minutes":19.57},{"run":"SAC, no preview","steps":171600,"ret":-70.7,"minutes":20.81},{"run":"SAC, no preview","steps":174000,"ret":-72.07,"minutes":22.1},{"run":"SAC, no preview","steps":176400,"ret":-71.8,"minutes":22.69},{"run":"SAC, no preview","steps":178800,"ret":-71.63,"minutes":22.82},{"run":"SAC, no preview","steps":181200,"ret":-72.53,"minutes":22.97},{"run":"SAC, no preview","steps":183600,"ret":-73.37,"minutes":23.11},{"run":"SAC, no preview","steps":186000,"ret":-73.11,"minutes":23.25},{"run":"SAC, no preview","steps":188400,"ret":-72.77,"minutes":23.41},{"run":"SAC, no preview","steps":190800,"ret":-73.52,"minutes":23.56},{"run":"SAC, no preview","steps":193200,"ret":-72.73,"minutes":23.71},{"run":"SAC, no preview","steps":195600,"ret":-73.75,"minutes":23.86},{"run":"SAC, no preview","steps":198000,"ret":-72.35,"minutes":24.01},{"run":"SAC, no preview","steps":200400,"ret":-71.12,"minutes":24.16},{"run":"SAC, no preview","steps":202800,"ret":-68.98,"minutes":24.32},{"run":"SAC, no preview","steps":205200,"ret":-68.91,"minutes":24.47},{"run":"SAC, no preview","steps":207600,"ret":-68.49,"minutes":24.62},{"run":"SAC, no preview","steps":210000,"ret":-67.8,"minutes":24.77},{"run":"SAC, no preview","steps":212400,"ret":-68.26,"minutes":24.93},{"run":"SAC, no preview","steps":214800,"ret":-67.87,"minutes":25.08},{"run":"SAC, no preview","steps":217200,"ret":-67.19,"minutes":25.23},{"run":"SAC, no preview","steps":219600,"ret":-66.99,"minutes":25.38},{"run":"SAC, no preview","steps":222000,"ret":-65.88,"minutes":25.53},{"run":"SAC, no preview","steps":224400,"ret":-66.33,"minutes":25.68},{"run":"SAC, no preview","steps":226800,"ret":-66.32,"minutes":25.82},{"run":"SAC, no preview","steps":229200,"ret":-65.79,"minutes":25.97},{"run":"SAC, no preview","steps":231600,"ret":-64.77,"minutes":26.13},{"run":"SAC, no preview","steps":234000,"ret":-65.0,"minutes":26.29},{"run":"SAC, no preview","steps":236400,"ret":-64.78,"minutes":26.44},{"run":"SAC, no preview","steps":238800,"ret":-64.56,"minutes":26.6},{"run":"SAC, no preview","steps":241200,"ret":-64.65,"minutes":26.75},{"run":"SAC, no preview","steps":243600,"ret":-64.53,"minutes":26.91},{"run":"SAC, no preview","steps":246000,"ret":-64.25,"minutes":27.06},{"run":"SAC, no preview","steps":248400,"ret":-64.09,"minutes":27.22},{"run":"SAC, no preview","steps":250800,"ret":-65.02,"minutes":27.38},{"run":"SAC, no preview","steps":253200,"ret":-65.44,"minutes":28.21},{"run":"SAC, no preview","steps":255600,"ret":-65.62,"minutes":29.58},{"run":"SAC, no preview","steps":258000,"ret":-65.05,"minutes":30.37},{"run":"SAC, no preview","steps":260400,"ret":-64.55,"minutes":30.5},{"run":"SAC, no preview","steps":262800,"ret":-64.62,"minutes":30.62},{"run":"SAC, no preview","steps":265200,"ret":-65.05,"minutes":30.73},{"run":"SAC, no preview","steps":267600,"ret":-64.2,"minutes":30.87},{"run":"SAC, no preview","steps":270000,"ret":-64.41,"minutes":31.01},{"run":"SAC, no preview","steps":272400,"ret":-64.28,"minutes":31.16},{"run":"SAC, no preview","steps":274800,"ret":-64.11,"minutes":31.31},{"run":"SAC, no preview","steps":277200,"ret":-63.44,"minutes":31.46},{"run":"SAC, no preview","steps":279600,"ret":-64.66,"minutes":31.62},{"run":"SAC, no preview","steps":282000,"ret":-64.92,"minutes":31.78},{"run":"SAC, no preview","steps":284400,"ret":-64.99,"minutes":31.94},{"run":"SAC, no preview","steps":286800,"ret":-64.57,"minutes":32.09},{"run":"SAC, no preview","steps":289200,"ret":-66.14,"minutes":32.25},{"run":"SAC, no preview","steps":291600,"ret":-66.19,"minutes":32.41},{"run":"SAC, no preview","steps":294000,"ret":-66.6,"minutes":32.57},{"run":"SAC, no preview","steps":296400,"ret":-67.18,"minutes":32.72},{"run":"SAC, no preview","steps":298800,"ret":-66.64,"minutes":32.89},{"run":"SAC, no preview","steps":301200,"ret":-66.17,"minutes":33.05},{"run":"SAC, no preview","steps":303600,"ret":-66.07,"minutes":33.2},{"run":"SAC, no preview","steps":306000,"ret":-66.16,"minutes":33.36},{"run":"SAC, no preview","steps":308400,"ret":-65.97,"minutes":33.51},{"run":"SAC, no preview","steps":310800,"ret":-65.62,"minutes":33.67},{"run":"SAC, no preview","steps":313200,"ret":-65.26,"minutes":34.31},{"run":"SAC, no preview","steps":315600,"ret":-65.15,"minutes":35.51},{"run":"SAC, no preview","steps":318000,"ret":-64.85,"minutes":36.27},{"run":"SAC, no preview","steps":320400,"ret":-64.6,"minutes":36.4},{"run":"SAC, no preview","steps":322800,"ret":-65.69,"minutes":36.54},{"run":"SAC, no preview","steps":325200,"ret":-65.89,"minutes":36.68},{"run":"SAC, no preview","steps":327600,"ret":-65.05,"minutes":36.84},{"run":"SAC, no preview","steps":330000,"ret":-64.67,"minutes":36.98},{"run":"SAC, no preview","steps":332400,"ret":-65.47,"minutes":37.12},{"run":"SAC, no preview","steps":334800,"ret":-65.06,"minutes":37.27},{"run":"SAC, no preview","steps":337200,"ret":-63.62,"minutes":37.42},{"run":"SAC, no preview","steps":339600,"ret":-63.08,"minutes":37.57},{"run":"SAC, no preview","steps":342000,"ret":-64.41,"minutes":37.72},{"run":"SAC, no preview","steps":344400,"ret":-63.98,"minutes":37.87},{"run":"SAC, no preview","steps":346800,"ret":-63.49,"minutes":38.03},{"run":"SAC, no preview","steps":349200,"ret":-63.42,"minutes":38.18},{"run":"SAC, no preview","steps":351600,"ret":-63.18,"minutes":38.34},{"run":"SAC, no preview","steps":354000,"ret":-63.2,"minutes":38.5},{"run":"SAC, no preview","steps":356400,"ret":-62.57,"minutes":38.64},{"run":"SAC, no preview","steps":358800,"ret":-64.4,"minutes":38.79},{"run":"SAC, no preview","steps":361200,"ret":-64.33,"minutes":38.95},{"run":"SAC, no preview","steps":363600,"ret":-63.92,"minutes":39.11},{"run":"SAC, no preview","steps":366000,"ret":-64.13,"minutes":39.25},{"run":"SAC, no preview","steps":368400,"ret":-64.11,"minutes":39.4},{"run":"SAC, no preview","steps":370800,"ret":-63.5,"minutes":39.56},{"run":"SAC, no preview","steps":373200,"ret":-64.14,"minutes":39.7},{"run":"SAC, no preview","steps":375600,"ret":-63.74,"minutes":39.85},{"run":"SAC, no preview","steps":378000,"ret":-63.19,"minutes":40.01},{"run":"SAC, no preview","steps":380400,"ret":-63.43,"minutes":40.17},{"run":"SAC, no preview","steps":382800,"ret":-64.35,"minutes":40.33},{"run":"SAC, no preview","steps":385200,"ret":-64.79,"minutes":40.49},{"run":"SAC, no preview","steps":387600,"ret":-65.69,"minutes":41.25},{"run":"SAC, no preview","steps":390000,"ret":-64.95,"minutes":42.59},{"run":"SAC, no preview","steps":392400,"ret":-64.41,"minutes":43.24},{"run":"SAC, no preview","steps":394800,"ret":-64.82,"minutes":43.39},{"run":"SAC, no preview","steps":397200,"ret":-65.04,"minutes":43.53},{"run":"SAC, no preview","steps":399600,"ret":-65.14,"minutes":43.67},{"run":"SAC, no preview","steps":402000,"ret":-65.5,"minutes":43.82},{"run":"SAC, no preview","steps":404400,"ret":-65.82,"minutes":43.96},{"run":"SAC, no preview","steps":406800,"ret":-64.86,"minutes":44.11},{"run":"SAC, no preview","steps":409200,"ret":-65.45,"minutes":44.25},{"run":"SAC, no preview","steps":411600,"ret":-65.95,"minutes":44.38},{"run":"SAC, no preview","steps":414000,"ret":-65.12,"minutes":44.52},{"run":"SAC, no preview","steps":416400,"ret":-65.39,"minutes":44.67},{"run":"SAC, no preview","steps":418800,"ret":-65.83,"minutes":44.82},{"run":"SAC, no preview","steps":421200,"ret":-65.2,"minutes":44.97},{"run":"SAC, no preview","steps":423600,"ret":-65.26,"minutes":45.11},{"run":"SAC, no preview","steps":426000,"ret":-65.18,"minutes":45.26},{"run":"SAC, no preview","steps":428400,"ret":-64.16,"minutes":45.4},{"run":"SAC, no preview","steps":430800,"ret":-63.26,"minutes":45.55},{"run":"SAC, no preview","steps":433200,"ret":-63.58,"minutes":45.7},{"run":"SAC, no preview","steps":435600,"ret":-62.8,"minutes":45.86},{"run":"SAC, no preview","steps":438000,"ret":-61.93,"minutes":46.01},{"run":"SAC, no preview","steps":440400,"ret":-62.41,"minutes":46.16},{"run":"SAC, no preview","steps":442800,"ret":-62.08,"minutes":46.31},{"run":"SAC, no preview","steps":445200,"ret":-61.9,"minutes":46.46},{"run":"SAC, no preview","steps":447600,"ret":-61.74,"minutes":46.6},{"run":"SAC, no preview","steps":450000,"ret":-62.59,"minutes":46.76},{"run":"SAC, no preview","steps":452400,"ret":-63.12,"minutes":46.91},{"run":"SAC, no preview","steps":454800,"ret":-63.34,"minutes":47.07},{"run":"SAC, no preview","steps":457200,"ret":-62.96,"minutes":47.21},{"run":"SAC, no preview","steps":459600,"ret":-63.85,"minutes":47.37},{"run":"SAC, no preview","steps":462000,"ret":-63.92,"minutes":47.5},{"run":"SAC, no preview","steps":464400,"ret":-65.0,"minutes":47.66},{"run":"SAC, no preview","steps":466800,"ret":-64.79,"minutes":47.81},{"run":"SAC, no preview","steps":469200,"ret":-65.47,"minutes":47.96},{"run":"SAC, no preview","steps":471600,"ret":-65.79,"minutes":48.1},{"run":"SAC, no preview","steps":474000,"ret":-66.44,"minutes":48.25},{"run":"SAC, no preview","steps":476400,"ret":-67.18,"minutes":48.4},{"run":"SAC, no preview","steps":478800,"ret":-68.0,"minutes":48.55},{"run":"SAC, no preview","steps":481200,"ret":-68.03,"minutes":48.7},{"run":"SAC, no preview","steps":483600,"ret":-68.19,"minutes":48.84},{"run":"SAC, no preview","steps":486000,"ret":-69.24,"minutes":48.99},{"run":"SAC, no preview","steps":488400,"ret":-68.98,"minutes":49.14},{"run":"SAC, no preview","steps":490800,"ret":-69.35,"minutes":49.29},{"run":"SAC, no preview","steps":493200,"ret":-70.12,"minutes":49.45},{"run":"SAC, no preview","steps":495600,"ret":-70.07,"minutes":49.59},{"run":"SAC, no preview","steps":498000,"ret":-69.47,"minutes":49.75},{"run":"SAC, preview","steps":1200,"ret":-375.25,"minutes":0.04},{"run":"SAC, preview","steps":2400,"ret":-401.6,"minutes":0.05},{"run":"SAC, preview","steps":4800,"ret":-406.89,"minutes":0.06},{"run":"SAC, preview","steps":7200,"ret":-415.89,"minutes":0.2},{"run":"SAC, preview","steps":9600,"ret":-397.95,"minutes":0.34},{"run":"SAC, preview","steps":10800,"ret":-377.53,"minutes":0.42},{"run":"SAC, preview","steps":13200,"ret":-362.34,"minutes":0.57},{"run":"SAC, preview","steps":15600,"ret":-342.12,"minutes":0.72},{"run":"SAC, preview","steps":18000,"ret":-326.58,"minutes":0.87},{"run":"SAC, preview","steps":19200,"ret":-310.75,"minutes":0.95},{"run":"SAC, preview","steps":21600,"ret":-294.57,"minutes":1.11},{"run":"SAC, preview","steps":24000,"ret":-279.39,"minutes":1.26},{"run":"SAC, preview","steps":26400,"ret":-266.61,"minutes":1.41},{"run":"SAC, preview","steps":27600,"ret":-254.23,"minutes":1.48},{"run":"SAC, preview","steps":30000,"ret":-243.48,"minutes":1.62},{"run":"SAC, preview","steps":32400,"ret":-233.27,"minutes":1.78},{"run":"SAC, preview","steps":34800,"ret":-224.37,"minutes":1.94},{"run":"SAC, preview","steps":36000,"ret":-216.07,"minutes":2.02},{"run":"SAC, preview","steps":38400,"ret":-209.19,"minutes":2.17},{"run":"SAC, preview","steps":40800,"ret":-202.26,"minutes":2.32},{"run":"SAC, preview","steps":43200,"ret":-186.57,"minutes":2.48},{"run":"SAC, preview","steps":44400,"ret":-168.42,"minutes":2.55},{"run":"SAC, preview","steps":46800,"ret":-150.96,"minutes":2.7},{"run":"SAC, preview","steps":49200,"ret":-131.24,"minutes":2.86},{"run":"SAC, preview","steps":51600,"ret":-118.03,"minutes":3.01},{"run":"SAC, preview","steps":52800,"ret":-107.09,"minutes":3.1},{"run":"SAC, preview","steps":55200,"ret":-96.99,"minutes":3.25},{"run":"SAC, preview","steps":57600,"ret":-90.43,"minutes":3.39},{"run":"SAC, preview","steps":60000,"ret":-83.1,"minutes":3.53},{"run":"SAC, preview","steps":61200,"ret":-77.55,"minutes":3.6},{"run":"SAC, preview","steps":63600,"ret":-73.47,"minutes":3.76},{"run":"SAC, preview","steps":66000,"ret":-70.84,"minutes":3.91},{"run":"SAC, preview","steps":68400,"ret":-67.88,"minutes":4.06},{"run":"SAC, preview","steps":69600,"ret":-65.8,"minutes":4.14},{"run":"SAC, preview","steps":72000,"ret":-63.85,"minutes":4.29},{"run":"SAC, preview","steps":74400,"ret":-63.04,"minutes":4.45},{"run":"SAC, preview","steps":76800,"ret":-62.11,"minutes":4.61},{"run":"SAC, preview","steps":78000,"ret":-61.21,"minutes":4.69},{"run":"SAC, preview","steps":80400,"ret":-59.54,"minutes":4.85},{"run":"SAC, preview","steps":82800,"ret":-58.79,"minutes":5.01},{"run":"SAC, preview","steps":85200,"ret":-58.87,"minutes":5.17},{"run":"SAC, preview","steps":86400,"ret":-58.34,"minutes":5.25},{"run":"SAC, preview","steps":88800,"ret":-57.99,"minutes":5.43},{"run":"SAC, preview","steps":91200,"ret":-58.21,"minutes":5.59},{"run":"SAC, preview","steps":93600,"ret":-57.89,"minutes":5.75},{"run":"SAC, preview","steps":94800,"ret":-57.97,"minutes":5.83},{"run":"SAC, preview","steps":97200,"ret":-57.0,"minutes":6.51},{"run":"SAC, preview","steps":99600,"ret":-55.83,"minutes":7.8},{"run":"SAC, preview","steps":102000,"ret":-56.2,"minutes":8.89},{"run":"SAC, preview","steps":103200,"ret":-55.95,"minutes":8.96},{"run":"SAC, preview","steps":105600,"ret":-56.36,"minutes":9.11},{"run":"SAC, preview","steps":108000,"ret":-56.27,"minutes":9.25},{"run":"SAC, preview","steps":110400,"ret":-56.6,"minutes":9.39},{"run":"SAC, preview","steps":111600,"ret":-56.36,"minutes":9.47},{"run":"SAC, preview","steps":114000,"ret":-56.42,"minutes":9.61},{"run":"SAC, preview","steps":116400,"ret":-56.18,"minutes":9.77},{"run":"SAC, preview","steps":118800,"ret":-56.24,"minutes":9.94},{"run":"SAC, preview","steps":120000,"ret":-56.39,"minutes":10.03},{"run":"SAC, preview","steps":122400,"ret":-57.04,"minutes":10.18},{"run":"SAC, preview","steps":124800,"ret":-57.68,"minutes":10.34},{"run":"SAC, preview","steps":127200,"ret":-57.79,"minutes":10.5},{"run":"SAC, preview","steps":128400,"ret":-57.75,"minutes":10.57},{"run":"SAC, preview","steps":130800,"ret":-57.28,"minutes":10.74},{"run":"SAC, preview","steps":133200,"ret":-57.27,"minutes":10.91},{"run":"SAC, preview","steps":135600,"ret":-57.44,"minutes":11.07},{"run":"SAC, preview","steps":136800,"ret":-57.48,"minutes":11.15},{"run":"SAC, preview","steps":139200,"ret":-57.94,"minutes":11.31},{"run":"SAC, preview","steps":141600,"ret":-58.42,"minutes":11.48},{"run":"SAC, preview","steps":144000,"ret":-58.13,"minutes":11.64},{"run":"SAC, preview","steps":145200,"ret":-58.09,"minutes":11.72},{"run":"SAC, preview","steps":147600,"ret":-57.84,"minutes":11.88},{"run":"SAC, preview","steps":150000,"ret":-57.74,"minutes":12.04},{"run":"SAC, preview","steps":152400,"ret":-58.17,"minutes":12.24},{"run":"SAC, preview","steps":153600,"ret":-58.86,"minutes":12.34},{"run":"SAC, preview","steps":156000,"ret":-59.07,"minutes":12.55},{"run":"SAC, preview","steps":158400,"ret":-58.94,"minutes":13.53},{"run":"SAC, preview","steps":160800,"ret":-58.12,"minutes":14.84},{"run":"SAC, preview","steps":162000,"ret":-58.38,"minutes":15.45},{"run":"SAC, preview","steps":164400,"ret":-57.8,"minutes":16.76},{"run":"SAC, preview","steps":166800,"ret":-57.03,"minutes":18.05},{"run":"SAC, preview","steps":169200,"ret":-56.86,"minutes":18.23},{"run":"SAC, preview","steps":170400,"ret":-56.7,"minutes":18.3},{"run":"SAC, preview","steps":172800,"ret":-57.39,"minutes":18.44},{"run":"SAC, preview","steps":175200,"ret":-57.28,"minutes":18.57},{"run":"SAC, preview","steps":177600,"ret":-57.05,"minutes":18.72},{"run":"SAC, preview","steps":178800,"ret":-57.22,"minutes":18.8},{"run":"SAC, preview","steps":181200,"ret":-56.99,"minutes":18.94},{"run":"SAC, preview","steps":183600,"ret":-56.76,"minutes":19.09},{"run":"SAC, preview","steps":186000,"ret":-56.58,"minutes":19.24},{"run":"SAC, preview","steps":187200,"ret":-56.59,"minutes":19.32},{"run":"SAC, preview","steps":189600,"ret":-56.55,"minutes":19.46},{"run":"SAC, preview","steps":192000,"ret":-56.47,"minutes":19.61},{"run":"SAC, preview","steps":194400,"ret":-55.87,"minutes":19.77},{"run":"SAC, preview","steps":195600,"ret":-55.96,"minutes":19.84},{"run":"SAC, preview","steps":198000,"ret":-55.6,"minutes":20.0},{"run":"SAC, preview","steps":200400,"ret":-55.61,"minutes":20.16},{"run":"SAC, preview","steps":202800,"ret":-55.91,"minutes":20.32},{"run":"SAC, preview","steps":204000,"ret":-55.85,"minutes":20.4},{"run":"SAC, preview","steps":206400,"ret":-56.04,"minutes":20.56},{"run":"SAC, preview","steps":208800,"ret":-55.95,"minutes":20.72},{"run":"SAC, preview","steps":211200,"ret":-56.18,"minutes":20.88},{"run":"SAC, preview","steps":212400,"ret":-56.98,"minutes":20.96},{"run":"SAC, preview","steps":214800,"ret":-56.77,"minutes":21.12},{"run":"SAC, preview","steps":217200,"ret":-57.95,"minutes":21.28},{"run":"SAC, preview","steps":219600,"ret":-58.53,"minutes":21.44},{"run":"SAC, preview","steps":220800,"ret":-58.12,"minutes":21.51},{"run":"SAC, preview","steps":223200,"ret":-57.75,"minutes":21.66},{"run":"SAC, preview","steps":225600,"ret":-57.74,"minutes":21.82},{"run":"SAC, preview","steps":228000,"ret":-57.78,"minutes":21.98},{"run":"SAC, preview","steps":229200,"ret":-58.0,"minutes":22.06},{"run":"SAC, preview","steps":231600,"ret":-58.17,"minutes":22.22},{"run":"SAC, preview","steps":234000,"ret":-58.28,"minutes":22.37},{"run":"SAC, preview","steps":236400,"ret":-58.03,"minutes":22.52},{"run":"SAC, preview","steps":237600,"ret":-57.97,"minutes":22.59},{"run":"SAC, preview","steps":240000,"ret":-58.77,"minutes":22.75},{"run":"SAC, preview","steps":242400,"ret":-59.14,"minutes":22.91},{"run":"SAC, preview","steps":244800,"ret":-59.59,"minutes":23.07},{"run":"SAC, preview","steps":246000,"ret":-59.19,"minutes":23.15},{"run":"SAC, preview","steps":248400,"ret":-59.54,"minutes":23.3},{"run":"SAC, preview","steps":250800,"ret":-59.92,"minutes":23.46},{"run":"SAC, preview","steps":253200,"ret":-60.1,"minutes":23.61},{"run":"SAC, preview","steps":254400,"ret":-60.09,"minutes":23.69},{"run":"SAC, preview","steps":256800,"ret":-59.69,"minutes":23.84},{"run":"SAC, preview","steps":259200,"ret":-58.77,"minutes":24.0},{"run":"SAC, preview","steps":261600,"ret":-58.33,"minutes":24.14},{"run":"SAC, preview","steps":262800,"ret":-58.55,"minutes":24.22},{"run":"SAC, preview","steps":265200,"ret":-59.12,"minutes":24.38},{"run":"SAC, preview","steps":267600,"ret":-59.27,"minutes":24.53},{"run":"SAC, preview","steps":270000,"ret":-59.61,"minutes":24.68},{"run":"SAC, preview","steps":271200,"ret":-59.49,"minutes":24.76},{"run":"SAC, preview","steps":273600,"ret":-59.45,"minutes":24.91},{"run":"SAC, preview","steps":276000,"ret":-59.48,"minutes":25.06},{"run":"SAC, preview","steps":278400,"ret":-59.66,"minutes":25.21},{"run":"SAC, preview","steps":279600,"ret":-59.4,"minutes":25.3},{"run":"SAC, preview","steps":282000,"ret":-58.79,"minutes":25.46},{"run":"SAC, preview","steps":284400,"ret":-58.25,"minutes":25.62},{"run":"SAC, preview","steps":286800,"ret":-57.91,"minutes":25.96},{"run":"SAC, preview","steps":288000,"ret":-57.7,"minutes":26.55},{"run":"SAC, preview","steps":290400,"ret":-57.38,"minutes":27.85},{"run":"SAC, preview","steps":292800,"ret":-57.98,"minutes":29.29},{"run":"SAC, preview","steps":295200,"ret":-57.33,"minutes":30.17},{"run":"SAC, preview","steps":296400,"ret":-56.87,"minutes":30.25},{"run":"SAC, preview","steps":298800,"ret":-56.69,"minutes":30.43},{"run":"SAC, preview","steps":301200,"ret":-56.72,"minutes":30.64},{"run":"SAC, preview","steps":303600,"ret":-56.87,"minutes":30.79},{"run":"SAC, preview","steps":304800,"ret":-57.06,"minutes":30.86},{"run":"SAC, preview","steps":307200,"ret":-56.72,"minutes":31.01},{"run":"SAC, preview","steps":309600,"ret":-57.48,"minutes":31.17},{"run":"SAC, preview","steps":312000,"ret":-57.27,"minutes":31.33},{"run":"SAC, preview","steps":313200,"ret":-57.2,"minutes":31.41},{"run":"SAC, preview","steps":315600,"ret":-57.61,"minutes":31.56},{"run":"SAC, preview","steps":318000,"ret":-57.96,"minutes":31.73},{"run":"SAC, preview","steps":320400,"ret":-57.98,"minutes":31.89},{"run":"SAC, preview","steps":321600,"ret":-58.06,"minutes":31.96},{"run":"SAC, preview","steps":324000,"ret":-58.01,"minutes":32.12},{"run":"SAC, preview","steps":326400,"ret":-58.24,"minutes":32.29},{"run":"SAC, preview","steps":328800,"ret":-58.92,"minutes":32.48},{"run":"SAC, preview","steps":330000,"ret":-58.9,"minutes":32.56},{"run":"SAC, preview","steps":332400,"ret":-58.66,"minutes":32.71},{"run":"SAC, preview","steps":334800,"ret":-57.72,"minutes":32.87},{"run":"SAC, preview","steps":337200,"ret":-57.89,"minutes":33.04},{"run":"SAC, preview","steps":338400,"ret":-57.84,"minutes":33.13},{"run":"SAC, preview","steps":340800,"ret":-58.32,"minutes":33.3},{"run":"SAC, preview","steps":343200,"ret":-58.23,"minutes":33.5},{"run":"SAC, preview","steps":345600,"ret":-57.87,"minutes":33.68},{"run":"SAC, preview","steps":346800,"ret":-57.88,"minutes":33.77},{"run":"SAC, preview","steps":349200,"ret":-58.1,"minutes":33.96},{"run":"SAC, preview","steps":351600,"ret":-57.5,"minutes":34.15},{"run":"SAC, preview","steps":354000,"ret":-57.38,"minutes":34.31},{"run":"SAC, preview","steps":355200,"ret":-57.81,"minutes":34.38},{"run":"SAC, preview","steps":357600,"ret":-57.36,"minutes":34.55},{"run":"SAC, preview","steps":360000,"ret":-57.13,"minutes":34.71},{"run":"SAC, preview","steps":362400,"ret":-57.15,"minutes":34.87},{"run":"SAC, preview","steps":363600,"ret":-57.38,"minutes":34.95},{"run":"SAC, preview","steps":366000,"ret":-57.43,"minutes":35.12},{"run":"SAC, preview","steps":368400,"ret":-57.39,"minutes":35.29},{"run":"SAC, preview","steps":370800,"ret":-56.85,"minutes":35.46},{"run":"SAC, preview","steps":372000,"ret":-57.16,"minutes":35.54},{"run":"SAC, preview","steps":374400,"ret":-57.11,"minutes":35.71},{"run":"SAC, preview","steps":376800,"ret":-57.28,"minutes":36.55},{"run":"SAC, preview","steps":379200,"ret":-56.97,"minutes":38.06},{"run":"SAC, preview","steps":380400,"ret":-56.82,"minutes":38.92},{"run":"SAC, preview","steps":382800,"ret":-56.75,"minutes":40.64},{"run":"SAC, preview","steps":385200,"ret":-56.95,"minutes":40.93},{"run":"SAC, preview","steps":387600,"ret":-57.77,"minutes":41.14},{"run":"SAC, preview","steps":388800,"ret":-57.74,"minutes":41.24},{"run":"SAC, preview","steps":391200,"ret":-58.03,"minutes":41.46},{"run":"SAC, preview","steps":393600,"ret":-58.3,"minutes":41.72},{"run":"SAC, preview","steps":396000,"ret":-58.27,"minutes":42.02},{"run":"SAC, preview","steps":397200,"ret":-58.17,"minutes":42.18},{"run":"SAC, preview","steps":399600,"ret":-58.27,"minutes":42.5},{"run":"SAC, preview","steps":402000,"ret":-57.74,"minutes":42.74},{"run":"SAC, preview","steps":404400,"ret":-57.52,"minutes":42.95},{"run":"SAC, preview","steps":405600,"ret":-57.08,"minutes":43.61},{"run":"SAC, preview","steps":408000,"ret":-56.79,"minutes":45.41},{"run":"SAC, preview","steps":410400,"ret":-56.86,"minutes":46.62},{"run":"SAC, preview","steps":412800,"ret":-56.64,"minutes":46.79},{"run":"SAC, preview","steps":414000,"ret":-57.27,"minutes":46.87},{"run":"SAC, preview","steps":416400,"ret":-57.59,"minutes":47.05},{"run":"SAC, preview","steps":418800,"ret":-57.52,"minutes":47.23},{"run":"SAC, preview","steps":421200,"ret":-57.53,"minutes":47.42},{"run":"SAC, preview","steps":422400,"ret":-57.73,"minutes":47.51},{"run":"SAC, preview","steps":424800,"ret":-57.8,"minutes":47.71},{"run":"SAC, preview","steps":427200,"ret":-57.62,"minutes":47.91},{"run":"SAC, preview","steps":429600,"ret":-57.13,"minutes":48.11},{"run":"SAC, preview","steps":430800,"ret":-56.72,"minutes":48.21},{"run":"SAC, preview","steps":433200,"ret":-56.17,"minutes":48.43},{"run":"SAC, preview","steps":435600,"ret":-56.1,"minutes":48.64},{"run":"SAC, preview","steps":438000,"ret":-56.2,"minutes":48.85},{"run":"SAC, preview","steps":439200,"ret":-56.01,"minutes":48.96},{"run":"SAC, preview","steps":441600,"ret":-56.28,"minutes":49.17},{"run":"SAC, preview","steps":444000,"ret":-56.41,"minutes":50.34},{"run":"SAC, preview","steps":446400,"ret":-57.15,"minutes":52.26},{"run":"SAC, preview","steps":447600,"ret":-57.27,"minutes":53.26}]
   },
   "mark": {
    "type": "line",
    "strokeWidth": 2
   },
   "encoding": {
    "x": {
     "field": "steps",
     "type": "quantitative",
     "scale": {
      "type": "log"
     },
     "title": "environment steps (log)"
    },
    "y": {
     "field": "ret",
     "type": "quantitative",
     "title": "episode return",
     "scale": {
      "domain": [
       -400,
       0
      ]
     }
    },
    "color": {
     "field": "run",
     "type": "nominal",
     "legend": {
      "title": null
     },
     "scale": {
      "domain": [
       "PPO, no preview",
       "PPO, preview",
       "SAC, no preview",
       "SAC, preview"
      ],
      "range": [
       "var(--viz-s1)",
       "var(--viz-s2)",
       "var(--viz-s3)",
       "var(--viz-s4)"
      ]
     }
    },
    "tooltip": [
     {
      "field": "run"
     },
     {
      "field": "steps"
     },
     {
      "field": "ret",
      "title": "return"
     },
     {
      "field": "minutes",
      "title": "wall time (min)"
     }
    ]
   }
  },
  {
   "data": {
    "values": [{"y":-130.1}]
   },
   "mark": {
    "type": "rule",
    "strokeDash": [
     5,
     4
    ],
    "color": "var(--viz-ink-2)",
    "strokeWidth": 1.5
   },
   "encoding": {
    "y": {
     "field": "y",
     "type": "quantitative"
    }
   }
  }
 ]
}
```

Training returns are those of the stochastic policy, which pays the valve-travel penalty for its exploration noise. SAC's learning curve plateaus near −58 (with preview) and −65 (without) after about 150 k steps, while its deterministic policy scores −25 to −29 on the held-out episodes. Most of the gap is the cost of exploration noise. PPO's curves keep improving to the end of their 3 M steps, so a longer run might still help.

## What this does and does not show

- **It shows the pipeline works end to end.** It has:
    - an environment with DLR's reward and constraints at the challenge's 20 Hz;
    - the challenge's seven test cases with faults;
    - a classical baseline with feedforward, decoupling, anti-windup and a bandwidth design;
    - two RL algorithms trained on a CPU, with their networks exported;
    - a browser port checked against Python to $10^{-6}$ for the engine, the PI, the faults and the test cases.
- **It shows which questions are worth asking on the real simulator:**
    - how much anticipation is worth when preview is not allowed;
    - whether a learned controller needs integral action, or a residual on top of a PI, to survive model error;
    - how a controller should behave when a valve sticks;
    - how much training a 20 Hz agent needs.
- **It does not show how any of these controllers would do on LUMEN.** The surrogate matches DLR's model at one operating point to within about 13 % in static gain and 25 % in settling time. Its envelope is narrower, its noise is gentler (σ 0.005 on $R_{OF}$ against about 0.1 on the real engine), and its dynamics have fewer states. Its faults are this site's choices. One seed per learner at 20 Hz is not a result either.
- **Next, on the real simulator** (20 Hz, no preview):
    - five seeds per learner, with budgets long enough for SAC;
    - a residual agent on top of PI ([open question 3](06-open-questions.md#3-residual-rl-on-a-decoupled-pi-baseline-with-a-bounded-envelope));
    - anticipation without preview ([open question 5](06-open-questions.md#5-anticipation-without-preview-delays-and-action-design-for-the-22-task));
    - fault-aware control for test cases 6–7 ([open question 4](06-open-questions.md#4-fault-tolerant-control-with-latent-mode-inference-test-cases-67)).

Reproduce: `bash scripts/reproduce.sh` re-evaluates the stored networks and checks them against `data/results/summary.json`; `bash scripts/reproduce.sh --full` retrains everything.
