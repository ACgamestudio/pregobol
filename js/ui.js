/* =======================================================================
   TELAS
   ======================================================================= */
const abertura = document.getElementById('abertura');
const cine = document.getElementById('cine');
const vinheta = document.getElementById('vinheta');
const intro = document.getElementById('intro');
const menu = document.getElementById('menu');
const telaTimes = document.getElementById('telaTimes');
const telaCampo = document.getElementById('telaCampo');
const gradeTimes = document.getElementById('gradeTimes');
const gradeCampos = document.getElementById('gradeCampos');
const subTimes = document.getElementById('subTimes');
const elConfronto = document.getElementById('confronto');

for (const el of document.querySelectorAll('.menu .fundo, .menu .arte')) {
  el.style.backgroundImage = "url('assets/splash.webp')";
}

/* ---- abertura: o clique libera som, tela cheia e paisagem ---- */
/* Nunca deixe o boot depender de uma promessa do navegador. Em vários
   navegadores de celular requestFullscreen não resolve NEM rejeita: fica
   pendurada. Como o iniciar() dava await nela, o jogo simplesmente não
   começava — só destravava quando o usuário apertava voltar e o pedido
   era cancelado. Agora tudo tem prazo. */
function comPrazo(p, ms) {
  return Promise.race([
    Promise.resolve(p).catch(() => {}),
    new Promise(r => setTimeout(r, ms))
  ]);
}

function emTelaCheia() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

async function telaCheiaPaisagem() {
  const alvo = document.documentElement;
  try {
    const p = alvo.requestFullscreen ? alvo.requestFullscreen({ navigationUI: 'hide' })
            : (alvo.webkitRequestFullscreen ? alvo.webkitRequestFullscreen() : null);
    await comPrazo(p, 1200);
  } catch (e) { /* iPhone não permite em elemento comum */ }
  try {
    const l = screen.orientation && screen.orientation.lock
            ? screen.orientation.lock('landscape') : null;
    await comPrazo(l, 800);
  } catch (e) { /* desktop ignora */ }
  setTimeout(ajustarEscala, 250);
  /* Não entrou? O botão na barra fica visível pra tentar de novo num
     toque futuro — no iPhone é a única forma que existe. */
  const bt = document.getElementById('btnTela');
  if (bt) bt.classList.toggle('oculta', emTelaCheia());
}

/* Espera o vídeo ficar tocável. O teto era 6s, e acontecia duas vezes —
   no celular isso virava mais de dez segundos de tela preta antes de
   qualquer coisa aparecer. 2,5s é o bastante pra rede boa e curto o
   bastante pra rede ruim não punir ninguém: se estourar, o vídeo toca
   com o que já baixou. */
function pronto(v, teto) {
  return v.readyState >= 3 ? Promise.resolve() : new Promise(r => {
    const ok = () => { v.removeEventListener('canplay', ok); r(); };
    v.addEventListener('canplay', ok);
    setTimeout(r, teto || 2500);
  });
}

let pularAtual = null;

/* ---------------- música da abertura ----------------
   toca do vídeo de abertura até a escolha do gramado */
const musica = document.getElementById('musica');
let musicaAtiva = false;

function tocarMusica() {
  musicaAtiva = true;
  musica.loop = true;
  musica.volume = .75;
  musica.muted = !Som.ligado;
  try { musica.currentTime = 0; } catch (e) {}
  const p = musica.play();
  if (p && p.catch) p.catch(() => { musica.muted = true; const q = musica.play(); if (q && q.catch) q.catch(() => {}); });
}

function pararMusica() {
  if (!musicaAtiva) return;
  musicaAtiva = false;
  const passo = musica.volume / 12;
  const esmaece = setInterval(() => {                    // desliga suave
    musica.volume = Math.max(0, musica.volume - passo);
    if (musica.volume <= 0.01) {
      clearInterval(esmaece);
      musica.pause();
      try { musica.currentTime = 0; } catch (e) {}
      musica.volume = .75;
    }
  }, 55);
}

