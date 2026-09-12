/* =======================================================================
   PREGOBOL — FX (spec §1 impact feedback, §5 goals, §12 visual style)
   Everything here is cosmetic and cheap on purpose: flat arrays, no
   allocation inside the draw loop, hard caps on particle count. If the
   device is struggling the effects thin out; the physics never does.

   Rule respected throughout: effects never take control away from the
   player. Slow motion only runs while the ball is already dead.
   ======================================================================= */
const FONTE_ARCADE = '"Arial Narrow", "Haettenschweiler", Impact, ' +
                     'ui-sans-serif, system-ui, sans-serif';

const FX = (() => {
  const MAX_PARTICULAS = 220;
  let particulas = [];
  let gritos = [];                       // floating arcade text
  let sacudida = 0;                      // screen shake amplitude, px
  let flash = 0;                         // white flash 0..1
  let ondas = [];                        // anéis de choque do gol
  let foco = 0, focoXY = null;           // holofote: escurece a volta, não clareia tudo
  let lento = 0;                         // remaining slow-motion time, frames
  let cam = null;                        // { fx, fy, zoom, vida, max }
  let leve = false;                      // low-power mode: fewer particles

  /* ---------------- particles ---------------- */
  function solta(x, y, n, cor, forca, tipo) {
    if (leve) n = Math.ceil(n / 2);
    const sobra = MAX_PARTICULAS - particulas.length;
    n = Math.min(n, Math.max(0, sobra));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = forca * (0.35 + Math.random() * 0.9);
      particulas.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        vida: 1, decai: 0.028 + Math.random() * 0.03,
        r: 1 + Math.random() * 2.2, cor, tipo: tipo || 'po'
      });
    }
  }
  /* Directional spray, used on impacts: reads as a real deflection. */
  function leque(x, y, nx, ny, n, cor, forca) {
    if (leve) n = Math.ceil(n / 2);
    const base = Math.atan2(ny, nx);
    const sobra = MAX_PARTICULAS - particulas.length;
    n = Math.min(n, Math.max(0, sobra));
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - .5) * 1.5;
      const v = forca * (0.4 + Math.random() * 0.9);
      particulas.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        vida: 1, decai: 0.04 + Math.random() * 0.04,
        r: 1 + Math.random() * 1.8, cor, tipo: 'faisca'
      });
    }
  }

  /* ---------------- events ---------------- */
  function impacto(x, y, nx, ny, vel, cor) {           // nail or board hit
    const forte = Math.min(1, vel / 14);
    leque(x, y, nx, ny, 3 + Math.round(forte * 7), cor || '#FFE9A8', 1.4 + forte * 2.6);
    sacudir(1.2 + forte * 3.2);
  }
  /* O gol.

     A versão anterior resolvia com dois lavados de branco somados, e o
     resultado era meia tela estourada por quase meio segundo. Aqui a
     lógica é invertida: em vez de clarear tudo, ESCURECE a periferia e
     deixa o gol aceso. O olho vai pro lugar certo em vez de piscar.

     Camadas, em ordem de leitura: estouro de partículas nas cores do
     clube, três anéis de choque saindo do ponto do gol, holofote
     fechando em volta, e um clarão curtíssimo só pra marcar o impacto. */
  function golExplosao(x, y, cores) {
    solta(x, y, 54, cores[0], 3.6);
    solta(x, y, 34, cores[1] || '#FFD24A', 2.8);
    solta(x, y, 22, '#FFF6DC', 4.6, 'brilho');
    for (let i = 0; i < 3; i++) {
      ondas.push({
        x: x, y: y, r: 8 + i * 4, vel: 5.4 - i * 1.1, vida: 1,
        decai: 0.021 + i * 0.005, grossura: 8 - i * 2.2,
        cor: (i === 1 ? (cores[1] || '#FFD24A') : cores[0])
      });
    }
    foco = 1; focoXY = { x: x, y: y };
    sacudir(13);
    flash = 0.55;                        // era 1: o clarão agora é acento, não protagonista
  }
  function sacudir(v) { sacudida = Math.min(16, Math.max(sacudida, v)); }
  function devagar(frames) { lento = Math.max(lento, frames); }
  function focar(fx, fy, zoom, frames) { cam = { fx, fy, zoom, vida: frames, max: frames }; }

  /* Two at a time is the ceiling — the brief is explicit about not
     flooding the screen with messages. */
  function grito(texto, sub, cor) {
    if (gritos.length >= 2) gritos.shift();
    gritos.push({ texto, sub: sub || '', cor: cor || '#FFF6DC', vida: 1, decai: 0.011 });
  }

  /* ---------------- per-frame ---------------- */
  function escala() { return lento > 0 ? 0.32 : 1; }    // time scale for physics

  function atualizar(passos) {
    const k = passos || 1;
    if (lento > 0) lento -= k;
    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i];
      p.x += p.vx * k; p.y += p.vy * k;
      p.vx *= 0.94; p.vy *= 0.94;
      p.vida -= p.decai * k;
      if (p.vida <= 0) particulas.splice(i, 1);
    }
    for (let i = gritos.length - 1; i >= 0; i--) {
      gritos[i].vida -= gritos[i].decai * k;
      if (gritos[i].vida <= 0) gritos.splice(i, 1);
    }
    if (sacudida > 0) { sacudida *= 0.87; if (sacudida < 0.3) sacudida = 0; }
    if (flash > 0) flash = Math.max(0, flash - 0.085 * k);   // some rápido
    if (foco > 0) foco = Math.max(0, foco - 0.013 * k);
    for (let i = ondas.length - 1; i >= 0; i--) {
      const o = ondas[i];
      o.r += o.vel * k;
      o.vel *= 0.985;
      o.vida -= o.decai * k;
      if (o.vida <= 0) ondas.splice(i, 1);
    }
    if (cam) { cam.vida -= k; if (cam.vida <= 0) cam = null; }
    /* auto thinning: if we are permanently at the cap, halve the spawns */
    leve = particulas.length > MAX_PARTICULAS * 0.9;
  }

  /* Shake + goal camera, applied inside the caller's save()/restore(). */
  function aplicarCamera(ctx, W, H) {
    if (sacudida > 0) {
      ctx.translate((Math.random() - .5) * sacudida, (Math.random() - .5) * sacudida);
    }
    if (!cam) return;
    const p = cam.vida / cam.max;
    const suave = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5);   // ease in/out
    const z = 1 + (cam.zoom - 1) * suave;
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.fx, -cam.fy);
  }

  function desenhar(ctx) {
    for (const p of particulas) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.vida));
      if (p.tipo === 'faisca') {
        ctx.strokeStyle = p.cor; ctx.lineWidth = p.r * .8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.8, p.y - p.vy * 1.8); ctx.stroke();
      } else if (p.tipo === 'brilho') {
        ctx.fillStyle = p.cor;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.6 * p.vida, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.cor;
        ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Arcade caption. Drawn in screen space (no camera), centred, with the
     thick outline that reads on any pitch colour. */
  function desenharGritos(ctx, W, H) {
    gritos.forEach((g, i) => {
      const p = g.vida;
      const entra = Math.min(1, (1 - p) * 6);                 // pop-in
      const sobe = (1 - p) * 26;
      const y = H * 0.30 + i * 46 - sobe;
      const esc = 0.82 + entra * 0.18 + (1 - p) * 0.06;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 2.2);
      ctx.translate(W / 2, y);
      ctx.scale(esc, esc);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold 38px ${FONTE_ARCADE}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(12,8,4,.92)';
      ctx.strokeText(g.texto, 0, 0);
      ctx.fillStyle = g.cor; ctx.fillText(g.texto, 0, 0);
      if (g.sub) {
        ctx.font = `bold 15px ${FONTE_ARCADE}`;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(12,8,4,.9)';
        ctx.strokeText(g.sub, 0, 26);
        ctx.fillStyle = 'rgba(255,246,220,.92)'; ctx.fillText(g.sub, 0, 26);
      }
      ctx.restore();
    });
  }

  function brilho() { return flash; }

  /* Anéis de choque. Desenhados depois das partículas pra cortarem por
     cima delas. */
  function desenharOndas(ctx) {
    for (const o of ondas) {
      ctx.globalAlpha = Math.max(0, o.vida) * 0.62;
      ctx.strokeStyle = o.cor;
      ctx.lineWidth = Math.max(0.6, o.grossura * o.vida);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* Holofote. Transparente no ponto do gol, escuro nas bordas — o
     contrário do lavado de branco que estava aqui antes. */
  function desenharFoco(ctx, W, H) {
    if (foco <= 0 || !focoXY) return;
    const raio = Math.max(W, H) * 0.60;
    const g = ctx.createRadialGradient(focoXY.x, focoXY.y, 18, focoXY.x, focoXY.y, raio);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, `rgba(6,4,3,${foco * 0.26})`);
    g.addColorStop(1, `rgba(4,3,2,${foco * 0.62})`);
    ctx.fillStyle = g;
    ctx.fillRect(-W, -H, W * 3, H * 3);
  }
  function limpar() { particulas = []; gritos = []; sacudida = 0; flash = 0; lento = 0; cam = null; ondas = []; foco = 0; focoXY = null; }

  return { solta, leque, impacto, golExplosao, desenharOndas, desenharFoco, sacudir, devagar, focar, grito,
           escala, atualizar, aplicarCamera, desenhar, desenharGritos, brilho, limpar };
})();
