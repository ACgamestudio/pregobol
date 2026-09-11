/* ===================================================================
   Deterministic randomness.

   Three things in the physics roll dice: the ice drift (every tick),
   the bent nail deflection (every contact) and the cap wobble at
   release. With Math.random the same flick produces a different result
   on each machine, which makes online play impossible.

   Every real shot is therefore seeded. The seed travels with the flick,
   so the other device replays exactly the same bounces.

   The AI's look-ahead deliberately keeps using Math.random: it runs
   hundreds of throwaway simulations and must never consume the shared
   stream, or the seed would no longer describe the shot that was
   actually taken.
   =================================================================== */
const Aleatorio = {
  s: 1,

  /* mulberry32 — small, fast, good enough for a game, and identical in
     every JS engine because it only uses integer ops. */
  semente(n) {
    this.s = (n >>> 0) || 1;
    return this.s;
  },

  nova() {
    return this.semente((Math.random() * 4294967296) >>> 0);
  },

  f() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  /* the shape the physics actually wants: -0.5 … +0.5 */
  meio() { return this.f() - 0.5; }
};
