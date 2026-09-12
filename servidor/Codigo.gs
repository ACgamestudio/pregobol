/* ===================================================================
   PREGOBOL — backend em Google Apps Script

   COMO PUBLICAR
   1. script.google.com  ->  Novo projeto
   2. Cole este arquivo inteiro por cima do Codigo.gs que vem em branco
   3. Implantar  ->  Nova implantação  ->  tipo: App da Web
        Executar como:      Eu
        Quem pode acessar:  Qualquer pessoa
   4. Copie a URL que termina em /exec
   5. Cole essa URL em js/apps-script-config.js

   Toda vez que mexer no código: Implantar -> Gerenciar implantações ->
   editar (lápis) -> Versão: Nova versão -> Implantar. Se criar uma
   implantação nova em vez de versionar a existente, a URL muda.

   POR QUE text/plain
   O navegador dispara preflight OPTIONS em POST com content-type JSON, e
   o Apps Script não responde OPTIONS. Mandando como text/plain não há
   preflight. O corpo continua sendo JSON, só o cabeçalho é que mente.

   ARMAZENAMENTO
   ScriptProperties, que é durável. O cabeçalho da sala fica em S_<cod> e
   cada jogada em T_<cod>_<n>, separadas porque uma propriedade só
   aguenta 9 KB e uma partida longa passaria disso num objeto só.
   =================================================================== */

var P = PropertiesService.getScriptProperties();
var VIDA_SALA = 2 * 60 * 60 * 1000;   // salas somem depois de 2h
var ESPERA_LOCK = 10000;

function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { req = e.parameter || {}; }
  return responder(processar(req));
}

/* doGet existe pra você conseguir testar no navegador:
   .../exec?acao=ler&cod=ABCD                                        */
function doGet(e) {
  return responder(processar(e.parameter || {}));
}

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function chaveSala(cod) { return 'S_' + cod; }
function chaveJogada(cod, n) { return 'T_' + cod + '_' + n; }

function lerSala(cod) {
  var cru = P.getProperty(chaveSala(cod));
  return cru ? JSON.parse(cru) : null;
}
function gravarSala(cod, s) {
  P.setProperty(chaveSala(cod), JSON.stringify(s));
}

function comTrava(fn) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(ESPERA_LOCK)) return { erro: 'ocupado' };
  try { return fn(); } finally { trava.releaseLock(); }
}

