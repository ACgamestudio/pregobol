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
  let lento = 0;                         // remaining slow-motion time, frames
  let cam = null;                        // { fx, fy, zoom, vida, max }
  let leve = false;                      // low-power mode: fewer particles
  let confetes = [];                     // confete de papel da festa do gol (tela)
  let festa = null;                      // { t0, texto, sub, cores } — o "GOL!" animado
  let ultimoDesenho = 0;

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

     Nada de escurecer a tela: o holofote que fechava em volta do gol
     saiu daqui. O que carrega o momento agora é o estouro de partículas
     nas cores do clube e três anéis de choque saindo do ponto do gol.
     Sem clarão branco: quem marca o gol agora é a festa (golFesta). */
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
    sacudir(13);
  }
  function sacudir(v) { sacudida = Math.min(16, Math.max(sacudida, v)); }
  function devagar(frames) { lento = Math.max(lento, frames); }
  function focar(fx, fy, zoom, frames) { cam = { fx, fy, zoom, vida: frames, max: frames }; }

  /* Two at a time is the ceiling — the brief is explicit about not
     flooding the screen with messages. */
  function grito(texto, sub, cor, grande) {
    if (gritos.length >= 2) gritos.shift();
    gritos.push({ texto, sub: sub || '', cor: cor || '#FFF6DC',
                  vida: 1, decai: grande ? 0.009 : 0.011, grande: !!grande });
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
    if (flash > 0) flash = Math.max(0, flash - 0.075 * k);   // some rápido
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
      /* O grito do gol vem em destaque: corpo grande, limitado à largura
         da tela pra nunca vazar pelas bordas em celular. */
      let corpo = g.grande ? Math.min(96, Math.max(44, W * 0.13)) : 38;
      ctx.font = `bold ${corpo}px ${FONTE_ARCADE}`;
      if (g.grande) {
        const larg = ctx.measureText(g.texto).width;
        const teto = W * 0.88;
        if (larg > teto) { corpo *= teto / larg; ctx.font = `bold ${corpo}px ${FONTE_ARCADE}`; }
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = g.grande ? corpo * 0.17 : 8;
      ctx.strokeStyle = 'rgba(12,8,4,.92)';
      ctx.strokeText(g.texto, 0, 0);
      ctx.fillStyle = g.cor; ctx.fillText(g.texto, 0, 0);
      if (g.sub) {
        const baixo = g.grande ? corpo * 0.72 : 26;
        ctx.font = `bold 15px ${FONTE_ARCADE}`;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(12,8,4,.9)';
        ctx.strokeText(g.sub, 0, baixo);
        ctx.fillStyle = 'rgba(255,246,220,.92)'; ctx.fillText(g.sub, 0, baixo);
      }
      ctx.restore();
    });
  }


  /* =====================================================================
     FESTA DO GOL — confete de papel + "GOL!" em letras 3D que despencam.
     Tudo em espaço de tela, no tempo real (não sofre o câmera lenta), e
     com teto de peças pra não pesar em celular.
     ===================================================================== */
  const MAX_CONFETES = 240;
  const FESTA_MS = 2600;

  function golFesta(W, H, cores, texto, sub) {
    const pal = [cores[0], cores[1] || '#FFD24A', '#FFD24A', '#FFF6DC',
                 '#EC5648', '#4FC3F7', '#7BE06B', '#FF7AC8'];
    const n = Math.min(leve ? 90 : 150, MAX_CONFETES - confetes.length);
    const mk = (x, y, ang, vel, espera) => ({
      x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
      w: 5 + Math.random() * 6, h: 9 + Math.random() * 9,
      rot: Math.random() * 6.28, vr: (Math.random() - .5) * .35,
      flip: Math.random() * 6.28, vf: .12 + Math.random() * .22,
      cor: pal[(Math.random() * pal.length) | 0],
      forma: (Math.random() * 4) | 0,                 // 0 papel, 1 serpentina, 2 bolinha, 3 estrela
      vida: 1, decai: 1 / (130 + Math.random() * 110),
      espera: espera || 0, fase: Math.random() * 6.28
    });
    /* três tiros: o estouro do centro e um canhão em cada canto de baixo */
    for (let i = 0; i < n; i++) {
      if (i < n * 0.4) {
        const a = Math.random() * Math.PI * 2;        // estouro em leque completo
        confetes.push(mk(W / 2, H * 0.42, a, 8 + Math.random() * 14, 0));
      } else if (i < n * 0.7) {
        const a = -Math.PI / 2 + 0.25 + Math.random() * 0.55;   // canhão esquerdo, sobe pra direita
        confetes.push(mk(0, H, -(Math.PI / 2) + 0.3 + Math.random() * 0.5 - 0.0, 11 + Math.random() * 12, 6 + Math.random() * 10));
        confetes[confetes.length - 1].vx = Math.abs(confetes[confetes.length - 1].vx);
      } else {
        confetes.push(mk(W, H, -(Math.PI / 2) - 0.3 - Math.random() * 0.5, 11 + Math.random() * 12, 6 + Math.random() * 10));
        confetes[confetes.length - 1].vx = -Math.abs(confetes[confetes.length - 1].vx);
      }
    }
    festa = { t0: performance.now(), texto: texto || 'GOL!', sub: sub || '', cores };
    ultimoDesenho = 0;
  }

  function desenharConfete(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.cor; ctx.strokeStyle = c.cor;
    if (c.forma === 0) {                               // papel girando (achata com o flip)
      ctx.scale(1, Math.cos(c.flip));
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    } else if (c.forma === 1) {                        // serpentina ondulada
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let j = -3; j <= 3; j++) {
        const px = Math.sin(c.fase + j * 0.9 + c.flip) * 4, py = j * 4;
        j === -3 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else if (c.forma === 2) {
      ctx.beginPath(); ctx.arc(0, 0, c.w * 0.45, 0, 6.283); ctx.fill();
    } else {                                           // estrelinha
      ctx.scale(Math.cos(c.flip) * .5 + .6, 1);
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? c.w * 0.28 : c.w * 0.75, a = j * Math.PI / 5;
        j ? ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r) : ctx.moveTo(0, -r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function easeOutBack(x) { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  /* Raios de sol girando atrás da palavra, na cor do clube. */
  function desenharRaios(ctx, W, H, cx, cy, T, alfa, cores) {
    const R = Math.hypot(W, H) * 0.75, n = 18, giro = T / 2400;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, R);
    g.addColorStop(0, 'rgba(255,236,150,0.75)');
    g.addColorStop(0.55, 'rgba(255,200,80,0.25)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.save();
    ctx.globalAlpha = alfa * 0.55;
    ctx.translate(cx, cy);
    ctx.rotate(giro);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.283, a1 = a0 + (3.1416 / n);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
      ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    /* halo na cor do clube, bem suave */
    ctx.save();
    ctx.globalAlpha = alfa * 0.35;
    const h = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
    h.addColorStop(0, cores[0]); h.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = h;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function desenharPalavra(ctx, W, H, T) {
    const f = festa;
    const cx = W / 2, cy = H * 0.42;
    const saida = Math.max(0, (T - (FESTA_MS - 500)) / 500);        // some nos últimos 500ms
    const alfa = 1 - saida;
    const entraRaios = Math.min(1, T / 250);
    desenharRaios(ctx, W, H, cx, cy, T, alfa * entraRaios, f.cores);

    const letras = Array.from(f.texto);
    let corpo = Math.min(190, Math.max(76, W * 0.27));
    ctx.font = `italic 900 ${corpo}px ${FONTE_ARCADE}`;
    let larg = letras.map(ch => ctx.measureText(ch).width + corpo * 0.04);
    let total = larg.reduce((a, b) => a + b, 0);
    const teto = W * 0.9;
    if (total > teto) {
      const k = teto / total; corpo *= k; larg = larg.map(w => w * k); total *= k;
      ctx.font = `italic 900 ${corpo}px ${FONTE_ARCADE}`;
    }
    const prof = Math.max(6, corpo * 0.09);                          // profundidade 3D
    const brilhoPos = ((T - 650) / 700);                              // brilho varre a palavra
    let x = cx - total / 2;

    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    letras.forEach((ch, i) => {
      const lt = Math.max(0, Math.min(1, (T - i * 90) / 420));      // entrada escalonada
      const w = larg[i], lx = x + w / 2; x += w;
      if (lt <= 0) return;
      const e = easeOutBack(lt);
      const esc = 3.4 - 2.4 * e;                                      // vem grandão e "bate" na tela
      const queda = (1 - e) * -H * 0.28;
      const ang = (1 - e) * (i % 2 ? .6 : -.6) + Math.sin(T / 210 + i * 1.3) * 0.045 * lt;
      const pulso = 1 + (lt >= 1 ? Math.sin(T / 130 + i * 0.9) * 0.035 : 0);
      ctx.save();
      ctx.globalAlpha = alfa * Math.min(1, lt * 3);
      ctx.translate(lx, cy + queda + Math.sin(T / 160 + i) * 3 * lt);
      ctx.rotate(ang);
      ctx.scale(esc * pulso, esc * pulso);
      /* 1) contorno escuro grosso em volta de toda a extrusão */
      ctx.strokeStyle = 'rgba(12,8,4,.95)';
      ctx.lineWidth = corpo * 0.2;
      for (let d = prof; d >= 0; d -= 3) ctx.strokeText(ch, d * 0.55, d);
      /* 2) corpo 3D na cor do clube */
      ctx.fillStyle = f.cores[0]; ctx.strokeStyle = f.cores[0]; ctx.lineWidth = 3;
      for (let d = prof; d >= 1; d -= 2) { ctx.fillText(ch, d * 0.55, d); ctx.strokeText(ch, d * 0.55, d); }
      /* 3) face dourada com degradê */
      const gf = ctx.createLinearGradient(0, -corpo / 2, 0, corpo / 2);
      gf.addColorStop(0, '#FFFFFF'); gf.addColorStop(0.35, '#FFF1A8');
      gf.addColorStop(0.7, '#FFC62E'); gf.addColorStop(1, '#FF9A1F');
      ctx.fillStyle = gf; ctx.fillText(ch, 0, 0);
      ctx.strokeStyle = 'rgba(12,8,4,.55)'; ctx.lineWidth = corpo * 0.025; ctx.strokeText(ch, 0, 0);
      /* 4) brilho diagonal varrendo a palavra inteira */
      if (brilhoPos > -0.2 && brilhoPos < 1.2) {
        const gx = (brilhoPos - 0.5) * total - (lx - cx);
        const gs = ctx.createLinearGradient(gx - corpo * 0.35, -corpo / 2, gx + corpo * 0.35, corpo / 2);
        gs.addColorStop(0, 'rgba(255,255,255,0)'); gs.addColorStop(0.5, 'rgba(255,255,255,.95)');
        gs.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gs; ctx.fillText(ch, 0, 0);
      }
      ctx.restore();
    });

    /* faíscas que pipocam em volta da palavra */
    for (let i = 0; i < 7; i++) {
      const ph = (T / 420 + i * 0.37) % 1;
      const px = cx + Math.cos(i * 2.4) * total * 0.52 * (0.6 + 0.4 * Math.sin(i * 5.1));
      const py = cy + Math.sin(i * 3.7) * corpo * 0.6;
      const r = corpo * 0.1 * Math.sin(ph * Math.PI);
      if (r > 0.5 && T > 400) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(ph * 2);
        ctx.fillStyle = '#FFF6DC';
        ctx.beginPath();
        ctx.moveTo(0, -r * 2); ctx.lineTo(r * .5, -r * .5); ctx.lineTo(r * 2, 0); ctx.lineTo(r * .5, r * .5);
        ctx.lineTo(0, r * 2); ctx.lineTo(-r * .5, r * .5); ctx.lineTo(-r * 2, 0); ctx.lineTo(-r * .5, -r * .5);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }

    /* nome da jogada (combo), miúdo, embaixo */
    if (f.sub && T > 700) {
      const e = Math.min(1, (T - 700) / 250);
      ctx.globalAlpha = alfa * e;
      ctx.font = `bold ${Math.max(18, corpo * 0.2)}px ${FONTE_ARCADE}`;
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(12,8,4,.92)';
      ctx.strokeText(f.sub, cx, cy + corpo * 0.78 + (1 - e) * 14);
      ctx.fillStyle = '#FFF6DC'; ctx.fillText(f.sub, cx, cy + corpo * 0.78 + (1 - e) * 14);
    }
    ctx.restore();
  }

  function desenharFesta(ctx, W, H) {
    if (!festa && !confetes.length) return;
    const agora = performance.now();
    const dt = ultimoDesenho ? Math.min(3, (agora - ultimoDesenho) / 16.667) : 1;
    ultimoDesenho = agora;

    for (let i = confetes.length - 1; i >= 0; i--) {
      const c = confetes[i];
      if (c.espera > 0) { c.espera -= dt; continue; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vy += 0.24 * dt;                                // gravidade
      c.vx *= Math.pow(0.984, dt);
      c.vy = Math.min(c.vy * Math.pow(0.985, dt), 6.5 + c.h * 0.1);   // velocidade terminal: papel flutua
      c.vx += Math.sin(c.fase + c.y * 0.03) * 0.12 * dt;               // balanço no ar
      c.rot += c.vr * dt; c.flip += c.vf * dt;
      c.vida -= c.decai * dt;
      if (c.vida <= 0 || c.y > H + 40) { confetes.splice(i, 1); continue; }
    }
    ctx.save();
    for (const c of confetes) {
      if (c.espera > 0) continue;
      ctx.globalAlpha = Math.min(1, c.vida * 3.5);
      desenharConfete(ctx, c);
    }
    ctx.restore();

    if (festa) {
      const T = agora - festa.t0;
      if (T >= FESTA_MS) festa = null; else desenharPalavra(ctx, W, H, T);
    }
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

  function limpar() { particulas = []; gritos = []; sacudida = 0; flash = 0; lento = 0; cam = null; ondas = []; confetes = []; festa = null; }

  return { solta, leque, impacto, golExplosao, golFesta, desenharFesta, desenharOndas, sacudir, devagar, focar, grito,
           escala, atualizar, aplicarCamera, desenhar, desenharGritos, brilho, limpar };
})();
