/* =======================================================================
   PREGOBOL — core engine
   Bottle-cap football on a nailed table. The player pulls the cap back and
   lets go; from there it is all physics.

   What did NOT change from the original build, on purpose:
     · the table is still 780×470 and still lies down in landscape
     · the control is still one drag: pull back from the piece, release
     · the AI still plays by simulating the real physics, not by cheating
     · the club shirts still paint the nails, from assets/times.webp
     · a first-touch goal still counts

   What is new: the flicked piece is a bottle cap with its own stats, the
   field has its own physics, nails have types, and every collision is
   recorded so a goal can be described (bank shot, off the nail, chain).
   ======================================================================= */

/* ---------------------- geometry (table lying down) ---------------------- */
const W = 780, H = 470;
const BORDA = 15;
const CAMPO = { x: BORDA, y: BORDA, w: W - BORDA * 2, h: H - BORDA * 2 };
const CX = W / 2, CY = H / 2;
const R_PREGO = 5;
const R_BOLA = 8.5;                     // reference radius; each cap scales it

/* Live physics constants — rewritten by aplicarCampo() on every match. */
let GOL_MEIA = 68;
let ATRITO = 0.968, PARADO = 0.10;
let RESTITUICAO = 0.74;                 // nail bounce: absorbs a lot
let REST_PAREDE = 0.89;                 // the board returns better — this is what allows bank shots
let FORCA_MAX = 25;
let ESCORREGA = 0;                      // random drift per step (rain)
const ALVO_PADRAO = 3;
let alvoGols = ALVO_PADRAO;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const wrap = document.querySelector('.board-wrap');
const elCenario = document.getElementById('cenario');

/* ---------------------- clubs ----------------------
   Names and crests come from assets/times.webp. Only the colours and the
   shirt pattern live here, because that is what the game paints on the
   nails. Untouched from the original build. */
const CLUBES = {
  rubronegro:  { nome:'Rubro Negro',              c1:'#E30613', c2:'#111111', padrao:'faixas'   },
  estrela:     { nome:'Estrela Solitária',        c1:'#111111', c2:'#F2F2F2', padrao:'listras'  },
  cruzmalta:   { nome:'Cruz de Malta',            c1:'#F2F2F2', c2:'#111111', padrao:'diagonal' },
  laranjeiras: { nome:'Tricolor das Laranjeiras', c1:'#8E1F35', c2:'#0A6B3D', c3:'#F2F2F2', padrao:'listras3' },
  peixe:       { nome:'Peixe',                    c1:'#F2F2F2', c2:'#0E2A5A', padrao:'solido'   },
  timao:       { nome:'Timão',                    c1:'#F2F2F2', c2:'#111111', padrao:'gola'     },
  palestra:    { nome:'Palestra Verde',           c1:'#046B37', c2:'#F2F2F2', padrao:'solido'   },
  morumbi:     { nome:'Tricolor do Morumbi',      c1:'#F2F2F2', c2:'#E30613', c3:'#111111', padrao:'faixas3' }
};
/* Second sheet. Same 4x2 grid, same crop coordinates — the artwork was
   built to the same template, so AREAS is shared. */
Object.assign(CLUBES, {
  merengues:  { nome:'Merengues',     c1:'#F2F2F2', c2:'#FEBE10', padrao:'solido',   folha:'intl' },
  cules:      { nome:'Culés',         c1:'#A50044', c2:'#004D98', padrao:'listras',  folha:'intl' },
  reddevils:  { nome:'Red Devils',    c1:'#DA291C', c2:'#111111', padrao:'gola',     folha:'intl' },
  reds:       { nome:'Reds',          c1:'#C8102E', c2:'#F2F2F2', padrao:'solido',   folha:'intl' },
  bavaros:    { nome:'Bávaros',       c1:'#DC052D', c2:'#F2F2F2', padrao:'gola',     folha:'intl' },
  velhasenhora:{nome:'Velha Senhora', c1:'#F2F2F2', c2:'#111111', padrao:'listras',  folha:'intl' },
  parisienses:{ nome:'Parisienses',   c1:'#004170', c2:'#DA291C', c3:'#F2F2F2', padrao:'faixas3', folha:'intl' },
  blues:      { nome:'Blues',         c1:'#034694', c2:'#F2F2F2', padrao:'solido',   folha:'intl' }
});

/* The order MUST follow the artwork: top row, then bottom row. */
const ELENCOS = {
  br:   { arte:'assets/times.webp',
          ordem:['rubronegro','estrela','cruzmalta','laranjeiras','peixe','timao','palestra','morumbi'] },
  intl: { arte:'assets/times_intl.webp',
          ordem:['merengues','cules','reddevils','reds','bavaros','velhasenhora','parisienses','blues'] }
};
let elenco = 'br';

/* ORDEM_CLUBES stays a live view of the sheet on screen, so every place
   that already indexed into it keeps working unchanged. */
let ORDEM_CLUBES = ELENCOS.br.ordem;
function usarElenco(k) {
  elenco = (k === 'intl') ? 'intl' : 'br';
  ORDEM_CLUBES = ELENCOS[elenco].ordem;
  return elenco;
}
/* Which sheet a club belongs to — a match can mix the two. */
function folhaDe(chave) { return (CLUBES[chave] && CLUBES[chave].folha === 'intl') ? 'intl' : 'br'; }
/* Crop of each crest inside the artwork, in % of the image. */
const AREAS = [
  { l:7.57,  t:26.31, w:20.37, h:25.50 }, { l:29.32, t:26.31, w:20.18, h:25.50 },
  { l:50.82, t:26.31, w:19.86, h:25.50 }, { l:72.00, t:26.31, w:20.55, h:25.50 },
  { l:7.57,  t:54.64, w:20.37, h:25.71 }, { l:29.32, t:54.64, w:20.18, h:25.71 },
  { l:50.82, t:54.64, w:19.86, h:25.71 }, { l:72.00, t:54.64, w:20.55, h:25.71 }
];

/* ---------------------- state ---------------------- */
let times = { 1:'rubronegro', 2:'estrela' };
let tampas = { 1:'classica', 2:'rapida' };
let campoAtual = 'rua';
let modo = 'ia';                        // 'ia' | '2p' | 'desafio'

/* The window for a bank shot is about two degrees wide, so the angular
   error below is what actually separates the difficulty levels. */
const NIVEIS = {
  easy:   { refina:false, fino:false, erroAng:0.130, erroForca:0.220, pensar:900, duvida:0.35 },
  normal: { refina:true,  fino:false, erroAng:0.055, erroForca:0.100, pensar:620, duvida:0.10 },
  hard:   { refina:true,  fino:false, erroAng:0.016, erroForca:0.035, pensar:470, duvida:0.02 },
  insane: { refina:true,  fino:true,  erroAng:0.0035, erroForca:0.010, pensar:360, duvida:0.00 }
};
const ORDEM_NIVEIS = ['easy','normal','hard','insane'];
let nivel = 'normal';

const clube = n => CLUBES[times[n]] || CLUBES[ORDEM_CLUBES[n === 1 ? 0 : 1]];
const tampaDe = n => TAMPAS[tampas[n]] || TAMPAS.classica;
const campo = () => CAMPOS[campoAtual] || CAMPOS.rua;
const mesa = () => PALETAS[campo().paleta] || PALETAS.classica;

/* The cap in play. `dono` is who flicks next: the piece visually becomes
   that player's cap, which is also the clearest possible turn indicator. */
const bola = { x: CX, y: CY, vx: 0, vy: 0, dono: 1, r: R_BOLA,
               quique: 1, empurra: 1, atrito: 1, giro: 0, ang: 0 };
let pregos = [];
let buracos = [];
let jogador = 1;                        // 1 attacks right | 2 attacks left
let placar = { 1:0, 2:0 };
let peteleco = 0;
const PETELECOS = 1;                    // one touch: the goal counts on the first flick
let fase = 'mirando';                   // mirando | rolando | pausa | fim | ia
let mira = null;
let relogio = 0;                        // physics ticks since the flick left
let mostrarMira = true;                 // the aim beam; off = read the table yourself
let brilhoGol = 0;
let inicioDaJogada = 0;
let miraIA = null;
let fantasma = null;                    // simulated trajectory (precision shot)

/* ---------------------- field setup ---------------------- */
function aplicarCampo() {
  const c = campo();
  ATRITO = c.atrito; REST_PAREDE = c.parede; RESTITUICAO = c.prego;
  FORCA_MAX = c.forca; GOL_MEIA = c.golMeia; ESCORREGA = c.escorrega || 0;
  const inset = c.insetY || 0;
  CAMPO.y = BORDA + inset;
  CAMPO.h = H - BORDA * 2 - inset * 2;
  if (elCenario) elCenario.className = 'cenario ' + c.cena;
}