function sincronizarMusica() {                           // segue o botão de som
  if (!musicaAtiva) return;
  musica.muted = !Som.ligado;
  if (Som.ligado && musica.paused) { const p = musica.play(); if (p && p.catch) p.catch(() => {}); }
}

/* ---------------- trilha das partidas ----------------
   Uma faixa por partida: sorteada no início e repetida em loop até o fim
   da partida — não troca de música no meio do jogo. */
const trilha = document.getElementById('trilha');
const FAIXAS = [
  'assets/gol_no_ultimo_minuto.mp3',
  'assets/asphalt_bleachers.mp3',
  'assets/grito_da_arquibancada.mp3',
  'assets/pe_na_grama.mp3'
];
let trilhaAtiva = false;
let faixaAtual = -1;
const VOL_TRILHA = .22;              // volume de fundo, baixo para não atrapalhar a jogabilidade

/* Next track, in order. Sequential rather than random so pressing the
   button twice cannot land on the same song again. */
function proximaFaixa() {
  faixaAtual = (faixaAtual + 1) % FAIXAS.length;
  iniciarTrilha(true, true);
  const b = document.getElementById('btnFaixa');
  if (b) b.classList.add('pulsa'), setTimeout(() => b.classList.remove('pulsa'), 400);
}

function sortearFaixa() {
  if (FAIXAS.length <= 1) return 0;
  let i;
  do { i = Math.floor(Math.random() * FAIXAS.length); } while (i === faixaAtual);
  return i;
}

function iniciarTrilha(forcar, manterFaixa) {
  pararMusica();                     // encerra a música da abertura, se ainda estiver tocando
  if (!forcar && trilhaAtiva && !trilha.paused) return;   // já rolando nesta partida
  trilhaAtiva = true;
  if (!manterFaixa) faixaAtual = sortearFaixa();   // uma música por partida, salvo troca manual
  trilha.src = FAIXAS[faixaAtual];
  trilha.loop = true;                // e repete ela até a partida acabar
  trilha.volume = VOL_TRILHA;
  trilha.muted = !Som.ligado;
  try { trilha.currentTime = 0; } catch (e) {}
  const p = trilha.play();
  if (p && p.catch) p.catch(() => {            // som bloqueado: toca mudo até haver gesto
    trilha.muted = true; const q = trilha.play(); if (q && q.catch) q.catch(() => {});
  });
}

function pararTrilha() {
  if (!trilhaAtiva) return;
  trilhaAtiva = false;
  const alvo = trilha.volume;
  const passo = (alvo || VOL_TRILHA) / 12;
  const esmaece = setInterval(() => {           // desliga suave
    trilha.volume = Math.max(0, trilha.volume - passo);
    if (trilha.volume <= 0.01) {
      clearInterval(esmaece);
      trilha.pause();
      try { trilha.currentTime = 0; } catch (e) {}
      trilha.volume = VOL_TRILHA;
    }
  }, 55);
}

function sincronizarTrilha() {                   // segue o botão de som
  if (!trilhaAtiva) return;
  trilha.muted = !Som.ligado;
  if (Som.ligado && trilha.paused) { const p = trilha.play(); if (p && p.catch) p.catch(() => {}); }
}

/* destrava os vídeos ainda dentro do clique do usuário:
   um play() mudo seguido de pause() marca o elemento como liberado,
   então o play() de verdade (com som) não é bloqueado depois dos await */
function destravar(v) {
  try {
    v.muted = true;
    const p = v.play();
    if (p && p.then) p.then(() => { v.pause(); v.currentTime = 0; }).catch(() => {});
  } catch (e) { /* segue o jogo */ }
}

