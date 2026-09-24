/* ===================================================================
   Online play.

   The game is turn based, so a turn is one small message and latency is
   irrelevant. What matters is agreement.

   AUTHORITY: WHOEVER SHOOTS IS RIGHT. The shooting client simulates the
   whole flick locally and then sends the parameters, the RNG seed AND
   the resulting board. The other client replays the flick for show and
   snaps to the board it was sent.

   This is deliberately not lockstep. Math.sin and Math.cos are not
   bit-identical across JS engines, and over ~900 physics ticks with
   chaotic collisions one last-bit difference becomes "goal" on one
   screen and "hit the post" on the other. Sending the outcome makes
   that class of bug impossible instead of merely unlikely.
   =================================================================== */

/* ------------------------------------------------------------------
   Transport interface (so the protocol can be tested without a network)

     conectar(cfg)          -> Promise
     criarSala(cod, dados)  -> Promise
     lerSala(cod)           -> Promise<dados|null>
     entrarSala(cod, dados) -> Promise<boolean>   false = full or gone
     ouvirSala(cod, cb)     -> unsubscribe        cb(dados)
     enviar(cod, n, msg)    -> Promise
     ouvirJogadas(cod, cb)  -> unsubscribe        cb(n, msg)
     enfileirar(cod)        -> Promise            offer room publicly
     desenfileirar()        -> Promise
     pegarDaFila()          -> Promise<cod|null>  atomically claim one
     sair(cod, sou)         -> Promise
     enviarAudio(cod, a)    -> Promise            a = {de, mime, d(base64), dur}
     ouvirAudios(cod, cb)   -> unsubscribe        cb(a)
     presenca(cod, sou)     -> void   (opcional) mantém vivo/sou de pé,
                                       inclusive depois de reconectar
   ------------------------------------------------------------------ */

