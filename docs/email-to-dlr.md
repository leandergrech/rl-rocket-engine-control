# Draft email to DLR (for Leander to send; not sent)

**To:** kai.dresia@dlr.de
**Subject:** Access to the LUMEN Control Challenge simulator

---

Dear Kai,

I saw the LUMEN Control Challenge pitch at the RL Bootcamp in Salzburg on 17 September. I was the one presenting the air-traffic challenge right after it. As the pitch invited, I'm writing to ask whether I could get access to the generalised LUMEN simulator, the evaluation service and the fine-tuning dataset before the public release.

A little about me: I work on reinforcement learning for physical control systems. I'm lead author on the RL-based bent-crystal alignment work at CERN (TWOCRYST/AICRYSCON) in the RL4AA community, I lead the single-agent RL work in the SESAR project TADA on air traffic control, and I teach a Master's course in AI/ML. Your problem has the structure I know best: a calibrated but imperfect simulator, expensive real steps and noisy sensors.

What I'd like to do first is a careful set of baselines on the 2×2 task. That means a decoupled PI controller, PPO and SAC, and a small model-based agent, with and without reference preview. I would share the results with you before publishing anything. Longer term I'm interested in the domain-adaptation and fault test cases, in particular how far the fine-tuning data can close the sim-to-real gap.

I'm happy to sign whatever licence or agreement the release needs. Four quick questions, if you have a moment:

1. Is there a rough date for the public release, and will results and code built on the simulator be publishable?
2. What are the control rate and episode length, and may the observation include future reference values?
3. Does the fine-tuning dataset contain real hot-fire runs, and does it include valve command/position pairs?
4. Does the simulator need a local EcosimPro licence, and roughly how fast does it run per step on a CPU?

Thanks, and congratulations on the hardware demonstration.

Best regards,
Leander Grech