function tocar(v) {
  return new Promise(resolve => {
    let fim = false;
    const acabou = () => { if (fim) return; fim = true;
      v.removeEventListener('ended', acabou); v.removeEventListener('error', acabou);
      pularAtual = null; resolve(); };
    v.addEventListener('ended', acabou); v.addEventListener('error', acabou);
    pularAtual = acabou;
    v.currentTime = 0; v.volume = 1;
    v.muted = !Som.ligado;

    const tentar = p => { if (p && p.catch) p.catch(() => {
      // som bloqueado pelo navegador: toca mudo em vez de pular o vídeo
      v.muted = true;
      const p2 = v.play();
      if (p2 && p2.catch) p2.catch(acabou);
    }); };
    tentar(v.play());
  });
}
document.getElementById('btnPular').onclick = () => pularAtual && pularAtual();

let jaIniciou = false;
async function iniciar() {
  if (jaIniciou) return;
  jaIniciou = true;
  abertura.classList.add('aguardando');
  Som.ligar();
  destravar(vinheta); destravar(intro); destravar(musica);  // ainda dentro do gesto do usuário
  await telaCheiaPaisagem();

  /* A abertura fica LIGADA por padrão: ela é parte da cara do jogo, não
     um custo de carregamento. Quem quiser ir direto ao menu desliga no
     card ABERTURA — decisão do jogador, não minha. */
  if (Progresso.dados.abertura === false) {
    abertura.classList.add('oculta');
    tocarMusica();
    abrirMenu();
    return;
  }

  intro.load();                           // começa a baixar a abertura desde já
  await pronto(vinheta);
  abertura.classList.add('oculta');
  cine.classList.add('on');
  intro.classList.add('esconde');
  await tocar(vinheta);                                  // vinheta da produtora
  vinheta.pause(); vinheta.classList.add('esconde');
  intro.classList.remove('esconde');
  await pronto(intro);
  tocarMusica();                                         // a música entra com a abertura
  await tocar(intro);                                    // vídeo de abertura (mudo)
  intro.pause();
  cine.classList.remove('on');
  abrirMenu();
}
document.getElementById('btnIniciar').onclick = iniciar;

/* =======================================================================
   MENUS AND SCREENS
   The opening, the vignettes and the soundtrack above are the original
   code, untouched. What follows is the navigation for the new modes.
   ======================================================================= */
const telaTampas   = document.getElementById('telaTampas');
const telaDesafios = document.getElementById('telaDesafios');
const telaFim      = document.getElementById('telaFim');
const gradeTampas  = document.getElementById('gradeTampas');
const gradeDesafios = document.getElementById('gradeDesafios');

/* Where the team/field screens should go once a choice is made. */
let destino = null;          // () => void
let campoAntesDeJogar = false;

function abrirMenu() {
  document.body.classList.remove('jogando');
  encerrarFesta(); esconderFim();
  for (const el of [telaTimes, telaCampo, telaTampas, telaDesafios]) el.classList.add('oculta');
  menu.classList.remove('oculta');
  document.getElementById('somEstado').textContent = Som.ligado ? t('on') : t('off');
  document.getElementById('nivelEstado').textContent = t(nivel);
}
function fecharTelas() {
  for (const el of [menu, telaTimes, telaCampo, telaTampas, telaDesafios, telaFim]) {
    el.classList.add('oculta');
  }
  document.body.classList.add('jogando');
  ajustarEscala();
}

/* Single entry point for starting anything. */
function comecarPartida(cfg) {
  fecharTelas();
  if (Modo.tipo === 'arcade') sortearAdversario();
  novaPartida(cfg);
  iniciarTrilha(true);
  if (Modo.tipo === 'arcade')
    mostrarAviso(t('nextOpponent'), CLUBES[times[2]].nome, 1800);
}

/* ---- main menu (spec §14) ---- */
function ligarCard(id, fn) {
  const b = document.getElementById(id);
  if (b) b.onclick = () => { Som.ligar(); Som.botao(); fn(); };
}

