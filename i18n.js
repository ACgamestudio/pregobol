/* =======================================================================
   PREGOBOL — i18n
   The game shipped in Portuguese. The UI language is now data, not markup:
   every label lives here and is stamped into the DOM on boot by aplicarIdioma().
   English is the default (spec §14); Portuguese is kept so nothing was lost.
   ======================================================================= */
const IDIOMAS = {

en: {
  /* --- opening / menu --- */
  start: '▶ START', startNote: 'Tap to begin — with sound, fullscreen',
  loading: 'loading intro…', skip: 'Skip ⏭',
  tagline: 'RESPECT · FOCUS · FUN',
  play: 'PLAY', playSub: 'quick match',
  twoPlayers: '2 PLAYERS', twoPlayersSub: 'same device',
  arcade: 'ARCADE', arcadeSub: 'unlock the fields',
  tournament: 'TOURNAMENT', tournamentSub: 'four rounds',
  challenges: 'CHALLENGES', challengesSub: 'physics puzzles',
  fieldSelect: 'FIELD SELECT', fieldSelectSub: 'pick the pitch',
  capSelect: 'CAP SELECT', capSelectSub: 'pick your cap',
  settings: 'SETTINGS', ai: 'AI', sound: 'SOUND',
  language: 'LANGUAGE', languageSub: 'português',
  online: 'ONLINE', soon: 'coming soon',
  on: 'On', off: 'Off',

  /* --- bars and buttons --- */
  menu: '☰ Menu', soundOn: '🔊 Sound', soundOff: '🔇 Muted', newMatch: '↺ New match',
  hint: 'Drag back from the cap and release — a first-touch goal counts.',
  back: 'back to menu', locked: 'LOCKED',

  /* --- match HUD --- */
  player1: 'PLAYER 1', player2: 'PLAYER 2',
  turn: 'Turn', yourTurn: 'YOUR TURN', aim: 'AIM', power: 'POWER', shoot: 'SHOOT!',
  scores: 'valid goal!', thinking: 'AI thinking…', over: 'Full time',

  /* --- goals (§5) --- */
  goal: 'GOAL!',
  goalCries: ['GOAL!', 'WHAT A SHOT!', 'PERFECT!', 'UNBELIEVABLE!',
              'WHAT A GOAL!', 'TOP CORNER!', 'THAT WAS CLEAN!'],
  goalFor: n => `Point for ${n}`,

  /* --- combos (§9) --- */
  bankShot: 'BANK SHOT!', nailShot: 'OFF THE NAIL!', doubleRebound: 'DOUBLE REBOUND!',
  tripleRebound: 'TRIPLE REBOUND!', chainRebound: 'CHAIN REBOUND!',
  longShot: 'LONG SHOT!', perfectAngle: 'PERFECT ANGLE!', insaneRebound: 'INSANE REBOUND!',

  /* --- special shots (§6) --- */
  powerShot: 'POWER SHOT', precisionShot: 'PRECISION SHOT',
  curveShot: 'CURVE SHOT', bounceShot: 'BOUNCE SHOT',
  armed: 'ARMED', charges: 'charges', noCharges: 'No charges yet',
  earnedCharge: 'SPECIAL SHOT EARNED',

  /* --- results --- */
  youWin: 'YOU WIN!', youLose: 'YOU LOSE', champion: 'CHAMPION!',
  greatGame: 'GREAT GAME!', tryAgain: 'TRY AGAIN', nextMatch: 'NEXT MATCH',
  matchComplete: 'MATCH COMPLETE',
  goals: 'GOALS', shots: 'SHOTS', accuracy: 'ACCURACY',
  rebounds: 'REBOUNDS', powerShots: 'POWER SHOTS',

  /* --- unlocks (§11) --- */
  newField: 'NEW FIELD UNLOCKED!', newCap: 'NEW CAP UNLOCKED!',
  newChallenge: 'NEW CHALLENGE UNLOCKED!',

  /* --- modes --- */
  qualifier: 'QUALIFIER', quarterFinal: 'QUARTER FINAL',
  semiFinal: 'SEMI FINAL', final: 'FINAL', theFinal: 'THE FINAL',
  round: n => `Round ${n}`, stage: 'STAGE',
  challengeComplete: 'CHALLENGE COMPLETE!', challengeFailed: 'CHALLENGE FAILED',
  attemptsLeft: n => `${n} shot${n === 1 ? '' : 's'} left`,
  holeIn: 'IN THE HOLE! Turn lost.',
  rotate: 'Rotate your phone', rotateSub: 'PREGOBOL plays in landscape',
  easy: 'EASY', normal: 'NORMAL', hard: 'HARD', insane: 'INSANE'
},

pt: {
  start: '▶ Iniciar', startNote: 'Toque para começar — com som e em tela cheia',
  loading: 'carregando abertura…', skip: 'Pular ⏭',
  tagline: 'RESPEITO · FOCO · DIVERSÃO',
  play: 'JOGAR', playSub: 'partida rápida',
  twoPlayers: '2 JOGADORES', twoPlayersSub: 'mesmo aparelho',
  arcade: 'ARCADE', arcadeSub: 'libere os campos',
  tournament: 'TORNEIO', tournamentSub: 'quatro rodadas',
  challenges: 'DESAFIOS', challengesSub: 'quebra-cabeças',
  fieldSelect: 'CAMPO', fieldSelectSub: 'escolha a mesa',
  capSelect: 'TAMPINHA', capSelectSub: 'escolha a sua',
  settings: 'AJUSTES', ai: 'IA', sound: 'SOM',
  language: 'IDIOMA', languageSub: 'english',
  online: 'ONLINE', soon: 'em breve',
  on: 'Ligado', off: 'Desligado',
  menu: '☰ Menu', soundOn: '🔊 Som', soundOff: '🔇 Sem som', newMatch: '↺ Nova partida',
  hint: 'Puxe a tampinha e solte — o gol vale já no primeiro toque.',
  back: 'voltar ao menu', locked: 'BLOQUEADO',
  player1: 'JOGADOR 1', player2: 'JOGADOR 2',
  turn: 'Vez de', yourTurn: 'SUA VEZ', aim: 'MIRA', power: 'FORÇA', shoot: 'CHUTA!',
  scores: 'vale gol!', thinking: 'IA pensando…', over: 'Fim',
  goal: 'GOL!',
  goalCries: ['GOL!', 'QUE CHUTE!', 'PERFEITO!', 'INACREDITÁVEL!',
              'QUE GOL!', 'NO ÂNGULO!', 'QUE LIMPEZA!'],
  goalFor: n => `Ponto do ${n}`,
  bankShot: 'DE TABELA!', nailShot: 'NO PREGO!', doubleRebound: 'DOIS QUIQUES!',
  tripleRebound: 'TRÊS QUIQUES!', chainRebound: 'QUIQUE EM SÉRIE!',
  longShot: 'DE LONGE!', perfectAngle: 'ÂNGULO PERFEITO!', insaneRebound: 'QUIQUE INSANO!',
  powerShot: 'CHUTE FORTE', precisionShot: 'CHUTE PRECISO',
  curveShot: 'CHUTE CURVO', bounceShot: 'CHUTE DE TABELA',
  armed: 'PRONTO', charges: 'cargas', noCharges: 'Sem cargas ainda',
  earnedCharge: 'CHUTE ESPECIAL GANHO',
  youWin: 'VOCÊ VENCEU!', youLose: 'VOCÊ PERDEU', champion: 'CAMPEÃO!',
  greatGame: 'BOA PARTIDA!', tryAgain: 'TENTE DE NOVO', nextMatch: 'PRÓXIMA',
  matchComplete: 'FIM DE PARTIDA',
  goals: 'GOLS', shots: 'CHUTES', accuracy: 'PRECISÃO',
  rebounds: 'QUIQUES', powerShots: 'ESPECIAIS',
  newField: 'NOVO CAMPO LIBERADO!', newCap: 'NOVA TAMPINHA LIBERADA!',
  newChallenge: 'NOVO DESAFIO LIBERADO!',
  qualifier: 'CLASSIFICATÓRIA', quarterFinal: 'QUARTAS',
  semiFinal: 'SEMIFINAL', final: 'FINAL', theFinal: 'A FINAL',
  round: n => `Rodada ${n}`, stage: 'FASE',
  challengeComplete: 'DESAFIO CUMPRIDO!', challengeFailed: 'DESAFIO PERDIDO',
  attemptsLeft: n => `${n} chute${n === 1 ? '' : 's'} restante${n === 1 ? '' : 's'}`,
  holeIn: 'CAIU NO BURACO! Perdeu a vez.',
  rotate: 'Gire o celular', rotateSub: 'O pregobol joga na horizontal',
  easy: 'FÁCIL', normal: 'MÉDIO', hard: 'FORTE', insane: 'INSANO'
}
};

