# Draft email to DLR (for Leander to send; not sent)

**To:** Kai Dresia (kai.dresia@dlr.de), Jonas Dauer (jonas.dauer@dlr.de), Vincent Bareiß (third contact on the bootcamp slide)
**Subject:** Access to the LUMEN Control Challenge simulator

Why these three: they are the contacts on the "LUMEN Control Challenge" slide at the RL Bootcamp 2026. They are also authors of the benchmark: Kai Dresia presented it at RL4AA'25, Vincent Bareiß is first author of the benchmark design, and Jonas Dauer is a co-author of both.

---

Dear Kai, Jonas and Vincent,

I was at the RL Bootcamp in Salzburg on 17 September and saw your pitch of the LUMEN Control Challenge; I presented the air-traffic challenge in the session right after it. You invited people to get in touch about access. Could I use the generalised LUMEN simulator, the evaluation service and the fine-tuning dataset, either now under whatever terms suit you or as soon as the public release is ready?

I work on reinforcement learning for physical control systems, so your problem is close to home.

What I'd like to do first is a careful set of baselines on the 2×2 task: a decoupled PI controller, PPO and SAC, and a small model-based agent, each with and without reference preview. I would share the results with you before publishing anything, and report any rough edges I find in the benchmark. Longer term I'm interested in the domain-adaptation and fault test cases, in particular how far the fine-tuning data can close the sim-to-real gap.

I'm happy to sign whatever licence or agreement the release needs. Four quick questions, if you have a moment:

1. Is there a rough date for the public release, and will results and code built on the simulator be publishable?
2. What are the control rate and episode length, and may the observation include future reference values?
3. Does the fine-tuning dataset contain real hot-fire runs, and does it include valve command/position pairs?
4. Does the simulator need a local EcosimPro licence, and roughly how fast does it run per step on a CPU?

Thanks, and congratulations on the hardware demonstration.

Best regards,
Leander Grech