ligarCard('cardPlay', () => {
  const cfg = Modo.rapida();
  destino = () => abrirCampos(true, cfg);
  abrirTimes();
});
ligarCard('card2P', () => {
  const cfg = Modo.doisJogadores();
  destino = () => abrirCampos(true, cfg);
  abrirTimes();
});
ligarCard('cardArcade', () => {
  const cfg = Modo.arcade();
  destino = () => comecarPartida(cfg);
  abrirTimes();
});
ligarCard('cardTorneio', () => {
  const cfg = Modo.torneio();
  destino = () => comecarPartida(cfg);
  abrirTimes();
});
ligarCard('cardDesafios', abrirDesafios);
ligarCard('cardCampo', () => abrirCampos(false, null));
ligarCard('cardTampa', abrirTampas);
ligarCard('cardAbertura', () => {
  Progresso.dados.abertura = (Progresso.dados.abertura === false);
  Progresso.salvar();
  aplicarIdioma();
});
ligarCard('cardMira', () => {
  mostrarMira = !mostrarMira;
  Progresso.dados.mira = mostrarMira;
  Progresso.salvar();
  aplicarIdioma();
});
ligarCard('cardNivel', () => {
  nivel = ORDEM_NIVEIS[(ORDEM_NIVEIS.indexOf(nivel) + 1) % ORDEM_NIVEIS.length];
  Progresso.lembrar('nivel', nivel);
  document.getElementById('nivelEstado').textContent = t(nivel);
  atualizarHUD();
});
ligarCard('cardSom', () => {
  const on = Som.alternar();
  sincronizarMusica(); sincronizarTrilha();
  document.getElementById('somEstado').textContent = on ? t('on') : t('off');
  const b = document.getElementById('btnSom');
  b.classList.toggle('on', on);
  b.textContent = on ? t('soundOn') : t('soundOff');
});
ligarCard('cardIdioma', () => {
  idioma = idioma === 'en' ? 'pt' : 'en';
  Progresso.lembrar('idioma', idioma);
  aplicarIdioma();
  abrirMenu(); atualizarHUD();
});

/* ---- team select: unchanged artwork, unchanged hotspots ---- */
let escolhendo = 1;

/* Arcade is a campaign: you pick YOUR club once and the ladder throws
   opponents at you. Choosing both sides would make it a friendly. */
function soMeuTime() { return Modo.tipo === 'arcade'; }

/* A bag, not a dice roll: every other club turns up exactly once before
   any of them turns up twice. Over a seven-rung ladder with seven rivals
   that means you face each of them once, in a different order each run. */
let sacola = [];
function encherSacola() {
  sacola = ELENCOS[folhaDe(times[1])].ordem.filter(c => c !== times[1]);
  for (let i = sacola.length - 1; i > 0; i--) {          // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = sacola[i]; sacola[i] = sacola[j]; sacola[j] = tmp;
  }
}
function sortearAdversario() {
  if (!sacola.length) encherSacola();
  times[2] = sacola.pop();
  return times[2];
}
function montarGradeTimes() {
  const img = document.querySelector('#arteTimes img');
  if (img) img.src = ELENCOS[elenco].arte;
  const bt = document.getElementById('btnElenco');
  if (bt) bt.textContent = elenco === 'br' ? t('worldTeams') : t('brTeams');
  gradeTimes.innerHTML = '';
  ORDEM_CLUBES.forEach((chave, i) => {
    const cl = CLUBES[chave], p = AREAS[i];
    const b = document.createElement('button');
    b.className = 'hot';
    b.style.cssText = `left:${p.l}%;top:${p.t}%;width:${p.w}%;height:${p.h}%`;
    b.setAttribute('aria-label', cl.nome);
    if (escolhendo === 2 && chave === times[1]) {
      b.classList.add('usado');
      b.textContent = t('player1');
      b.disabled = true;
    } else {
      b.onclick = () => escolherTime(chave);
    }
    gradeTimes.appendChild(b);
  });
}

