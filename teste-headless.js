/* Headless smoke test: stubs just enough DOM/Canvas/WebAudio to load every
   module in the real order and then play matches with the real physics. */
const fs = require('fs');
const path = require('path');

function noop() {}
function fakeCtx() {
  const grad = { addColorStop: noop };
  const alvo = {
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    setTransform: noop, save: noop, restore: noop, measureText: () => ({ width: 10 })
  };
  return new Proxy(alvo, {
    get(o, k) {
      if (k in o) return o[k];
      return typeof k === 'string' ? noop : undefined;
    },
    set() { return true; }
  });
}

const elems = {};
function el(id) {
  if (elems[id]) return elems[id];
  const e = {
    id, style: { setProperty: noop, cssText: '' }, dataset: {},
    textContent: '', innerHTML: '', className: '', title: '',
    classList: { _s: new Set(),
      add(...a) { a.forEach(x => this._s.add(x)); },
      remove(...a) { a.forEach(x => this._s.delete(x)); },
      toggle(x, v) { v === undefined ? (this._s.has(x) ? this._s.delete(x) : this._s.add(x)) : (v ? this._s.add(x) : this._s.delete(x)); },
      contains(x) { return this._s.has(x); } },
    offsetWidth: 100, offsetHeight: 40, clientWidth: 900, clientHeight: 500,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 780, height: 470 }),
    addEventListener: noop, removeEventListener: noop, setPointerCapture: noop,
    appendChild: noop, querySelector: () => el(id + ':q'), querySelectorAll: () => [],
    getContext: () => fakeCtx(), setAttribute: noop, focus: noop,
    play: () => Promise.resolve(), pause: noop, load: noop, muted: false, volume: 1,
    readyState: 4, paused: true, currentTime: 0, loop: false, src: '', width: 0, height: 0
  };
  elems[id] = e;
  return e;
}

global.window = {
  addEventListener: noop, devicePixelRatio: 2, innerWidth: 1200, innerHeight: 700,
  AudioContext: function () {
    return new Proxy({ currentTime: 0, state: 'running', destination: {},
      sampleRate: 44100,
      createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) }, {
      get(o, k) {
        if (k in o) return o[k];
        return () => new Proxy({ frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
                                 gain: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
                                 Q: { value: 0 }, type: '', buffer: null }, {
          get(o2, k2) { if (k2 in o2) return o2[k2]; return noop; },
          set(o2, k2, v) { o2[k2] = v; return true; }
        });
      }
    });
  }
};
global.document = {
  addEventListener: noop, removeEventListener: noop,
  fullscreenElement: null, webkitFullscreenElement: null,
  getElementById: el,
  querySelector: s => el('sel:' + s),
  querySelectorAll: () => [],
  createElement: t => el('novo:' + t + ':' + Math.random()),
  body: el('body'), documentElement: el('html')
};
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; }
};
global.performance = { now: () => Date.now() };

/* Audio element stub: the sample layer must degrade to the synthesised
   voices when the files cannot load, and that is exactly what happens
   here — ok never flips to true. */
global.Audio = function () {
  return { preload: '', src: '', volume: 1,
           addEventListener: function () {}, cloneNode: function () { return this; },
           play: function () { return Promise.resolve(); } };
};

global.requestAnimationFrame = () => 0;
global.screen = { orientation: { lock: () => Promise.reject() } };
global.setTimeout = (f) => 0;           // no async: we drive everything by hand

const ordem = ['i18n', 'audio', 'rng', 'data-caps', 'data-fields', 'data-nails', 'fx',
               'combos', 'specials', 'progress', 'net', 'modes', 'engine', 'ui'];
let fonte = '';
for (const f of ordem) {
  fonte += '\n/*=== ' + f + ' ===*/\n' + fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8');
}
/* run everything in one scope, exactly like the browser's global scope */
const rodar = new Function(fonte + `
return { CAMPOS, ORDEM_CAMPOS, TAMPAS, ORDEM_TAMPAS, LAYOUTS, PREGOS_TIPO,
         DESAFIOS, TORNEIO, Modo, Progresso, Especiais, Stats, Jogada, FX, Som,
         novaPartida, passo, chutar, melhorJogada, simular, jogadaIA,
         montarPregos, aplicarCampo, atualizarHUD, mostrarFim,
         get campoAtual(){return campoAtual;}, set campoAtual(v){campoAtual=v;},
         get pregos(){return pregos;}, get bola(){return bola;},
         get fase(){return fase;}, set fase(v){fase=v;},
         get placar(){return placar;}, get jogador(){return jogador;},
         get nivel(){return nivel;}, set nivel(v){nivel=v;},
         get modo(){return modo;}, set modo(v){modo=v;},
         get tampas(){return tampas;},
         get FORCA_MAX(){return FORCA_MAX;}, get ATRITO(){return ATRITO;},
         get buracos(){return buracos;}, niveisInfo: NIVEIS };
`);
const G = rodar();
console.log('MODULES LOADED OK');

