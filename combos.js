/* =======================================================================
   PREGOBOL — combos and statistics (spec §9, §10)
   Jogada records what a single flick actually touched. It is fed by the
   physics step, so it is always the truth and never a guess. On a goal,
   avaliar() picks the ONE most impressive label — the brief is explicit
   about not stacking messages.
   ======================================================================= */
const Jogada = {
  quem: 1, x0: 0, y0: 0, dist: 0,
  paredes: 0, pregos: 0, sequencia: [], tiposPregos: [],
  raspou: 999,               // closest pass by a nail without touching it
  dourado: false,
  especial: null,

  iniciar(quem, x, y, especial) {
    this.quem = quem; this.x0 = x; this.y0 = y; this.dist = 0;
    this.paredes = 0; this.pregos = 0;
    this.sequencia = []; this.tiposPregos = [];
    this.raspou = 999; this.dourado = false; this.especial = especial || null;
  },
  bateuParede() {
    this.paredes++;
    if (this.sequencia[this.sequencia.length - 1] !== 'parede') this.sequencia.push('parede');
    else this.sequencia.push('parede');
  },
  bateuPrego(tipo, id) {
    this.pregos++; this.tiposPregos.push(tipo);
    this.sequencia.push('p' + id);
    if (tipo === 'golden') this.dourado = true;
  },
  quasePrego(d) { if (d < this.raspou) this.raspou = d; },
  andou(d) { this.dist += d; },

  get rebotes() { return this.paredes + this.pregos; },

  /* One label, chosen by how hard it is to pull off. Returns null for an
     ordinary goal so the goal cry stands on its own. */
  avaliar(distanciaAoGol) {
    const r = this.rebotes;
    const unicos = new Set(this.sequencia).size;

    if (unicos >= 4 && r >= 4)
      return { chave: 'chainRebound', pontos: 5, cargas: 2 };
    if (r >= 3)
      return { chave: 'tripleRebound', pontos: 4, cargas: 2 };
    if (r === 2)
      return { chave: 'doubleRebound', pontos: 3, cargas: 1 };
    if (this.dourado)
      return { chave: 'nailShot', pontos: 3, cargas: 2 };
    if (r === 1 && this.pregos === 1)
      return { chave: 'nailShot', pontos: 2, cargas: 1 };
    if (r === 1 && this.paredes === 1)
      return { chave: 'bankShot', pontos: 2, cargas: 1 };
    if (r === 0 && distanciaAoGol > 430)
      return { chave: 'longShot', pontos: 2, cargas: 1 };
    if (r === 0 && this.raspou < 5)
      return { chave: 'perfectAngle', pontos: 2, cargas: 1 };
    return null;
  }
};

/* -----------------------------------------------------------------------
   Match statistics. Kept per player so the end-of-match panel in §10 can
   be filled without recomputing anything.
   --------------------------------------------------------------------- */
const Stats = {
  d: { 1: null, 2: null },
  zerar() {
    for (const n of [1, 2]) {
      this.d[n] = { gols: 0, chutes: 0, quiques: 0, especiais: 0, combos: 0, dourados: 0 };
    }
  },
  chute(n) { this.d[n].chutes++; },
  gol(n) { this.d[n].gols++; },
  quiques(n, k) { this.d[n].quiques += k; },
  especial(n) { this.d[n].especiais++; },
  combo(n) { this.d[n].combos++; },
  dourado(n) { this.d[n].dourados++; },
  precisao(n) {
    const s = this.d[n];
    return s.chutes ? Math.round(s.gols / s.chutes * 100) : 0;
  }
};
Stats.zerar();