function abrirTimes() {
  escolhendo = 1;
  if (subTimes) subTimes.innerHTML = `<b>${soMeuTime() ? t('yourTeam') : t('player1')}</b>`;
  telaTimes.classList.remove('jogador2');
  elConfronto.innerHTML = '';
  menu.classList.add('oculta');
  telaTimes.classList.remove('oculta');
  montarGradeTimes();
}
function escolherTime(chave) {
  Som.ligar(); Som.botao();
  times[escolhendo] = chave;
  if (escolhendo === 1 && soMeuTime()) {
    encherSacola();                       // fresh ladder, fresh draw order
    sortearAdversario();
    if (destino) { const ir = destino; destino = null; ir(); }
    return;
  }
  if (escolhendo === 1) {
    escolhendo = 2;
    subTimes.innerHTML = modo === 'ia' ? `<b>${t('ai')}</b>` : `<b>${t('player2')}</b>`;
    telaTimes.classList.add('jogador2');
    const cl = CLUBES[times[1]];
    elConfronto.innerHTML =
      `<span class="camisa" style="background:${fundoCamisa(cl)}"></span><span>${cl.nome} →</span>`;
    montarGradeTimes();
  } else if (destino) {
    const ir = destino; destino = null; ir();
  } else {
    abrirCampos(true, Modo.rapida());
  }
}

/* ---- field select (spec §3): name, phrase and the lock ---- */
let cfgPendente = null;
function montarGradeCampos() {
  gradeCampos.innerHTML = '';
  for (const chave of ORDEM_CAMPOS) {
    const c = CAMPOS[chave];
    const pal = PALETAS[c.paleta];
    const tem = Progresso.temCampo(chave);
    const b = document.createElement('button');
    b.className = 'op campo' + (tem ? '' : ' travado') + (chave === campoAtual ? ' on' : '');
    b.innerHTML =
      `<span class="mini" style="background:linear-gradient(90deg,${pal.m2} 0 7%,${pal.g1} 7% 20%,` +
      `${pal.g2} 20% 80%,${pal.g1} 80% 93%,${pal.m2} 93%)"></span>` +
      `<span class="txt"><b>${c.nome}</b><i>${tem ? c.frase : t('locked')}</i>` +
      `<u>${tem ? c.sub : ''}</u></span>`;
    if (!tem) b.disabled = true;
    else b.onclick = () => {
      Som.ligar(); Som.botao();
      campoAtual = chave;
      if (campoAntesDeJogar) comecarPartida(cfgPendente || { alvo: 3 });
      else { pararMusica(); montarGradeCampos(); }
    };
    gradeCampos.appendChild(b);
  }
}
function abrirCampos(antesDeJogar, cfg) {
  campoAntesDeJogar = antesDeJogar;
  cfgPendente = cfg;
  menu.classList.add('oculta'); telaTimes.classList.add('oculta');
  telaCampo.classList.remove('oculta');
  montarGradeCampos();
}

/* ---- cap select (spec §2) ----
   Each card draws its own cap with the same routine the match uses, so
   what you pick is exactly what you will be flicking. */
function miniaturaTampa(c) {
  const cvs = document.createElement('canvas');
  const lado = 96;
  cvs.width = cvs.height = lado;
  /* desenharTampa takes the context, so the same routine that draws the
     cap in play also draws the card. What you pick is what you flick. */
  desenharTampa(cvs.getContext('2d'), lado / 2, lado / 2, 34, c, -0.35);
  return cvs;
}

function montarGradeTampas() {
  gradeTampas.innerHTML = '';
  for (const chave of ORDEM_TAMPAS) {
    const c = TAMPAS[chave];
    const tem = Progresso.temTampa(chave);
    const b = document.createElement('button');
    b.className = 'op tampa' + (tem ? '' : ' travado') + (chave === tampas[1] ? ' on' : '');
    const cx = document.createElement('div');
    cx.className = 'arteTampa';
    cx.appendChild(miniaturaTampa(c));
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.innerHTML = `<b>${c.nome}</b><i>${c.tipo}</i>` +
      (tem ? `<u>+ ${c.pro}<br>− ${c.contra}</u>` : `<u>${t('locked')}</u>`);
    b.appendChild(cx); b.appendChild(txt);
    if (!tem) b.disabled = true;
    else b.onclick = () => {
      Som.ligar(); Som.botao();
      tampas[1] = chave;
      Progresso.lembrar('tampa', chave);
      /* the AI takes a different cap so the matchup stays interesting */
      const outras = ORDEM_TAMPAS.filter(k => k !== chave && Progresso.temTampa(k));
      tampas[2] = outras.length ? outras[0] : chave;
      bola.r = R_BOLA * (TAMPAS[tampas[bola.dono]].raio / 8.5);
      montarGradeTampas(); atualizarHUD();
    };
    gradeTampas.appendChild(b);
  }
}
function abrirTampas() {
  menu.classList.add('oculta');
  telaTampas.classList.remove('oculta');
  montarGradeTampas();
}

