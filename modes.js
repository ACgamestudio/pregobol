/* =======================================================================
   PREGOBOL — game modes (spec §7)
   One object owns "what happens when a match ends". The match itself does
   not know whether it is a friendly, a cup semi-final or an arcade rung:
   it just calls Modo.fimDaPartida(vencedor) and does as it is told.
   ======================================================================= */

/* Tournament ladder. The final is longer, played at the Stadium and at a
   harder AI level — it has to feel like it matters. */
const TORNEIO = [
  { chave: 'qualifier',    campo: 'rua',     nivel: 'normal', alvo: 3 },
  { chave: 'quarterFinal', campo: 'praia',   nivel: 'normal', alvo: 3 },
  { chave: 'semiFinal',    campo: 'chuva',   nivel: 'hard',   alvo: 3 },
  { chave: 'final',        campo: 'estadio', nivel: 'insane', alvo: 4, grande: true }
];

/* Challenge Mode (spec §7). Each one is a physics puzzle with a hard shot
   budget, so failure is quick and retrying is cheap. */
const DESAFIOS = [
  { id: 'rebotes', nome: 'ONLY REBOUNDS', desc: 'Score without a straight shot',
    campo: 'rua', tiros: 4, bola: { fx: .5, fy: .5 },
    checar: j => j.rebotes >= 1 },
  { id: 'tres', nome: 'THREE SHOTS', desc: 'Score in three shots or fewer',
    campo: 'estadio', tiros: 3, bola: { fx: .5, fy: .5 },
    checar: () => true },
  { id: 'dourado', nome: 'THE GOLDEN NAIL', desc: 'Hit the golden nail, then score',
    campo: 'favela', tiros: 5, bola: { fx: .5, fy: .5 },
    exigeDourado: 1, checar: j => true },
  { id: 'semborda', nome: 'NO BOARDS', desc: 'Score without touching a board',
    campo: 'rua', tiros: 4, bola: { fx: .5, fy: .5 },
    checar: j => j.paredes === 0 },
  { id: 'canto', nome: 'FROM THE CORNER', desc: 'Score from the corner in two shots',
    campo: 'praia', tiros: 2, bola: { fx: .10, fy: .09 },
    checar: () => true },
  { id: 'alvos', nome: 'THREE TARGETS', desc: 'Hit three golden nails, then score',
    campo: 'extremo', tiros: 8, bola: { fx: .5, fy: .5 },
    exigeDourado: 3, checar: () => true }
];