function montarPregos() {
  const feito = (LAYOUTS[campo().layout] || LAYOUTS.rua)();
  pregos = feito.pregos;
  buracos = feito.buracos || [];
  pregos.forEach((p, i) => {
    p.id = i; p.tipo = p.tipo || 'normal'; p.tremor = 0;
    p.x0 = p.x; p.y0 = p.y;               // home position, for the drift back
  });
}

/* Movable nails shoved by a heavy cap creep back to their spot between
   shots, so a layout never degrades over a long match. Moving obstacles
   are advanced here — never inside the physics step, which the AI reuses. */
function acomodarPregos(k) {
  relogio += (k || 1);
  for (const pr of pregos) {
    if (pr.mov) {
      /* A tick counter, not the wall clock: the opponent replaying this
         shot has to see the bars in exactly the same place. */
      pr.y = pr.baseY + Math.sin(relogio * PASSO_MS * pr.mov.vel + pr.mov.fase) * pr.mov.amp * CAMPO.h * 0.5;
    } else if (pr.x !== pr.x0 || pr.y !== pr.y0) {
      pr.x += (pr.x0 - pr.x) * 0.06 * k;
      pr.y += (pr.y0 - pr.y) * 0.06 * k;
      if (Math.abs(pr.x - pr.x0) < 0.2 && Math.abs(pr.y - pr.y0) < 0.2) { pr.x = pr.x0; pr.y = pr.y0; }
    }
    if (pr.tremor > 0) pr.tremor = Math.max(0, pr.tremor - 0.055 * k);
  }
}

/* ---------------------- scale ---------------------- */
function ajustarEscala() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const placarH = document.querySelector('.placar').offsetHeight || 54;
  const barraH = document.querySelector('.barra').offsetHeight || 42;
  const margem = window.innerHeight < 480 ? 12 : 24;
  const dispW = window.innerWidth - (window.innerWidth < 480 ? 0 : 20);
  const dispH = window.innerHeight - placarH - barraH - margem;
  /* ONE scale, same on both axes: keeps the real 780×470 proportion. */
  let esc = Math.min(dispW / W, dispH / H);
  esc = Math.min(esc, 1.15);
  cv.style.width = (W * esc) + 'px';
  cv.style.height = (H * esc) + 'px';
  cv.width = Math.round(W * esc * dpr);
  cv.height = Math.round(H * esc * dpr);
  ctx.setTransform(esc * dpr, 0, 0, esc * dpr, 0, 0);

  const sobra = (wrap.clientWidth - W * esc) / 2;
  const cabe = sobra >= 88;
  document.body.classList.toggle('semLados', !cabe);
  if (cabe) {
    const lw = Math.min(sobra - 16, H * esc * .70, 200);
    wrap.style.setProperty('--ladoW', Math.round(lw) + 'px');
  }
  checarOrientacao();
}
window.addEventListener('resize', () => setTimeout(ajustarEscala, 60));
window.addEventListener('orientationchange', () => setTimeout(ajustarEscala, 220));

function checarOrientacao() {
  document.getElementById('girar')
    .classList.toggle('ativa', window.innerHeight > window.innerWidth * 1.05);
}

/* =======================================================================
   PHYSICS
   One function for the real cap and for every AI simulation. Only the
   soundtrack changes (silencioso = true).

   Read this before editing: anything that MUTATES the world (nail shoving,
   golden-nail rewards, combo tracking) must stay behind the `!silencioso`
   guard, otherwise the AI's hundreds of look-ahead runs would rewrite the
   board while it is only thinking.
   ======================================================================= */
function passoFisico(e, silencioso) {
  const rb = e.r || R_BOLA;
  const kq = e.quique || 1;
  const sub = 3;

  for (let s = 0; s < sub; s++) {
    /* spin → a sideways force proportional to speed (curve shot) */
    if (e.giro) {
      const v = Math.hypot(e.vx, e.vy);
      if (v > 0.05) {
        const nx = -e.vy / v, ny = e.vx / v;
        e.vx += nx * e.giro * v / sub;
        e.vy += ny * e.giro * v / sub;
      }
      e.giro *= 0.986;
    }
    /* wet surface: the cap never quite goes where it was sent */
    if (ESCORREGA) {
      const dado = silencioso ? (Math.random() - .5) : Aleatorio.meio();
      const dado2 = silencioso ? (Math.random() - .5) : Aleatorio.meio();
      e.vx += dado * ESCORREGA;
      e.vy += dado2 * ESCORREGA;
    }

    e.x += e.vx / sub;
    e.y += e.vy / sub;

    let maisPerto = 999;

    for (const pr of pregos) {
      const T = PREGOS_TIPO[pr.tipo] || PREGOS_TIPO.normal;
      const dx = e.x - pr.x, dy = e.y - pr.y;
      /* A heavy cap shoves a loose nail aside during contact, so it bites
         slightly deeper before deflecting; a light cap glances off early.
         The same folga applies in the AI's look-ahead, so a heavy cap's
         advantage is something the search can actually see and use. */
      const folga = (T.fixo ? 1 : Math.max(0.80, Math.min(1.05, 1 - ((e.empurra || 1) - 1) * 0.22)));
      const d = Math.hypot(dx, dy), min = rb + R_PREGO * folga;

      /* magnetic nail: a gentle pull, strongest up close */
      if (T.ima && d < T.ima && d > min) {
        const vel0 = Math.hypot(e.vx, e.vy);
        const f = (1 - d / T.ima) * 0.13 / sub;
        e.vx -= (dx / d) * f * vel0;
        e.vy -= (dy / d) * f * vel0;
      }

      if (d >= min) { if (d - min < maisPerto) maisPerto = d - min; continue; }
      if (d <= 1e-4) continue;

      const nx = dx / d, ny = dy / d;
      e.x = pr.x + nx * min; e.y = pr.y + ny * min;
      const proj = e.vx * nx + e.vy * ny, vel = Math.hypot(e.vx, e.vy);
      const rest = Math.min(1.06, RESTITUICAO * T.quique * kq);
      let rvx = (e.vx - 2 * proj * nx) * rest;
      let rvy = (e.vy - 2 * proj * ny) * rest;
      /* bent nail: same energy, unpredictable angle */
      if (T.desvio) {
        const m = Math.hypot(rvx, rvy);
        const sorte = silencioso ? (Math.random() - .5) : Aleatorio.meio();
        const a = Math.atan2(rvy, rvx) + sorte * 2 * T.desvio;
        rvx = Math.cos(a) * m; rvy = Math.sin(a) * m;
      }
      e.vx = rvx; e.vy = rvy;

      if (!silencioso) {
        pr.tremor = 1;
        Jogada.bateuPrego(pr.tipo, pr.id);
        if (vel > .7) {
          if (pr.tipo === 'bouncy') Som.pregoMola(vel); else Som.prego(vel);
          FX.impacto(pr.x + nx * min, pr.y + ny * min, nx, ny, vel, T.cor);
        }
        /* heavy caps shove anything that is not nailed down */
        if (!T.fixo) {
          const push = Math.min(3.4, vel * 0.13) * (e.empurra || 1);
          pr.x -= nx * push; pr.y -= ny * push;
          pr.x = Math.max(CAMPO.x + 6, Math.min(CAMPO.x + CAMPO.w - 6, pr.x));
          pr.y = Math.max(CAMPO.y + 6, Math.min(CAMPO.y + CAMPO.h - 6, pr.y));
        }
        /* golden nail: the bonus object, once per flick */
        if (T.bonus && !pr.tocado) {
          pr.tocado = true;
          Especiais.ganhar(e.dono || 1, 2);
          Modo.contarDourado();
          Stats.dourado(e.dono || 1);
          Som.pregoDourado();
          FX.solta(pr.x, pr.y, 22, '#FFD24A', 2.6, 'brilho');
          FX.grito(t('earnedCharge'), '', '#FFD24A');
        }
      }
    }
    if (!silencioso && maisPerto < 999) Jogada.quasePrego(maisPerto);

    /* holes swallow the cap: the turn is lost (EXTREME) */
    for (const h of buracos) {
      if (Math.hypot(e.x - h.x, e.y - h.y) < h.r * 0.75) return -1;
    }

    const naBoca = Math.abs(e.y - CY) < GOL_MEIA - rb * .35;
    const vel = Math.hypot(e.vx, e.vy);
    const restP = Math.min(1.02, REST_PAREDE * kq);

    /* Hitting the end wall just wide of the mouth, at pace, attacking
       the goal you are supposed to attack: that is a near miss and the
       crowd should react to it. */
    const rente = !naBoca && Math.abs(e.y - CY) < GOL_MEIA + 26 && vel > 2.2;

    if (e.x + rb > CAMPO.x + CAMPO.w) {                 // right goal
      if (naBoca) { if (e.x > CAMPO.x + CAMPO.w + 1) return 1; }
      else {
        if (!silencioso && rente && e.dono === 1) Jogada.quase = true;
        e.x = CAMPO.x + CAMPO.w - rb; e.vx = -e.vx * restP; bateuNaRipa(e, silencioso, vel, -1, 0);
      }
    }
    if (e.x - rb < CAMPO.x) {                           // left goal
      if (naBoca) { if (e.x < CAMPO.x - 1) return 2; }
      else {
        if (!silencioso && rente && e.dono === 2) Jogada.quase = true;
        e.x = CAMPO.x + rb; e.vx = -e.vx * restP; bateuNaRipa(e, silencioso, vel, 1, 0);
      }
    }
    if (e.y - rb < CAMPO.y) {
      e.y = CAMPO.y + rb; e.vy = -e.vy * restP; bateuNaRipa(e, silencioso, vel, 0, 1);
    }
    if (e.y + rb > CAMPO.y + CAMPO.h) {
      e.y = CAMPO.y + CAMPO.h - rb; e.vy = -e.vy * restP; bateuNaRipa(e, silencioso, vel, 0, -1);
    }
  }
  const at = ATRITO * (e.atrito || 1);
  e.vx *= at; e.vy *= at;
  return 0;
}