/* ---- challenges (spec §7) ---- */
function montarGradeDesafios() {
  gradeDesafios.innerHTML = '';
  DESAFIOS.forEach((d, i) => {
    const liberado = i === 0 || Progresso.feito(DESAFIOS[i - 1].id);
    const feito = Progresso.feito(d.id);
    const b = document.createElement('button');
    b.className = 'op desafio' + (liberado ? '' : ' travado') + (feito ? ' feito' : '');
    b.innerHTML =
      `<span class="txt"><b>${liberado ? d.nome : t('locked')}</b>` +
      `<i>${liberado ? d.desc : ''}</i>` +
      `<u>${liberado ? `${CAMPOS[d.campo].nome} · ${t('attemptsLeft', d.tiros)}` : ''}</u></span>` +
      (feito ? '<span class="selo">✓</span>' : '');
    if (!liberado) b.disabled = true;
    else b.onclick = () => {
      Som.ligar(); Som.botao();
      comecarPartida(Modo.desafiar(d.id));
    };
    gradeDesafios.appendChild(b);
  });
}
function abrirDesafios() {
  menu.classList.add('oculta');
  telaDesafios.classList.remove('oculta');
  montarGradeDesafios();
}

/* ---- end of match (spec §10) ---- */
function linhaStats(n) {
  const s = Stats.d[n];
  return `<div class="col">
      <b>${t('player' + n)}</b>
      <span>${t('goals')}<i>${s.gols}</i></span>
      <span>${t('shots')}<i>${s.chutes}</i></span>
      <span>${t('accuracy')}<i>${Stats.precisao(n)}%</i></span>
      <span>${t('rebounds')}<i>${s.quiques}</i></span>
      <span>${t('powerShots')}<i>${s.especiais}</i></span>
    </div>`;
}

function mostrarFim(plano, vencedor) {
  document.getElementById('fimTitulo').textContent = plano.titulo;
  document.getElementById('fimSub').textContent = plano.sub || '';
  document.getElementById('fimStats').innerHTML =
    `<div class="stats">${linhaStats(1)}${linhaStats(2)}</div>`;

  /* unlocks are announced here, once, right where they were earned */
  const avisos = [];
  if (plano.desbloqueio) avisos.push(`${t('newField')} ${CAMPOS[plano.desbloqueio].nome}`);
  if (plano.tampa) avisos.push(`${t('newCap')} ${TAMPAS[plano.tampa].nome}`);
  if (plano.novo) avisos.push(t('newChallenge'));
  document.getElementById('fimPremio').innerHTML =
    avisos.length ? avisos.map(a => `<span>${a}</span>`).join('') : '';

  const acao = document.getElementById('fimAcao');
  acao.textContent = plano.botao;
  acao.onclick = () => {
    Som.botao();
    if (plano.acao === 'proxima') comecarPartida(Modo.proxima());
    else if (plano.acao === 'repetir') comecarPartida(Modo.repetir());
    else { pararTrilha(); abrirMenu(); }
  };
  const bMenu = document.getElementById('fimMenu');
  bMenu.textContent = t('menu');
  bMenu.onclick = () => { Som.botao(); pararTrilha(); abrirMenu(); };

  telaFim.classList.remove('oculta');
}
function esconderFim() { if (telaFim) telaFim.classList.add('oculta'); }