const TransporteFirebase = {
  nome: 'firebase',
  db: null, uid: null, meuNaFila: null, motivo: null,
  _presenca: null,
  PRAZO: 15000,
  RELIGAR_MS: 4000,       // fora da aba por mais que isso = reconecta na volta
  SALA_VELHA_MS: 30 * 60 * 1000,           // nenhuma operação pode deixar a tela "conectando" pra sempre

  /* Promessa com prazo. Sem rede, o SDK do Firebase enfileira a escrita
     e espera em silêncio; pro jogador isso é uma tela parada. */
  prazo(p, msg) {
    let t;
    return Promise.race([
      p,
      new Promise((_, falha) => { t = setTimeout(() => falha(new Error(msg || 'sem resposta do servidor')), this.PRAZO); })
    ]).finally(() => clearTimeout(t));
  },

  /* Os erros do Firebase dizem o que falta configurar, mas em código.
     Traduzir aqui poupa uma tarde de depuração. */
  explicar(e) {
    const c = String((e && (e.code || e.message)) || e || '');
    if (/operation-not-allowed|admin-restricted/i.test(c))
      return new Error('Ative o login Anônimo no Firebase (Authentication → Sign-in method → Anônimo)');
    if (/api-key|invalid-api-key/i.test(c))
      return new Error('apiKey inválida em js/firebase-config.js');
    if (/permission.denied/i.test(c))
      return new Error('O Firebase recusou: confira as regras do Realtime Database (veja firebase-config.js)');
    if (/network-request-failed/i.test(c))
      return new Error('sem internet');
    return e instanceof Error ? e : new Error(c);
  },

  async conectar(cfg) {
    if (typeof firebase === 'undefined')
      throw new Error('SDK do Firebase não carregou (sem internet?)');
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      /* Anônimo persiste no navegador: recarregar a página mantém o
         mesmo uid, e é isso que permite retomar a sala. */
      if (!firebase.auth().currentUser)
        await this.prazo(firebase.auth().signInAnonymously(), 'o login do Firebase não respondeu');
      this.uid = firebase.auth().currentUser.uid;
      this.db = firebase.database();
    } catch (e) { throw this.explicar(e); }
    this._vigiarAba();
  },

  /* Voltou pra aba depois de um tempo fora (WhatsApp, outra aba, tela
     apagada)? O navegador pode ter matado a conexão sem avisar, e o
     Firebase só percebe depois de quase um minuto de silêncio. Nesse
     meio-tempo os ouvintes ficam mudos: o amigo entra e esta tela
     continua em "esperando adversário". Derrubar e religar na volta
     força uma conexão nova, que já chega com o estado atual da sala. */
  _vigiarAba() {
    if (this._abaVigiada || typeof document === 'undefined' || !document.addEventListener) return;
    this._abaVigiada = true;
    let saiu = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { saiu = Date.now(); return; }
      if (saiu && Date.now() - saiu > this.RELIGAR_MS && this.db) {
        try { this.db.goOffline(); this.db.goOnline(); } catch (e) {}
      }
      saiu = 0;
    });
  },

  r(p) { return this.db.ref(p); },

  /* JSON de ida e volta: o Firebase recusa undefined e NaN, e o erro
     aparece longe de quem o causou. */
  limpo(x) { return x == null ? null : JSON.parse(JSON.stringify(x)); },

  async criarSala(cod, dados) {
    try {
      await this.prazo(this.r('salas/' + cod).set(Object.assign({
        criada: firebase.database.ServerValue.TIMESTAMP, host: this.uid
      }, this.limpo(dados))));
    } catch (e) { throw this.explicar(e); }
  },

  async lerSala(cod) {
    try {
      const s = await this.prazo(this.r('salas/' + cod).once('value'));
      return s.val();
    } catch (e) { throw this.explicar(e); }
  },

  /* Transação: dois amigos tocando ENTRAR ao mesmo tempo não podem os dois
     virar visitante. O primeiro palpite vem do cache local, que costuma
     estar vazio — por isso "não existe" devolve null em vez de abortar:
     se o servidor discordar, a função roda de novo com o valor real. */
  async entrarSala(cod, dados) {
    const uid = this.uid, cfgB = this.limpo(dados) || {};
    let motivo = null;
    try {
      /* O "vivo" do visitante vai JUNTO com a entrada, na mesma
         transação: não existe um instante em que o anfitrião vê
         "amigo entrou" e o amigo ainda não está marcado. */
      await this.r('salas/' + cod + '/vivo/2').onDisconnect().remove();
      const res = await this.prazo(this.r('salas/' + cod).transaction(s => {
        if (s === null) { motivo = 'inexistente'; return null; }
        if (s.visitante && s.visitante !== uid) { motivo = 'cheia'; return; }
        /* Sala antiga cujo dono não está mais aqui: é de um convite velho
           que ficou no WhatsApp. Entrar nela deixaria o amigo "dentro" de
           uma sala que ninguém mais olha, enquanto o dono espera em outra. */
        const donoAqui = !!(s.vivo && s.vivo[1]);
        if (!donoAqui && s.criada && Date.now() - s.criada > this.SALA_VELHA_MS) {
          motivo = 'inexistente'; return;
        }
        motivo = null;
        s.visitante = uid;
        s.cfgB = cfgB;
        s.vivo = Object.assign({}, s.vivo, { 2: true });
        if (s.saiu) delete s.saiu[2];
        return s;
      }, undefined, false));
      if (!res.committed || motivo || !res.snapshot.val()) {
        this.r('salas/' + cod + '/vivo/2').onDisconnect().cancel().catch(() => {});
        this.motivo = motivo || (res.committed ? 'inexistente' : 'cheia');
        return false;
      }
      this.motivo = null;
      return true;
    } catch (e) { throw this.explicar(e); }
  },

  /* Presença. O ponto fraco do celular: quem vai pro WhatsApp mandar o
     link tem a aba congelada, a conexão cai e o onDisconnect apaga o
     "vivo". Quando a aba volta, o Firebase reconecta sozinho — e
     .info/connected avisa. É aí que o "vivo" é escrito DE NOVO. Sem
     isso, o anfitrião voltava do WhatsApp e ninguém sabia. */
  presenca(cod, sou) {
    this.pararPresenca();
    const vivo = this.r('salas/' + cod + '/vivo/' + sou);
    const con = this.db.ref('.info/connected');
    const marcar = async () => {
      try {
        await vivo.onDisconnect().remove();
        await vivo.set(true);
        if (this.meuNaFila === cod) {
          await this.r('fila/' + cod).onDisconnect().remove();
          await this.r('fila/' + cod).set(firebase.database.ServerValue.TIMESTAMP);
        }
      } catch (e) {
        /* Sala apagada: a regra .validate recusa recriar só o "vivo", e
           isso é o esperado. Qualquer outra recusa é problema de verdade
           (regra errada) e precisa aparecer na tela, não sumir aqui. */
        if (this.aoErro) this.aoErro(this.explicar(e));
      }
    };
    const h = con.on('value', snap => { if (snap.val() === true) marcar(); });
    marcar();
    this._presenca = () => {
      con.off('value', h);
      vivo.onDisconnect().cancel().catch(() => {});
    };
  },

  pararPresenca() {
    if (this._presenca) { this._presenca(); this._presenca = null; }
  },

  ouvirSala(cod, cb) {
    const ref = this.r('salas/' + cod);
    const h = ref.on('value', s => cb(s.val()), e => cb(null));
    return () => ref.off('value', h);
  },

  /* A jogada vai como texto. O Realtime Database transforma arrays em
     objetos e some com arrays vazios; o tabuleiro do outro lado chegaria
     diferente do que foi enviado. Texto chega exatamente igual. */
  async enviar(cod, n, msg) {
    try {
      await this.prazo(this.r('salas/' + cod + '/jogadas/' + n).set({ j: JSON.stringify(msg) }),
                       'a jogada não chegou ao servidor');
    } catch (e) { throw this.explicar(e); }
  },

  ouvirJogadas(cod, cb) {
    const ref = this.r('salas/' + cod + '/jogadas');
    const h = ref.on('child_added', s => {
      const v = s.val();
      let m = null;
      try { m = v && typeof v.j === 'string' ? JSON.parse(v.j) : v; } catch (e) {}
      if (m) cb(Number(s.key), m);
    });
    return () => ref.off('child_added', h);
  },

  async enfileirar(cod) {
    this.meuNaFila = cod;
    await this.r('fila/' + cod).onDisconnect().remove();
    await this.prazo(this.r('fila/' + cod).set(firebase.database.ServerValue.TIMESTAMP));
  },

  async desenfileirar() {
    if (!this.meuNaFila) return;
    const cod = this.meuNaFila;
    this.meuNaFila = null;
    try {
      await this.r('fila/' + cod).onDisconnect().cancel();
      await this.r('fila/' + cod).remove();
    } catch (e) {}
  },

  /* Pegar uma sala da fila é atômico: dois jogadores tocando PROCURAR no
     mesmo instante não podem sair com a mesma sala. A última execução da
     transação é a que valeu no servidor, então é ela que diz se havia
     alguém ali pra pegar. */
  async pegarDaFila() {
    let lista;
    try { lista = await this.prazo(this.r('fila').orderByValue().limitToFirst(6).once('value')); }
    catch (e) { throw this.explicar(e); }
    const v = lista.val();
    if (!v) return null;
    for (const cod of Object.keys(v)) {
      if (cod === this.meuNaFila) continue;
      let tinha = false;
      const res = await this.r('fila/' + cod).transaction(x => { tinha = x !== null; return null; },
                                                          undefined, false);
      if (res.committed && tinha) return cod;
    }
    return null;
  },

  async enviarAudio(cod, a) {
    try { await this.prazo(this.r('salas/' + cod + '/audios').push(a), 'áudio não enviado'); }
    catch (e) { throw this.explicar(e); }
  },

  ouvirAudios(cod, cb) {
    const ref = this.r('salas/' + cod + '/audios');
    const h = ref.on('child_added', s => cb(s.val()));
    return () => ref.off('child_added', h);
  },

  /* Saída explícita marca "saiu": o outro lado sabe NA HORA que não é
     uma queda passageira e não precisa esperar a tolerância. */
  async sair(cod, sou) {
    this.pararPresenca();
    if (!cod) return;
    if (sou === 1) { try { await this.r('salas/' + cod).remove(); } catch (e) {} return; }
    try { await this.r('salas/' + cod + '/saiu/' + sou).set(true); } catch (e) {}
    try { await this.r('salas/' + cod + '/vivo/' + sou).remove(); } catch (e) {}
  }
};

