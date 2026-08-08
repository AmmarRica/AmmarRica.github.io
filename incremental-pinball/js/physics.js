/* =========================================================================
 * TOWER OF CHIPS — physics
 * A compact circle-vs-(segment | circle | arc) solver with force fields,
 * sensors and swinging flippers. Deterministic, allocation-light, and
 * substepped so fast balls never tunnel through a wall.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;
  const D = IP.data;

  const MAX_SPEED = 430;
  const MAX_STEP_DIST = 0.75;   // world units a ball may travel per substep
  const MAX_SUBSTEPS = 26;

  /* ------------------------------------------------------------------ */
  /* Broadphase: colliders bucketed by floor band so a ball on floor 7    */
  /* never tests geometry down on floor 0.                                */
  /* ------------------------------------------------------------------ */
  function bucketize(colliders, floorH, floors) {
    const buckets = [];
    for (let i = 0; i < floors + 2; i++) buckets.push([]);
    const put = (c, lo, hi) => {
      let a = Math.floor(lo / floorH) - 1, b = Math.floor(hi / floorH) + 1;
      a = U.clamp(a, 0, buckets.length - 1);
      b = U.clamp(b, 0, buckets.length - 1);
      for (let i = a; i <= b; i++) buckets[i].push(c);
    };
    for (const c of colliders) {
      if (c.k === 'seg' || c.k === 'sensorSeg') put(c, Math.min(c.a.y, c.b.y), Math.max(c.a.y, c.b.y));
      else if (c.k === 'arc') put(c, c.c.y - c.r, c.c.y + c.r);
      else put(c, c.c.y - c.r, c.c.y + c.r);
    }
    return buckets;
  }

  /** Which bucket a point belongs to. */
  const bandOf = (y, floorH, n) => U.clamp(Math.floor(y / floorH), 0, n - 1);

  /* ------------------------------------------------------------------ */
  /* Contact resolution primitives                                       */
  /* ------------------------------------------------------------------ */

  /** Reflect `ball` off a static surface with normal n and penetration pen. */
  function resolveStatic(ball, n, pen, col, hit) {
    ball.p.x += n.x * pen;
    ball.p.y += n.y * pen;
    const vn = ball.v.x * n.x + ball.v.y * n.y;
    if (vn < 0) {
      const e = U.clamp((col.e != null ? col.e : 0.5) * ball.e, 0, 1.35);
      const tx = -n.y, ty = n.x;
      let vt = ball.v.x * tx + ball.v.y * ty;
      const fric = col.f != null ? col.f : 0.035;
      vt *= (1 - (ball.slick ? fric * 0.15 : fric));
      const nvn = -vn * e;
      ball.v.x = n.x * nvn + tx * vt;
      ball.v.y = n.y * nvn + ty * vt;
      hit.speed = -vn;
      hit.hit = true;
    }
    if (col.kick) {                       // active kickers add energy outward
      ball.v.x += n.x * col.kick / Math.sqrt(ball.mass);
      ball.v.y += n.y * col.kick / Math.sqrt(ball.mass);
      hit.hit = true;
    }
    if (col.belt) {                       // conveyors drag along their axis
      const bx = Math.cos(col.beltDir), by = Math.sin(col.beltDir);
      ball.v.x += bx * col.belt * 0.06;
      ball.v.y += by * col.belt * 0.06;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Flippers                                                            */
  /* ------------------------------------------------------------------ */

  /** Advance a flipper's swing. `dir` = +1 pressed (up), -1 released. */
  function stepFlipper(f, dt) {
    if (f.spinRate) {                    // batter wheel: constant windmill
      f.ang = U.norm(f.ang + f.spinRate * dt);
      f.angV = f.spinRate;
      f.tip = { x: f.pivot.x + Math.cos(f.ang) * f.len, y: f.pivot.y + Math.sin(f.ang) * f.len };
      return;
    }
    const target = f.pressed ? f.upAng : f.restAng;
    const prev = f.ang;
    const rate = f.rate * (f.pressed ? 1 : 0.62);
    const diff = U.norm(target - f.ang);
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    f.ang += step;
    f.angV = dt > 0 ? U.norm(f.ang - prev) / dt : 0;
    f.tip = { x: f.pivot.x + Math.cos(f.ang) * f.len, y: f.pivot.y + Math.sin(f.ang) * f.len };
  }

  function collideFlipper(ball, f, hit) {
    const q = U.closestOnSeg(ball.p, f.pivot, f.tip);
    let dx = ball.p.x - q.x, dy = ball.p.y - q.y;
    let dist = Math.hypot(dx, dy);
    const rad = ball.r + f.thick;
    if (dist >= rad) return false;
    if (dist < 1e-4) { dx = 0; dy = 1; dist = 1e-4; }
    const n = { x: dx / dist, y: dy / dist };
    ball.p.x += n.x * (rad - dist);
    ball.p.y += n.y * (rad - dist);

    // Surface velocity at the contact point (ω × r).
    const rx = q.x - f.pivot.x, ry = q.y - f.pivot.y;
    const vs = { x: -f.angV * ry, y: f.angV * rx };
    const rvx = ball.v.x - vs.x, rvy = ball.v.y - vs.y;
    const vn = rvx * n.x + rvy * n.y;
    if (vn < 0) {
      const e = U.clamp(f.e * ball.e, 0, 1.2);
      const tx = -n.y, ty = n.x;
      let vt = rvx * tx + rvy * ty;
      vt *= 0.93;
      const nvn = -vn * e;
      ball.v.x = vs.x + n.x * nvn + tx * vt;
      ball.v.y = vs.y + n.y * nvn + ty * vt;
      // Extra punch while actively swinging up — this is what "flipping" feels like.
      const swing = Math.abs(f.angV) * (f.spinRate ? 1 : f.pressed ? 1 : 0.25);
      if (swing > 0.6 && f.power > 0) {
        const boost = Math.min(swing * f.power * 0.09, f.power) / Math.sqrt(ball.mass);
        ball.v.x += n.x * boost;
        ball.v.y += n.y * boost;
      }
      hit.hit = true;
      hit.speed = -vn;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Main integrator                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * world  : { buckets, floorH, gravity, flippers, fields }
   * balls  : array of live balls
   * cb     : { onHit(ball,col,info), onSensor(ball,col), onDrain(ball) }
   */
  function step(world, balls, dt, cb) {
    if (dt <= 0) return;

    // Pick a substep count from the fastest ball so nothing tunnels.
    let vmax = 40;
    for (const b of balls) { const s = Math.hypot(b.v.x, b.v.y); if (s > vmax) vmax = s; }
    const n = U.clamp(Math.ceil((vmax * dt) / MAX_STEP_DIST), 1, MAX_SUBSTEPS);
    const h = dt / n;

    for (let s = 0; s < n; s++) {
      for (const f of world.flippers) stepFlipper(f, h);
      for (let bi = 0; bi < balls.length; bi++) {
        const ball = balls[bi];
        if (!ball.alive) continue;
        if (ball.held) { integrateHeld(ball, h); continue; }
        substepBall(world, balls, ball, h, cb);
      }
    }
  }

  function integrateHeld(ball, h) {
    ball.v.x *= 0.6; ball.v.y *= 0.6;
    if (ball.holdTo) {
      ball.p.x = U.approach(ball.p.x, ball.holdTo.x, 22, h);
      ball.p.y = U.approach(ball.p.y, ball.holdTo.y, 22, h);
    }
  }

  function substepBall(world, balls, ball, h, cb) {
    /* ---- forces -------------------------------------------------- */
    let g = world.gravity * ball.grav * (ball.gravMul || 1);
    let fx = 0, fy = 0;
    const fieldScale = world.fieldMult || 1;

    for (const fl of world.fields) {
      const dx = fl.c.x - ball.p.x, dy = fl.c.y - ball.p.y;
      const d2 = dx * dx + dy * dy;
      const rr = fl.r * fl.r;
      if (d2 > rr) continue;
      const d = Math.sqrt(d2) || 0.001;
      const fall = 1 - d / fl.r;                      // linear falloff
      if (fl.kind === 'attract') {
        const pw = fl.power * fieldScale * fall * (ball.magnetic || 1);
        fx += (dx / d) * pw; fy += (dy / d) * pw;
        if (fl.part) fl.hot = 1;
      } else if (fl.kind === 'push') {
        const pw = fl.power * fieldScale * fall;
        fx += Math.cos(fl.ang) * pw; fy += Math.sin(fl.ang) * pw;
        if (fl.part) fl.hot = 1;
      } else if (fl.kind === 'lowgrav') {
        g *= (1 - fl.power * fall);
        if (fl.part) fl.hot = 1;
      }
    }

    // Void-class balls tug every other ball toward them.
    for (const other of balls) {
      if (other === ball || !other.alive || !other.pullsBalls) continue;
      const dx = other.p.x - ball.p.x, dy = other.p.y - ball.p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5 && d < 45) { const pw = other.pullsBalls * (1 - d / 45) / ball.mass; fx += (dx / d) * pw; fy += (dy / d) * pw; }
    }

    fx += (world.nudgeX || 0);
    fy += (world.nudgeY || 0);

    // Fields/nudges are forces (divided by mass); gravity is an acceleration.
    const m = ball.massForce || 1;
    ball.v.x += (fx / m) * h;
    ball.v.y += (fy / m - g) * h;

    // Air drag (negative drag = the mercury/perpetual "keeps its speed" case).
    if (ball.drag && !world.noDrag) {
      const k = 1 - ball.drag * h;
      ball.v.x *= k; ball.v.y *= k;
    }

    const sp = Math.hypot(ball.v.x, ball.v.y);
    if (sp > MAX_SPEED) { const k = MAX_SPEED / sp; ball.v.x *= k; ball.v.y *= k; }

    /* ---- integrate ---------------------------------------------- */
    ball.p.x += ball.v.x * h;
    ball.p.y += ball.v.y * h;

    if (ball.portalCd > 0) ball.portalCd -= h;
    if (ball.holdCd > 0) ball.holdCd -= h;
    ball.age += h;

    /* ---- drain / stray ------------------------------------------- */
    if (ball.p.y < D.W.DRAIN_Y) { cb.onDrain(ball); return; }

    /* ---- static collisions --------------------------------------- */
    const nb = world.buckets.length;
    const list = world.buckets[bandOf(ball.p.y, world.floorH, nb)];
    const hit = { hit: false, speed: 0 };

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.dead) continue;

      if (c.k === 'seg') {
        if (c.oneWayUp && ball.v.y > 4) continue;
        const q = U.closestOnSeg(ball.p, c.a, c.b);
        let dx = ball.p.x - q.x, dy = ball.p.y - q.y;
        let dist = Math.hypot(dx, dy);
        const rad = ball.r + (c.t || 0);
        if (dist >= rad) continue;
        if (dist < 1e-5) { dx = 0; dy = 1; dist = 1e-5; }
        hit.hit = false;
        resolveStatic(ball, { x: dx / dist, y: dy / dist }, rad - dist, c, hit);
        if (hit.hit && c.part) cb.onHit(ball, c, hit);
        else if (hit.hit && c.tag === 'wallOuter') cb.onWall && cb.onWall(ball, c, hit);

      } else if (c.k === 'circ') {
        const dx = ball.p.x - c.c.x, dy = ball.p.y - c.c.y;
        let dist = Math.hypot(dx, dy);
        const rad = ball.r + c.r;
        if (dist >= rad) continue;
        const nrm = dist < 1e-5 ? { x: 0, y: 1 } : { x: dx / dist, y: dy / dist };
        hit.hit = false;
        resolveStatic(ball, nrm, rad - (dist || 1e-5), c, hit);
        if (hit.hit && c.part) cb.onHit(ball, c, hit);

      } else if (c.k === 'arc') {
        const dx = ball.p.x - c.c.x, dy = ball.p.y - c.c.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-4) continue;
        let ang = Math.atan2(dy, dx);
        // Is this angle inside the arc's sweep?
        let rel = U.norm(ang - c.a0);
        const span = U.norm(c.a1 - c.a0);
        const sweep = span < 0 ? span + U.TAU : span;
        if (rel < 0) rel += U.TAU;
        if (rel > sweep) continue;
        const gap = Math.abs(d - c.r);
        const rad = ball.r + (c.t || 0);
        if (gap >= rad) continue;
        const sign = d > c.r ? 1 : -1;
        const nrm = { x: (dx / d) * sign, y: (dy / d) * sign };
        hit.hit = false;
        resolveStatic(ball, nrm, rad - gap, c, hit);
        if (hit.hit && c.part) cb.onHit(ball, c, hit);

      } else if (c.k === 'sensor') {
        const dx = ball.p.x - c.c.x, dy = ball.p.y - c.c.y;
        if (dx * dx + dy * dy > (c.r + ball.r) * (c.r + ball.r)) continue;
        cb.onSensor(ball, c);

      } else if (c.k === 'sensorSeg') {
        const q = U.closestOnSeg(ball.p, c.a, c.b);
        const dd = (ball.p.x - q.x) ** 2 + (ball.p.y - q.y) ** 2;
        if (dd > (ball.r + 1.4) ** 2) continue;
        cb.onSensor(ball, c);
      }
    }

    /* ---- flippers ------------------------------------------------- */
    for (const f of world.flippers) {
      if (Math.abs(f.pivot.y - ball.p.y) > f.len + 14) continue;
      hit.hit = false;
      if (collideFlipper(ball, f, hit) && hit.hit) cb.onFlipper(ball, f, hit);
    }
  }

  IP.physics = { step, bucketize, bandOf, stepFlipper, MAX_SPEED };
})(window);
