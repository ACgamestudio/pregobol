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

  async sair(cod, sou) {
    if (!cod) return;
    try { await this.r('salas/' + cod + '/vivo/' + sou).remove(); } catch (e) {}
    if (sou === 1) { try { await this.r('salas/' + cod).remove(); } catch (e) {} }
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

  ao: { pronto: null, oponente: null, jogada: null, saiu: null, erro: null, fila: null },

  usar(t) { this.T = t; return this; },

  async conectar(cfg) {
    if (!this.T) this.usar(TransporteFirebase);
    await this.T.conectar(cfg);
  },

  codigo() {
    /* No vowels: a room code should never accidentally spell something. */
    const abc = 'BCDFGHJKLMNPQRSTVWXZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += abc[Math.floor(Math.random() * abc.length)];
    return c;
  },

  async criar(cfg, publica) {
    this.sala = this.codigo();
    this.sou = 1; this.ativo = true; this.publica = !!publica;
    this.turno = 0; this.aplicado = -1;
    await this.T.criarSala(this.sala, { cfg: cfg });
    if (publica) await this.T.enfileirar(this.sala);
    this.estado = 'esperando';
    this._ouvir();
    return this.sala;
  },

  async entrar(cod, cfgB) {
    cod = String(cod || '').toUpperCase().trim();
    const ok = await this.T.entrarSala(cod, cfgB);
    if (!ok) return false;
    this.sala = cod; this.sou = 2; this.ativo = true;
    this.turno = 0; this.aplicado = -1;
    this.estado = 'jogando';
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

    this._offSala = this.T.ouvirSala(this.sala, s => {
      if (!s) { this._quedou(); return; }
      this.cfgSala = s;
      const doisAqui = s.vivo && s.vivo[1] && s.vivo[2];
      if (doisAqui && this.estado !== 'jogando') {
        this.estado = 'jogando';
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
    this.emCurso = null; this.pendente = null;
    if (this._offSala) this._offSala();
    if (this._offJog) this._offJog();
    if (this.publica) { try { await this.T.desenfileirar(); } catch (e) {} }
    try { await this.T.sair(s, eu); } catch (e) {}
  }
};
