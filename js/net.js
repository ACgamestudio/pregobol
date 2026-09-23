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
   ------------------------------------------------------------------ */

const TransporteFirebase = {
  nome: 'firebase',
  db: null, uid: null, meuNaFila: null,

  async conectar(cfg) {
    if (typeof firebase === 'undefined')
      throw new Error('Firebase SDK not loaded');
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    await firebase.auth().signInAnonymously();
    this.uid = firebase.auth().currentUser.uid;
    this.db = firebase.database();
  },

  r(p) { return this.db.ref(p); },

  async criarSala(cod, dados) {
    await this.r('salas/' + cod).set(Object.assign({
      criada: firebase.database.ServerValue.TIMESTAMP, host: this.uid
    }, dados));
    /* the whole reason for choosing Firebase: an abandoned room cleans
       itself up, and the opponent finds out immediately. */
    this.r('salas/' + cod + '/vivo/1').onDisconnect().remove();
    await this.r('salas/' + cod + '/vivo/1').set(true);
  },

  async lerSala(cod) {
    const s = await this.r('salas/' + cod).once('value');
    return s.val();
  },

  async entrarSala(cod, dados) {
    const ref = this.r('salas/' + cod);
    const res = await ref.transaction(s => {
      if (!s) return;                       // room does not exist
      if (s.visitante) return;              // already full
      s.visitante = this.uid;
      s.cfgB = dados;
      return s;
    });
    if (!res.committed || !res.snapshot.val()) return false;
    this.r('salas/' + cod + '/vivo/2').onDisconnect().remove();
    await this.r('salas/' + cod + '/vivo/2').set(true);
    return true;
  },

  ouvirSala(cod, cb) {
    const ref = this.r('salas/' + cod);
    const h = ref.on('value', s => cb(s.val()));
    return () => ref.off('value', h);
  },

  async enviar(cod, n, msg) {
    await this.r('salas/' + cod + '/jogadas/' + n).set(msg);
  },

  ouvirJogadas(cod, cb) {
    const ref = this.r('salas/' + cod + '/jogadas');
    const h = ref.on('child_added', s => cb(Number(s.key), s.val()));
    return () => ref.off('child_added', h);
  },

  async enfileirar(cod) {
    this.meuNaFila = cod;
    this.r('fila/' + cod).onDisconnect().remove();
    await this.r('fila/' + cod).set(firebase.database.ServerValue.TIMESTAMP);
  },

  async desenfileirar() {
    if (!this.meuNaFila) return;
    await this.r('fila/' + this.meuNaFila).remove();
    this.meuNaFila = null;
  },

  /* Atomic claim. Two players hitting FIND MATCH at the same instant
     must not both walk away with the same room. */
  async pegarDaFila() {
    const lista = await this.r('fila').orderByValue().limitToFirst(6).once('value');
    const v = lista.val();
    if (!v) return null;
    for (const cod of Object.keys(v)) {
      const res = await this.r('fila/' + cod).transaction(x => (x === null ? undefined : null));
      if (res.committed && res.snapshot.val() === null) return cod;
    }
    return null;
  },

  async enviarAudio(cod, a) {
    await this.r('salas/' + cod + '/audios').push(a);
  },

  ouvirAudios(cod, cb) {
    const ref = this.r('salas/' + cod + '/audios');
    const h = ref.on('child_added', s => cb(s.val()));
    return () => ref.off('child_added', h);
  },

  async sair(cod, sou) {
    if (!cod) return;
    try { await this.r('salas/' + cod + '/vivo/' + sou).remove(); } catch (e) {}
    if (sou === 1) { try { await this.r('salas/' + cod).remove(); } catch (e) {} }
  }
};


/* ------------------------------------------------------------------
   Google Apps Script.

   Mesmo contrato do transporte do Firebase, com uma diferença que muda
   tudo: não existe push. Um web app do Apps Script é requisição e
   resposta, então "ouvir" aqui é perguntar de tempos em tempos.

   Uma consequência prática: sem onDisconnect, a queda do adversário
   deixa de ser um evento e passa a ser uma dedução — ninguém deu sinal
   há QUEDA_MS. Por isso o servidor devolve o próprio relógio em cada
   resposta: comparar carimbos do servidor com o relógio do celular do
   jogador daria falso positivo toda vez que os dois estivessem
   dessincronizados.
   ------------------------------------------------------------------ */