/* ---- 1. every field builds a legal layout ---- */
for (const k of G.ORDEM_CAMPOS) {
  G.campoAtual = k;
  G.aplicarCampo();
  G.montarPregos();
  const tipos = {};
  for (const p of G.pregos) tipos[p.tipo] = (tipos[p.tipo] || 0) + 1;
  console.log(`field ${k.padEnd(8)} nails=${String(G.pregos.length).padStart(3)} ` +
              `holes=${G.buracos.length} friction=${G.ATRITO} force=${G.FORCA_MAX} ` +
              JSON.stringify(tipos));
}

/* ---- 2. play out full matches on every field, both AI levels ---- */
function jogarPartida(campoK, nivelK, tampaK, maxFlicks = 400) {
  G.campoAtual = campoK; G.nivel = nivelK; G.modo = 'ia';
  G.tampas[1] = tampaK; G.tampas[2] = 'classica';
  G.Modo.rapida();
  G.novaPartida({ alvo: 3 });
  let flicks = 0, gols = 0, combos = 0;
  while (flicks < maxFlicks && G.fase !== 'fim') {
    /* both sides use the real search so the physics gets a real workout */
    const escolha = G.melhorJogada(G.jogador);
    G.fase = 'mirando';
    G.chutar(G.jogador, escolha.ang, escolha.forca, null);
    flicks++;
    let passos = 0;
    while (G.fase === 'rolando' && passos < 900) { G.passo(); passos++; }
    if (G.fase === 'pausa' || G.fase === 'fim') {
      /* setTimeout is stubbed out, so advance the turn by hand */
      const total = G.placar[1] + G.placar[2];
      if (total > gols) { gols = total; combos += G.Stats.d[1].combos + G.Stats.d[2].combos; }
      if (G.fase !== 'fim') { G.bola.x = 390; G.bola.y = 235; G.fase = 'mirando'; }
    }
    if (G.fase === 'mirando' || G.fase === 'ia') G.fase = 'mirando';
  }
  return { flicks, placar: { ...G.placar },
           s1: { ...G.Stats.d[1] }, s2: { ...G.Stats.d[2] } };
}

console.log('\n--- matches ---');
for (const c of G.ORDEM_CAMPOS) {
  const r = jogarPartida(c, 'hard', 'classica');
  console.log(`${c.padEnd(8)} flicks=${String(r.flicks).padStart(3)} ` +
              `score=${r.placar[1]}-${r.placar[2]} ` +
              `shots=${r.s1.chutes}/${r.s2.chutes} ` +
              `rebounds=${r.s1.quiques + r.s2.quiques} ` +
              `combos=${r.s1.combos + r.s2.combos} gold=${r.s1.dourados + r.s2.dourados}`);
}

/* Cheaper, far less noisy than playing whole matches: from a fixed set of
   board positions, how often can each cap find ANY scoring line, and how
   hard does it have to hit to get there? */
console.log('\n--- cap capability: scoring lines found from 12 fixed boards ---');
const postos = [];
for (let i = 0; i < 12; i++) postos.push({ x: 250 + (i % 4) * 45, y: 130 + (i % 3) * 55 });
for (const k of G.ORDEM_TAMPAS) {
  const linha = [];
  for (const campo of ['rua', 'favela']) {
    let achou = 0, forcas = [];
    for (const p of postos) {
      G.campoAtual = campo; G.nivel = 'hard'; G.modo = 'ia';
      G.tampas[1] = k; G.Modo.rapida(); G.novaPartida({ alvo: 3 });
      G.bola.x = p.x; G.bola.y = p.y;
      const e = G.melhorJogada(1);
      if (e.res.gol === 1) { achou++; forcas.push(e.forca); }
    }
    const mf = forcas.length ? (forcas.reduce((s, v) => s + v, 0) / forcas.length) : 0;
    linha.push(`${campo}=${String(achou).padStart(2)}/12 @force ${mf.toFixed(1)}`);
  }
  console.log(`${G.TAMPAS[k].tipo.padEnd(9)} ${linha.join('   ')}`);
}

/* ---- 3. AI levels: how often the shot ACTUALLY lands after the level's
        aiming error is applied. This is the number that must be ordered. ---- */
