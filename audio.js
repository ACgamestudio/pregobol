/* =======================================================================
   PREGOBOL — sound (spec §13)
   Everything is synthesised in the Web Audio API: no sample files, no
   loading, no memory cost. The original six voices (flick, nail, board,
   goal, whistle, fanfare) are untouched; the new ones sit alongside them
   and follow the same shape so the mute switch keeps working as before.

   Timbre notes kept from the original build:
     nail  = inharmonic partials → metal
     board = filtered triangle   → wood
     cap   = short noise burst + click → plastic on a table
   ======================================================================= */
const Som = (() => {
  let ac = null, ligado = true;
  const ligar = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
                        if (ac.state === 'suspended') ac.resume(); return ac; };
  function ruido(dur) {
    const a = ligar(), n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = buf; return s;
  }
  function peteleco(forca) {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const s = ruido(.09), bp = a.createBiquadFilter(), g = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1500 + forca * 90; bp.Q.value = 1.1;
    g.gain.setValueAtTime(.28 * (.5 + forca / 30), t);
    g.gain.exponentialRampToValueAtTime(.001, t + .085);
    s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t); s.stop(t + .09);
    const o = a.createOscillator(), og = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(90, t + .09);
    og.gain.setValueAtTime(.22, t); og.gain.exponentialRampToValueAtTime(.001, t + .1);
    o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + .11);
  }
  function prego(vel) {                        // parciais inarmônicos = timbre de metal
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const vol = Math.min(.30, .05 + vel * .028), base = 1750 + Math.random() * 900;
    [1, 2.41, 3.83, 5.17].forEach((m, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = base * m;
      const dur = .30 - i * .05;
      g.gain.setValueAtTime(vol / (i + 1.5), t);
      g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
    });
  }
  /* Bouncy nail: same metal, tuned higher and with a spring-like glide up. */
  function pregoMola(vel) {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + .12);
    g.gain.setValueAtTime(Math.min(.24, .06 + vel * .02), t);
    g.gain.exponentialRampToValueAtTime(.001, t + .22);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .24);
    prego(vel * .7);
  }
  /* Golden nail: a bright two-note ping, the "you earned something" cue. */
  function pregoDourado() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    [1568, 2093].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain(), ini = t + i * .07;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ini); g.gain.linearRampToValueAtTime(.16, ini + .012);
      g.gain.exponentialRampToValueAtTime(.001, ini + .5);
      o.connect(g); g.connect(a.destination); o.start(ini); o.stop(ini + .52);
    });
  }
  function madeira(vel) {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    o.type = 'triangle'; o.frequency.setValueAtTime(180 + Math.random() * 50, t);
    o.frequency.exponentialRampToValueAtTime(70, t + .12);
    g.gain.setValueAtTime(Math.min(.26, .05 + vel * .022), t);
    g.gain.exponentialRampToValueAtTime(.001, t + .14);
    o.connect(lp); lp.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .15);
  }
  /* Cap against cap: plastic. Dry noise click, almost no tail. */
  function tampa(vel) {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const s = ruido(.05), hp = a.createBiquadFilter(), g = a.createGain();
    hp.type = 'highpass'; hp.frequency.value = 900;
    g.gain.setValueAtTime(Math.min(.22, .05 + vel * .02), t);
    g.gain.exponentialRampToValueAtTime(.001, t + .05);
    s.connect(hp); hp.connect(g); g.connect(a.destination); s.start(t); s.stop(t + .06);
    const o = a.createOscillator(), og = a.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(240, t + .05);
    og.gain.setValueAtTime(.10, t); og.gain.exponentialRampToValueAtTime(.001, t + .06);
    o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + .07);
  }
  function gol() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain(), ini = t + i * .075;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ini); g.gain.linearRampToValueAtTime(.13, ini + .02);
      g.gain.exponentialRampToValueAtTime(.001, ini + .42);
      o.connect(g); g.connect(a.destination); o.start(ini); o.stop(ini + .45);
    });
    const s = ruido(1.5), bp = a.createBiquadFilter(), g = a.createGain();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(1500, t + .5); bp.Q.value = .7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .25);
    g.gain.linearRampToValueAtTime(0, t + 1.4);
    s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 1.5);
  }
  function apito(longo) {
    if (!ligado) return; const a = ligar(), t = a.currentTime, dur = longo ? .85 : .3;
    const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
    o.type = o2.type = 'sine'; o.frequency.value = 2350; o2.frequency.value = 2680;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .03);
    g.gain.setValueAtTime(.12, t + dur - .06); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); o2.connect(g); g.connect(a.destination);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  }
  function fanfarra() {                        // arpejo de vitória + arquibancada
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const notas = [392, 523, 659, 784, 1047, 784, 1047];
    notas.forEach((f, i) => {
      const ini = t + i * .135, ultima = i === notas.length - 1;
      const dur = ultima ? 1.15 : .34;
      [[1, 'sawtooth', .09], [2, 'triangle', .045]].forEach(([m, tipo, vol]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = tipo; o.frequency.value = f * m;
        g.gain.setValueAtTime(0, ini); g.gain.linearRampToValueAtTime(vol, ini + .03);
        g.gain.exponentialRampToValueAtTime(.0008, ini + dur);
        o.connect(g); g.connect(a.destination); o.start(ini); o.stop(ini + dur + .04);
      });
    });
    const s = ruido(2.6), bp = a.createBiquadFilter(), g = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.13, t + .45);
    g.gain.linearRampToValueAtTime(0, t + 2.5);
    s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 2.6);
  }
  /* Defeat: the fanfare's mirror image — same arpeggio walking down, minor. */
  function derrota() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    [523, 466, 392, 311].forEach((f, i) => {
      const ini = t + i * .19;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ini); g.gain.linearRampToValueAtTime(.085, ini + .04);
      g.gain.exponentialRampToValueAtTime(.0008, ini + (i === 3 ? .95 : .3));
      o.connect(g); g.connect(a.destination); o.start(ini); o.stop(ini + 1);
    });
  }
  /* Menu select: the short arcade blip. Deliberately quiet. */
  function botao() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1320, t + .035);
    g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.001, t + .09);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .1);
  }
  /* Kick-off: whistle plus a crowd swell. */
  function inicio() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    apito(false);
    const s = ruido(1.2), bp = a.createBiquadFilter(), g = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = .5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.10, t + .35);
    g.gain.linearRampToValueAtTime(0, t + 1.15);
    s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 1.2);
  }
  /* Special shot arming: a charging sweep, so power feels spent, not free. */
  function especial() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + .28);
    g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(.11, t + .22);
    g.gain.exponentialRampToValueAtTime(.001, t + .34);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .36);
  }
  /* Falling into a hole on EXTREME. */
  function buraco() {
    if (!ligado) return; const a = ligar(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(70, t + .45);
    g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .5);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .52);
  }

  return { peteleco, prego, pregoMola, pregoDourado, madeira, tampa, gol, apito,
           fanfarra, derrota, botao, inicio, especial, buraco, ligar,
           alternar: () => (ligado = !ligado), get ligado() { return ligado; } };
})();