const Modo = {
  tipo: 'rapida',          // rapida | 2p | arcade | torneio | desafio
  etapa: 0,
  desafio: null,
  tirosRestantes: 0,
  douradosFeitos: 0,

  /* ---------------- entry points ---------------- */
  rapida() {
    this.tipo = 'rapida'; this.etapa = 0; this.desafio = null;
    modo = 'ia';
    return { alvo: 3 };
  },
  doisJogadores() {
    this.tipo = '2p'; this.etapa = 0; this.desafio = null;
    modo = '2p';
    return { alvo: 3 };
  },
  arcade() {
    this.tipo = 'arcade'; this.desafio = null;
    modo = 'ia';
    this.etapa = Math.min(Progresso.dados.arcade, ORDEM_CAMPOS.length - 1);
    campoAtual = ORDEM_CAMPOS[this.etapa];
    /* difficulty climbs with the ladder but never jumps to insane early */
    nivel = ['easy', 'normal', 'normal', 'hard', 'hard', 'insane', 'insane'][this.etapa] || 'hard';
    return { alvo: 3 };
  },
  torneio() {
    this.tipo = 'torneio'; this.desafio = null; this.etapa = 0;
    modo = 'ia';
    return this.montarEtapaTorneio();
  },
  montarEtapaTorneio() {
    const e = TORNEIO[this.etapa];
    campoAtual = e.campo; nivel = e.nivel;
    return { alvo: e.alvo, grande: !!e.grande };
  },
  desafiar(id) {
    const d = DESAFIOS.find(x => x.id === id);
    if (!d) return { alvo: 3 };
    this.tipo = 'desafio'; this.desafio = d; this.etapa = 0;
    this.tirosRestantes = d.tiros; this.douradosFeitos = 0;
    modo = 'desafio';
    campoAtual = d.campo;
    return { alvo: 1, desafio: d };
  },

  /* ---------------- labels ---------------- */
  rotulo() {
    if (this.tipo === 'torneio') return t(TORNEIO[this.etapa].chave);
    if (this.tipo === 'arcade') return `${t('arcade')} ${this.etapa + 1}/${ORDEM_CAMPOS.length}`;
    if (this.tipo === 'desafio') return this.desafio ? this.desafio.nome : t('challenges');
    if (this.tipo === '2p') return t('twoPlayers');
    return '';
  },
  ehFinal() { return this.tipo === 'torneio' && TORNEIO[this.etapa].grande; },

  /* ---------------- challenge bookkeeping ---------------- */
  gastarTiro() {
    if (this.tipo !== 'desafio') return;
    this.tirosRestantes--;
  },
  contarDourado() {
    if (this.tipo === 'desafio') this.douradosFeitos++;
  },
  /* Called on a goal in challenge mode. Returns true if the puzzle is won. */
  desafioCumprido(j) {
    const d = this.desafio;
    if (!d) return false;
    if (d.exigeDourado && this.douradosFeitos < d.exigeDourado) return false;
    return d.checar(j);
  },
  desafioPerdido() {
    return this.tipo === 'desafio' && this.tirosRestantes <= 0;
  },

  /* ---------------- end of match ---------------- */
  /* Returns a plan the UI acts on:
       { titulo, sub, botao, acao }   acao: 'proxima' | 'repetir' | 'menu'  */
  fimDaPartida(vencedor) {
    const humanoGanhou = vencedor === 1 || this.tipo === '2p';

    if (this.tipo === 'torneio') {
      if (!humanoGanhou) {
        return { titulo: t('youLose'), sub: this.rotulo(), botao: t('tryAgain'), acao: 'repetir' };
      }
      if (this.etapa >= TORNEIO.length - 1) {
        Progresso.ganharTorneio();
        const premio = Progresso.liberarCampo('extremo');
        return { titulo: t('champion'), sub: t('greatGame'),
                 botao: t('menu'), acao: 'menu', desbloqueio: premio ? 'extremo' : null };
      }
      this.etapa++;
      return { titulo: t('youWin'), sub: t(TORNEIO[this.etapa].chave),
               botao: t('nextMatch'), acao: 'proxima' };
    }

    if (this.tipo === 'arcade') {
      if (!humanoGanhou) {
        return { titulo: t('youLose'), sub: CAMPOS[campoAtual].nome,
                 botao: t('tryAgain'), acao: 'repetir' };
      }
      const proximo = ORDEM_CAMPOS[this.etapa + 1];
      Progresso.subirArcade(this.etapa + 1);
      let desbloqueio = null, tampa = null;
      if (proximo && Progresso.liberarCampo(proximo)) desbloqueio = proximo;
      const p = PREMIO_ARCADE[proximo];
      if (p && Progresso.liberarTampa(p)) tampa = p;
      if (!proximo) {
        return { titulo: t('champion'), sub: t('greatGame'), botao: t('menu'), acao: 'menu' };
      }
      this.etapa++;
      return { titulo: t('youWin'), sub: CAMPOS[proximo].nome, botao: t('nextMatch'),
               acao: 'proxima', desbloqueio, tampa };
    }

    if (this.tipo === 'desafio') {
      const d = this.desafio;
      if (vencedor === 1) {
        const novo = Progresso.concluirDesafio(d.id);
        let tampa = null;
        /* finishing challenges is the other route to the rarer caps */
        const feitos = DESAFIOS.filter(x => Progresso.feito(x.id)).length;
        if (feitos >= 3 && Progresso.liberarTampa('precisa')) tampa = 'precisa';
        if (feitos >= 5 && Progresso.liberarTampa('turbo')) tampa = 'turbo';
        return { titulo: t('challengeComplete'), sub: d.nome, botao: t('menu'),
                 acao: 'menu', tampa, novo };
      }
      return { titulo: t('challengeFailed'), sub: d.desc, botao: t('tryAgain'), acao: 'repetir' };
    }

    /* quick match and 2 players */
    const titulo = this.tipo === '2p'
      ? `${t('player' + vencedor)} ${t('youWin')}`
      : (vencedor === 1 ? t('youWin') : t('youLose'));
    return { titulo, sub: t('matchComplete'), botao: t('newMatch'), acao: 'repetir' };
  },

  /* Sets up the next match inside a running mode. */
  proxima() {
    if (this.tipo === 'torneio') return this.montarEtapaTorneio();
    if (this.tipo === 'arcade') {
      campoAtual = ORDEM_CAMPOS[this.etapa];
      nivel = ['easy', 'normal', 'normal', 'hard', 'hard', 'insane', 'insane'][this.etapa] || 'hard';
      return { alvo: 3 };
    }
    return { alvo: 3 };
  },
  repetir() {
    if (this.tipo === 'desafio' && this.desafio) return this.desafiar(this.desafio.id);
    if (this.tipo === 'torneio') return this.montarEtapaTorneio();
    if (this.tipo === 'arcade') return this.proxima();
    return { alvo: 3 };
  }
};