/* ---- back buttons ---- */
document.getElementById('voltarMenu1').onclick = abrirMenu;
document.getElementById('voltarMenu2').onclick = abrirMenu;
document.getElementById('voltarMenu3').onclick = abrirMenu;
document.getElementById('voltarMenu4').onclick = abrirMenu;

/* ---- bottom bar ---- */
document.getElementById('btnMenu').onclick = () => { Som.ligar(); Som.botao(); pararTrilha(); abrirMenu(); };
document.getElementById('btnSom').onclick = e => {
  const on = Som.alternar();
  sincronizarMusica(); sincronizarTrilha();
  e.currentTarget.classList.toggle('on', on);
  e.currentTarget.textContent = on ? t('soundOn') : t('soundOff');
};
document.getElementById('btnNovo').onclick = () => {
  Som.ligar(); Som.botao();
  comecarPartida(Modo.repetir());
};

/* ---- special shot buttons (spec §6) ---- */
for (const b of document.querySelectorAll('#especiais button')) {
  b.onclick = () => {
    if (!minhaVez()) return;
    Som.ligar();
    const r = Especiais.armar(jogador, b.dataset.esp);
    if (r === 'sem-carga') { mostrarAviso(t('noCharges'), '', 900); Som.botao(); }
    else if (r === 'armado') { Som.especial(); mostrarAviso(t(ESPECIAIS[b.dataset.esp].chave), t('armed'), 900); }
    else Som.botao();
    atualizarEspeciais();
    calcularFantasma();
  };
}

/* ---------------------- boot ---------------------- */
Progresso.carregar();
idioma = Progresso.dados.idioma || 'pt';
mostrarMira = Progresso.dados.mira !== false;   // on unless turned off
usarElenco(Progresso.dados.elenco || 'br');
if (Progresso.temTampa(Progresso.dados.tampa)) tampas[1] = Progresso.dados.tampa;
if (NIVEIS[Progresso.dados.nivel]) nivel = Progresso.dados.nivel;
if (!Progresso.temCampo(campoAtual)) campoAtual = Progresso.dados.campos[0];

aplicarIdioma();
ajustarEscala();
Modo.rapida();
novaPartida({ alvo: 3 });
laco();

/* ==================================================================
   ONLINE
   ================================================================== */
const telaOnline = document.getElementById('telaOnline');
const onEstado = document.getElementById('onEstado');
const onCodigo = document.getElementById('onCodigo');
const onEntrada = document.getElementById('onEntrada');
let onLigado = false;

function dizer(chave, cru) {
  if (onEstado) onEstado.textContent = cru || t(chave);
}

function mostrarCodigo(cod) {
  if (!onCodigo) return;
  onCodigo.textContent = cod || '';
  onCodigo.classList.toggle('vazio', !cod);
}

async function ligarRede() {
  if (onLigado) return true;
  if (!APPS_SCRIPT_PRONTO && !FIREBASE_PRONTO) {
    dizer(null, 'Preencha js/apps-script-config.js ou js/firebase-config.js');
    return false;
  }
  dizer('connecting');
  try {
    await Rede.conectar(APPS_SCRIPT_PRONTO ? { url: APPS_SCRIPT_URL } : FIREBASE_CONFIG);
    onLigado = true;
    return true;
  } catch (e) {
    dizer('netFail');
    return false;
  }
}

/* Both players are in the room: start the same match on both devices.
   The host's field choice wins, and each side keeps its own cap. */
function comecarOnline() {
  fecharTelas();
  const s = Rede.cfgSala || {};
  const cfg = (s.cfg) || {};
  campoAtual = cfg.campo || campoAtual;
  const cfgLocal = Modo.online({ alvo: cfg.alvo || 3 });
  novaPartida(cfgLocal);
  atualizarHUD();
  mostrarAviso(t('yourTurn'), Rede.sou === 1 ? t('goalCries')[0] : t('opponentTurn'));
}