console.log('\n--- AI: shots that still score after the level error ---');
G.tampas[1] = 'classica'; G.tampas[2] = 'classica';
for (const n of ['easy', 'normal', 'hard', 'insane']) {
  G.nivel = n;
  let achou = 0, marcou = 0;
  const amostras = 24;
  for (let i = 0; i < amostras; i++) {
    G.campoAtual = 'rua'; G.Modo.rapida(); G.novaPartida({ alvo: 3 });
    G.bola.x = 300 + (i % 8) * 14; G.bola.y = 150 + (i % 6) * 22;
    const e = G.melhorJogada(2);
    if (e.res.gol !== 2) continue;
    achou++;
    const err = (Math.random() - .5) * 2 * G.niveisInfo[n].erroAng;
    const f = e.forca * (1 + (Math.random() - .5) * 2 * G.niveisInfo[n].erroForca);
    const r = G.simular(Math.cos(e.ang + err) * f, Math.sin(e.ang + err) * f);
    if (r.gol === 2) marcou++;
  }
  const pc = achou ? Math.round(marcou / achou * 100) : 0;
  console.log(`${n.padEnd(7)} converts ${marcou}/${achou} of the lines it found (${pc}%)`);
}

/* ---- 4. progression and challenges ---- */
console.log('\n--- progression ---');
console.log('fields at start:', G.Progresso.dados.campos.join(','));
G.Modo.arcade();
let plano = G.Modo.fimDaPartida(1);
console.log('arcade win →', plano.titulo, '| unlocked field:', plano.desbloqueio, '| cap:', plano.tampa);
console.log('fields now:', G.Progresso.dados.campos.join(','));
G.Modo.torneio();
for (let i = 0; i < 4; i++) {
  const p = G.Modo.fimDaPartida(1);
  console.log(`tournament stage ${i} →`, p.titulo, '|', p.sub, '| next:', p.acao);
}
for (const d of G.DESAFIOS) {
  const cfg = G.Modo.desafiar(d.id);
  console.log(`challenge ${d.id.padEnd(9)} field=${cfg.desafio.campo.padEnd(8)} ` +
              `shots=${cfg.desafio.tiros} alvo=${cfg.alvo}`);
}

/* ---- 5. specials economy ---- */
console.log('\n--- first-flick goal from the kickoff spot ---');
for (const campo of G.ORDEM_CAMPOS) {
  G.campoAtual = campo; G.nivel = 'insane'; G.modo = 'ia';
  G.tampas[1] = 'classica'; G.Modo.rapida(); G.novaPartida({ alvo: 3 });
  const e = G.melhorJogada(1);
  const marca = e.res.gol === 1;
  /* re-run the winning line to see whether it needed the walls */
  let via = '-';
  if (marca) {
    G.fase = 'mirando';
    G.chutar(1, e.ang, e.forca, null);
    let n = 0; while (G.fase === 'rolando' && n < 900) { G.passo(); n++; }
    via = `${G.Jogada.paredes} wall / ${G.Jogada.pregos} nail`;
  }
  console.log(`${campo.padEnd(8)} first-flick goal: ${marca ? 'YES' : 'no '}   ${via}`);
}

console.log('\n--- near miss detection ---');
for (const campo of ['rua', 'estadio']) {
  let quases = 0, gols = 0, tiros = 0;
  const orig = G.Som.torcida;
  G.Som.torcida = () => { quases++; };
  for (let i = 0; i < 40; i++) {
    G.campoAtual = campo; G.nivel = 'easy'; G.modo = 'ia';
    G.tampas[1] = 'classica'; G.Modo.rapida(); G.novaPartida({ alvo: 9 });
    G.bola.x = 300 + (i % 7) * 20; G.bola.y = 140 + (i % 5) * 40;
    const e = G.melhorJogada(1);
    G.fase = 'mirando';
    /* nudge the aim so plenty of shots go just wide */
    G.chutar(1, e.ang + (Math.random() - .5) * 0.16, e.forca, null);
    tiros++;
    let n = 0; while (G.fase === 'rolando' && n < 900) { G.passo(); n++; }

    if (G.placar[1] > 0) gols++;
  }
  G.Som.torcida = orig;
  console.log(`${campo.padEnd(8)} ${tiros} shots -> ${quases} near misses, ${gols} goals`);
}

console.log('\n--- special shots ---');
G.Especiais.zerar();
console.log('armar with no charges:', G.Especiais.armar(1, 'power'));
G.Especiais.ganhar(1, 3);
console.log('armar with 3 charges:', G.Especiais.armar(1, 'power'));
const gasto = G.Especiais.consumir(1);
console.log('consumed:', gasto.tipo, 'force x', gasto.forca, '| charges left:', G.Especiais.cargas[1]);
console.log('\nALL CHECKS COMPLETE');
