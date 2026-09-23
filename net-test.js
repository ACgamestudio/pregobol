/* Two independent copies of the game, in one Node process, playing each
   other through the loopback transport. Verifies that the seeded replay
   reproduces the opponent's flick and that the boards never drift. */
const fs = require('fs'), path = require('path');

function noop() {}

/* Audio element stub: the sample layer must degrade to the synthesised
   voices when the files cannot load, and that is exactly what happens
   here — ok never flips to true. */
global.Audio = function () {
  return { preload: '', src: '', volume: 1,
           addEventListener: function () {}, cloneNode: function () { return this; },
           play: function () { return Promise.resolve(); } };
};

function fakeCtx() {
  const g = { addColorStop: noop };
  const base = { createLinearGradient: () => g, createRadialGradient: () => g,
                 setTransform: noop, save: noop, restore: noop, measureText: () => ({ width: 10 }) };
  return new Proxy(base, { get: (o, k) => (k in o ? o[k] : noop), set: () => true });
}

/* Each client gets its OWN document so their DOM stubs cannot interfere. */
function criarAmbiente(timers) {
  const elems = {};
  const el = id => elems[id] || (elems[id] = {
    id, style: { setProperty: noop, cssText: '' }, dataset: {},
    textContent: '', innerHTML: '', className: '', title: '',
    classList: { _s: new Set(), add(...a) { a.forEach(x => this._s.add(x)); },
      remove(...a) { a.forEach(x => this._s.delete(x)); },
      toggle(x, v) { v ? this._s.add(x) : this._s.delete(x); },
      contains(x) { return this._s.has(x); } },
    offsetWidth: 100, offsetHeight: 40, clientWidth: 900, clientHeight: 500,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 780, height: 470 }),
    addEventListener: noop, removeEventListener: noop, setPointerCapture: noop,
    appendChild: noop, querySelector: () => el(id + ':q'), querySelectorAll: () => [],
    getContext: () => fakeCtx(), setAttribute: noop, focus: noop,
    play: () => Promise.resolve(), pause: noop, load: noop,
    muted: false, volume: 1, readyState: 4, paused: true, currentTime: 0, src: ''
  });
  const guardaTimer = (f, ms) => { timers.push({ f, ms: ms || 0 }); return timers.length; };
  return {
    document: { getElementById: el, querySelector: s => el('s:' + s),
                querySelectorAll: () => [], createElement: t => el('n:' + t + Math.random()),
                body: el('body'), documentElement: el('html') },
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; },
                    setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
    setTimeout: guardaTimer,
    requestAnimationFrame: () => 0,
    performance: { now: () => Date.now() },
    screen: { orientation: { lock: () => Promise.reject() } },
    window: { addEventListener: noop, devicePixelRatio: 2, innerWidth: 1200, innerHeight: 700,
      AudioContext: function () {
        return new Proxy({ currentTime: 0, state: 'running', destination: {}, sampleRate: 44100,
          createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) },
          { get: (o, k) => (k in o ? o[k] : () => new Proxy(
              { frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
                gain: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
                Q: { value: 0 }, type: '', buffer: null },
              { get: (o2, k2) => (k2 in o2 ? o2[k2] : noop), set: (o2, k2, v) => (o2[k2] = v, true) })) });
      } }
  };
}

const ORDEM = ['i18n', 'audio', 'rng', 'data-caps', 'data-fields', 'data-nails', 'fx',
               'combos', 'specials', 'progress', 'net', 'modes', 'engine'];
/* ui.js is not loaded (it is all screens); the engine calls into three of
   its functions, so they are stubbed. */
