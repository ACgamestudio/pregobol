/* =======================================================================
   PREGOBOL — nails (spec §4)
   A nail is: position, owner team (for the shirt paint), and a type.
   The type is pure physics data read by passoFisico(), so the AI's
   simulations obey exactly the same rules the player does.

     quique     restitution multiplier
     fixo       true = never moves, no matter how heavy the cap
     desvio     random angle added to the bounce, in radians (broken nails)
     ima        attraction radius in px (0 = none)
     bonus      awards a special-shot charge when hit
   ======================================================================= */
const PREGOS_TIPO = {
  normal:    { quique: 1.00, fixo: false, desvio: 0.00, ima: 0,  bonus: false, cor: '#CDD4DD' },
  heavy:     { quique: 0.86, fixo: true,  desvio: 0.00, ima: 0,  bonus: false, cor: '#8E949C' },
  bouncy:    { quique: 1.38, fixo: false, desvio: 0.00, ima: 0,  bonus: false, cor: '#6AD67C' },
  broken:    { quique: 1.02, fixo: false, desvio: 0.34, ima: 0,  bonus: false, cor: '#B08968' },
  golden:    { quique: 1.08, fixo: true,  desvio: 0.00, ima: 0,  bonus: true,  cor: '#FFD24A' },
  magnetic:  { quique: 0.94, fixo: true,  desvio: 0.00, ima: 62, bonus: false, cor: '#C58CF0' }
};

/* ---------------------------------------------------------------------
   Layout helpers. These run at match start, so CAMPO already carries the
   vertical inset the current field asked for.
   ------------------------------------------------------------------- */
function _linha(saida, fx, fys, tipo) {
  for (const fy of fys) {
    const y = CAMPO.y + fy * CAMPO.h;
    saida.push({ x: CAMPO.x + fx * CAMPO.w,       y, time: 1, tipo, tremor: 0 });
    saida.push({ x: CAMPO.x + (1 - fx) * CAMPO.w, y, time: 2, tipo, tremor: 0 });
  }
}
/* Neutral obstacles sit on the halfway line and belong to nobody. */
function _neutro(saida, fx, fy, tipo, mov) {
  const n = { x: CAMPO.x + fx * CAMPO.w, y: CAMPO.y + fy * CAMPO.h, time: 0, tipo, tremor: 0 };
  if (mov) { n.baseY = n.y; n.mov = mov; }
  saida.push(n);
}

/* The original 1-4-3-3 formation, kept as-is: it is what makes the first
   straight shot impossible and forces the player to find a bank shot. */
function _formacaoClassica(p, tipo = 'normal') {
  _linha(p, 0.055, [0.50], tipo);
  _linha(p, 0.130, [0.32, 0.68], tipo);
  _linha(p, 0.195, [0.18, 0.40, 0.60, 0.82], tipo);
  _linha(p, 0.300, [0.22, 0.42, 0.62, 0.82], tipo);
  _linha(p, 0.395, [0.30, 0.50, 0.70], tipo);
  _linha(p, 0.470, [0.20, 0.50, 0.80], tipo);
}

/* Each field owns its obstacle design — no field has every nail type. */
const LAYOUTS = {

  /* RIO STREET — the reference layout. */
  rua() {
    const p = [];
    _formacaoClassica(p);
    _neutro(p, 0.50, 0.10, 'bouncy');
    _neutro(p, 0.50, 0.90, 'bouncy');
    return { pregos: p, buracos: [] };
  },

  /* BEACH — sparse and wide: the sand already punishes long shots. */
  praia() {
    const p = [];
    _linha(p, 0.060, [0.50], 'normal');
    _linha(p, 0.150, [0.28, 0.72], 'heavy');
    _linha(p, 0.250, [0.16, 0.44, 0.72], 'normal');
    _linha(p, 0.380, [0.30, 0.58, 0.86], 'normal');
    _linha(p, 0.465, [0.22, 0.50, 0.78], 'normal');
    return { pregos: p, buracos: [] };
  },

  /* STADIUM — the clean stage: fewest obstacles, fastest surface. */
  estadio() {
    const p = [];
    _linha(p, 0.055, [0.50], 'normal');
    _linha(p, 0.170, [0.26, 0.50, 0.74], 'normal');
    _linha(p, 0.310, [0.18, 0.40, 0.62, 0.84], 'normal');
    _linha(p, 0.455, [0.32, 0.68], 'normal');
    return { pregos: p, buracos: [] };
  },

  /* ICE — magnets at midfield give the slide somewhere to go wrong. */
  gelo() {
    const p = [];
    _formacaoClassica(p);
    _neutro(p, 0.50, 0.34, 'magnetic');
    _neutro(p, 0.50, 0.66, 'magnetic');
    return { pregos: p, buracos: [] };
  },

  /* RAIN — bent nails: wet nights never bounce the same way twice. */
  chuva() {
    const p = [];
    _formacaoClassica(p);
    _linha(p, 0.240, [0.50], 'broken');
    _neutro(p, 0.50, 0.20, 'broken');
    _neutro(p, 0.50, 0.80, 'broken');
    return { pregos: p, buracos: [] };
  },

  /* FAVELA — narrow field (see the field's insetY), stacked obstacles. */
  favela() {
    const p = [];
    _linha(p, 0.055, [0.50], 'heavy');
    _linha(p, 0.125, [0.26, 0.74], 'normal');
    _linha(p, 0.190, [0.14, 0.38, 0.62, 0.86], 'normal');
    _linha(p, 0.265, [0.26, 0.50, 0.74], 'bouncy');
    _linha(p, 0.340, [0.16, 0.40, 0.60, 0.84], 'normal');
    _linha(p, 0.420, [0.28, 0.52, 0.76], 'broken');
    _linha(p, 0.478, [0.20, 0.50, 0.80], 'normal');
    _neutro(p, 0.50, 0.50, 'golden');
    return { pregos: p, buracos: [] };
  },

  /* EXTREME — every type, two moving bars and two holes. No rules. */
  extremo() {
    const p = [];
    _formacaoClassica(p);
    _linha(p, 0.240, [0.30, 0.70], 'bouncy');
    _linha(p, 0.345, [0.50], 'broken');
    _linha(p, 0.150, [0.50], 'heavy');
    _neutro(p, 0.50, 0.50, 'golden');
    _neutro(p, 0.42, 0.20, 'normal', { amp: 0.26, vel: 0.0011, fase: 0 });
    _neutro(p, 0.58, 0.80, 'normal', { amp: 0.26, vel: 0.0011, fase: Math.PI });
    _neutro(p, 0.50, 0.18, 'magnetic');
    _neutro(p, 0.50, 0.82, 'magnetic');
    const b = [
      { fx: 0.335, fy: 0.50, r: 15 },
      { fx: 0.665, fy: 0.50, r: 15 }
    ].map(h => ({ x: CAMPO.x + h.fx * CAMPO.w, y: CAMPO.y + h.fy * CAMPO.h, r: h.r }));
    return { pregos: p, buracos: b };
  }
};
