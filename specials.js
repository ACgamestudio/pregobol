/* =======================================================================
   PREGOBOL — special shots (spec §6)
   These are earned, never free, and every one of them is a modifier on the
   normal shot rather than a different mechanic. A player who never arms a
   special can still win: the normal flick stays the core of the game.

     custo   charges spent, earned from combos and golden nails
     forca   force multiplier
     quique  restitution multiplier for boards and nails
     giro    spin, which becomes a sideways force in passoFisico
     guia    show the simulated trajectory while aiming
     firme   cancels the cap's release wobble
   ======================================================================= */
const ESPECIAIS = {
  power:     { chave: 'powerShot',     custo: 2, cor: '#EC5648',
               forca: 1.34, quique: 1.00, giro: 0, guia: false, firme: false },
  precision: { chave: 'precisionShot', custo: 2, cor: '#7FD6F0',
               forca: 0.96, quique: 1.00, giro: 0, guia: true,  firme: true  },
  curve:     { chave: 'curveShot',     custo: 3, cor: '#C9F03A',
               forca: 1.02, quique: 1.00, giro: 0.052, guia: false, firme: true },
  bounce:    { chave: 'bounceShot',    custo: 3, cor: '#FFD24A',
               forca: 1.06, quique: 1.18, giro: 0, guia: false, firme: false }
};
const ORDEM_ESPECIAIS = ['power', 'precision', 'curve', 'bounce'];

const Especiais = {
  cargas: { 1: 0, 2: 0 },
  armado: { 1: null, 2: null },
  ladoCurva: 1,                     // +1 / -1, flipped by re-arming CURVE

  zerar() { this.cargas = { 1: 0, 2: 0 }; this.armado = { 1: null, 2: null }; },

  ganhar(n, k) {
    if (!k) return;
    this.cargas[n] = Math.min(9, this.cargas[n] + k);
  },

  /* Returns 'armado' | 'desarmado' | 'sem-carga' so the UI can react. */
  armar(n, tipo) {
    const e = ESPECIAIS[tipo];
    if (!e) return 'sem-carga';
    if (this.armado[n] === tipo) {
      if (tipo === 'curve') { this.ladoCurva *= -1; return 'armado'; }
      this.armado[n] = null; return 'desarmado';
    }
    if (this.cargas[n] < e.custo) return 'sem-carga';
    this.armado[n] = tipo;
    return 'armado';
  },

  /* Called at release: spends the charges and hands back the modifiers. */
  consumir(n) {
    const tipo = this.armado[n];
    if (!tipo) return null;
    const e = ESPECIAIS[tipo];
    this.cargas[n] = Math.max(0, this.cargas[n] - e.custo);
    this.armado[n] = null;
    return { tipo, forca: e.forca, quique: e.quique,
             giro: e.giro * this.ladoCurva, cor: e.cor, chave: e.chave };
  },

  /* Modifiers that apply while still aiming (guide length, no wobble). */
  emMira(n) {
    const tipo = this.armado[n];
    return tipo ? ESPECIAIS[tipo] : null;
  },

  disponivel(n, tipo) { return this.cargas[n] >= ESPECIAIS[tipo].custo; }
};