/* In-process transport. Used by net-test.js to run two clients against
   each other without a network. */
const TransporteLoop = {
  nome: 'loop',
  mundo: null, uid: null,
  async conectar() { this.uid = 'u' + Math.random().toString(36).slice(2, 8); },
  _s(cod) { return this.mundo.salas[cod]; },
  async criarSala(cod, dados) {
    this.mundo.salas[cod] = Object.assign({ host: this.uid, vivo: { 1: true }, jogadas: {} }, dados);
    this._avisar(cod);
  },
  async lerSala(cod) { return this._s(cod) || null; },
  async entrarSala(cod, dados) {
    const s = this._s(cod);
    if (!s || s.visitante) return false;
    s.visitante = this.uid; s.cfgB = dados; s.vivo[2] = true;
    this._avisar(cod);
    return true;
  },
  ouvirSala(cod, cb) {
    (this.mundo.ouvintes[cod] = this.mundo.ouvintes[cod] || []).push(cb);
    if (this._s(cod)) cb(this._s(cod));
    return () => {};
  },
  _avisar(cod) { (this.mundo.ouvintes[cod] || []).forEach(cb => cb(this._s(cod))); },
  async enviar(cod, n, msg) {
    const s = this._s(cod); s.jogadas[n] = msg;
    (this.mundo.ouvintesJ[cod] || []).forEach(cb => cb(n, msg));
  },
  ouvirJogadas(cod, cb) {
    (this.mundo.ouvintesJ[cod] = this.mundo.ouvintesJ[cod] || []).push(cb);
    return () => {};
  },
  async enfileirar(cod) { this.mundo.fila.push(cod); },
  async desenfileirar() {},
  async pegarDaFila() { return this.mundo.fila.shift() || null; },
  async enviarAudio(cod, a) { (this.mundo.ouvintesA && this.mundo.ouvintesA[cod] || []).forEach(cb => cb(a)); },
  ouvirAudios(cod, cb) {
    this.mundo.ouvintesA = this.mundo.ouvintesA || {};
    (this.mundo.ouvintesA[cod] = this.mundo.ouvintesA[cod] || []).push(cb);
    return () => {};
  },
  async sair(cod, sou) {
    const s = this._s(cod);
    if (s) { delete s.vivo[sou]; s.saiu = Object.assign({}, s.saiu, { [sou]: true }); }
    this._avisar(cod);
  }
};