function bateuNaRipa(e, silencioso, vel, nx, ny) {
  if (silencioso) return;
  Jogada.bateuParede();
  if (vel > .7) {
    Som.madeira(vel);
    FX.impacto(e.x, e.y, nx, ny, vel, '#E8D6B0');
  }
}

/* One physics tick of the real cap. */
function passo() {
  if (fase !== 'rolando') return;
  acomodarPregos(1);                     // deterministic: one tick, one step
  const antesX = bola.x, antesY = bola.y;
  const r = passoFisico(bola, false);
  Jogada.andou(Math.hypot(bola.x - antesX, bola.y - antesY));

  const lenta = Math.hypot(bola.vx, bola.vy) < PARADO;
  const demorou = inicioDaJogada && performance.now() - inicioDaJogada > 8000;

  if (Rede.pendente) {
    /* Replay of the opponent's flick: let it animate, then take the
       result off the wire instead of trusting local floating point.
       The tick cap matters — if the local replay diverges enough to keep
       rolling forever, the match must still move on. */
    if (r === -1 || r || lenta || demorou || relogio > 1500) {
      bola.vx = bola.vy = 0; bola.giro = 0;
      fecharRemota();
    }
    return;
  }

  /* My own flick: resolve it locally, then ship the result. Capture
     happens AFTER the outcome runs so the combo label is already picked. */
  if (r === -1) { caiuNoBuraco(); if (Rede.emCurso) Rede.concluir(capturarEstado(0, true)); return; }
  if (r) {
    if (peteleco >= PETELECOS) registrarGol(r);
    else golCedoDemais(r);
    if (Rede.emCurso) Rede.concluir(capturarEstado(r, false));
    return;
  }
  if (lenta || demorou) {
    bola.vx = bola.vy = 0; bola.giro = 0;
    fimDoToque();
    if (Rede.emCurso) Rede.concluir(capturarEstado(0, false));
  }
}

function caiuNoBuraco() {
  bola.vx = bola.vy = 0; bola.giro = 0;
  fase = 'pausa';
  Som.buraco();
  FX.solta(bola.x, bola.y, 20, '#141414', 1.6);
  FX.grito(t('holeIn'), '', '#EC5648');
  setTimeout(() => { bola.x = CX; bola.y = CY; passarAVez(); }, 1100);
}

/* Kept from the original build: with PETELECOS = 1 this path is unreachable,
   but the rule (a goal before the series is complete does not count) is
   preserved so raising PETELECOS keeps working. */
function golCedoDemais(dono) {
  bola.vx = bola.vy = 0;
  fase = 'pausa';
  Som.apito(false);
  const faltam = PETELECOS - peteleco;
  mostrarAviso('TOO EARLY', `Goal counts on flick ${PETELECOS} · ${faltam} to go`, 1300);
  setTimeout(() => {
    bola.x = CX; bola.y = CY; bola.vx = bola.vy = 0;
    fase = 'mirando';
    atualizarHUD();
    if (modo === 'ia' && jogador === 2 && !Rede.ativo) talvezIA();
  }, 1300);
}

/* =======================================================================
   AI (spec §8)
   It does not "kick towards the goal": it simulates hundreds of flicks
   with the real physics and keeps the best outcome. Because a nail blocks
   the straight shot, it finds the bank shots by itself.

   Difficulty is angular error and search depth — never extra force, never
   a physics exemption. INSANE is simply a machine that aims within 0.2°.
   ======================================================================= */
/* The body used for look-ahead has to carry the CAP STATS OF WHOEVER IS
   SHOOTING, otherwise the AI would plan a heavy cap's shot with a light
   cap's physics and miss every time. */
function corpoDe(quem) {
  const c = tampaDe(quem);
  return { x: bola.x, y: bola.y, vx: 0, vy: 0, r: R_BOLA * (c.raio / 8.5),
           quique: c.quique, empurra: c.empurra, atrito: c.atrito, giro: 0, dono: quem };
}

function simular(vx, vy, molde) {
  const e = Object.assign({}, molde || corpoDe(2));
  e.x = bola.x; e.y = bola.y; e.vx = vx; e.vy = vy; e.giro = 0;
  let i = 0;
  for (; i < 420; i++) {
    const r = passoFisico(e, true);
    if (r) return { gol: r, x: e.x, y: e.y, passos: i };
    if (Math.hypot(e.vx, e.vy) < PARADO) break;
  }
  return { gol: 0, x: e.x, y: e.y, passos: i };
}

/* Is there a clear line from (x,y) to the opposite goal mouth? */
function linhaLivre(x, y, paraDireita) {
  const gx = paraDireita ? CAMPO.x + CAMPO.w : CAMPO.x;
  for (const alvoY of [CY - GOL_MEIA * .5, CY, CY + GOL_MEIA * .5]) {
    const dx = gx - x, dy = alvoY - y, comp = Math.hypot(dx, dy);
    if (comp < 1) return true;
    const ux = dx / comp, uy = dy / comp;
    let livre = true;
    for (const pr of pregos) {
      const tt = (pr.x - x) * ux + (pr.y - y) * uy;
      if (tt < 0 || tt > comp) continue;
      const px = x + ux * tt, py = y + uy * tt;
      if (Math.hypot(pr.x - px, pr.y - py) < R_PREGO + R_BOLA) { livre = false; break; }
    }
    if (livre) return true;
  }
  return false;
}

function avaliar(res, quem) {
  const paraDireita = quem === 1;
  const podeMarcar = (peteleco + 1) >= PETELECOS;
  if (res.gol === -1) return -60000;                 // fell in a hole
  if (res.gol === quem) return podeMarcar ? 100000 - res.passos : -50000;
  if (res.gol) return -100000;                       // own goal
  const gx = paraDireita ? CAMPO.x + CAMPO.w : CAMPO.x;
  const meuGx = paraDireita ? CAMPO.x : CAMPO.x + CAMPO.w;
  const dAlvo = Math.hypot(gx - res.x, CY - res.y);
  const dMeu = Math.hypot(meuGx - res.x, CY - res.y);
  let s = 900 - dAlvo;                               // get closer to their goal
  if (linhaLivre(res.x, res.y, paraDireita)) s += 260;
  s += Math.min(dMeu, 340) * 0.55;                   // and away from mine
  return s;
}

function testar(ang, forca, quem, melhor, molde) {
  const res = simular(Math.cos(ang) * forca, Math.sin(ang) * forca, molde);
  const nota = avaliar(res, quem);
  return (!melhor || nota > melhor.nota) ? { nota, ang, forca, res } : melhor;
}

