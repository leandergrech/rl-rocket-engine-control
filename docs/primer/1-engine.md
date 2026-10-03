---
icon: re/engine
---

# :re-engine: The engine as a control system

!!! abstract "The question"

    What are the two numbers the controller must hold, what do they mean physically, and why can't one valve set one number?

<div class="re-widget" data-widget="stand" data-title="Interactive: LUMEN on the P8.3 test stand (move the valves)"></div>

## Thrust is chamber pressure

A rocket engine burns an oxidiser and a fuel in a chamber and expands the hot gas through a converging–diverging nozzle. Thrust is momentum flux plus a pressure term at the nozzle exit ([Dresia thesis eq. 2.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=27)):

$$
F = \dot m_T\,u_e + (p_e - p_{\mathrm{amb}})\,A_e ,
$$

with $\dot m_T = \dot m_{\mathrm{ox}} + \dot m_{\mathrm{fuel}}$ the total propellant flow, and $u_e$, $p_e$, $A_e$ the exit velocity, pressure and area. For an ideal isentropic nozzle this becomes ([eq. 2.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=28))

$$
F = A_t\,p_{cc}\,\sqrt{\frac{2\kappa^2}{\kappa-1}\Big(\frac{2}{\kappa+1}\Big)^{\frac{\kappa+1}{\kappa-1}}\Big[1-\Big(\frac{p_e}{p_{cc}}\Big)^{\frac{\kappa-1}{\kappa}}\Big]} + (p_e-p_{\mathrm{amb}})A_e ,
$$

where $A_t$ is the nozzle throat area, $p_{cc}$ the combustion chamber pressure and $\kappa$ the ratio of specific heats. The throat is fixed and $\kappa$ depends only weakly on mixture ratio, so **thrust is proportional to $p_{cc}$**. That is why "thrust control becomes equivalent to $p_{cc}$ control" ([p. 11](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=28)). It is also why the benchmark tracks $p_{cc}$ rather than thrust: the test bench measures pressure directly and precisely.

Chamber pressure in turn follows the propellant flow. The classical small-signal model from Lorenzo and Musgrave, quoted in [thesis eq. 2.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=25), is

$$
\frac{p_{cc}(s)}{\dot m_T(s)} = \frac{c^*}{A_t\,g}\;\frac{e^{-\sigma s}}{\tau s + 1},
$$

a first-order lag with dead time:

- $c^*$, the *characteristic velocity*, is a property of the propellant pair and the mixture ratio;
- $\sigma$ is the combustion delay;
- $\tau$ is the chamber filling time.

Both $\sigma$ and $\tau$ are short compared with everything else in a pump-fed engine. For control purposes, then: **more total flow means more pressure, almost immediately.** The hard part is getting the flow, which in LUMEN comes from turbopumps ([The expander-bleed cycle](2-cycle.md)).

## Mixture ratio is temperature {#mixture-ratio-is-temperature}

The second controlled variable is the oxidiser-to-fuel mass ratio ([eq. 2.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=25)):

$$
R_{OF} = \frac{\dot m_{\mathrm{ox}}}{\dot m_{\mathrm{fuel}}} .
$$

For methane, complete combustion $\mathrm{CH_4 + 2\,O_2 \to CO_2 + 2\,H_2O}$ needs $2 \times 32 = 64$ g of oxygen per 16 g of methane, a stoichiometric $R_{OF}$ of 4.0. The flame is hottest near stoichiometric, so engines run fuel-rich: "operating conditions close to the stoichiometric mixture ratio needs to be avoided" to protect the chamber wall ([thesis p. 11](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=28)). LUMEN runs at $R_{OF}$ 3.0–3.8, nominally 3.4 ([Table 4.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=75)).

An upward excursion is the fastest way to damage hardware. That is why classical designs make the mixture-ratio loop the fast loop and the pressure loop the slow one ([Lorenzo & Musgrave 1992, p. 3](https://ntrs.nasa.gov/citations/19920004056); [thesis p. 9](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=26)).

## Two valves, two outputs, no clean pairing

The coupling is built in. $p_{cc}$ depends on the *sum* of the two flows and $R_{OF}$ on their *ratio*, so any single valve that changes one flow moves both outputs ([thesis p. 9](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=26)). In LUMEN the two actions of the benchmark are the turbine valves:

- **TFV** feeds the fuel turbine, which drives the fuel pump;
- **TOV** feeds the oxidiser turbine, which drives the LOX pump.

DLR's static gains for a 10 % step at 40 bar ([thesis Table 4.6](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=89)) make the coupling concrete:

| +0.1 opening of | $\Delta p_{cc}$ | $\Delta R_{OF}$ |
|---|---|---|
| TFV (fuel side) | +3.7 bar | −0.6 |
| TOV (oxidiser side) | +2.7 bar | +0.9 |

Both valves raise pressure; they push mixture ratio in opposite directions. Holding pressure while raising $R_{OF}$ therefore means opening TOV *and closing* TFV. The plane below shows this on the surrogate. Lines of constant pressure and of constant mixture ratio cross at an angle, and neither family runs parallel to a valve axis.

<div class="re-widget" data-widget="valve-plane" data-title="Interactive: the valve plane (drag the point)"></div>

The usual pairing is TFV with pressure and TOV with mixture ratio. A control engineer can quantify how good it is with the relative gain array (RGA). From the gain table above, $\lambda_{11} = g_{11}g_{22}/(g_{11}g_{22} - g_{12}g_{21}) = 3.33/(3.33 + 1.62) \approx 0.67$. That is positive and below 1: the pairing is right, but each loop sees the other one move its plant by about a third. This is the reason the [PI baseline](8-lab.md?preset=pi) uses a static decoupler.

!!! tip "What it means for the agent"

    - **The action space is two continuous valve openings**, and the outputs are a coupled, nonlinear function of both. There is no axis-aligned shortcut.
    - **The two outputs are not equally dangerous.** A pressure error costs thrust; a mixture-ratio error can burn the chamber. A good reward or evaluation treats them differently ([From physics to reward](7-reward.md)).
    - **The plant is not a lookup table.** The valve plane above is the steady state. How the engine gets there takes from half a second to 20 seconds ([Fast chamber, slow heat](4-time-scales.md)).

??? question "Check yourself (click to open)"

    1. Why does the benchmark track chamber pressure and not thrust? *Thrust is proportional to $p_{cc}$ for a fixed throat, and the bench measures pressure directly and precisely.*
    2. You want +2 bar at constant mixture ratio. Which valves move, and which way? *Both open, TOV relatively more: TFV alone would lower $R_{OF}$. In the valve plane, follow a mixture-ratio line upward.*
    3. Why is a stoichiometric mixture ratio avoided? *The flame is hottest there; the wall would overheat. LUMEN runs fuel-rich at 3.0–3.8 (stoichiometric is 4.0).*