let idioma = 'en';
/* t('key') → string; t('key', arg) → calls the function entries above. */
function t(k, arg) {
  const d = IDIOMAS[idioma] || IDIOMAS.en;
  const v = k in d ? d[k] : IDIOMAS.en[k];
  return typeof v === 'function' ? v(arg) : v;
}
const sorteio = a => a[Math.floor(Math.random() * a.length)];

/* Stamps every static label. Called on boot and whenever the language flips. */
function aplicarIdioma() {
  const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  const setHTML = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
  document.documentElement.lang = idioma;

  set('btnIniciar', t('start'));
  set('notaAbertura', t('startNote'));
  set('carregando', t('loading'));
  set('btnPular', t('skip'));

  set('tagline', t('tagline'));
  /* the icon is part of the label: the menu is graffiti on a wall, and the
     pictogram is the tag next to the word */
  const card = (id, ico, txt, sub) =>
    setHTML(id, `<span class="ico">${ico}</span>${txt}<em>${sub}</em>`);
  card('cardPlay', '⚽', t('play'), t('playSub'));
  card('card2P', '👥', t('twoPlayers'), t('twoPlayersSub'));
  card('cardArcade', '🕹️', t('arcade'), t('arcadeSub'));
  card('cardTorneio', '🏆', t('tournament'), t('tournamentSub'));
  card('cardDesafios', '🎯', t('challenges'), t('challengesSub'));
  card('cardCampo', '🎨', t('fieldSelect'), t('fieldSelectSub'));
  card('cardTampa', '🔘', t('capSelect'), t('capSelectSub'));
  setHTML('cardNivel', `<span class="ico">🧠</span>${t('ai')}<em id="nivelEstado"></em>`);
  setHTML('cardSom', `<span class="ico">🔊</span>${t('sound')}<em id="somEstado"></em>`);
  setHTML('cardIdioma', `<span class="ico">🌎</span>${t('language')}<em>${t('languageSub')}</em>`);
  setHTML('cardOnline', `<span class="ico">🌐</span>${t('online')}<span class="selo">${t('soon')}</span>`);

  set('rotName', t('rotate'));
  set('rotSub', t('rotateSub'));
  set('rotLabel', t('turn'));
  set('btnMenu', t('menu'));
  set('btnNovo', t('newMatch'));
  set('dicaBarra', t('hint'));
  set('voltarMenu2', t('back'));
  set('voltarMenu3', t('back'));
  set('voltarMenu4', t('back'));
  set('tituloCampo', t('fieldSelect'));
  set('tituloTampa', t('capSelect'));
  set('tituloDesafios', t('challenges'));
  set('faixaCampeao', t('champion'));

  const bs = document.getElementById('btnSom');
  if (bs) bs.textContent = Som.ligado ? t('soundOn') : t('soundOff');
}