function melhorJogada(quem, tetoForca, molde) {
  molde = molde || corpoDe(quem);
  const teto = tetoForca || FORCA_MAX * tampaDe(quem).forca;
  const n = NIVEIS[nivel] || NIVEIS.normal;
  let melhor = null, segundo = null;
  const forcas = [teto * .38, teto * .55, teto * .72, teto * .88, teto];
  const passoBruto = n.refina ? 5 : 9;
  for (let a = 0; a < 360; a += passoBruto) {
    const rad = a * Math.PI / 180;
    for (const f of forcas) {
      const antes = melhor;
      melhor = testar(rad, f, quem, melhor, molde);
      if (melhor !== antes && antes) segundo = antes;
    }
  }
  if (!n.refina) {
    /* EASY sometimes commits to the second-best idea — that is what makes
       it look like a person misreading the table, not a broken bot. */
    return (segundo && Math.random() < n.duvida) ? segundo : melhor;
  }
  const grau = Math.PI / 180;
  for (let da = -4; da <= 4; da++) {
    for (const mult of [.88, .94, 1, 1.06, 1.12]) {
      const f = Math.min(teto, melhor.forca * mult);
      melhor = testar(melhor.ang + da * grau, f, quem, melhor, molde);
    }
  }
  if (n.fino) {                                     // INSANE: sub-degree polish
    for (let da = -8; da <= 8; da++) {
      for (const mult of [.97, 1, 1.03]) {
        const f = Math.min(teto, melhor.forca * mult);
        melhor = testar(melhor.ang + da * grau * 0.25, f, quem, melhor, molde);
      }
    }
  }
  return melhor;
}

function jogadaIA() {
  if (fase !== 'ia') return;
  const n = NIVEIS[nivel] || NIVEIS.normal;
  const c = tampaDe(2);
  const molde = corpoDe(2);
  let escolha = melhorJogada(2, FORCA_MAX * c.forca, molde);
  let esp = null;

  /* The AI gets the same special shots the player does, on the same terms:
     it only arms POWER when its best idea is already at maximum force and
     it has paid for the charges. No exclusive abilities (spec §8). */
  if ((nivel === 'hard' || nivel === 'insane') &&
      escolha.res.gol !== 2 &&
      escolha.forca > FORCA_MAX * c.forca * 0.98 &&
      Especiais.disponivel(2, 'power')) {
    const teto = FORCA_MAX * c.forca * ESPECIAIS.power.forca;
    const tentativa = melhorJogada(2, teto, molde);
    if (tentativa.nota > escolha.nota) {
      escolha = tentativa;
      Especiais.armar(2, 'power');
      esp = Especiais.consumir(2);
      if (esp) Stats.especial(2);
    }
  }

  const ang = escolha.ang + (Math.random() - .5) * 2 * n.erroAng
              + (Math.random() - .5) * 2 * c.tremor;
  const teto = FORCA_MAX * c.forca * (esp ? esp.forca : 1);
  const forca = Math.min(teto, escolha.forca * (1 + (Math.random() - .5) * 2 * n.erroForca));
  miraIA = { x: bola.x, y: bola.y, ang, forca, cor: esp ? esp.cor : null };
  setTimeout(() => { miraIA = null; chutar(2, ang, forca, esp); }, n.pensar);
}

function talvezIA() {
  if (Rede.ativo) return;              // online: the other side is a person
  if (modo === 'ia' && jogador === 2 && fase === 'mirando') {
    fase = 'ia';
    atualizarHUD();
    setTimeout(jogadaIA, 300);
  }
}

/* =======================================================================
   SHOOTING — the single path taken by the pointer, the keyboard and the AI
   ======================================================================= */
function chutar(quem, ang, forca, esp) {
  const c = tampaDe(quem);
  bola.dono = quem;
  bola.r = R_BOLA * (c.raio / 8.5);
  bola.atrito = c.atrito;
  bola.empurra = c.empurra;
  bola.quique = c.quique * (esp ? esp.quique : 1);
  bola.giro = esp ? esp.giro : 0;
  bola.vx = Math.cos(ang) * forca;
  bola.vy = Math.sin(ang) * forca;

  pregos.forEach(p => { p.tocado = false; });
  Jogada.iniciar(quem, bola.x, bola.y, esp ? esp.tipo : null);
  Stats.chute(quem);
  peteleco++;
  fase = 'rolando';
  relogio = 0;
  inicioDaJogada = performance.now();
  Modo.gastarTiro();

  Som.peteleco(forca);
  if (esp) { Som.especial(); FX.solta(bola.x, bola.y, 16, esp.cor, 2.2, 'faisca'); }
  FX.sacudir(1 + forca * 0.10);
  atualizarHUD();
}


/* ==================================================================
   Online: capturing and applying an authoritative board.

   Only what can actually differ travels: the cap, the nails that were
   shoved out of place, the score and the outcome. A full board would be
   ~2 KB per turn for no gain.
   ================================================================== */
function capturarEstado(gol, buraco) {
  const movidos = [];
  pregos.forEach((p, i) => {
    if (Math.abs(p.x - p.x0) > 0.01 || Math.abs(p.y - p.y0) > 0.01)
      movidos.push([i, +p.x.toFixed(3), +p.y.toFixed(3)]);
  });
  return {
    b: [+bola.x.toFixed(3), +bola.y.toFixed(3)],
    p: movidos,
    gol: gol || 0,
    buraco: !!buraco,
    reb: Jogada.rebotes || 0,
    combo: Jogada.ultimoCombo || null
  };
}

function aplicarEstado(s) {
  if (!s) return;
  bola.x = s.b[0]; bola.y = s.b[1];
  bola.vx = bola.vy = 0; bola.giro = 0;
  pregos.forEach(p => { p.x = p.x0; p.y = p.y0; });
  (s.p || []).forEach(m => {
    const p = pregos[m[0]];
    if (p) { p.x = m[1]; p.y = m[2]; }
  });
}

/* Replaying the opponent's flick. The animation runs on local physics
   because it looks right; the RESULT never does — it comes off the wire.
   That is the whole reason this cannot desync. */
function jogadaRemota(m) {
  Aleatorio.semente(m.semente);
  Rede.pendente = m.fim;
  const esp = m.esp ? ESPECIAIS[m.esp] : null;
  if (esp) Especiais.armar(m.de, m.esp, true);
  jogador = m.de;
  chutar(m.de, m.ang, m.forca, esp);
}

/* Called by passo() the moment the replayed shot resolves, whatever the
   local simulation happened to think. */
function fecharRemota() {
  const s = Rede.pendente;
  Rede.pendente = null;
  aplicarEstado(s);
  if (s && s.combo) Jogada.forcar(s.combo, s.reb);
  if (s && s.gol) { registrarGol(s.gol); return; }
  if (s && s.buraco) {
    Som.buraco();
    FX.grito(t('holeIn'), '', '#EC5648');
    setTimeout(() => { bola.x = CX; bola.y = CY; passarAVez(); }, 1100);
    fase = 'pausa';
    return;
  }
  fimDoToque();
}

/* ---------------------- rules ---------------------- */
function novaPartida(cfg) {
  const c = cfg || {};
  alvoGols = c.alvo || ALVO_PADRAO;
  placar = { 1:0, 2:0 };
  jogador = 1; peteleco = 0; fase = 'mirando';
  aplicarCampo();
  montarPregos();
  bola.x = CX; bola.y = CY; bola.vx = bola.vy = 0; bola.giro = 0; bola.dono = 1;
  bola.r = R_BOLA * (tampaDe(1).raio / 8.5);
  if (c.desafio && c.desafio.bola) {
    bola.x = CAMPO.x + c.desafio.bola.fx * CAMPO.w;
    bola.y = CAMPO.y + c.desafio.bola.fy * CAMPO.h;
  }
  Stats.zerar();
  Especiais.zerar();
  Jogada.iniciar(1, bola.x, bola.y, null);
  FX.limpar();
  esconderAviso(); encerrarFesta(); esconderFim(); atualizarHUD();

  const f = campo();
  FX.grito(f.nome, f.frase, '#FFD24A');
  if (Modo.ehFinal()) FX.grito(t('theFinal'), '', '#EC5648');
  if (typeof jaIniciou === 'undefined' || jaIniciou) Som.inicio();
  talvezIA();
}

function recomecarDoMeio(quemComeca) {
  bola.x = CX; bola.y = CY; bola.vx = bola.vy = 0; bola.giro = 0;
  jogador = quemComeca; bola.dono = quemComeca;
  peteleco = 0; fase = 'mirando';
  atualizarHUD(); talvezIA();
}