const STUBS = '\nfunction esconderFim(){} function mostrarFim(){} function abrirMenu(){}\n';
const FONTE = STUBS + ORDEM.map(f =>
  '\n/*== ' + f + ' ==*/\n' + fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8')).join('');

const SAIDA = `
return { Rede, TransporteLoop, Modo, Aleatorio, Jogada, Especiais, Stats,
  novaPartida, passo, lancar, chutar, jogadaRemota, capturarEstado, melhorJogada,
  get bola(){return bola;}, get pregos(){return pregos;},
  get placar(){return placar;}, get fase(){return fase;}, set fase(v){fase=v;},
  get jogador(){return jogador;}, set jogador(v){jogador=v;},
  get campoAtual(){return campoAtual;}, set campoAtual(v){campoAtual=v;},
  get modo(){return modo;}, set modo(v){modo=v;},
  get tampas(){return tampas;} };`;

function novoCliente(timers) {
  const amb = criarAmbiente(timers);
  const f = new Function('document', 'localStorage', 'setTimeout', 'requestAnimationFrame',
                         'performance', 'screen', 'window', FONTE + SAIDA);
  return f(amb.document, amb.localStorage, amb.setTimeout, amb.requestAnimationFrame,
           amb.performance, amb.screen, amb.window);
}

const timersA = [], timersB = [];
const A = novoCliente(timersA), B = novoCliente(timersB);
console.log('two independent clients loaded');

/* shared loopback world */
const mundo = { salas: {}, ouvintes: {}, ouvintesJ: {}, fila: [] };
function transporte(cli) {
  const t = Object.create(cli.TransporteLoop);
  t.mundo = mundo;
  return t;
}
A.Rede.usar(transporte(A));
B.Rede.usar(transporte(B));

const espera = () => new Promise(r => setImmediate(r));
function escoar(timers) {                     // run whatever the game queued
  let n = 0;
  while (timers.length && n < 50) { const t = timers.shift(); try { t.f(); } catch (e) {} n++; }
}
function rodarAte(cli, limite = 4000) {
  let n = 0;
  while (cli.fase === 'rolando' && n < limite) { cli.passo(); n++; }
  return n;
}

function prepararAmbos(campo) {
  for (const c of [A, B]) {
    c.campoAtual = campo;
    c.tampas[1] = 'classica'; c.tampas[2] = 'rapida';
    c.Modo.online({ alvo: 3 });
    c.novaPartida({ alvo: 3 });
  }
}

async function main() {
  await A.Rede.conectar(); await B.Rede.conectar();
  const cod = await A.Rede.criar({ campo: 'rua' }, false);
  const ok = await B.Rede.entrar(cod, {});
  await espera();
  console.log(`room ${cod} · joined=${ok} · A.estado=${A.Rede.estado} B.estado=${B.Rede.estado}`);
  console.log(`A is player ${A.Rede.sou}, B is player ${B.Rede.sou}\n`);

  /* wire each client's incoming message to its replay path */
  A.Rede.ao.jogada = m => { A.jogadaRemota(m); };
  B.Rede.ao.jogada = m => { B.jogadaRemota(m); };

  const campos = ['rua', 'gelo', 'favela', 'extremo'];   // gelo = random every tick
  let desvios = 0, turnos = 0, replaysExatos = 0;

  for (const campo of campos) {
    prepararAmbos(campo);
    console.log(`--- ${campo} ---`);

    for (let turno = 0; turno < 8; turno++) {
      const daVez = A.jogador;
      const atirador = daVez === A.Rede.sou ? A : B;
      const outro = atirador === A ? B : A;
      const timersAt = atirador === A ? timersA : timersB;
      const timersOu = atirador === A ? timersB : timersA;

      if (atirador.fase === 'fim' || outro.fase === 'fim') break;
      if (process.env.DBG) console.log(`    [dbg] daVez=${daVez} A{j:${A.jogador},f:${A.fase},sou:${A.Rede.sou},est:${A.Rede.estado}} B{j:${B.jogador},f:${B.fase},sou:${B.Rede.sou},est:${B.Rede.estado}}`);

      /* the shooter picks a real line, then flicks through the normal path */
      const escolha = atirador.melhorJogada(daVez);
      atirador.fase = 'mirando';
      atirador.lancar(escolha.ang, escolha.forca / (60 / 60));
      const ticksAt = rodarAte(atirador);
      /* where the shooter's cap actually came to rest, BEFORE the kickoff
         timer moves it back to the centre — that is what the replay has
         to reproduce */
      const alvoX = atirador.bola.x, alvoY = atirador.bola.y;
      if (process.env.DBG) console.log(`    [dbg] shooter ran ${ticksAt} ticks, fase=${atirador.fase}, ` +
        `v=(${atirador.bola.vx.toFixed(3)},${atirador.bola.vy.toFixed(3)}) ` +
        `pos=(${atirador.bola.x.toFixed(1)},${atirador.bola.y.toFixed(1)}) emCurso=${!!atirador.Rede.emCurso}`);
      escoar(timersAt);
      await espera();                       // let the message cross

      /* the opponent should now be replaying it */
      const passosB = rodarAte(outro);
      const antesX = outro.bola.x, antesY = outro.bola.y;   // pre-snap position
      escoar(timersOu);
      await espera();

      const dx = Math.abs(atirador.bola.x - outro.bola.x);
      const dy = Math.abs(atirador.bola.y - outro.bola.y);
      const placarBate = atirador.placar[1] === outro.placar[1] &&
                         atirador.placar[2] === outro.placar[2];
      turnos++;
      if (dx > 0.01 || dy > 0.01 || !placarBate) {
        desvios++;
        console.log(`  turn ${turno} DESYNC dx=${dx.toFixed(3)} dy=${dy.toFixed(3)} ` +
                    `score ${atirador.placar[1]}-${atirador.placar[2]} vs ` +
                    `${outro.placar[1]}-${outro.placar[2]}`);
      } else {
        /* how close did the blind replay get BEFORE being corrected? */
        const drift = Math.hypot(antesX - alvoX, antesY - alvoY);
        if (drift < 0.001) replaysExatos++;
        console.log(`  turn ${turno} ok  score ${outro.placar[1]}-${outro.placar[2]}  ` +
                    `replay drift ${drift.toFixed(4)}px  (${passosB} ticks)`);
      }
      /* both sides advance the turn the same way */
      if (atirador.fase !== 'rolando' && outro.fase !== 'rolando') {
        A.jogador = A.jogador; // engine already flipped it on both sides
      }
    }
  }

  console.log(`\nturns played: ${turnos}`);
  console.log(`desyncs:      ${desvios}`);
  console.log(`replays that matched the shooter bit-for-bit: ${replaysExatos}/${turnos}`);

  /* --- matchmaking --- */
  console.log('\n--- public matchmaking ---');
  await A.Rede.encerrar(); await B.Rede.encerrar();
  mundo.salas = {}; mundo.ouvintes = {}; mundo.ouvintesJ = {}; mundo.fila = [];
  const r1 = await A.Rede.procurar({ campo: 'rua' });
  console.log('first player  ->', r1.modo, r1.sala);
  const r2 = await B.Rede.procurar({ campo: 'rua' });
  console.log('second player ->', r2.modo, r2.sala);
  await espera();
  console.log('same room:', r1.sala === r2.sala, '| A:', A.Rede.estado, '| B:', B.Rede.estado);

  /* --- opponent disappears --- */
  console.log('\n--- opponent drops ---');
  let avisou = false;
  A.Rede.ao.saiu = () => { avisou = true; };
  await B.Rede.encerrar();
  await espera();
  console.log('A was told the opponent left:', avisou, '| A.estado =', A.Rede.estado);

  console.log(desvios === 0 ? '\nNO DESYNCS' : '\nDESYNCS PRESENT');
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
