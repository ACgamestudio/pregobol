/* =======================================================================
   PREGOBOL — progression (spec §11)
   Everything is earned by playing; there is no store and no currency.
   Storage is best-effort: if the browser refuses (private mode, file://
   with strict settings) the game still runs, it just forgets between
   sessions. Nothing in the game logic may assume the save exists.
   ======================================================================= */
const Progresso = (() => {
  const CHAVE = 'pregobol.save.v1';
  const vazio = () => ({
    campos: CAMPOS_INICIAIS.slice(),
    tampas: TAMPAS_INICIAIS.slice(),
    desafios: {},          // id → true
    arcade: 0,             // how far up the arcade ladder
    torneios: 0,           // tournaments won
    idioma: 'en', mira: true,
    tampa: 'classica',
    nivel: 'normal'
  });
  let d = vazio();

  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        const lido = JSON.parse(bruto);
        d = Object.assign(vazio(), lido);
        /* Never trust the file: drop keys that no longer exist. */
        d.campos = d.campos.filter(k => CAMPOS[k]);
        d.tampas = d.tampas.filter(k => TAMPAS[k]);
        if (!d.campos.length) d.campos = CAMPOS_INICIAIS.slice();
        if (!d.tampas.length) d.tampas = TAMPAS_INICIAIS.slice();
      }
    } catch (e) { d = vazio(); }
    return d;
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) { /* sem espaço: segue o jogo */ }
  }

  const temCampo = k => d.campos.includes(k);
  const temTampa = k => d.tampas.includes(k);
  const feito = id => !!d.desafios[id];

  /* Returns true only the first time, so the caller knows when to
     celebrate instead of celebrating on every load. */
  function liberarCampo(k) {
    if (!CAMPOS[k] || temCampo(k)) return false;
    d.campos.push(k); salvar(); return true;
  }
  function liberarTampa(k) {
    if (!TAMPAS[k] || temTampa(k)) return false;
    d.tampas.push(k); salvar(); return true;
  }
  function concluirDesafio(id) {
    if (d.desafios[id]) return false;
    d.desafios[id] = true; salvar(); return true;
  }
  function subirArcade(n) { if (n > d.arcade) { d.arcade = n; salvar(); } }
  function ganharTorneio() { d.torneios++; salvar(); }
  function lembrar(campo, valor) { d[campo] = valor; salvar(); }

  return { carregar, salvar, temCampo, temTampa, feito, liberarCampo, liberarTampa,
           concluirDesafio, subirArcade, ganharTorneio, lembrar,
           get dados() { return d; } };
})();
