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

   PRESENÇA E ÁUDIO FICAM NO CacheService
   Antes o sync regravava a sala inteira (sem trava) só pra marcar
   presença. Com os dois celulares consultando a cada 1,8s, esse sync
   atropelava o 'entrar' (apagava o visitante) e o 'enviar' (voltava o
   contador e a jogada nunca chegava). Agora quem grava o cabeçalho da
   sala está SEMPRE sob trava, e o sync só lê. Presença vai pro cache,
   que ainda por cima não gasta a cota diária do PropertiesService.
   Mensagens de voz também vão pro cache: são descartáveis (10 min) e
   cabem até 100 KB por chave, contra 9 KB de uma propriedade.

   ARMAZENAMENTO
   ScriptProperties, que é durável. O cabeçalho da sala fica em S_<cod> e
   cada jogada em T_<cod>_<n>, separadas porque uma propriedade só
   aguenta 9 KB e uma partida longa passaria disso num objeto só.
   =================================================================== */

var P = PropertiesService.getScriptProperties();
var VIDA_SALA = 2 * 60 * 60 * 1000;   // salas somem depois de 2h
var ESPERA_LOCK = 10000;
var C = CacheService.getScriptCache();
var VIDA_CACHE = 21600;                // 6h, o máximo do CacheService
var VIDA_AUDIO = 600;                  // voz some depois de 10 min
var LIM_AUDIO = 95000;                 // caracteres base64 (~70 KB de áudio)

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
function chaveVivo(cod, sou) { return 'V_' + cod + '_' + sou; }
function chaveAudio(cod, n) { return 'A_' + cod + '_' + n; }
function chaveNAudio(cod) { return 'AN_' + cod; }

function marcarVivo(cod, sou, agora) {
  if (sou !== '1' && sou !== '2') return;
  C.put(chaveVivo(cod, sou), String(agora), VIDA_CACHE);
}

/* O cabeçalho gravado não tem mais presença; ela é montada na hora a
   partir do cache. Chave ausente = sem informação nova (o cliente
   decide), não "saiu". Saída explícita vem em s.saiu. */
function comVivo(cod, s) {
  if (!s) return s;
  var v = C.getAll([chaveVivo(cod, '1'), chaveVivo(cod, '2')]);
  s.vivo = {};
  if (v[chaveVivo(cod, '1')]) s.vivo['1'] = Number(v[chaveVivo(cod, '1')]);
  if (v[chaveVivo(cod, '2')]) s.vivo['2'] = Number(v[chaveVivo(cod, '2')]);
  return s;
}

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
        cfgB: null, n: 0, criada: agora, saiu: {}
      };
      gravarSala(req.cod, s);
      marcarVivo(req.cod, '1', agora);
      return { ok: true, sala: comVivo(req.cod, s), agora: agora };
    });
  }

  if (acao === 'ler') {
    var s = comVivo(req.cod, lerSala(req.cod));
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
      gravarSala(req.cod, s);
      marcarVivo(req.cod, '2', agora);
      tirarDaFila_(req.cod);
      return { ok: true, sala: comVivo(req.cod, s), agora: agora };
    });
  }

  if (acao === 'enviar') {
    return comTrava(function () {
      var s = lerSala(req.cod);
      if (!s) return { ok: false, motivo: 'inexistente', agora: agora };
      var n = Number(req.n);
      P.setProperty(chaveJogada(req.cod, n), req.msg);   // já vem como string
      if (n + 1 > s.n) s.n = n + 1;
      gravarSala(req.cod, s);
      marcarVivo(req.cod, String(req.sou), agora);
      return { ok: true, n: n, agora: agora };
    });
  }

  /* Uma requisição só devolve o estado da sala E as jogadas novas, e de
     quebra marca presença. Com polling, cada ida ao servidor economizada
     é latência e cota economizadas. */
  if (acao === 'sync') {
    var s2 = lerSala(req.cod);
    if (!s2) return { ok: false, motivo: 'inexistente', agora: agora };
    /* SÓ LÊ. Nada de gravarSala aqui: é fora da trava. */
    if (req.sou) marcarVivo(req.cod, String(req.sou), agora);
    comVivo(req.cod, s2);
    var desde = Number(req.desde != null ? req.desde : -1);
    var novas = [];
    for (var i = desde + 1; i < s2.n; i++) {
      var m = P.getProperty(chaveJogada(req.cod, i));
      if (m) novas.push({ n: i, msg: m });
    }
    /* Voz: devolve só as do outro jogador, e diz até onde já foi. */
    var an = Number(C.get(chaveNAudio(req.cod)) || 0);
    var desdeA = Number(req.desdeA != null ? req.desdeA : -1);
    var audios = [];
    if (an > desdeA + 1) {
      var chaves = [];
      for (var j = desdeA + 1; j < an; j++) chaves.push(chaveAudio(req.cod, j));
      var cru = C.getAll(chaves);
      for (var k = desdeA + 1; k < an; k++) {
        var a = cru[chaveAudio(req.cod, k)];
        if (!a) continue;                        // expirou ou foi despejado
        try {
          var ao = JSON.parse(a);
          if (String(ao.de) !== String(req.sou)) { ao.n = k; audios.push(ao); }
        } catch (e) {}
      }
    }
    return { ok: true, sala: s2, jogadas: novas, audios: audios, an: an, agora: agora };
  }

  if (acao === 'audio') {
    return comTrava(function () {
      var s5 = lerSala(req.cod);
      if (!s5) return { ok: false, motivo: 'inexistente', agora: agora };
      var d = String(req.d || '');
      if (!d) return { ok: false, motivo: 'audio vazio', agora: agora };
      if (d.length > LIM_AUDIO) return { ok: false, motivo: 'audio grande demais', agora: agora };
      var n = Number(C.get(chaveNAudio(req.cod)) || 0);
      C.put(chaveAudio(req.cod, n), JSON.stringify({
        de: Number(req.sou), mime: String(req.mime || 'audio/webm'),
        d: d, dur: Number(req.dur) || 0
      }), VIDA_AUDIO);
      C.put(chaveNAudio(req.cod), String(n + 1), VIDA_CACHE);
      marcarVivo(req.cod, String(req.sou), agora);
      return { ok: true, n: n, agora: agora };
    });
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
        C.remove(chaveVivo(req.cod, String(req.sou)));
        if (String(req.sou) === '1') apagarSala_(req.cod, s4);
        else { s4.saiu = s4.saiu || {}; s4.saiu[String(req.sou)] = agora; gravarSala(req.cod, s4); }
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
  apagar.forEach(function (k) { P.deleteProperty(k); });
  var nA = Number(C.get(chaveNAudio(cod)) || 0), doCache = [chaveVivo(cod, '1'), chaveVivo(cod, '2'), chaveNAudio(cod)];
  for (var j = 0; j < nA; j++) doCache.push(chaveAudio(cod, j));
  C.removeAll(doCache);
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