function registrarGol(dono) {
  bola.vx = bola.vy = 0; bola.giro = 0;
  fase = 'pausa';

  /* --- describe the goal before touching the score (spec §9) --- */
  const gx = dono === 1 ? CAMPO.x + CAMPO.w : CAMPO.x;
  const distGol = Math.hypot(gx - Jogada.x0, CY - Jogada.y0);
  const combo = Jogada.avaliar(distGol);
  const grito = sorteio(t('goalCries'));
  Stats.gol(dono);
  Stats.quiques(dono, Jogada.rebotes);
  if (combo) {
    Stats.combo(dono);
    Especiais.ganhar(dono, combo.cargas);
    FX.grito(t(combo.chave), grito, '#FFD24A');
  } else {
    FX.grito(grito, '', '#FFF6DC');
  }

  /* --- the goal itself (spec §5) --- */
  const cl = clube(dono), cp = tampaDe(dono);
  FX.golExplosao(bola.x, bola.y, [cl.c1, cp.c1]);
  FX.devagar(34);
  FX.focar(bola.x, bola.y, 1.28, 52);
  brilhoGol = 1;
  Som.gol();

  /* --- a challenge is decided by the goal, not by the score --- */
  if (Modo.tipo === 'desafio') {
    const ok = Modo.desafioCumprido(Jogada);
    fase = 'fim';
    atualizarHUD();
    setTimeout(() => fimDeJogo(ok ? 1 : 2), 1500);
    return;
  }

  placar[dono]++;
  atualizarHUD();

  if (placar[dono] >= alvoGols) {
    fase = 'fim';
    setTimeout(() => Som.apito(true), 900);
    setTimeout(() => fimDeJogo(dono), 1250);
    return;
  }
  setTimeout(() => recomecarDoMeio(dono === 1 ? 2 : 1), 1500);
}

function fimDeJogo(vencedor) {
  fase = 'fim';
  const humano = vencedor === 1 || modo === '2p' ||
                 (Rede.ativo && vencedor === Rede.sou);
  /* Full time whistle first, then the reaction — the whistle is what
     ends the match, so it has to land before the celebration. */
  Som.apitoFinal();
  setTimeout(() => {
    if (humano) Som.fanfarra(); else Som.derrota();
  }, 900);
  /* The winner's crest goes up either way — losing to a club you can see
     named is better feedback than an empty table. Only the confetti is
     reserved for actually winning. */
  celebrar(vencedor, humano);
  const plano = Modo.fimDaPartida(vencedor);
  atualizarHUD();
  mostrarFim(plano, vencedor);
}

function passarAVez() {
  jogador = jogador === 1 ? 2 : 1;
  peteleco = 0;
  bola.dono = jogador;
  bola.vx = bola.vy = 0; bola.giro = 0;
  fase = 'mirando';
  atualizarHUD();
  talvezIA();
}

function reagirAoQuase() {
  if (!Jogada.quase) return;
  Jogada.quase = false;
  Som.torcida();
  FX.grito(t('soClose'), '', '#FFD24A');
}

function fimDoToque() {
  reagirAoQuase();
  /* challenge: the shot budget is the whole game */
  if (Modo.tipo === 'desafio') {
    if (Modo.desafioPerdido()) {
      fase = 'fim';
      setTimeout(() => fimDeJogo(2), 700);
      return;
    }
    fase = 'mirando';
    atualizarHUD();
    return;
  }
  if (peteleco < PETELECOS) {            // series not finished: same player again
    fase = 'mirando';
    atualizarHUD();
    if (modo === 'ia' && jogador === 2 && !Rede.ativo) talvezIA();
    return;
  }
  /* The cap STAYS where the previous player left it — the next player
     plays from that position. Only the velocity is cleared. */
  Som.apito(false);
  passarAVez();
}

/* ---------------------- HUD ---------------------- */
const elGolsA = document.getElementById('golsA'), elGolsB = document.getElementById('golsB');
const elTimeA = document.getElementById('timeA'), elTimeB = document.getElementById('timeB');
const elAviso = document.getElementById('aviso'), elQuem = document.getElementById('quemJoga');
const elLadoA = document.getElementById('ladoA'), elLadoB = document.getElementById('ladoB');
const elEscudoA = document.getElementById('escudoA'), elEscudoB = document.getElementById('escudoB');
const elLadoNomeA = document.getElementById('ladoNomeA'), elLadoNomeB = document.getElementById('ladoNomeB');
const elCampeao = document.getElementById('campeao'), elConfetes = document.getElementById('confetes');
const elCargas = document.getElementById('cargas'), elEspeciais = document.getElementById('especiais');
const elRotulo = document.getElementById('rotuloModo');

/* ---------------------- crest cropped from the artwork ---------------------- */
const CORTE_TOPO = 1.5, CORTE_BASE = 22;      // % of the cell height
function estiloEscudo(chave) {
  const f = folhaDe(chave);
  const i = ELENCOS[f].ordem.indexOf(chave);
  if (i < 0) return '';
  const a = AREAS[i];
  const tp = a.t + a.h * CORTE_TOPO / 100;
  const h = a.h * (100 - CORTE_TOPO - CORTE_BASE) / 100;
  return `aspect-ratio:${(a.w * 1586).toFixed(1)}/${(h * 992).toFixed(1)};` +
         `background-image:url('${ELENCOS[f].arte}');` +
         `background-size:${(10000 / a.w).toFixed(3)}% ${(10000 / h).toFixed(3)}%;` +
         `background-position:${(a.l / (100 - a.w) * 100).toFixed(3)}% ` +
                             `${(tp / (100 - h) * 100).toFixed(3)}%;`;
}
function pintarEscudo(el, chave) {
  if (!el || el.dataset.time === chave) return;
  el.style.cssText = estiloEscudo(chave);
  el.dataset.time = chave;
}

function fundoCamisa(cl) {
  switch (cl.padrao) {
    case 'listras':  return `repeating-linear-gradient(90deg,${cl.c1} 0 25%,${cl.c2} 25% 50%)`;
    case 'listras3': return `linear-gradient(90deg,${cl.c1} 0 33.3%,${cl.c3} 33.3% 66.6%,${cl.c2} 66.6%)`;
    case 'faixas':   return `repeating-linear-gradient(180deg,${cl.c1} 0 25%,${cl.c2} 25% 50%)`;
    case 'faixas3':  return `linear-gradient(180deg,${cl.c1} 0 33.3%,${cl.c2} 33.3% 66.6%,${cl.c3} 66.6%)`;
    case 'diagonal': return `linear-gradient(135deg,${cl.c1} 0 32%,${cl.c2} 32% 62%,${cl.c1} 62%)`;
    case 'gola':     return `linear-gradient(180deg,${cl.c2} 0 26%,${cl.c1} 26%)`;
    case 'metades':  return `linear-gradient(90deg,${cl.c1} 0 50%,${cl.c2} 50%)`;
    default:         return cl.c1;
  }
}

function atualizarHUD() {
  const cA = clube(1), cB = clube(2);
  const marca = modo === 'ia' ? ` · ${t('ai')} ${t(nivel)}` : '';
  document.getElementById('nomeA').textContent = `${t('player1')} · ${tampaDe(1).nome}`;
  document.getElementById('nomeB').textContent =
    (modo === 'desafio' ? campo().nome : t('player2') + marca);
  document.getElementById('corA').style.background = fundoCamisa(cA);
  document.getElementById('corB').style.background = fundoCamisa(cB);
  elGolsA.textContent = placar[1]; elGolsB.textContent = placar[2];
  elTimeA.classList.toggle('ativo', jogador === 1 && fase !== 'fim');
  elTimeB.classList.toggle('ativo', jogador === 2 && fase !== 'fim');

  pintarEscudo(elEscudoA, times[1]);
  pintarEscudo(elEscudoB, times[2]);
  elLadoNomeA.textContent = cA.nome;
  elLadoNomeB.textContent = cB.nome;
  elLadoA.classList.toggle('ativo', jogador === 1 && fase !== 'fim');
  elLadoB.classList.toggle('ativo', jogador === 2 && fase !== 'fim');

  if (elRotulo) elRotulo.textContent = Modo.rotulo();

  if (fase === 'fim') { elQuem.textContent = t('over'); elQuem.className = 'quem'; }
  else if (fase === 'ia') { elQuem.textContent = t('thinking'); elQuem.className = 'quem pensando'; }
  else if (Modo.tipo === 'desafio') {
    elQuem.innerHTML = `${Modo.desafio ? Modo.desafio.nome : ''}` +
      `<br><span class="serie">${t('attemptsLeft', Math.max(0, Modo.tirosRestantes))}</span>`;
    elQuem.className = 'quem';
  } else {
    elQuem.innerHTML = `${t('player' + jogador)}` +
      `<br><span class="serie">${t('yourTurn')} · ${t('scores')}</span>`;
    elQuem.className = 'quem';
  }
  atualizarEspeciais();
}

/* Special-shot bar: four buttons, one per ability, dark until the player
   has actually earned the charges (spec §6). */
