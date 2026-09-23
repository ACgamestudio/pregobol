/* Executa o Codigo.gs DE VERDADE dentro do Node, com stubs de
   PropertiesService/LockService, e liga o TransporteAppsScript nele por
   um fetch falso. Testa os dois lados do protocolo de uma vez: se o .gs
   tiver um erro de lógica, aparece aqui e não só depois de publicar. */
const fs = require('fs'), path = require('path');

/* ---------- ambiente do Apps Script ---------- */
const armazem = {};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in armazem ? armazem[k] : null),
    setProperty: (k, v) => { armazem[k] = String(v); },
    deleteProperty: k => { delete armazem[k]; },
    deleteAllProperties: () => { Object.keys(armazem).forEach(k => delete armazem[k]); },
    getProperties: () => Object.assign({}, armazem)
  })
};
let travada = false;
const LockService = {
  getScriptLock: () => ({
    tryLock: () => { if (travada) return false; travada = true; return true; },
    releaseLock: () => { travada = false; }
  })
};
const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } })
};
const Logger = { log: () => {} };

const gs = fs.readFileSync(path.join(__dirname, 'servidor', 'Codigo.gs'), 'utf8');
const servidor = new Function('PropertiesService', 'LockService', 'ContentService', 'Logger',
  gs + '\nreturn { doPost, processar, faxina_, limparTudo };')
  (PropertiesService, LockService, ContentService, Logger);
console.log('Codigo.gs carregado e avaliado sem erro');

/* ---------- fetch falso apontando pro servidor ---------- */
let chamadas = 0, bytesEnviados = 0, bytesRecebidos = 0;
global.fetch = async (url, opcoes) => {
  chamadas++;
  bytesEnviados += opcoes.body.length;
  const resposta = servidor.doPost({ postData: { contents: opcoes.body } }).getContent();
  bytesRecebidos += resposta.length;
  return { ok: true, status: 200, json: async () => JSON.parse(resposta) };
};

