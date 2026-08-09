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
    const view = { w: 0, h: 0, scale: 4, camY: 0, shake: 0, sx: 0, sy: 0, dpr: 1 };

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

    const sx = (wx) => wx * view.scale + view.sx;
    const sy = (wy) => view.h - (wy - view.camY) * view.scale + view.sy;
    const s = (n) => n * view.scale;

    /* --------------------------------------------------------------- */
    function draw(g) {
      const dpr = view.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, view.w, view.h);

      view.sx = view.shake ? U.rand(-view.shake, view.shake) : 0;
      view.sy = view.shake ? U.rand(-view.shake, view.shake) : 0;

      drawBackground(g);
      drawFloors(g);
      drawShell(g);
      drawFields(g);
      drawParts(g);
      drawFlippers(g);
      drawPlunger(g);
      drawBalls(g);
      drawCannon(g);
      drawParticles(g);
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

      // Soft diagonal felt hatching.
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      const step = 16;
      const off = (view.camY * view.scale) % (step * 2);
      for (let x = -view.h; x < view.w + view.h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, -off);
        ctx.lineTo(x + view.h, view.h - off);
        ctx.stroke();
      }
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
        f.hot = Math.max(0, hot - 0.06);
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
      inst._glow = Math.max(0, glow - 0.055);
    }

    /* ------------------------------------------------------------- */
    function drawFlippers(g) {
      for (const f of g.world.flippers) {
        const y = sy(f.pivot.y);
        if (y < -80 || y > view.h + 80) continue;
        const px = sx(f.pivot.x), py = y;
        const tx = sx(f.tip.x), ty = sy(f.tip.y);
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
    function drawBalls(g) {
      for (const b of g.balls) {
        if (!b.alive) continue;
        const y = sy(b.p.y);
        if (y < -60 || y > view.h + 60) continue;
        const x = sx(b.p.x), r = s(b.r);

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
        const y = sy(b.p.y);
        if (y >= -20 && y <= view.h + 20) continue;
        const x = U.clamp(sx(b.p.x), 22, view.w - 22);
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
        inkCircle(ctx, x0 + mw / 2, my(b.p.y), 3.4, b.def.color, 1.5);
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

    return { ctx, view, resize, draw, toWorld, sx, sy, s, inkText, roundRect };
  }

  IP.render = { makeRenderer, roundRect, inkText, inkCircle, capsule };
})(window);