function atualizarEspeciais() {
  if (!elEspeciais) return;
  const n = jogador;
  if (elCargas) elCargas.textContent = Especiais.cargas[n];
  for (const b of elEspeciais.querySelectorAll('button')) {
    const k = b.dataset.esp;
    const e = ESPECIAIS[k];
    if (!e) continue;
    b.classList.toggle('pode', Especiais.disponivel(n, k));
    b.classList.toggle('armado', Especiais.armado[n] === k);
    b.title = `${t(e.chave)} · ${e.custo} ${t('charges')}`;
  }
}

let timerAviso = null;
function mostrarAviso(tt, s, ms = 1400) {
  elAviso.querySelector('b').textContent = tt;
  elAviso.querySelector('span').textContent = s;
  elAviso.classList.add('show');
  clearTimeout(timerAviso);
  if (ms) timerAviso = setTimeout(esconderAviso, ms);
}
function esconderAviso() { elAviso.classList.remove('show'); }

/* ---------------------- champion party ---------------------- */
function soltarConfete(cl) {
  elConfetes.innerHTML = '';
  const cores = [cl.c1, cl.c2, cl.c3 || '#FFD24A', '#FFD24A', '#FFF6DC'];
  const queda = wrap.clientHeight + 60;
  for (let i = 0; i < 44; i++) {
    const p = document.createElement('i');
    p.className = 'confete';
    p.style.cssText =
      `left:${(Math.random() * 100).toFixed(1)}%;` +
      `width:${(4 + Math.random() * 4).toFixed(0)}px;` +
      `height:${(8 + Math.random() * 7).toFixed(0)}px;` +
      `background:${cores[i % cores.length]};` +
      `animation-duration:${(2.1 + Math.random() * 2.3).toFixed(2)}s;` +
      `animation-delay:${(Math.random() * 2.6).toFixed(2)}s;` +
      `--dist:${queda}px;--giro:${(Math.random() * 1000 - 500).toFixed(0)}deg;`;
    elConfetes.appendChild(p);
  }
}

function celebrar(dono, festa) {
  const cl = clube(dono);
  esconderAviso();
  document.getElementById('tacaEscudo').style.cssText = estiloEscudo(times[dono]);
  document.getElementById('nomeCampeao').textContent = `${t('player' + dono)} · ${cl.nome}`;
  document.getElementById('placarFinal').textContent = `${placar[1]} × ${placar[2]} · ${campo().nome}`;
  if (festa) soltarConfete(cl);   // confetti only when the player won
  elCampeao.classList.remove('on');
  void elCampeao.offsetWidth;                // restart the animations
  elCampeao.classList.add('on');
  elLadoA.classList.toggle('venceu', dono === 1);
  elLadoB.classList.toggle('venceu', dono === 2);
  elLadoA.classList.toggle('perdeu', dono !== 1);
  elLadoB.classList.toggle('perdeu', dono !== 2);
}

function encerrarFesta() {
  elCampeao.classList.remove('on');
  elConfetes.innerHTML = '';
  elLadoA.classList.remove('venceu', 'perdeu');
  elLadoB.classList.remove('venceu', 'perdeu');
}

/* =======================================================================
   INPUT — pointer (the original gesture, untouched) plus a keyboard for
   two players sharing one device (spec §7).
   ======================================================================= */
function posNoCanvas(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
}
const minhaVez = () => fase === 'mirando' && !(modo === 'ia' && jogador === 2);

cv.addEventListener('pointerdown', ev => {
  Som.ligar();
  if (!minhaVez()) return;
  const p = posNoCanvas(ev);
  if (Math.hypot(p.x - bola.x, p.y - bola.y) > 74) return;
  mira = p; teclado.ativo = false;
  cv.setPointerCapture(ev.pointerId);
});
cv.addEventListener('pointermove', ev => {
  if (!mira) return;
  mira = posNoCanvas(ev);
  calcularFantasma();
});
cv.addEventListener('pointerup', () => {
  if (!mira || !minhaVez()) { mira = null; fantasma = null; return; }
  const dx = bola.x - mira.x, dy = bola.y - mira.y, d = Math.hypot(dx, dy);
  mira = null; fantasma = null;
  if (d < 9) return;
  lancar(Math.atan2(dy, dx), Math.min(d / 7, FORCA_MAX));
});
cv.addEventListener('pointercancel', () => { mira = null; fantasma = null; });

/* Turns a raw aim into a real shot: cap stats, wobble, special shot. */
function lancar(ang, forcaBruta) {
  if (!Rede.minhaVez(jogador)) return;
  const c = tampaDe(jogador);
  /* Seed BEFORE the wobble: the wobble is part of the shot the opponent
     has to be able to reproduce. */
  const semente = Aleatorio.nova();
  const esp = Especiais.consumir(jogador);
  if (esp) Stats.especial(jogador);
  const mult = c.forca * (esp ? esp.forca : 1);
  const forca = Math.min(FORCA_MAX * mult, forcaBruta * mult);
  /* the price of a fast cap: it never leaves exactly where you pointed */
  if (!(esp && ESPECIAIS[esp.tipo].firme) && c.tremor) {
    ang += Aleatorio.meio() * 2 * c.tremor;
  }
  Rede.registrar(ang, forca, esp, semente);
  chutar(jogador, ang, forca, esp);
}

/* Predicted path, offered only by the PRECISION shot — handing it out for
   free would remove the skill the whole game is about. */
function calcularFantasma() {
  const esp = Especiais.emMira(jogador);
  if (!esp || !esp.guia || !mira) { fantasma = null; return; }
  const dx = bola.x - mira.x, dy = bola.y - mira.y, d = Math.hypot(dx, dy);
  if (d < 9) { fantasma = null; return; }
  const c = tampaDe(jogador);
  const forca = Math.min(FORCA_MAX * c.forca, d / 7 * c.forca) * esp.forca;
  const ang = Math.atan2(dy, dx);
  const e = { x: bola.x, y: bola.y, vx: Math.cos(ang) * forca, vy: Math.sin(ang) * forca,
              r: R_BOLA * (c.raio / 8.5), quique: c.quique * esp.quique,
              atrito: c.atrito, empurra: 0, giro: 0 };
  const pts = [{ x: e.x, y: e.y }];
  for (let i = 0; i < 150; i++) {
    if (passoFisico(e, true)) break;
    if (i % 3 === 0) pts.push({ x: e.x, y: e.y });
    if (Math.hypot(e.vx, e.vy) < PARADO) break;
  }
  fantasma = pts;
}

/* --- keyboard: two players on one keyboard ---
   P1: A / D turn, W / S power, SPACE shoot.
   P2: ← / → turn, ↑ / ↓ power, ENTER shoot.
   Pointer play is untouched; this is an addition, not a replacement. */
const teclado = { ativo: false, ang: 0, forca: 0.55 };
const MAPA = {
  1: { esq:'KeyA', dir:'KeyD', mais:'KeyW', menos:'KeyS', chuta:'Space' },
  2: { esq:'ArrowLeft', dir:'ArrowRight', mais:'ArrowUp', menos:'ArrowDown', chuta:'Enter' }
};
window.addEventListener('keydown', ev => {
  if (!minhaVez()) return;
  const m = MAPA[jogador];
  if (!m) return;
  let usada = false;
  for (const k in m) if (m[k] === ev.code) usada = true;
  if (!usada) return;
  ev.preventDefault();
  if (!teclado.ativo) {
    teclado.ativo = true;
    teclado.ang = jogador === 1 ? 0 : Math.PI;   // start pointing at the target goal
  }
  if (ev.code === m.esq) teclado.ang -= 0.035;
  else if (ev.code === m.dir) teclado.ang += 0.035;
  else if (ev.code === m.mais) teclado.forca = Math.min(1, teclado.forca + 0.06);
  else if (ev.code === m.menos) teclado.forca = Math.max(0.12, teclado.forca - 0.06);
  else if (ev.code === m.chuta) {
    teclado.ativo = false;
    lancar(teclado.ang, FORCA_MAX * teclado.forca);
  }
});