/* ------------------------------------------------------------------
   Protocol
   ------------------------------------------------------------------ */
const Rede = {
  T: null,
  ativo: false,
  sou: 0,              // 1 = host and kicks off, 2 = visitor
  sala: null,
  turno: 0,            // index of the next message to be written
  aplicado: -1,        // highest message index already played out
  publica: false,
  estado: 'off',       // off | procurando | esperando | jogando | caiu
  pendente: null,      // authoritative board waiting to be applied
  emCurso: null,       // my own flick, waiting for its outcome
  cfgSala: null,

  ao: { pronto: null, oponente: null, jogada: null, saiu: null, erro: null, fila: null,
        audio: null, fim: null },

  usar(t) { this.T = t; return this; },

  async conectar(cfg) {
    if (!this.T) this.usar(TransporteFirebase);
    await this.T.conectar(cfg);
  },

  /* Queda de conexão no meio da partida (celular trocou de rede, tela
     apagou, foi responder o WhatsApp) não é desistência. Espera esse
     tempo pelo outro voltar antes de encerrar. Saída de verdade não
     espera: quem sai marca "saiu" e o outro lado sabe na hora. */
  QUEDA_MS: 45000,
  CURA_MS: 3000,          // intervalo mínimo entre remarcações de presença

  codigo() {
    /* No vowels: a room code should never accidentally spell something. */
    const abc = 'BCDFGHJKLMNPQRSTVWXZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += abc[Math.floor(Math.random() * abc.length)];
    return c;
  },

  /* Nada pode ficar "conectando" pra sempre. Se o outro lado não
     aparecer nesse prazo, o jogador é avisado em vez de encarar uma
     tela parada. */
  ESPERA_MAX: 120000,
  _vigiar() {
    clearTimeout(this._vigia);
    /* Quem criou a sala está mandando o link no WhatsApp: esperar é o
       normal, não um erro. Só o visitante tem prazo. */
    if (this.sou === 1) return;
    this._vigia = setTimeout(() => {
      if (this.estado !== 'jogando' && this.ativo && this.ao.erro)
        this.ao.erro(new Error(typeof t === 'function' ? t('hostAway') : 'host away'));
    }, this.ESPERA_MAX);
  },

  async criar(cfg, publica) {
    this.sala = this.codigo();
    this.sou = 1; this.ativo = true; this.publica = !!publica;
    this.turno = 0; this.aplicado = -1;
    await this.T.criarSala(this.sala, { cfg: cfg });
    if (publica) await this.T.enfileirar(this.sala);
    if (!publica) this._lembrar();
    this.estado = 'esperando';
    this._ouvir();
    this._vigiar();
    return this.sala;
  },

  async entrar(cod, cfgB) {
    cod = String(cod || '').toUpperCase().trim();
    const ok = await this.T.entrarSala(cod, cfgB);
    this.motivo = ok ? null : (this.T.motivo || null);
    if (!ok) return false;
    this.sala = cod; this.sou = 2; this.ativo = true;
    this.turno = 0; this.aplicado = -1;
    this._lembrar();
    /* NÃO marcar 'jogando' aqui. Quem promove o estado é o ouvinte da
       sala, e é ele que dispara ao.pronto — que é o que faz a partida
       começar na tela. Marcando aqui, a condição do ouvinte nunca era
       verdadeira e o visitante ficava preso em "conectando" pra sempre. */
    this.estado = 'esperando';
    this._ouvir();
    this._vigiar();
    return true;
  },

  /* Celular: ir pro WhatsApp mandar o link pode fazer o navegador
     descartar a aba. Na volta a página recarrega do zero e a sala criada
     ficava órfã. Guardando o código, o anfitrião retoma a mesma sala. */
  _lembrar() {
    try { sessionStorage.setItem('pregobol_sala', JSON.stringify({ cod: this.sala, sou: this.sou, t: Date.now() })); } catch (e) {}
  },
  _esquecer() { try { sessionStorage.removeItem('pregobol_sala'); } catch (e) {} },
  salaLembrada() {
    try {
      const x = JSON.parse(sessionStorage.getItem('pregobol_sala') || 'null');
      if (x && x.cod && Date.now() - x.t < 20 * 60 * 1000) return { cod: x.cod, sou: x.sou === 2 ? 2 : 1 };
    } catch (e) {}
    return null;
  },

  /* A página recarregou (o celular descartou a aba enquanto a pessoa
     estava no WhatsApp). Volta pra mesma sala no mesmo papel.
     ANTES recusava a sala se ela já tivesse visitante — mas o amigo
     entrar enquanto o anfitrião está no WhatsApp é exatamente o caso
     normal. O anfitrião perdia a sala e o convidado ficava "conectando"
     pra sempre. */
  async retomar(x) {
    const cod = x && x.cod ? x.cod : x, sou = x && x.sou === 2 ? 2 : 1;
    const s = await this.T.lerSala(cod);
    if (!s) { this._esquecer(); return false; }
    if (sou === 2 && s.visitante && this.T.uid && s.visitante !== this.T.uid) { this._esquecer(); return false; }
    this.sala = cod; this.sou = sou; this.ativo = true; this.publica = false;
    this.turno = 0; this.aplicado = -1; this.estado = 'esperando';
    this._ouvir();
    return true;
  },

  /* Public matchmaking: take a waiting room if there is one, otherwise
     become the waiting room. */
  async procurar(cfg) {
    this.estado = 'procurando';
    const cod = await this.T.pegarDaFila();
    if (cod) {
      const ok = await this.entrar(cod, cfg);
      if (ok) return { modo: 'entrou', sala: cod };
    }
    const nova = await this.criar(cfg, true);
    return { modo: 'aguardando', sala: nova };
  },

  _ouvir() {
    if (this._offSala) this._offSala();
    if (this._offJog) this._offJog();
    if (this._offAudio) this._offAudio();
    if (this.T.presenca) {
      this.T.aoErro = e => {
        if (this.ativo && this.cfgSala && this.ao.erro) this.ao.erro(e);
      };
      this.T.presenca(this.sala, this.sou);
    }

    this._offSala = this.T.ouvirSala(this.sala, s => {
      if (!s) { this._quedou(); return; }
      this.cfgSala = s;
      /* Autocura: a sala existe, eu estou nela, mas o servidor não me vê
         como "vivo". Seja qual for o motivo (reconexão que não avisou,
         aba congelada, escrita perdida), marca de novo. Com limite pra
         não virar um laço de escritas. */
      if (this.ativo && !(s.vivo && s.vivo[this.sou]) && this.T.presenca &&
          Date.now() - (this._curou || 0) > this.CURA_MS) {
        this._curou = Date.now();
        this.T.presenca(this.sala, this.sou);
      }
      const doisAqui = !!(s.vivo && s.vivo[1] && s.vivo[2]);
      const outro = this.sou === 1 ? 2 : 1;
      if (doisAqui && this._graca) { clearTimeout(this._graca); this._graca = null; }
      if (doisAqui && this.estado !== 'jogando') {
        clearTimeout(this._vigia);
        this.estado = 'jogando';
        this._esquecer();
        if (this.publica) this.T.desenfileirar();
        if (this.ao.pronto) this.ao.pronto(s);
      } else if (this.estado === 'jogando' && !doisAqui) {
        if (s.saiu && s.saiu[outro]) this._quedou();
        else if (!this._graca) {
          this._graca = setTimeout(() => {
            this._graca = null;
            const c = this.cfgSala;
            if (this.estado === 'jogando' && !(c && c.vivo && c.vivo[1] && c.vivo[2])) this._quedou();
          }, this.QUEDA_MS);
        }
      }
      if (this.ao.oponente) this.ao.oponente(s);
    });

    this._offJog = this.T.ouvirJogadas(this.sala, (n, m) => {
      if (!m || m.de === this.sou) return;   // my own echo
      if (n <= this.aplicado) return;
      this.aplicado = n;
      this.turno = Math.max(this.turno, n + 1);
      if (this.ao.jogada) this.ao.jogada(m);
    });

    this._offAudio = this.T.ouvirAudios ? this.T.ouvirAudios(this.sala, a => {
      if (!a || Number(a.de) === this.sou || !a.d) return;   // meu próprio eco
      if (this.ao.audio) this.ao.audio(a);
    }) : null;
  },

  /* Mensagem de voz. Vai como base64 no próprio banco: 6s de voz em
     opus dão poucos KB, e assim não precisa do Firebase Storage. */
  async enviarAudio(blob, dur) {
    if (!this.ativo || this.estado !== 'jogando') throw new Error('fora de partida');
    const d = await new Promise((ok, falha) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(',')[1] || '');
      fr.onerror = () => falha(new Error('não consegui ler o áudio'));
      fr.readAsDataURL(blob);
    });
    const mime = (blob.type || 'audio/webm').split(';')[0];
    await this.T.enviarAudio(this.sala, { de: this.sou, mime: mime, d: d, dur: Math.round(dur || 0) });
  },

  _quedou() {
    if (this._graca) { clearTimeout(this._graca); this._graca = null; }
    if (this.estado === 'caiu' || !this.ativo) return;
    this.estado = 'caiu';
    if (this.ao.saiu) this.ao.saiu();
  },

  /* Called the instant I release a flick: remember what I did so the
     outcome can be attached to it once the physics settles. */
  registrar(ang, forca, esp, semente) {
    if (!this.ativo || this.estado !== 'jogando') return;
    this.emCurso = { de: this.sou, ang: ang, forca: forca,
                     esp: esp ? esp.tipo : null, semente: semente };
  },

  /* Called when that flick has finished resolving. */
  async concluir(fim) {
    if (!this.emCurso) return;
    const msg = this.emCurso; msg.fim = fim;
    this.emCurso = null;
    const n = this.turno++;
    try { await this.T.enviar(this.sala, n, msg); }
    catch (e) { if (this.ao.erro) this.ao.erro(e); }
  },

  minhaVez(jogadorDaVez) { return !this.ativo || jogadorDaVez === this.sou; },

  async encerrar() {
    if (!this.ativo) return;
    const s = this.sala, eu = this.sou;
    this.ativo = false; this.estado = 'off'; this.sala = null;
    this._esquecer();
    this.emCurso = null; this.pendente = null;
    clearTimeout(this._vigia);
    if (this._graca) { clearTimeout(this._graca); this._graca = null; }
    if (this._offSala) this._offSala();
    if (this._offJog) this._offJog();
    if (this._offAudio) this._offAudio();
    this._offSala = this._offJog = this._offAudio = null;
    if (this.ao.fim) this.ao.fim();
    if (this.publica) { try { await this.T.desenfileirar(); } catch (e) {} }
    try { await this.T.sair(s, eu); } catch (e) {}
  }
};
