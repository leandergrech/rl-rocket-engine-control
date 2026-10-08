---
icon: re/valve
---

# :re-valve: Valves are the actuators

!!! abstract "The question"

    What happens between the controller's command and the flow, and why did DLR's first hardware test of an RL controller fail there?

## Flow coefficient and characteristic

Every action in the benchmark is a valve command. A valve is characterised by two things ([thesis p. 21](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=38)):

- its flow coefficient $k_v$, the water flow in m³/h at 1 bar pressure drop;
- a characteristic curve $k_v(\text{position})$, either linear or equal-percentage (opening progressively).

Guidelines put a control valve at 35–75 % of the system pressure drop when fully open. Outside that range the loop gain varies sharply over the stroke, which an RL policy experiences as state-dependent action sensitivity.

LUMEN's hot-gas valves pass a choked or nearly choked flow of warm methane. For a choked orifice the mass flow is proportional to the upstream pressure and to the inverse square root of the upstream temperature:

$$
\dot m \approx k\,A(x)\,\frac{p_0}{\sqrt{T_0}} .
$$

With $A(x) \propto x^{0.8}$ this law fits DLR's three TFV component tests ([thesis Table 4.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=85)) to within 2 % (my fit: $k$ = 0.52, 0.52 and 0.50 at 64, 80 and 98 % opening). This is the valve law the surrogate uses. The $1/\sqrt{T_0}$ matters: the same opening passes *more* mass when the methane is colder, one more path from the heat budget into the action's effect.

## Dead time, speed and no overshoot

LUMEN's valves are DLR-built and servo-motor driven:

- "opening speeds of less than 0.5 seconds" ([Traudt et al. 2022, p. 8](https://elib.dlr.de/191316/1/Traudt%20IAC-22,C4,1,3,x73654.pdf#page=8));
- "high positioning accuracy, no overshoot … and no hysteresis" ([thesis p. 56](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=73)).

Between a command and the valve's motion there is a dead time: communication, the drive's own loop. Then the valve moves at a limited speed and acceleration. Try it on the surrogate's valve model:

<div class="re-widget" data-widget="valve" data-title="Interactive: one valve step"></div>

## Where sim-to-real broke

Valve dynamics are where sim-to-real has broken twice.

1. The first hot-fire test of an RL controller oscillated, "likely attributable to an inaccurate model of the valve dynamics" ([Dauer et al. 2025, p. 7](https://www.eucass.eu/doi/EUCASS2025-533.pdf#page=7)). The thesis appendix calls the run "unstable due to a modeling error in the valve transfer function" ([PDF p. 166](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=166)).
2. DLR then fitted a semi-empirical valve model and randomised the valve during training ([Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)):
    - $k_v$ by ±5 %;
    - maximum acceleration by ±6 % and maximum velocity by ±8 %;
    - dead time over 0.03–0.08 s.

Why would a valve model error destabilise a controller that worked in simulation? A policy that has learned to act aggressively, overdriving the valves to speed up transients, effectively has a high loop gain. Extra delay or a slower actuator adds phase lag at exactly the frequencies where that gain is high. The same mechanism makes any fast PI loop oscillate when its actuator is slower than modelled. In the Lab, raise the [valve dead time](8-lab.md?preset=pi&delay=0.15) under the PI controller and watch the mixture-ratio loop.

!!! tip "What it means for the agent"

    - **The action is a set point for a servo, not a flow.** The flow follows after a dead time, a rate-limited stroke and the plant's own dynamics.
    - **Observe what the valve did, not only what you asked.** DLR's observation contains both the commands $U$ and the measured positions $Y_{\mathrm{valves}}$ ([thesis eq. 5.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=97)); so does this repo's environment.
    - **Randomise the actuator first.** Of everything in the plant, the valve model is the part that has already caused a hardware failure.
    - **Penalise valve travel.** Chattering wears valves and couples into the feed system. DLR reports the summed command changes as a metric ([thesis p. 97](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=114)); this repo's reward subtracts 0.5 × the summed absolute change of both commands each step.

??? question "Check yourself (click to open)"

    1. A valve has 50 ms dead time and the controller runs at 10 Hz. When does the controller first see the effect of its command? *Not before the next sample, and only partly: the valve starts moving after 50 ms and the sensors add their own delay ([Sensors, delays and noise](6-sensors.md)).*
    2. Why does the same TFV opening pass more methane when the methane is colder? *Choked mass flow scales with $p_0/\sqrt{T_0}$.*
    3. What do you randomise first when training for hardware? *Valve dead time, speed and flow coefficient, as DLR did after the first, unstable test.*