/* ---------------------- drawing ---------------------- */
function desenharMesa() {
  const m = mesa();
  const gm = ctx.createLinearGradient(0, 0, W, H);
  gm.addColorStop(0, m.m1); gm.addColorStop(1, m.m2);
  ctx.fillStyle = gm; ctx.fillRect(0, 0, W, H);

  ctx.save(); ctx.globalAlpha = .12; ctx.strokeStyle = m.veio; ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const y = (i * 25 + 7) % H;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * .3, y + 6, W * .7, y - 6, W, y + 2); ctx.stroke();
  }
  ctx.restore();

  const gg = ctx.createLinearGradient(0, CAMPO.y, 0, CAMPO.y + CAMPO.h);
  gg.addColorStop(0, m.g1); gg.addColorStop(.5, m.g2); gg.addColorStop(1, m.g1);
  ctx.fillStyle = gg; ctx.fillRect(CAMPO.x, CAMPO.y, CAMPO.w, CAMPO.h);

  ctx.save(); ctx.globalAlpha = .07; ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 12; i += 2) ctx.fillRect(CAMPO.x + i * CAMPO.w / 12, CAMPO.y, CAMPO.w / 12, CAMPO.h);
  ctx.restore();

  ctx.strokeStyle = m.linha; ctx.lineWidth = 2;
  ctx.strokeRect(CAMPO.x + 7, CAMPO.y + 7, CAMPO.w - 14, CAMPO.h - 14);
  ctx.beginPath(); ctx.moveTo(CX, CAMPO.y + 7); ctx.lineTo(CX, CAMPO.y + CAMPO.h - 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, Math.min(54, CAMPO.h * .28), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 3.5, 0, Math.PI * 2); ctx.fillStyle = m.linha; ctx.fill();

  const areaH = Math.min(168, CAMPO.h * .62), areaW = 74;
  ctx.strokeStyle = m.linha;
  ctx.strokeRect(CAMPO.x + 7, CY - areaH / 2, areaW, areaH);
  ctx.strokeRect(CAMPO.x + CAMPO.w - 7 - areaW, CY - areaH / 2, areaW, areaH);

  desenharGol(CAMPO.x, -1);
  desenharGol(CAMPO.x + CAMPO.w, 1);
}

function desenharGol(x, dir) {
  const m = mesa(), prof = 12;
  ctx.save();
  const gg = ctx.createLinearGradient(x, 0, x + dir * prof, 0);
  gg.addColorStop(0, 'rgba(0,0,0,.55)'); gg.addColorStop(1, 'rgba(0,0,0,.85)');
  ctx.fillStyle = gg;
  ctx.fillRect(dir < 0 ? x - prof : x, CY - GOL_MEIA, prof, GOL_MEIA * 2);
  ctx.strokeStyle = m.rede; ctx.lineWidth = 1;
  for (let y = CY - GOL_MEIA; y <= CY + GOL_MEIA; y += 7) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * prof, y); ctx.stroke();
  }
  for (let i = 1; i < prof; i += 4) {
    ctx.beginPath(); ctx.moveTo(x + dir * i, CY - GOL_MEIA); ctx.lineTo(x + dir * i, CY + GOL_MEIA); ctx.stroke();
  }
  ctx.strokeStyle = '#F3EFE6'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + dir * prof, CY - GOL_MEIA); ctx.lineTo(x, CY - GOL_MEIA);
  ctx.moveTo(x + dir * prof, CY + GOL_MEIA); ctx.lineTo(x, CY + GOL_MEIA);
  ctx.stroke();
  ctx.restore();
}

function desenharBuracos() {
  for (const h of buracos) {
    const g = ctx.createRadialGradient(h.x, h.y, 1, h.x, h.y, h.r);
    g.addColorStop(0, '#000'); g.addColorStop(.7, '#0A0A0A'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.4; ctx.stroke();
  }
}

/* The club shirt painted inside a circle — used on the nails. */
function pintarCamisa(x, y, r, cl) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const d = r * 2, x0 = x - r, y0 = y - r;
  switch (cl.padrao) {
    case 'listras':
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? cl.c2 : cl.c1;
        ctx.fillRect(x0 + i * d / 4, y0, d / 4 + .6, d); } break;
    case 'listras3':
      [cl.c1, cl.c3, cl.c2].forEach((c, i) => { ctx.fillStyle = c;
        ctx.fillRect(x0 + i * d / 3, y0, d / 3 + .6, d); }); break;
    case 'faixas':
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? cl.c2 : cl.c1;
        ctx.fillRect(x0, y0 + i * d / 4, d, d / 4 + .6); } break;
    case 'faixas3':
      [cl.c1, cl.c2, cl.c3].forEach((c, i) => { ctx.fillStyle = c;
        ctx.fillRect(x0, y0 + i * d / 3, d, d / 3 + .6); }); break;
    case 'diagonal':
      ctx.fillStyle = cl.c1; ctx.fillRect(x0, y0, d, d);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = cl.c2; ctx.fillRect(-r, -r * .34, d, r * .68); ctx.restore(); break;
    case 'gola':
      ctx.fillStyle = cl.c1; ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = cl.c2; ctx.fillRect(x0, y0, d, d * .26); break;
    case 'metades':
      ctx.fillStyle = cl.c1; ctx.fillRect(x0, y0, d / 2 + .6, d);
      ctx.fillStyle = cl.c2; ctx.fillRect(x + 0, y0, d / 2, d); break;
    default:
      ctx.fillStyle = cl.c1; ctx.fillRect(x0, y0, d, d);
  }
  ctx.restore();
}

