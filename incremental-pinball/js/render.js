/* =========================================================================
 * TOWER OF CHIPS — canvas renderer
 * Chunky ink outlines, cream card-stock, saturated accents: the table is
 * drawn like a deck of playing cards stood on end.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;
  const D = IP.data;
  const C = D.C;
  const T = () => IP.table;

  /* ------------------------------------------------------------------ */
  /* primitives                                                          */
  /* ------------------------------------------------------------------ */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function inkCircle(ctx, x, y, r, fill, lw, ink) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, U.TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = ink || C.ink2; ctx.stroke(); }
  }

  function capsule(ctx, x1, y1, x2, y2, r) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
    ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  }

  function inkText(ctx, text, x, y, size, fill, weight, outline) {
    ctx.font = `${weight || 900} ${size}px "Arial Black", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = outline != null ? outline : Math.max(2, size * 0.22);
    ctx.strokeStyle = C.ink2;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  /* ------------------------------------------------------------------ */
  /* renderer                                                            */
  /* ------------------------------------------------------------------ */
  function makeRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const view = { w: 0, h: 0, scale: 4, camY: 0, shake: 0, sx: 0, sy: 0, dpr: 1, alpha: 0 };

    function resize(cssW, cssH) {
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      view.dpr = dpr;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      view.w = cssW; view.h = cssH;
      view.scale = cssW / D.W.WIDTH;
      view.viewH = cssH / view.scale;
    }

    /** Repeating 45° hatch tile; built once, stretched forever. */
    let hatch = null;
    function buildHatch() {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const x = c.getContext('2d');
      x.globalAlpha = 0.055;
      x.strokeStyle = '#ffffff';
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(-1, -1); x.lineTo(17, 17);
      x.moveTo(-17, -1); x.lineTo(1, 17);
      x.moveTo(15, -1); x.lineTo(33, 17);
      x.stroke();
      hatch = ctx.createPattern(c, 'repeat');
    }

    const sx = (wx) => wx * view.scale + view.sx;
    const sy = (wy) => view.h - (wy - view.camY) * view.scale + view.sy;
    const s = (n) => n * view.scale;

    /* -----------------------------------------------------------------
     * PARALLAX
     *
     * Depth is faked by giving each layer its own camera: at depth p the
     * layer scrolls at p × the real camera, so p = 0 is painted on the
     * glass, p = 1 moves with the world, and p > 1 races past in front of
     * it. Shake is scaled by p too — near things jolt further than far
     * ones, and that is most of what sells the effect.
     *
     * ⚠️ Layer content comes from a pure hash of its lattice index, never
     * from IP.rng. draw() has to be idempotent (tests/tower-timing.mjs),
     * and a renderer that drew from a random stream would desync the sim
     * from its seed (tests/tower-determinism.mjs).
     */
    const DEPTH = { far: 0.15, mid: 0.42, struct: 0.74, fore: 1.34 };

    function hash01(a, b) {
      let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
      h = Math.imul(h ^ ((b | 0) + 0x165667b1), 0xc2b2ae35);
      h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    }

    /** World → screen on the layer at depth p. */
    const dx = (wx, p) => wx * view.scale + view.sx * p;
    const dy = (wy, p) => view.h - (wy - view.camY * p) * view.scale + view.sy * p;

    /**
     * Visit every row of a layer's repeating lattice that can reach the
     * screen. Content repeats every `period` world units, so a layer
     * dresses a tower of any height without storing anything.
     */
    function lattice(p, period, cb) {
      const bot = view.camY * p, top = bot + view.viewH;
      const i0 = Math.floor(bot / period) - 1, i1 = Math.ceil(top / period) + 1;
      for (let i = i0; i <= i1; i++) cb(i, i * period);
    }

    /**
     * How many pieces each layer painted last frame. A test cannot tell a
     * layer that renders nothing from one that renders behind something
     * else, and "the canvas changed" passes as long as *any* layer works.
     */
    view.drawn = { far: 0, mid: 0, struct: 0, fore: 0 };

    const depthOn = (g) => g.state.settings.depth !== false;
    /** Idle drift is motion for its own sake; the parallax itself is not. */
    const driftOn = (g) => depthOn(g) && g.state.settings.particles !== false;

    /* --------------------------------------------------------------- */
    function draw(g) {
      const dpr = view.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, view.w, view.h);

      view.alpha = g.alpha || 0;
      view.sx = g.shakeX || 0;
      view.sy = g.shakeY || 0;
      view.camY = U.lerp(g.prevCamY != null ? g.prevCamY : g.camY, g.camY, g.alpha || 0);
      view.drawn.far = view.drawn.mid = view.drawn.struct = view.drawn.fore = 0;

      drawBackground(g);
      drawFarCity(g);
      drawMidMotes(g);
      drawFloors(g);
      drawGirders(g);
      drawShell(g);
      drawFields(g);
      drawParts(g);
      drawFlippers(g);
      drawPlunger(g);
      drawBalls(g);
      drawCannon(g);
      drawParticles(g);
      drawForeBeams(g);
      drawPopups(g);
      if (g.build.on) drawBuildOverlay(g);
      drawMinimap(g);
      drawVignette(g);
    }

    /* --------------------------------------------------------------- */
    function visibleFloors(g) {
      const lo = Math.max(0, Math.floor(view.camY / D.W.FLOOR_H) - 1);
      const hi = Math.min(g.state.floors, Math.ceil((view.camY + view.viewH) / D.W.FLOOR_H) + 1);
      return { lo, hi };
    }

    function drawBackground(g) {
      const grd = ctx.createLinearGradient(0, 0, 0, view.h);
      const { lo, hi } = visibleFloors(g);
      const topTint = (D.FLOORS[U.clamp(hi, 0, D.FLOORS.length - 1)] || D.FLOORS[0]).tint;
      const botTint = (D.FLOORS[U.clamp(lo, 0, D.FLOORS.length - 1)] || D.FLOORS[0]).tint;
      grd.addColorStop(0, U.shade(topTint, 0.02));
      grd.addColorStop(1, U.shade(botTint, -0.06));
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, view.w, view.h);

      // ⚠️ Baked once into a 16px tile. This used to stroke one line per
      // 16px of (width + height) EVERY frame — ~50 stroked paths a frame for
      // a static texture.
      if (!hatch) buildHatch();
      const off = (view.camY * view.scale) % 16;
      ctx.save();
      ctx.translate(0, -off);
      ctx.fillStyle = hatch;
      ctx.fillRect(0, 0, view.w, view.h + 16);
      ctx.restore();
    }

    /**
     * FAR — a skyline of other towers, a long way behind this one. Blocks
     * are stacked on a repeating ground line and lit window-by-window.
     */
    function drawFarCity(g) {
      if (!depthOn(g)) return;
      const p = DEPTH.far, PER = 150;
      const k = U.clamp(Math.floor(view.camY / D.W.FLOOR_H), 0, D.FLOORS.length - 1);
      // Mixed toward a cold haze rather than shaded: shading a nearly-black
      // tint moves it almost nowhere, and a block that does not separate from
      // the sky leaves its lit windows floating with nothing behind them.
      const tint = (D.FLOORS[k] || D.FLOORS[0]).tint;
      const body = U.mixHex(tint, '#7d93ab', 0.34);
      const edge = U.mixHex(tint, '#aebfd0', 0.5);
      ctx.save();
      lattice(p, PER, (i, base) => {
        for (let j = 0; j < 3; j++) {
          const bx = -9 + hash01(i, j * 9 + 1) * 118;
          const bw = 15 + hash01(i, j * 9 + 2) * 20;
          const bh = 55 + hash01(i, j * 9 + 3) * 135;
          const y0 = dy(base, p), y1 = dy(base + bh, p);
          if (y1 > view.h + 24 || y0 < -24) continue;
          view.drawn.far++;
          const x0 = dx(bx, p), w = s(bw);
          ctx.globalAlpha = 0.34;
          ctx.fillStyle = body;
          ctx.fillRect(x0, y1, w, y0 - y1);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = edge;
          ctx.fillRect(x0, y1, w, s(1.2));            // catch-light on the roof
          ctx.globalAlpha = 0.22;
          ctx.fillRect(x0, y1, s(0.9), y0 - y1);      // lit corner, to give it a face
          // Only lit windows are drawn — the dark ones are already the wall.
          const cols = Math.max(1, Math.floor(bw / 7));
          const rows = Math.max(1, Math.floor(bh / 11));
          const ww = s(2.1), wh = s(2.6);
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
              const lit = hash01(i * 131 + j * 17 + c, r);
              if (lit < 0.74) continue;
              ctx.globalAlpha = 0.07 + lit * 0.13;
              ctx.fillStyle = lit > 0.94 ? C.gold : C.cream;
              ctx.fillRect(x0 + s(2.6 + c * 7), y1 + s(5 + r * 11), ww, wh);
            }
          }
        }
      });
      ctx.restore();
    }

    /** MID — suit glyphs adrift between the skyline and the tower. */
    function drawMidMotes(g) {
      if (!depthOn(g)) return;
      const p = DEPTH.mid, PER = 62;
      const glyphs = ['♠', '♥', '♦', '♣', '★'];
      const drift = driftOn(g);
      ctx.save();
      lattice(p, PER, (i, base) => {
        for (let j = 0; j < 2; j++) {
          const h1 = hash01(i, j * 5 + 1), h2 = hash01(i, j * 5 + 2), h3 = hash01(i, j * 5 + 3);
          const bob = drift ? Math.sin(g.time * 0.6 + h1 * U.TAU) * 5 : 0;
          const wy = base + h2 * PER + bob;
          const y = dy(wy, p);
          if (y < -40 || y > view.h + 40) continue;
          view.drawn.mid++;
          ctx.globalAlpha = 0.05 + h3 * 0.04;
          inkText(ctx, glyphs[Math.floor(h1 * glyphs.length)], dx(4 + h1 * 92, p), y,
            s(7 + h3 * 9), h2 > 0.5 ? C.cream : C.gold, 900);
        }
      });
      ctx.restore();
    }

    /**
     * STRUCT — the steelwork the tower is bolted to, one bay behind the
     * play surface. Close enough to p = 1 to read as part of the building,
     * far enough to visibly lag the decks as you climb.
     */
    function drawGirders(g) {
      if (!depthOn(g)) return;
      const p = DEPTH.struct, BAY = 54;
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = C.cream2;
      ctx.lineCap = 'round';
      const L = 6, R = 94;
      lattice(p, BAY, (i, base) => {
        const y0 = dy(base, p), y1 = dy(base + BAY, p);
        if (y1 > view.h + 40 || y0 < -40) return;
        view.drawn.struct++;
        ctx.lineWidth = Math.max(1, s(0.7));
        ctx.beginPath();
        ctx.moveTo(dx(L, p), y0); ctx.lineTo(dx(R, p), y1);   // X-brace
        ctx.moveTo(dx(R, p), y0); ctx.lineTo(dx(L, p), y1);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.5, s(1.2));
        ctx.beginPath();
        ctx.moveTo(dx(L, p), y0); ctx.lineTo(dx(R, p), y0);   // bay tie
        ctx.moveTo(dx(L, p), y0); ctx.lineTo(dx(L, p), y1);   // posts
        ctx.moveTo(dx(R, p), y0); ctx.lineTo(dx(R, p), y1);
        ctx.stroke();
      });
      ctx.restore();
    }

    /**
     * FORE — beams passing in front of the glass. At p > 1 they sweep by
     * faster than the table, which is the cue that reads as "nearer".
     * Kept dark, soft-edged and rare so a ball is never lost behind one.
     */
    function drawForeBeams(g) {
      if (!depthOn(g)) return;
      const p = DEPTH.fore, PER = 260;
      ctx.save();
      lattice(p, PER, (i, base) => {
        const wy = base + hash01(i, 1) * PER * 0.7;
        const th = 7 + hash01(i, 2) * 6;
        const y1 = dy(wy + th, p), y0 = dy(wy, p);
        if (y1 > view.h + 30 || y0 < -30) return;
        view.drawn.fore++;
        const grd = ctx.createLinearGradient(0, y1, 0, y0);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.35, 'rgba(3,6,9,0.52)');
        grd.addColorStop(0.65, 'rgba(3,6,9,0.52)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, y1, view.w, y0 - y1);
        // Rivets, so the beam has a surface rather than being a smear.
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = C.cream;
        for (let c = 0; c < 7; c++) {
          ctx.beginPath();
          ctx.arc(dx(8 + c * 14, p), (y0 + y1) / 2, Math.max(1, s(0.55)), 0, U.TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
      ctx.restore();
    }

    function drawFloors(g) {
      const { lo, hi } = visibleFloors(g);
      for (let k = lo; k <= hi; k++) {
        const base = k * D.W.FLOOR_H;
        const f = D.FLOORS[k] || D.FLOORS[D.FLOORS.length - 1];
        const unlocked = k < g.state.floors;
        const y0 = sy(base + D.W.FLOOR_H), y1 = sy(base);
        if (y1 < -60 || y0 > view.h + 60) continue;

        // Floor tint band.
        ctx.save();
        ctx.globalAlpha = unlocked ? 0.5 : 0.22;
        ctx.fillStyle = f.tint;
        ctx.fillRect(sx(T().PLAY_L), y0, s(T().PLAY_R - T().PLAY_L), y1 - y0);
        ctx.restore();

        if (!unlocked) {
          // Locked floor: hazard stripes + a price plaque.
          ctx.save();
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 10;
          ctx.beginPath();
          for (let i = -20; i < 40; i++) {
            ctx.moveTo(sx(T().PLAY_L) + i * 22, y1);
            ctx.lineTo(sx(T().PLAY_L) + i * 22 + (y1 - y0), y0);
          }
          ctx.stroke();
          ctx.restore();
          const cx = sx(50), cy = (y0 + y1) / 2;
          plaque(cx, cy, 150, 54, C.ink, C.gold);
          inkText(ctx, '🔒 FLOOR ' + k, cx, cy - 11, 15, C.gold);
          inkText(ctx, U.fmt(D.floorCost(k)) + ' coins', cx, cy + 12, 13, C.cream);
        }

        // Left-edge floor plaque with its chip multiplier, sitting just above
        // the floor's own deck so it labels the space you are looking at.
        const px = sx(T().PLAY_L) - 1, py = y1;
        if (py > -40 && py < view.h + 40) {
          ctx.save();
          ctx.translate(px + 30, py - 26);
          plaque(0, 0, 58, 38, unlocked ? C.ink : '#3a3a3a', unlocked ? f.accent : '#666');
          inkText(ctx, 'F' + k, 0, -8, 13, unlocked ? f.accent : '#888');
          inkText(ctx, '×' + U.fmt(D.floorMult(k)), 0, 9, 13, C.cream);
          ctx.restore();
        }
      }
    }

    function plaque(x, y, w, h, fill, stroke) {
      ctx.save();
      ctx.translate(x, y);
      roundRect(ctx, -w / 2, -h / 2 + 3, w, h, 8);
      ctx.fillStyle = C.ink2; ctx.fill();
      roundRect(ctx, -w / 2, -h / 2, w, h, 8);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke();
      ctx.restore();
    }

    function drawShell(g) {
      const world = g.world;
      ctx.lineCap = 'round';
      for (const c of world.colliders) {
        if (c.part || c.dead) continue;
        if (c.k !== 'seg') continue;
        const tag = c.tag;
        let col = C.cream2, wdt = Math.max(3, s((c.t || 1.2) * 2));
        if (tag === 'deck') { col = C.cream; wdt = Math.max(5, s(3)); }
        else if (tag === 'lip') col = C.cream2;
        else if (tag === 'shellSling') col = C.orange;
        else if (tag === 'lanegate') col = U.rgba(C.green, 0.55);

        const ay = sy(c.a.y), by = sy(c.b.y);
        if (Math.min(ay, by) > view.h + 40 || Math.max(ay, by) < -40) continue;
        ctx.beginPath();
        ctx.moveTo(sx(c.a.x), ay); ctx.lineTo(sx(c.b.x), by);
        ctx.lineWidth = wdt + 4; ctx.strokeStyle = C.ink2; ctx.stroke();
        ctx.lineWidth = wdt; ctx.strokeStyle = col; ctx.stroke();
        if (tag === 'deck') {
          ctx.lineWidth = Math.max(1, wdt * 0.3);
          ctx.strokeStyle = U.rgba('#000000', 0.18);
          ctx.stroke();
        }
      }
      // Gap arrows: show the way up.
      for (const gp of world.meta.gaps) {
        const y = sy(gp.y), x = sx(gp.x);
        if (y < -30 || y > view.h + 30) continue;
        const t = (g.time * 2) % 1;
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(g.time * 4);
        inkText(ctx, '▲', x, y - 4 - t * 10, 16, C.green, 900, 3);
        ctx.restore();
      }
    }

    function drawFields(g) {
      for (const f of g.world.fields) {
        const y = sy(f.c.y);
        if (y < -80 || y > view.h + 80) continue;
        const x = sx(f.c.x), r = s(f.r);
        const hot = f.hot || 0;
        const col = f.kind === 'attract' ? C.blue : f.kind === 'push' ? C.teal : C.purple;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, U.rgba(col, 0.22 + hot * 0.16));
        grd.addColorStop(1, U.rgba(col, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
        if (f.kind === 'push') {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.translate(x, y); ctx.rotate(-f.ang + Math.PI / 2);
          for (let i = 0; i < 3; i++) {
            const t = ((g.time * 1.6 + i / 3) % 1);
            ctx.globalAlpha = 0.5 * (1 - t);
            inkText(ctx, '▲', 0, r * 0.4 - t * r, 13, C.teal, 900, 3);
          }
          ctx.restore();
        }
      }
    }

    /* ------------------------------------------------------------- */
    function drawParts(g) {
      for (const inst of g.state.parts) {
        const def = D.PART_BY_ID[inst.id];
        if (!def || def.flipper) continue;
        const y = sy(inst.y);
        if (y < -70 || y > view.h + 70) continue;
        const locked = inst.floor >= g.state.floors;
        ctx.save();
        if (locked) ctx.globalAlpha = 0.3;
        drawPart(g, inst, def, sx(inst.x), y);
        ctx.restore();
      }
    }

    /**
     * Pops-remaining readout that sits above a bumper. Colour-coded rather
     * than number-only so you can read a whole floor's state at a glance:
     * gold healthy, orange low, red spent.
     */
    function drawUseCounter(g, inst, def, x, y, r, left) {
      const max = def.maxUses(inst);
      const frac = max ? left / max : 0;
      const col = left <= 0 ? C.red : frac < 0.34 ? C.orange : C.gold;
      const label = String(left);
      const w = 15 + label.length * 6;
      const cy = y - r - 11;

      ctx.save();
      // Recharge sweep: shows the next pop ticking back in.
      if (left < max) {
        const p = U.clamp((inst.rech || 0) / def.rechargeTime(inst), 0, 1);
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + U.TAU * p);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = U.rgba(C.gold, 0.75);
        ctx.stroke();
      }
      roundRect(ctx, x - w / 2, cy - 8 + 2, w, 16, 6);
      ctx.fillStyle = C.ink2; ctx.fill();
      roundRect(ctx, x - w / 2, cy - 8, w, 16, 6);
      ctx.fillStyle = C.ink; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();
      inkText(ctx, label, x, cy + 0.5, 11, col, 900, 2);
      ctx.restore();
    }

    function drawPart(g, inst, def, x, y) {
      const t = g.time;
      const r = s(def.r);
      const glow = inst._glow || 0;
      const lvl = inst.lvl;

      switch (def.id) {
        case 'bumper': {
          const left = def.usesLeft(inst);
          const spent = left <= 0;
          const pulse = 1 + glow * 0.35;
          const body = spent ? '#4a3b3a' : U.shade(def.color, glow * 0.35);
          inkCircle(ctx, x, y + 3, r * pulse, C.ink2, 0);
          inkCircle(ctx, x, y, r * pulse, body, 4);
          inkCircle(ctx, x, y, r * 0.62 * pulse, spent ? '#6b6157' : C.cream, 3);
          inkCircle(ctx, x, y, r * 0.3 * pulse, spent ? '#4a3b3a' : def.color, 2);
          drawUseCounter(g, inst, def, x, y, r, left);
          break;
        }
        case 'sling': case 'tramp': case 'wall': case 'conveyor': {
          const L = def.id === 'wall' ? s(9 + lvl * 0.8) : s(def.id === 'conveyor' ? 10 : def.id === 'tramp' ? 10 : 9);
          const a = -inst.a;
          const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
          const x1 = x - Math.cos(a) * L, y1 = y - Math.sin(a) * L;
          const w = s(def.id === 'wall' ? 1.6 : 2.0);
          capsule(ctx, x1, y1 + 3, x2, y2 + 3, w); ctx.fillStyle = C.ink2; ctx.fill();
          capsule(ctx, x1, y1, x2, y2, w);
          ctx.fillStyle = glow > 0.05 ? U.shade(def.color, 0.3) : def.color; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          if (def.id === 'tramp') {
            ctx.beginPath();
            for (let i = 0; i <= 8; i++) {
              const p = i / 8;
              const px = U.lerp(x1, x2, p), py = U.lerp(y1, y2, p) + Math.sin(p * Math.PI * 3 + t * 8) * s(0.8) * (1 + glow * 2);
              i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.lineWidth = 2; ctx.strokeStyle = C.ink2; ctx.stroke();
          }
          if (def.id === 'conveyor') {
            const off = (t * 2.2) % 1;
            for (let i = 0; i < 4; i++) {
              const p = ((i / 4) + off) % 1;
              const px = U.lerp(x1, x2, p), py = U.lerp(y1, y2, p);
              ctx.save(); ctx.translate(px, py); ctx.rotate(a);
              inkText(ctx, '›', 0, 0, 14, C.ink2, 900, 0);
              ctx.restore();
            }
          }
          break;
        }
        case 'target': {
          const down = inst.t_down > 0;
          const a = -inst.a;
          ctx.save();
          ctx.translate(x, y); ctx.rotate(a);
          const w = s(10), h = s(down ? 1.6 : 5.2);
          roundRect(ctx, -w / 2, -h / 2 + 3, w, h, 4); ctx.fillStyle = C.ink2; ctx.fill();
          roundRect(ctx, -w / 2, -h / 2, w, h, 4);
          ctx.fillStyle = down ? '#5a5347' : (glow > 0.05 ? C.cream : def.color); ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          if (!down) inkText(ctx, String(lvl), 0, 0, 11, C.ink2, 900, 0);
          ctx.restore();
          break;
        }
        case 'spinner': {
          ctx.save();
          ctx.translate(x, y);
          const spin = inst.rot || 0;
          const sc = Math.abs(Math.cos(spin));
          ctx.beginPath(); ctx.arc(0, 0, r, 0, U.TAU);
          ctx.fillStyle = U.rgba(def.color, 0.16); ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          ctx.save(); ctx.rotate(-inst.a); ctx.scale(1, Math.max(0.12, sc));
          roundRect(ctx, -s(1.6), -r * 0.92, s(3.2), r * 1.84, 3);
          ctx.fillStyle = def.color; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          ctx.restore();
          ctx.restore();
          break;
        }
        case 'rollover': {
          const lit = inst.lit;
          inkCircle(ctx, x, y + 2, r, C.ink2, 0);
          inkCircle(ctx, x, y, r, lit ? C.gold : U.rgba(def.color, 0.45), 3);
          inkCircle(ctx, x, y, r * 0.45, lit ? C.cream : U.rgba(C.cream, 0.35), 2);
          break;
        }
        case 'jackpot': {
          const ch = U.clamp((inst.charge || 0) / 1, 0, 1);
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.08);
          inkCircle(ctx, 0, 3, r, C.ink2, 0);
          inkCircle(ctx, 0, 0, r, U.rgba(def.color, 0.25 + ch * 0.5), 4);
          ctx.beginPath(); ctx.arc(0, 0, r * 0.78, -Math.PI / 2, -Math.PI / 2 + U.TAU * ch);
          ctx.lineWidth = 5; ctx.strokeStyle = ch >= 1 ? C.gold : def.color; ctx.stroke();
          inkText(ctx, '💎', 0, 1, r * 0.95, C.cream, 900, 0);
          ctx.restore();
          break;
        }
        case 'multgate': {
          inkCircle(ctx, x, y + 3, r, C.ink2, 0);
          inkCircle(ctx, x, y, r, inst.cd > 0 ? '#5a3a38' : def.color, 4);
          inkText(ctx, '×', x, y, r * 1.5, C.cream, 900, 3);
          break;
        }
        case 'totem': {
          ctx.save(); ctx.translate(x, y);
          roundRect(ctx, -r * 0.8, -r + 3, r * 1.6, r * 2, 5); ctx.fillStyle = C.ink2; ctx.fill();
          roundRect(ctx, -r * 0.8, -r, r * 1.6, r * 2, 5);
          ctx.fillStyle = def.color; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          inkText(ctx, '🗿', 0, 0, r, C.cream, 900, 0);
          ctx.restore();
          break;
        }
        case 'mint': case 'battery': {
          inkCircle(ctx, x, y + 3, r, C.ink2, 0);
          inkCircle(ctx, x, y, r, def.color, 4);
          inkText(ctx, def.id === 'mint' ? '🪙' : '🔋', x, y, r * 1.2, C.cream, 900, 0);
          break;
        }
        case 'splitter': {
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3) * 0.12);
          inkCircle(ctx, 0, 3, r, C.ink2, 0);
          inkCircle(ctx, 0, 0, r, def.color, 4);
          inkText(ctx, String(inst.hits || 0), 0, 0, r, C.ink2, 900, 0);
          ctx.restore();
          break;
        }
        case 'saucer': {
          inkCircle(ctx, x, y, r * 1.15, C.ink2, 0);
          inkCircle(ctx, x, y, r * 0.9, '#1a1a22', 3, def.color);
          ctx.save(); ctx.globalAlpha = 0.6;
          inkCircle(ctx, x, y, r * 0.5 * (1 + 0.15 * Math.sin(t * 5)), U.rgba(def.color, 0.6), 0);
          ctx.restore();
          break;
        }
        case 'cannon': {
          ctx.save(); ctx.translate(x, y); ctx.rotate(-inst.a);
          roundRect(ctx, -s(2), -s(2), s(11), s(4), 3); ctx.fillStyle = C.ink2; ctx.fill();
          roundRect(ctx, -s(2), -s(2.4), s(11), s(4), 3);
          ctx.fillStyle = def.color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          ctx.restore();
          inkCircle(ctx, x, y, r * 0.8, C.ink, 3, def.color);
          break;
        }
        case 'portal': {
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2);
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, r * (1 - i * 0.25), i * 2, i * 2 + 3.6);
            ctx.lineWidth = 4; ctx.strokeStyle = i % 2 ? C.cream : def.color; ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'laser': {
          const L = s(11), a = -inst.a;
          const x1 = x - Math.cos(a) * L, y1 = y - Math.sin(a) * L;
          const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
          ctx.save();
          ctx.globalAlpha = inst.cd > 0 ? 0.35 : 0.8 + 0.2 * Math.sin(t * 9);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
          ctx.lineWidth = 6; ctx.strokeStyle = U.rgba(def.color, 0.35); ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = C.cream; ctx.stroke();
          ctx.restore();
          inkCircle(ctx, x1, y1, s(1.8), def.color, 3);
          inkCircle(ctx, x2, y2, s(1.8), def.color, 3);
          break;
        }
        case 'orbit': {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, s(12), -inst.a - 1.5, -inst.a + 1.5);
          ctx.lineWidth = s(3.2) + 4; ctx.strokeStyle = C.ink2; ctx.stroke();
          ctx.lineWidth = s(3.2); ctx.strokeStyle = def.color; ctx.stroke();
          ctx.restore();
          break;
        }
        case 'ratchet': {
          ctx.save();
          const w = s(12);
          ctx.globalAlpha = inst.armed ? 1 : 0.3;
          roundRect(ctx, x - w, y - 4, w * 2, 8, 3); ctx.fillStyle = C.ink2; ctx.fill();
          roundRect(ctx, x - w, y - 7, w * 2, 8, 3);
          ctx.fillStyle = def.color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          inkText(ctx, '⤴', x, y - 3, 12, C.ink2, 900, 0);
          ctx.restore();
          break;
        }
        case 'kicker': {
          inkCircle(ctx, x, y + 3, r, C.ink2, 0);
          const spent = (inst.used || 0) >= (def.charges + inst.lvl - 1);
          inkCircle(ctx, x, y, r, spent ? '#3d4a42' : def.color, 4);
          inkText(ctx, '⬆', x, y, r, spent ? '#7a8a80' : C.ink2, 900, 0);
          break;
        }
        case 'lift': {
          ctx.save();
          const rise = s(32 + 7 * lvl);
          ctx.globalAlpha = 0.28;
          ctx.setLineDash([4, 6]);
          ctx.lineWidth = 2.5; ctx.strokeStyle = def.color;
          ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r, y - rise);
          ctx.moveTo(x + r, y); ctx.lineTo(x + r, y - rise); ctx.stroke();
          ctx.restore();
          roundRect(ctx, x - r, y - s(1) + 3, r * 2, s(2.6), 3); ctx.fillStyle = C.ink2; ctx.fill();
          roundRect(ctx, x - r, y - s(1), r * 2, s(2.6), 3);
          ctx.fillStyle = def.color; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          inkText(ctx, '▲', x, y - s(3.5), 12, def.color, 900, 3);
          break;
        }
        case 'piston': {
          const fire = !!inst.fire;
          const lift = fire ? s(3) : 0;
          inkCircle(ctx, x, y + 3, r, C.ink2, 0);
          roundRect(ctx, x - r * 0.85, y - lift - r * 0.5, r * 1.7, r * 1.2, 4);
          ctx.fillStyle = fire ? C.cream : def.color; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          // Charge ring so the timing is readable.
          const p = ((inst.t || 0) % Math.max(1.1, 2.6 - lvl * 0.09)) / Math.max(1.1, 2.6 - lvl * 0.09);
          ctx.beginPath(); ctx.arc(x, y, r * 0.95, -Math.PI / 2, -Math.PI / 2 + U.TAU * p);
          ctx.lineWidth = 3; ctx.strokeStyle = fire ? C.gold : U.rgba(def.color, 0.7); ctx.stroke();
          break;
        }
        case 'gate': {
          const L = s(8 + lvl * 0.7), a = -inst.a;
          const x1 = x - Math.cos(a) * L, y1 = y - Math.sin(a) * L;
          const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
          capsule(ctx, x1, y1 + 3, x2, y2 + 3, s(1.5)); ctx.fillStyle = C.ink2; ctx.fill();
          capsule(ctx, x1, y1, x2, y2, s(1.5));
          ctx.fillStyle = def.color; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
          ctx.save(); ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 4);
          inkText(ctx, '▲', x, y - s(3.5), 11, C.cream, 900, 2.5);
          ctx.restore();
          break;
        }
        case 'bell': {
          inkCircle(ctx, x, y + 3, r, C.ink2, 0);
          inkCircle(ctx, x, y, r, def.color, 3.5);
          inkText(ctx, '🔔', x, y, r * 1.2, C.cream, 900, 0);
          break;
        }
        case 'roulette': {
          ctx.save(); ctx.translate(x, y); ctx.rotate((inst.face || 0) * 1.25 + Math.sin(t) * 0.05);
          inkCircle(ctx, 0, 3, r, C.ink2, 0);
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r, i * U.TAU / 5, (i + 1) * U.TAU / 5);
            ctx.closePath();
            ctx.fillStyle = [C.blue, C.red, C.gold, C.green, C.pink][i];
            ctx.fill();
          }
          inkCircle(ctx, 0, 0, r, 'transparent', 3.5);
          inkCircle(ctx, 0, 0, r * 0.28, C.cream, 3);
          ctx.restore();
          break;
        }
        case 'jet': case 'magnet': case 'antigrav': {
          inkCircle(ctx, x, y + 3, r * 0.7, C.ink2, 0);
          inkCircle(ctx, x, y, r * 0.7, def.color, 3);
          ctx.save();
          if (def.id === 'jet') { ctx.translate(x, y); ctx.rotate(-inst.a); ctx.translate(-x, -y); }
          inkText(ctx, def.emoji, x, y, r * 0.9, C.cream, 900, 0);
          ctx.restore();
          break;
        }
        default: {
          inkCircle(ctx, x, y + 3, r, C.ink2, 0);
          inkCircle(ctx, x, y, r, def.color, 4);
          inkText(ctx, def.emoji, x, y, r, C.cream, 900, 0);
        }
      }

      // Level pip for anything above level 1. Sits low-right so it never
      // collides with a pops-remaining counter riding above the part.
      if (lvl > 1) {
        const px = x + r * 0.85, py = y + r * 0.85;
        inkCircle(ctx, px, py, 8, C.gold, 2.5);
        inkText(ctx, String(lvl), px, py + 0.5, 10, C.ink2, 900, 0);
      }
    }

    /* ------------------------------------------------------------- */
    function drawFlippers(g) {
      const alpha = view.alpha;
      for (const f of g.world.flippers) {
        const y = sy(f.pivot.y);
        if (y < -80 || y > view.h + 80) continue;
        const ang = f.prevAng != null ? U.angLerp(f.prevAng, f.ang, alpha) : f.ang;
        const px = sx(f.pivot.x), py = y;
        const tx = sx(f.pivot.x + Math.cos(ang) * f.len), ty = sy(f.pivot.y + Math.sin(ang) * f.len);
        const w = s(f.thick + 0.6);
        if (f.wheel) {
          // Batter wheel: a windmilling arm on a fat hub.
          ctx.save();
          ctx.globalAlpha = 0.18;
          inkCircle(ctx, px, py, s(f.len), f.color, 0);
          ctx.restore();
          capsule(ctx, px, py, tx, ty, w); ctx.fillStyle = C.ink2; ctx.fill();
          capsule(ctx, px, py, tx, ty, w * 0.78);
          ctx.fillStyle = f.color; ctx.fill();
          inkCircle(ctx, tx, ty, w * 1.1, C.cream, 3);
          inkCircle(ctx, px, py, w * 1.25, C.ink, 3.5, f.color);
          continue;
        }
        capsule(ctx, px, py + 4, tx, ty + 4, w); ctx.fillStyle = C.ink2; ctx.fill();
        capsule(ctx, px, py, tx, ty, w);
        ctx.fillStyle = f.pressed ? C.gold : f.color;
        ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = C.ink2; ctx.stroke();
        // Pivot cap.
        inkCircle(ctx, px, py, w * 0.62, C.ink, 3, f.pressed ? C.gold : C.cream2);
        if (f.panel > 1 || f.part) {
          inkText(ctx, f.auto ? 'A' : String(f.panel + 1), px, py + 0.5, 10, C.cream, 900, 2);
        }
      }
    }

    function drawPlunger(g) {
      const lane = g.world.meta.lane;
      if (!lane) return;
      const x = sx(lane.x), w = s(9);
      const base = sy(lane.bottom);
      const pull = g.plunger.pull;
      const h = s(10 + pull * 16);
      if (base < -50 || base > view.h + 200) return;
      // Spring
      ctx.save();
      ctx.lineWidth = 3; ctx.strokeStyle = C.steel;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const p = i / 10;
        ctx.lineTo(x + (i % 2 ? w * 0.28 : -w * 0.28), base - p * s(12));
      }
      ctx.stroke();
      ctx.restore();
      roundRect(ctx, x - w / 2, base - h + s(pull * 16), w, h, 4);
      ctx.fillStyle = pull > 0.02 ? C.red : C.steel; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
      if (g.awaitLaunch) {
        const yy = base + s(pull * 16) - h - 16;
        ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.time * 6);
        inkText(ctx, 'PULL', x, yy, 12, C.gold);
        ctx.restore();
      }
    }

    /* ------------------------------------------------------------- */
    /** Render position of a body, interpolated across the current step. */
    function ipos(b) {
      const a = view.alpha;
      if (!b.pp || !a) return b.p;
      return { x: U.lerp(b.pp.x, b.p.x, a), y: U.lerp(b.pp.y, b.p.y, a) };
    }

    function drawBalls(g) {
      for (const b of g.balls) {
        if (!b.alive) continue;
        const ip = ipos(b);
        const y = sy(ip.y);
        if (y < -60 || y > view.h + 60) continue;
        const x = sx(ip.x), r = s(b.r);

        if (b.def.trail && b.trail.length > 1) {
          ctx.save();
          ctx.lineCap = 'round';
          for (let i = 1; i < b.trail.length; i++) {
            const a = i / b.trail.length;
            ctx.globalAlpha = a * 0.55;
            ctx.beginPath();
            ctx.moveTo(sx(b.trail[i - 1].x), sy(b.trail[i - 1].y));
            ctx.lineTo(sx(b.trail[i].x), sy(b.trail[i].y));
            ctx.lineWidth = r * 1.5 * a;
            ctx.strokeStyle = b.def.color;
            ctx.stroke();
          }
          ctx.restore();
        }

        inkCircle(ctx, x, y + 3, r, U.rgba('#000000', 0.45), 0);
        const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.45, b.def.color);
        grd.addColorStop(1, U.shade(b.def.color, -0.34));
        ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU);
        ctx.fillStyle = grd; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink2; ctx.stroke();
        ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.26, 0, U.TAU);
        ctx.fillStyle = U.rgba('#ffffff', 0.85); ctx.fill();

        if (b.held) {
          ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.time * 10);
          inkCircle(ctx, x, y, r * 1.7, 'transparent', 3, C.gold);
          ctx.restore();
        }
      }

      // Off-screen ball pointer so you never lose track of the play.
      for (const b of g.balls) {
        if (!b.alive) continue;
        const ip = ipos(b);
        const y = sy(ip.y);
        if (y >= -20 && y <= view.h + 20) continue;
        const x = U.clamp(sx(ip.x), 22, view.w - 22);
        const yy = y < 0 ? 26 : view.h - 26;
        ctx.save();
        inkCircle(ctx, x, yy, 13, U.rgba(b.def.color, 0.9), 3);
        inkText(ctx, y < 0 ? '▲' : '▼', x, yy, 12, C.ink2, 900, 0);
        ctx.restore();
      }
    }

    /**
     * A loaded cannon hands the shot to the player, so it needs a real aim
     * readout: a dotted trajectory the ball will actually follow, plus a
     * power wedge you set by dragging further from the barrel.
     */
    function drawCannon(g) {
      const c = g.cannon;
      if (!c) return;
      const ox = c.inst.x, oy = c.inst.y;
      const sp = (170 + c.inst.lvl * 10) * U.clamp(c.power, 0.3, 1);
      const vx = Math.cos(c.ang) * sp, vy = Math.sin(c.ang) * sp;
      const grav = g.world.gravity * (g.balls[0] ? g.balls[0].grav : 1);

      ctx.save();
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = -g.time * 40;
      ctx.lineWidth = 3;
      ctx.strokeStyle = U.rgba(C.gold, 0.85);
      ctx.beginPath();
      ctx.moveTo(sx(ox), sy(oy));
      for (let i = 1; i <= 26; i++) {
        const t = i * 0.032;
        ctx.lineTo(sx(ox + vx * t), sy(oy + vy * t - 0.5 * grav * t * t));
      }
      ctx.stroke();
      ctx.restore();

      // Power wedge at the muzzle.
      ctx.save();
      ctx.translate(sx(ox), sy(oy));
      ctx.rotate(-c.ang);
      const len = s(9 + 12 * c.power);
      capsule(ctx, 0, 0, len, 0, s(2.4));
      ctx.fillStyle = C.red; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = C.ink2; ctx.stroke();
      ctx.restore();
      inkCircle(ctx, sx(ox), sy(oy), s(3), C.ink, 3, C.gold);
      inkText(ctx, 'DRAG TO AIM · RELEASE TO FIRE', view.w / 2, view.h - 96, 12, C.gold);
    }

    function drawParticles(g) {
      for (const p of g.particles) {
        const y = sy(p.y);
        if (y < -30 || y > view.h + 30) continue;
        const a = U.clamp(p.life / p.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(sx(p.x), y);
        ctx.rotate(p.rot);
        const sz = p.size * (0.4 + a * 0.8);
        ctx.fillStyle = p.color;
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink2;
        ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
    }

    function drawPopups(g) {
      for (const p of g.popups) {
        const a = U.clamp(p.life / p.max, 0, 1);
        const rise = (1 - a) * 34;
        const y = sy(p.y) - rise;
        if (y < -40 || y > view.h + 40) continue;
        const pop = p.life > p.max - 0.12 ? 1 + (p.life - (p.max - 0.12)) * 3 : 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 1.8);
        ctx.translate(sx(p.x), y);
        ctx.rotate(p.tilt * (1 - a));
        ctx.scale(pop, pop);
        inkText(ctx, p.text, 0, 0, p.size, p.color, 900);
        ctx.restore();
      }
    }

    /* ------------------------------------------------------------- */
    function drawBuildOverlay(g) {
      const b = g.build;
      // Grid over the active floor.
      const base = b.floor * D.W.FLOOR_H;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = C.cream;
      ctx.lineWidth = 1;
      for (let x = T().PLAY_L; x <= T().PLAY_R; x += 5) {
        ctx.beginPath(); ctx.moveTo(sx(x), sy(base)); ctx.lineTo(sx(x), sy(base + D.W.FLOOR_H)); ctx.stroke();
      }
      for (let y = 0; y <= D.W.FLOOR_H; y += 5) {
        ctx.beginPath(); ctx.moveTo(sx(T().PLAY_L), sy(base + y)); ctx.lineTo(sx(T().PLAY_R), sy(base + y)); ctx.stroke();
      }
      ctx.restore();

      // Bulldozer armed: ring every part on this floor in red, so the mode
      // is visible on the table and not only in the bar you are not looking at.
      if (b.raze) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -g.time * 26;
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.red;
        for (const inst of g.state.parts) {
          if (inst.floor !== b.floor) continue;
          const def = D.PART_BY_ID[inst.id];
          if (!def) continue;
          const x = sx(inst.x), y = sy(inst.y);
          if (y < -40 || y > view.h + 40) continue;
          const r = s(def.r) + 6;
          ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.stroke();
          ctx.setLineDash([]);
          inkText(ctx, '✕', x, y, s(5.5), C.red, 900, 3);
          ctx.setLineDash([5, 4]);
        }
        ctx.restore();
      }

      // Highlight the selected part.
      if (b.sel) {
        const def = D.PART_BY_ID[b.sel.id];
        const x = sx(b.sel.x), y = sy(b.sel.y), r = s(def.r) + 8;
        ctx.save();
        ctx.setLineDash([7, 6]);
        ctx.lineWidth = 3; ctx.strokeStyle = C.gold;
        ctx.lineDashOffset = -g.time * 22;
        ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.stroke();
        ctx.restore();
      }

      // Ghost of the part being dropped.
      if (b.ghost) {
        const def = D.PART_BY_ID[b.ghost.id];
        const ok = !b.ghostErr;
        ctx.save();
        ctx.globalAlpha = 0.72;
        drawPart(g, b.ghost, def, sx(b.ghost.x), sy(b.ghost.y));
        ctx.globalAlpha = 1;
        const x = sx(b.ghost.x), y = sy(b.ghost.y), r = s(def.r) + 7;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 3; ctx.strokeStyle = ok ? C.green : C.red;
        ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.stroke();
        ctx.setLineDash([]);
        if (b.ghostErr) inkText(ctx, b.ghostErr, x, y - r - 14, 12, C.red);
        ctx.restore();
      }
    }

    /**
     * A tall table is easy to get lost in, so the right edge carries a
     * miniature of the whole tower: floor bands, where your parts are, the
     * slice you are looking at, and every live ball.
     */
    function drawMinimap(g) {
      const totalH = g.world.totalH || 1;
      const mw = 10;
      const x0 = view.w - mw - 4;
      const top = 152, bot = view.h - 120;
      const h = bot - top;
      if (h < 90) return;
      const my = (wy) => bot - (wy / totalH) * h;

      ctx.save();
      ctx.globalAlpha = 0.88;
      roundRect(ctx, x0 - 2, top - 4, mw + 4, h + 8, 6);
      ctx.fillStyle = U.rgba('#000000', 0.55); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = U.rgba(C.ink2, 0.8); ctx.stroke();

      for (let k = 0; k < g.state.floors; k++) {
        const f = D.FLOORS[k] || D.FLOORS[0];
        const ya = my((k + 1) * D.W.FLOOR_H), yb = my(k * D.W.FLOOR_H);
        ctx.fillStyle = U.rgba(f.accent, 0.3);
        ctx.fillRect(x0, ya, mw, yb - ya - 1);
      }
      // Part density per floor, as pips.
      for (const p of g.state.parts) {
        if (p.floor >= g.state.floors) continue;
        const def = D.PART_BY_ID[p.id];
        ctx.fillStyle = U.rgba(def ? def.color : C.cream, 0.9);
        ctx.fillRect(x0 + 1 + (p.x / 100) * (mw - 3), my(p.y) - 1, 2, 2);
      }
      // Viewport slice.
      const va = my(view.camY + view.viewH), vb = my(view.camY);
      ctx.lineWidth = 2; ctx.strokeStyle = C.cream;
      ctx.strokeRect(x0 - 1, va, mw + 2, Math.max(4, vb - va));
      // Balls.
      for (const b of g.balls) {
        if (!b.alive) continue;
        inkCircle(ctx, x0 + mw / 2, my(ipos(b).y), 3.4, b.def.color, 1.5);
      }
      ctx.restore();
    }

    function drawVignette() {
      const grd = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.25, view.w / 2, view.h / 2, view.h * 0.78);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    /* --------------------------------------------------------------- */
    /** Screen → world (used by build mode drag + cannon aiming). */
    function toWorld(px, py) {
      return { x: px / view.scale, y: view.camY + (view.h - py) / view.scale };
    }

    return { ctx, view, resize, draw, toWorld, sx, sy, s, dx, dy, DEPTH, inkText, roundRect };
  }

  IP.render = { makeRenderer, roundRect, inkText, inkCircle, capsule };
})(window);