Rede.ao.pronto = () => comecarOnline();
Rede.ao.jogada = m => jogadaRemota(m);
Rede.ao.erro = e => {
  dizer(null, (e && e.message) ? e.message : t('netFail'));
  mostrarCodigo('');
};
Rede.ao.saiu = () => {
  mostrarAviso(t('opponentLeft'), '');
  fase = 'fim';
  setTimeout(() => { Rede.encerrar(); abrirMenu(); }, 1800);
};

function abrirOnline() {
  fecharTelas();
  telaOnline.classList.remove('oculta');
  mostrarCodigo('');
  dizer(null, (APPS_SCRIPT_PRONTO || FIREBASE_PRONTO) ? '' : 'Preencha js/apps-script-config.js ou js/firebase-config.js');
  ligarRede();
}

ligarCard('cardOnline', abrirOnline);

/* Toda ação de rede passa por aqui. Sem isso, uma exceção dentro de um
   onclick vira rejeição não tratada: o console reclama e a tela fica
   parada em "conectando" pra sempre, sem nenhuma pista pro jogador. */
async function tentar(fn) {
  try { return await fn(); }
  catch (e) {
    dizer(null, (e && e.message) ? e.message : t('netFail'));
    mostrarCodigo('');
    return null;
  }
}

const btnCriar = document.getElementById('btnCriarSala');
if (btnCriar) btnCriar.onclick = () => tentar(async () => {
  if (!(await ligarRede())) return;
  Som.botao();
  const cod = await Rede.criar({ campo: campoAtual, alvo: 3 }, false);
  mostrarCodigo(cod);
  dizer('waitingOpponent');
});

const btnEntrar = document.getElementById('btnEntrarSala');
if (btnEntrar) btnEntrar.onclick = () => tentar(async () => {
  if (!(await ligarRede())) return;
  Som.botao();
  const cod = (onEntrada.value || '').toUpperCase().trim();
  if (cod.length < 4) { dizer('enterCode'); return; }
  dizer('connecting');
  const ok = await Rede.entrar(cod, { tampa: tampas[1] });
  if (!ok) { dizer('roomGone'); return; }
  mostrarCodigo(cod);
});

const btnProcurar = document.getElementById('btnProcurar');
if (btnProcurar) btnProcurar.onclick = () => tentar(async () => {
  if (!(await ligarRede())) return;
  Som.botao();
  dizer('searching');
  const r = await Rede.procurar({ campo: campoAtual, alvo: 3 });
  mostrarCodigo(r.sala);
  dizer(r.modo === 'aguardando' ? 'waitingOpponent' : 'connecting');
});

/* Switching sheets mid-pick keeps whatever was already chosen: player 1
   can take a Brazilian club and player 2 an international one. */
const btnElenco = document.getElementById('btnElenco');
if (btnElenco) btnElenco.onclick = () => {
  Som.botao();
  usarElenco(elenco === 'br' ? 'intl' : 'br');
  Progresso.dados.elenco = elenco;
  Progresso.salvar();
  montarGradeTimes();
};

const btnTela = document.getElementById('btnTela');
if (btnTela) btnTela.onclick = async () => {
  Som.botao();
  if (emTelaCheia()) {
    try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
  } else {
    await telaCheiaPaisagem();
  }
  setTimeout(ajustarEscala, 200);
  btnTela.classList.toggle('oculta', emTelaCheia());
};
document.addEventListener('fullscreenchange', () => {
  if (btnTela) btnTela.classList.toggle('oculta', emTelaCheia());
  setTimeout(ajustarEscala, 150);
});

const btnFaixa = document.getElementById('btnFaixa');
if (btnFaixa) btnFaixa.onclick = () => { Som.botao(); proximaFaixa(); };

const voltar5 = document.getElementById('voltarMenu5');
if (voltar5) voltar5.onclick = () => { Rede.encerrar(); abrirMenu(); };

/* Leaving a match mid-game has to tell the other side. */
window.addEventListener('beforeunload', () => { if (Rede.ativo) Rede.encerrar(); });