function desenharPregos() {
  const agora = Date.now();
  for (const pr of pregos) {
    const T = PREGOS_TIPO[pr.tipo] || PREGOS_TIPO.normal;
    const tr = pr.tremor > 0 ? Math.sin(pr.tremor * 22) * pr.tremor * 1.6 : 0;
    const x = pr.x + tr, y = pr.y;

    /* magnet: a faint field, so the pull is never a surprise */
    if (T.ima) {
      ctx.save();
      ctx.globalAlpha = .12 + Math.abs(Math.sin(agora / 700)) * .10;
      ctx.strokeStyle = T.cor; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, T.ima, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, T.ima * .6, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath(); ctx.arc(x + 1.5, y + 2.5, R_PREGO + 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill();

    const g = ctx.createRadialGradient(x - 2.4, y - 2.8, .5, x, y, R_PREGO + 2);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(.45, T.cor);
    g.addColorStop(.85, '#828A95'); g.addColorStop(1, '#4E555F');
    ctx.beginPath(); ctx.arc(x, y, R_PREGO + 1.4, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();

    if (pr.time) {
      pintarCamisa(x, y, R_PREGO - .2, clube(pr.time));
    } else {
      ctx.beginPath(); ctx.arc(x, y, R_PREGO - .2, 0, Math.PI * 2);
      ctx.fillStyle = T.cor; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, R_PREGO - .2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20,16,12,.6)'; ctx.lineWidth = 1; ctx.stroke();

    /* the golden nail pulses, so it reads as the bonus object it is */
    if (T.bonus) {
      const p = .5 + Math.abs(Math.sin(agora / 320)) * .5;
      ctx.save(); ctx.globalAlpha = .35 + p * .5;
      ctx.strokeStyle = '#FFD24A'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R_PREGO + 4 + p * 2.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (pr.tipo === 'heavy') {                     // a thicker collar reads as immovable
      ctx.beginPath(); ctx.arc(x, y, R_PREGO + 2.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(30,26,22,.55)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x - R_PREGO * .32, y - R_PREGO * .38, R_PREGO * .3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.fill();
  }
}

/* ---- the bottle cap ----
   Crimped skirt, painted top, a maker's mark and one highlight, all from
   primitives: no images, so it is sharp at any DPI and costs nothing to load. */
function desenharTampa(g, x, y, r, c, ang) {
  g.save();
  g.beginPath(); g.ellipse(x + 2, y + 3.2, r, r * .82, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,.42)'; g.fill();

  const dentes = 22;
  g.beginPath();
  for (let i = 0; i < dentes * 2; i++) {
    const a = (i / (dentes * 2)) * Math.PI * 2 + (ang || 0);
    const rr = r * (i % 2 ? 0.90 : 1.0);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  const gb = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gb.addColorStop(0, '#F2F2F2'); gb.addColorStop(.5, '#9AA1AA'); gb.addColorStop(1, '#5B626B');
  g.fillStyle = gb; g.fill();

  const gt = g.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r * .85);
  gt.addColorStop(0, c.c3 || '#FFFFFF'); gt.addColorStop(.45, c.c1); gt.addColorStop(1, c.c2);
  g.beginPath(); g.arc(x, y, r * .78, 0, Math.PI * 2);
  g.fillStyle = gt; g.fill();
  g.strokeStyle = 'rgba(20,16,12,.45)'; g.lineWidth = 1; g.stroke();

  g.save();
  g.translate(x, y); g.rotate(ang || 0);
  g.fillStyle = c.c2;
  const s = r * .42;
  switch (c.marca) {
    case 'estrela': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * .45 : s;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath(); g.fill(); break;
    }
    case 'raio':
      g.beginPath();
      g.moveTo(s * .2, -s); g.lineTo(-s * .5, s * .1);
      g.lineTo(0, s * .1); g.lineTo(-s * .2, s);
      g.lineTo(s * .55, -s * .15); g.lineTo(s * .05, -s * .15);
      g.closePath(); g.fill(); break;
    case 'sete':
      g.font = `bold ${Math.round(r * 1.05)}px ${FONTE_ARCADE}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('7', 0, r * .04); break;
    case 'gota':
      g.beginPath();
      g.moveTo(0, -s);
      g.quadraticCurveTo(s * .85, s * .15, 0, s);
      g.quadraticCurveTo(-s * .85, s * .15, 0, -s);
      g.fill(); break;
    case 'chama':
      g.beginPath();
      g.moveTo(0, -s);
      g.quadraticCurveTo(s * .8, -s * .1, s * .25, s * .8);
      g.quadraticCurveTo(0, s * .35, -s * .25, s * .8);
      g.quadraticCurveTo(-s * .8, -s * .1, 0, -s);
      g.fill(); break;
    case 'coroa':
      g.beginPath();
      g.moveTo(-s, s * .5); g.lineTo(-s, -s * .5); g.lineTo(-s * .45, s * .05);
      g.lineTo(0, -s * .7); g.lineTo(s * .45, s * .05); g.lineTo(s, -s * .5);
      g.lineTo(s, s * .5); g.closePath(); g.fill(); break;
    default:
      g.beginPath(); g.arc(0, 0, s * .6, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  g.beginPath();
  g.arc(x - r * .30, y - r * .34, r * .22, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
  g.restore();
}

function desenharBola() {
  const c = tampaDe(bola.dono);
  const r = R_BOLA * (c.raio / 8.5);
  /* the cap spins as it travels: cosmetics only, but it sells the movement */
  bola.ang = (bola.ang || 0) + (bola.vx + bola.vy) * 0.008;
  desenharTampa(ctx, bola.x, bola.y, r, c, bola.ang);
  if (bola.giro) {
    ctx.save();
    ctx.globalAlpha = .5; ctx.strokeStyle = ESPECIAIS.curve.cor; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(bola.x, bola.y, r + 4, 0, Math.PI * 1.4 * (bola.giro > 0 ? 1 : -1));
    ctx.stroke(); ctx.restore();
  }
}

function desenharFantasma() {
  if (!mostrarMira) return;
  if (!fantasma || fantasma.length < 2) return;
  ctx.save();
  ctx.setLineDash([3, 6]); ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(127,214,240,.75)';
  ctx.beginPath(); ctx.moveTo(fantasma[0].x, fantasma[0].y);
  for (const p of fantasma) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();
}

function desenharMira() {
  if (!mira || !minhaVez()) return;
  const dx = bola.x - mira.x, dy = bola.y - mira.y, d = Math.hypot(dx, dy);
  if (d < 4) return;
  const c = tampaDe(jogador);
  const forca = Math.min(d / 7, FORCA_MAX), p = forca / FORCA_MAX;
  const nx = dx / d, ny = dy / d;
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.moveTo(bola.x, bola.y); ctx.lineTo(mira.x, mira.y); ctx.stroke();
  ctx.setLineDash([]);
  /* Guide off: you still see how far you have pulled back, because that
     is your own hand — you just do not get told where it will end up. */
  if (!mostrarMira) { ctx.restore(); return; }
  /* a precise cap simply shows you more of where it is going */
  const alc = (26 + p * 190) * c.mira;
  const esp = Especiais.emMira(jogador);
  const cor = esp ? hexRGB(esp.cor)
                  : (p < .45 ? '106,214,124' : p < .8 ? '240,200,80' : '236,86,72');
  const grad = ctx.createLinearGradient(bola.x, bola.y, bola.x + nx * alc, bola.y + ny * alc);
  grad.addColorStop(0, `rgba(${cor},.95)`); grad.addColorStop(1, `rgba(${cor},0)`);
  ctx.strokeStyle = grad; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bola.x + nx * (bola.r + 2), bola.y + ny * (bola.r + 2));
  ctx.lineTo(bola.x + nx * alc, bola.y + ny * alc); ctx.stroke();
  const px = bola.x + nx * alc, py = bola.y + ny * alc, ang = Math.atan2(ny, nx);
  ctx.fillStyle = `rgba(${cor},.95)`;
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(ang) * 9, py + Math.sin(ang) * 9);
  ctx.lineTo(px + Math.cos(ang + 2.5) * 8, py + Math.sin(ang + 2.5) * 8);
  ctx.lineTo(px + Math.cos(ang - 2.5) * 8, py + Math.sin(ang - 2.5) * 8);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.arc(bola.x, bola.y, bola.r + 6, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
  ctx.strokeStyle = `rgba(${cor},.9)`; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

function desenharMiraTeclado() {
  if (!teclado.ativo || !minhaVez()) return;
  const alc = 30 + teclado.forca * 175;
  const cor = teclado.forca < .45 ? '106,214,124' : teclado.forca < .8 ? '240,200,80' : '236,86,72';
  ctx.save();
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${cor},.9)`;
  ctx.beginPath();
  ctx.moveTo(bola.x + Math.cos(teclado.ang) * (bola.r + 3),
             bola.y + Math.sin(teclado.ang) * (bola.r + 3));
  ctx.lineTo(bola.x + Math.cos(teclado.ang) * alc, bola.y + Math.sin(teclado.ang) * alc);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bola.x, bola.y, bola.r + 7, -Math.PI / 2, -Math.PI / 2 + teclado.forca * Math.PI * 2);
  ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

function desenharMiraIA() {
  if (!miraIA) return;
  const alc = 30 + (miraIA.forca / FORCA_MAX) * 150;
  ctx.save();
  ctx.setLineDash([7, 6]); ctx.lineWidth = 3;
  ctx.strokeStyle = miraIA.cor || 'rgba(255,210,74,.85)';
  ctx.beginPath(); ctx.moveTo(miraIA.x, miraIA.y);
  ctx.lineTo(miraIA.x + Math.cos(miraIA.ang) * alc, miraIA.y + Math.sin(miraIA.ang) * alc);
  ctx.stroke(); ctx.restore();
}

function desenharSetaDoAtaque() {
  if (fase === 'fim') return;
  const paraDireita = jogador === 1;
  const x = paraDireita ? CAMPO.x + CAMPO.w - 26 : CAMPO.x + 26;
  const pulso = .35 + Math.abs(Math.sin(Date.now() / 460)) * .35;
  ctx.save(); ctx.globalAlpha = pulso; ctx.fillStyle = tampaDe(jogador).c1;
  const d = paraDireita ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(x + d * 11, CY); ctx.lineTo(x - d * 5, CY - 11); ctx.lineTo(x - d * 5, CY + 11);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/* =======================================================================
   MAIN LOOP — fixed timestep
   The original loop ran one physics tick per animation frame, which made
   the game run at double speed on a 120 Hz screen. The accumulator below
   pins the simulation to 60 ticks per second on any display, and it gives
   the goal slow-motion for free: FX.escala() scales the accumulator, not
   the physics constants, so the collision maths never changes.
   ======================================================================= */
const PASSO_MS = 1000 / 60;
let ultimoQuadro = 0, acumulador = 0;

function laco(agora) {
  const t0 = agora || performance.now();
  if (!ultimoQuadro) ultimoQuadro = t0;
  const bruto = Math.min(64, t0 - ultimoQuadro);
  ultimoQuadro = t0;

  acumulador += (bruto / PASSO_MS) * FX.escala();
  let n = 0;
  while (acumulador >= 1 && n < 5) { passo(); acumulador -= 1; n++; }
  if (acumulador > 5) acumulador = 0;              // came back from a background tab
  const k = Math.max(1, n);
  if (fase !== 'rolando') acomodarPregos(k);   // idle drift only; passo() owns it mid-shot
  FX.atualizar(k);

  ctx.save();
  FX.aplicarCamera(ctx, W, H);
  desenharMesa();
  desenharBuracos();
  desenharSetaDoAtaque();
  desenharPregos();
  desenharFantasma();
  desenharBola();
  desenharMira();
  desenharMiraTeclado();
  desenharMiraIA();
  FX.desenhar(ctx);
  FX.desenharOndas(ctx);
  FX.desenharFoco(ctx, W, H);
  /* O lavado branco sobre a mesa saiu daqui: somado ao brilho global ele
     chegava a 0,52 de branco puro e estourava metade do tabuleiro. Quem
     carrega o momento agora são os anéis e o holofote. */
  if (brilhoGol > 0) brilhoGol -= .05 * k;
  ctx.restore();

  const f = FX.brilho();
  if (f > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${f * .10})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  FX.desenharGritos(ctx, W, H);

  requestAnimationFrame(laco);
}