/* ---------- dois clientes ---------- */
function noop() {}
function fakeCtx() {
  const g = { addColorStop: noop };
  const base = { createLinearGradient: () => g, createRadialGradient: () => g,
                 setTransform: noop, save: noop, restore: noop, measureText: () => ({ width: 10 }) };
  return new Proxy(base, { get: (o, k) => (k in o ? o[k] : noop), set: () => true });
}
function ambiente(timers) {
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
  return {
    document: { getElementById: el, querySelector: s => el('s:' + s), querySelectorAll: () => [],
                createElement: t => el('n:' + t + Math.random()), body: el('body'), documentElement: el('html') },
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; },
                    setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
    /* o loop de polling precisa de setTimeout real */
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: id => clearTimeout(id),
    requestAnimationFrame: () => 0,
    performance: { now: () => Date.now() },
    screen: { orientation: { lock: () => Promise.reject() } },
    Audio: function () { return { preload: '', src: '', volume: 1, addEventListener: noop,
                                  cloneNode() { return this; }, play: () => Promise.resolve() }; },
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
const CFG = "\nconst APPS_SCRIPT_URL='https://exemplo/exec'; const APPS_SCRIPT_PRONTO=true;\n" +
            "const FIREBASE_CONFIG={}; const FIREBASE_PRONTO=false;\n" +
            "function esconderFim(){} function mostrarFim(){} function abrirMenu(){}\n";
const FONTE = CFG + ORDEM.map(f =>
  '\n/*== ' + f + ' ==*/\n' + fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8')).join('');
const SAIDA = `
return { Rede, TransporteAppsScript, Modo, Jogada,
  novaPartida, passo, chutar, lancar, jogadaRemota, melhorJogada,
  get bola(){return bola;}, get placar(){return placar;},
  get fase(){return fase;}, set fase(v){fase=v;},
  get jogador(){return jogador;}, get campoAtual(){return campoAtual;},
  set campoAtual(v){campoAtual=v;}, set modo(v){modo=v;}, get tampas(){return tampas;} };`;

function cliente() {
  const a = ambiente();
  return new Function('document', 'localStorage', 'setTimeout', 'clearTimeout',
                      'requestAnimationFrame', 'performance', 'screen', 'Audio', 'window',
                      FONTE + SAIDA)
    (a.document, a.localStorage, a.setTimeout, a.clearTimeout, a.requestAnimationFrame,
     a.performance, a.screen, a.Audio, a.window);
}

const A = cliente(), B = cliente();
/* cada cliente tem sua própria instância do transporte */
A.Rede.usar(Object.create(A.TransporteAppsScript));
B.Rede.usar(Object.create(B.TransporteAppsScript));

const pausa = ms => new Promise(r => setTimeout(r, ms));
function rodarAte(c, lim = 4000) { let n = 0; while (c.fase === 'rolando' && n < lim) { c.passo(); n++; } return n; }

async function main() {
  await A.Rede.conectar({ url: 'https://exemplo/exec' });
  await B.Rede.conectar({ url: 'https://exemplo/exec' });

  A.Rede.ao.jogada = m => A.jogadaRemota(m);
  B.Rede.ao.jogada = m => B.jogadaRemota(m);

  const cod = await A.Rede.criar({ campo: 'rua', alvo: 3 }, false);
  console.log('sala criada:', cod);
  const entrou = await B.Rede.entrar(cod, { tampa: 'rapida' });
  console.log('visitante entrou:', entrou);
  await pausa(2500);                       // deixa o polling perceber
  console.log('estados apos polling  A:', A.Rede.estado, ' B:', B.Rede.estado);

  for (const c of [A, B]) {
    c.campoAtual = 'rua'; c.modo = 'online';
    c.tampas[1] = 'classica'; c.tampas[2] = 'rapida';
    c.Modo.online({ alvo: 3 }); c.novaPartida({ alvo: 3 });
  }

  let turnos = 0, divergencias = 0;
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) {
    /* depois de um gol a bola volta ao meio por setTimeout de 1,5s;
       sem esperar, o teste escolhe o atirador errado e o chute é
       recusado por nao ser a vez dele */
    await pausa(1800);
    const daVez = A.jogador;
    if (daVez !== B.jogador) { console.log(`  turno ${i}: lados discordam de quem joga`); divergencias++; break; }
    const atira = daVez === A.Rede.sou ? A : B;
    const outro = atira === A ? B : A;
    if (atira.fase === 'fim' || outro.fase === 'fim') break;

    const e = atira.melhorJogada(daVez);
    atira.fase = 'mirando';
    atira.lancar(e.ang, e.forca);
    rodarAte(atira);
    const alvo = [atira.bola.x, atira.bola.y];

    /* espera a jogada atravessar o servidor pelo polling */
    let esperou = 0;
    while (!outro.Rede.pendente && outro.fase !== 'rolando' && esperou < 6000) {
      await pausa(200); esperou += 200;
    }
    rodarAte(outro);
    await pausa(120);

    const dx = Math.abs(alvo[0] - outro.bola.x), dy = Math.abs(alvo[1] - outro.bola.y);
    const ok = dx < 0.02 && dy < 0.02;
    if (!ok) divergencias++;
    turnos++;
    console.log(`  turno ${i}: entregue em ${esperou}ms  ${ok ? 'em sincronia' : `DIVERGIU dx=${dx.toFixed(2)}`}`);
  }

  console.log(`\nturnos: ${turnos} · divergencias: ${divergencias}`);
  console.log(`tempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  /* --- matchmaking --- */
  await A.Rede.encerrar(); await B.Rede.encerrar();
  const r1 = await A.Rede.procurar({ campo: 'rua' });
  const r2 = await B.Rede.procurar({ campo: 'rua' });
  console.log(`\nmatchmaking: ${r1.modo}/${r2.modo} · mesma sala: ${r1.sala === r2.sala}`);

  /* --- queda do adversário, deduzida por falta de sinal --- */
  console.log('\n--- queda por silencio ---');
  const T = A.Rede.T;
  console.log(`limite de silencio configurado: ${T.QUEDA_MS}ms`);
  const antes = await T.lerSala(r1.sala);
  console.log('vivos agora:', JSON.stringify(antes.vivo));
  const sala = JSON.parse(armazem['S_' + r1.sala]);
  sala.vivo['2'] = Date.now() - (T.QUEDA_MS + 3000);      // simula B mudo
  armazem['S_' + r1.sala] = JSON.stringify(sala);
  const depois = await T.lerSala(r1.sala);
  console.log('vivos apos silencio de B:', JSON.stringify(depois.vivo),
              depois.vivo['2'] ? '-> FALHOU' : '-> queda detectada');

  await A.Rede.encerrar(); await B.Rede.encerrar();

  console.log(`\nrequisicoes: ${chamadas} · enviado ${(bytesEnviados / 1024).toFixed(1)} KB · recebido ${(bytesRecebidos / 1024).toFixed(1)} KB`);
  console.log(`media por requisicao: ${Math.round((bytesEnviados + bytesRecebidos) / chamadas)} bytes`);
  console.log(divergencias === 0 ? '\nSEM DIVERGENCIAS' : '\nDIVERGENCIAS PRESENTES');
  process.exit(0);
}
main().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