/* ------------------------------------------------------------------ */
function processar(req) {
  var acao = req.acao;
  var agora = Date.now();

  if (acao === 'criar') {
    return comTrava(function () {
      faxina_();
      var s = {
        host: req.uid || '?', visitante: null,
        cfg: req.cfg ? JSON.parse(req.cfg) : (req.dados || null),
        cfgB: null, vivo: {}, n: 0, criada: agora
      };
      s.vivo['1'] = agora;
      gravarSala(req.cod, s);
      return { ok: true, sala: s, agora: agora };
    });
  }

  if (acao === 'ler') {
    var s = lerSala(req.cod);
    return { ok: !!s, sala: s, agora: agora };
  }

  /* Entrada atômica: dois jogadores não podem virar visitante da mesma
     sala. É por isso que existe a trava. */
  if (acao === 'entrar') {
    return comTrava(function () {
      var s = lerSala(req.cod);
      if (!s) return { ok: false, motivo: 'inexistente', agora: agora };
      if (s.visitante) return { ok: false, motivo: 'cheia', agora: agora };
      s.visitante = req.uid || '?';
      s.cfgB = req.cfg ? JSON.parse(req.cfg) : (req.dados || null);
      s.vivo['2'] = agora;
      gravarSala(req.cod, s);
      tirarDaFila_(req.cod);
      return { ok: true, sala: s, agora: agora };
    });
  }

  if (acao === 'enviar') {
    return comTrava(function () {
      var s = lerSala(req.cod);
      if (!s) return { ok: false, motivo: 'inexistente', agora: agora };
      var n = Number(req.n);
      P.setProperty(chaveJogada(req.cod, n), req.msg);   // já vem como string
      if (n + 1 > s.n) s.n = n + 1;
      s.vivo[String(req.sou)] = agora;
      gravarSala(req.cod, s);
      return { ok: true, n: n, agora: agora };
    });
  }

  /* Uma requisição só devolve o estado da sala E as jogadas novas, e de
     quebra marca presença. Com polling, cada ida ao servidor economizada
     é latência e cota economizadas. */
  if (acao === 'sync') {
    var s2 = lerSala(req.cod);
    if (!s2) return { ok: false, motivo: 'inexistente', agora: agora };
    if (req.sou) {
      s2.vivo[String(req.sou)] = agora;
      gravarSala(req.cod, s2);
    }
    var desde = Number(req.desde || -1);
    var novas = [];
    for (var i = desde + 1; i < s2.n; i++) {
      var m = P.getProperty(chaveJogada(req.cod, i));
      if (m) novas.push({ n: i, msg: m });
    }
    return { ok: true, sala: s2, jogadas: novas, agora: agora };
  }

  if (acao === 'enfileirar') {
    return comTrava(function () {
      var f = JSON.parse(P.getProperty('FILA') || '[]');
      if (f.indexOf(req.cod) < 0) f.push(req.cod);
      P.setProperty('FILA', JSON.stringify(f));
      return { ok: true, agora: agora };
    });
  }

  if (acao === 'desenfileirar') {
    return comTrava(function () { tirarDaFila_(req.cod); return { ok: true, agora: agora }; });
  }

  /* Pega a sala mais antiga da fila. Sob trava, senão dois jogadores
     apertando PROCURAR ao mesmo tempo levam a mesma sala. */
  if (acao === 'pegar') {
    return comTrava(function () {
      var f = JSON.parse(P.getProperty('FILA') || '[]');
      while (f.length) {
        var cod = f.shift();
        var s3 = lerSala(cod);
        if (s3 && !s3.visitante && agora - s3.criada < VIDA_SALA) {
          P.setProperty('FILA', JSON.stringify(f));
          return { ok: true, cod: cod, agora: agora };
        }
      }
      P.setProperty('FILA', JSON.stringify(f));
      return { ok: true, cod: null, agora: agora };
    });
  }

  if (acao === 'sair') {
    return comTrava(function () {
      var s4 = lerSala(req.cod);
      if (s4) {
        delete s4.vivo[String(req.sou)];
        if (String(req.sou) === '1' || !s4.vivo['1']) apagarSala_(req.cod, s4);
        else gravarSala(req.cod, s4);
      }
      tirarDaFila_(req.cod);
      return { ok: true, agora: agora };
    });
  }

  return { ok: false, motivo: 'acao desconhecida: ' + acao, agora: agora };
}

/* ------------------------------------------------------------------ */
function tirarDaFila_(cod) {
  var f = JSON.parse(P.getProperty('FILA') || '[]');
  var i = f.indexOf(cod);
  if (i >= 0) { f.splice(i, 1); P.setProperty('FILA', JSON.stringify(f)); }
}

function apagarSala_(cod, s) {
  var apagar = [chaveSala(cod)];
  for (var i = 0; i < (s ? s.n : 0); i++) apagar.push(chaveJogada(cod, i));
  P.deleteAllProperties && apagar.forEach(function (k) { P.deleteProperty(k); });
}

/* ScriptProperties tem 500 KB no total. Sem faxina, salas abandonadas
   entopem o armazenamento em algumas semanas e tudo passa a falhar. */
function faxina_() {
  var agora = Date.now();
  var todas = P.getProperties();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try {
      var s = JSON.parse(todas[k]);
      if (agora - (s.criada || 0) > VIDA_SALA) apagarSala_(k.substring(2), s);
    } catch (e) { P.deleteProperty(k); }
  });
}

/* Roda na mão pelo editor se quiser zerar tudo durante os testes. */
function limparTudo() {
  P.deleteAllProperties();
  Logger.log('armazenamento limpo');
}