const TransporteAppsScript = {
  nome: 'apps-script',
  url: '', uid: null,
  INTERVALO: 1800,        // ms entre consultas
  /* Sem sinal por mais que isso = saiu. Era 16s, mas no celular quem
     vai pro WhatsApp mandar o link tem a aba CONGELADA pelo sistema e
     para de dar sinal: o convidado entrava e ficava "conectando" até o
     anfitrião voltar. Saída de verdade não depende disto — sair apaga a
     sala ou marca s.saiu, e o outro lado sabe na hora. */
  QUEDA_MS: 90000,
  TEMPO_MAX: 15000,       // uma requisição pendurada não pode travar o polling
  _timer: null, _cbSala: null, _cbJogadas: null, _cbAudio: null,
  _desde: -1, _desdeA: -1, _cod: null, _visto: null, _falhas: 0,

  async conectar(cfg) {
    this.url = (cfg && cfg.url) || APPS_SCRIPT_URL;
    if (!this.url) throw new Error('APPS_SCRIPT_URL vazia');
    let uid = null;
    try { uid = sessionStorage.getItem('pregobol_uid'); } catch (e) {}
    if (!uid) {
      uid = 'u' + Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem('pregobol_uid', uid); } catch (e) {}
    }
    this.uid = uid;
    /* Voltou pro jogo (do WhatsApp, de outra aba): consulta NA HORA em
       vez de esperar o próximo ciclo, que o sistema pode ter atrasado. */
    if (!this._ouvindoVis && typeof document !== 'undefined' && document.addEventListener) {
      this._ouvindoVis = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this._timer && this._passo && !this._emVoo) {
          clearTimeout(this._timer);
          this._timer = setTimeout(this._passo, 0);
        }
      });
    }
  },

  /* text/plain de propósito: com application/json o navegador manda um
     OPTIONS de preflight, e o Apps Script não responde OPTIONS. */
  async chamar(dados) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), this.TEMPO_MAX) : null;
    try {
      const r = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(dados),
        redirect: 'follow',
        signal: ctl ? ctl.signal : undefined
      });
      if (!r.ok) throw new Error('http ' + r.status);
      const txt = await r.text();
      /* Se a implantação não estiver como "Qualquer pessoa", o Google
         devolve uma página HTML de login em vez de JSON. Dizer isso
         poupa uma tarde de depuração. */
      try { return JSON.parse(txt); }
      catch (e) { throw new Error('o Apps Script respondeu HTML, não JSON — confira se a implantação está como "Qualquer pessoa"'); }
    } finally { if (t) clearTimeout(t); }
  },

  async criarSala(cod, dados) {
    const r = await this.chamar({ acao: 'criar', cod: cod, uid: this.uid,
                                  cfg: JSON.stringify(dados.cfg || dados) });
    if (!r.ok) throw new Error(r.motivo || 'falhou');
  },

  async lerSala(cod) {
    const r = await this.chamar({ acao: 'ler', cod: cod });
    return r.ok ? this.traduzir(r.sala, r.agora) : null;
  },

  /* Guarda o motivo da recusa: "não existe" e "cheia" pedem respostas
     diferentes do jogador. Trava ocupada é passageira: tenta de novo. */
  async entrarSala(cod, dados) {
    for (let i = 0; i < 3; i++) {
      const r = await this.chamar({ acao: 'entrar', cod: cod, uid: this.uid,
                                    cfg: JSON.stringify(dados || {}) });
      if (r.ok) { this.motivo = null; return true; }
      this.motivo = r.motivo || r.erro || 'falhou';
      if (r.erro !== 'ocupado') return false;
      await new Promise(ok => setTimeout(ok, 800));
    }
    return false;
  },

  /* Formato do Firebase pra cima: vivo vira booleano, e é aqui que a
     ausência de sinal vira "saiu". */
  traduzir(s, agora) {
    if (!s) return null;
    const vivo = {};
    this._visto = this._visto || {};
    ['1', '2'].forEach(k => {
      /* Presença mora no CacheService, que pode despejar uma chave.
         Chave ausente = sem notícia nova: vale o último carimbo visto.
         Só saída explícita (s.saiu) ou silêncio longo derrubam. */
      let t = s.vivo && s.vivo[k];
      if (t) this._visto[k] = Math.max(this._visto[k] || 0, t);
      else t = this._visto[k];
      const saiu = s.saiu && s.saiu[k];
      if (t && !saiu && (agora - t) < this.QUEDA_MS) vivo[k] = true;
    });
    const visto = {};
    ['1', '2'].forEach(k => { if (this._visto[k]) visto[k] = Math.max(0, agora - this._visto[k]); });
    return { host: s.host, visitante: s.visitante, cfg: s.cfg, cfgB: s.cfgB,
             vivo: vivo, visto: visto, criada: s.criada };
  },

  /* Uma consulta alimenta os dois "ouvintes": estado da sala e jogadas
     novas chegam na mesma resposta. */
  ouvirSala(cod, cb) {
    this._cod = cod; this._cbSala = cb;
    this.iniciarLoop();
    return () => { this._cbSala = null; this.pararSePreciso(); };
  },

  ouvirJogadas(cod, cb) {
    this._cod = cod; this._cbJogadas = cb;
    this.iniciarLoop();
    return () => { this._cbJogadas = null; this.pararSePreciso(); };
  },

  ouvirAudios(cod, cb) {
    this._cod = cod; this._cbAudio = cb;
    this.iniciarLoop();
    return () => { this._cbAudio = null; this.pararSePreciso(); };
  },

  async enviarAudio(cod, a) {
    const r = await this.chamar({ acao: 'audio', cod: cod, sou: a.de,
                                  mime: a.mime, d: a.d, dur: a.dur });
    if (!r.ok) throw new Error(r.motivo || 'áudio não enviado');
  },

  iniciarLoop() {
    if (this._timer) return;
    const passo = async () => {
      if (!this._cod) return;
      this._emVoo = true;
      try {
        const r = await this.chamar({ acao: 'sync', cod: this._cod,
                                      sou: Rede.sou || 0, desde: this._desde,
                                      desdeA: this._desdeA });
        this._falhas = 0;
        if (r.ok) {
          if (this._cbSala) this._cbSala(this.traduzir(r.sala, r.agora));
          (r.jogadas || []).forEach(j => {
            this._desde = Math.max(this._desde, j.n);
            if (this._cbJogadas) {
              let m = null;
              try { m = JSON.parse(j.msg); } catch (e) {}
              if (m) this._cbJogadas(j.n, m);
            }
          });
          (r.audios || []).forEach(a => { if (this._cbAudio) this._cbAudio(a); });
          if (typeof r.an === 'number') this._desdeA = Math.max(this._desdeA, r.an - 1);
        } else if (this._cbSala) {
          this._cbSala(null);              // sala sumiu
        }
      } catch (e) {
        /* Uma falha isolada é normal (rede oscila). Várias seguidas
           significam que não vai voltar sozinho, e ficar mudo é pior que
           errar: o jogador fica olhando "conectando" pra sempre. */
        this._falhas = (this._falhas || 0) + 1;
        if (this._falhas === 3 && Rede.ao.erro)
          Rede.ao.erro(new Error('sem resposta do servidor: ' + (e.message || e)));
      }
      this._emVoo = false;
      if (this._timer) this._timer = setTimeout(passo, this.INTERVALO);
    };
    this._passo = passo;
    this._timer = setTimeout(passo, 0);
  },

  pararSePreciso() {
    if (this._cbSala || this._cbJogadas || this._cbAudio) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },

  async enviar(cod, n, msg) {
    await this.chamar({ acao: 'enviar', cod: cod, n: n, sou: Rede.sou,
                        msg: JSON.stringify(msg) });
  },

  async enfileirar(cod) { await this.chamar({ acao: 'enfileirar', cod: cod }); },
  async desenfileirar() {
    if (this._cod) await this.chamar({ acao: 'desenfileirar', cod: this._cod });
  },
  async pegarDaFila() {
    const r = await this.chamar({ acao: 'pegar' });
    return r.ok ? r.cod : null;
  },

  async sair(cod, sou) {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._cbSala = this._cbJogadas = this._cbAudio = null; this._cod = null;
    this._desde = -1; this._desdeA = -1; this._visto = null; this._falhas = 0;
    if (cod) { try { await this.chamar({ acao: 'sair', cod: cod, sou: sou }); } catch (e) {} }
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
  async sair(cod, sou) { const s = this._s(cod); if (s) delete s.vivo[sou]; this._avisar(cod); }
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

  /* Apps Script ganha se estiver configurado — é o que você estará
     testando. Sem ele, cai no Firebase. */
  async conectar(cfg) {
    if (!this.T) {
      const usarGAS = (typeof APPS_SCRIPT_PRONTO !== 'undefined') && APPS_SCRIPT_PRONTO;
      this.usar(usarGAS ? TransporteAppsScript : TransporteFirebase);
    }
    await this.T.conectar(cfg);
  },

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

    this._offSala = this.T.ouvirSala(this.sala, s => {
      if (!s) { this._quedou(); return; }
      this.cfgSala = s;
      const doisAqui = s.vivo && s.vivo[1] && s.vivo[2];
      if (doisAqui && this.estado !== 'jogando') {
        clearTimeout(this._vigia);
        this.estado = 'jogando';
        this._esquecer();
        if (this.publica) this.T.desenfileirar();
        if (this.ao.pronto) this.ao.pronto(s);
      } else if (this.estado === 'jogando' && !doisAqui) {
        this._quedou();
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

  /* Mensagem de voz. Vai como base64 dentro do JSON: é o único jeito que
     o Apps Script aceita sem preflight, e 6s de voz dão poucos KB. */
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
    if (this._offSala) this._offSala();
    if (this._offJog) this._offJog();
    if (this._offAudio) this._offAudio();
    this._offSala = this._offJog = this._offAudio = null;
    if (this.ao.fim) this.ao.fim();
    if (this.publica) { try { await this.T.desenfileirar(); } catch (e) {} }
    try { await this.T.sair(s, eu); } catch (e) {}
  }
};
