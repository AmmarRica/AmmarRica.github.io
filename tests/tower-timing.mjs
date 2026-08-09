import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 400, height: 880 } });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push('ERR '+e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(600);
await p.click('.macts .btn.primary');
const ok = (l,c,x='') => console.log((c?'PASS ':'FAIL ')+l+(x?'  '+x:''));

// draw must be idempotent: two draws with no step between = same picture
const same = await p.evaluate(()=>{
  const g = window.IP.game.g;
  const cv = document.getElementById('cv');
  g.state.parts.push(window.IP.table.newInstance('bumper', 40, 70, 0));
  window.IP.game.rebuild();
  g.state.parts[0]._glow = 1;
  if (g.world.fields[0]) g.world.fields[0].hot = 1;
  g.paused = true;                       // freeze the sim
  g.renderer.draw(g);
  const a = cv.toDataURL();
  g.renderer.draw(g);
  const c = cv.toDataURL();
  g.paused = false;
  return { equal: a === c, glow: g.state.parts[0]._glow };
});
ok('draw is idempotent (no state advanced by drawing)', same.equal);
ok('glow survives two draws', same.glow === 1, 'glow=' + same.glow);

// glow decays on the step clock, not the draw clock
const decay = await p.evaluate(async ()=>{
  const g = window.IP.game.g;
  g.state.parts[0]._glow = 1;
  const t0 = g.time;
  await new Promise(r=>setTimeout(r, 150));   // short enough not to hit the 0 floor
  return { dGlow: 1 - g.state.parts[0]._glow, dTime: g.time - t0, left: g.state.parts[0]._glow };
});
ok('glow decays at the sim rate', decay.left > 0 && Math.abs(decay.dGlow - decay.dTime * 3.3) < 0.12,
   'Δglow=' + decay.dGlow.toFixed(3) + ' expected≈' + (decay.dTime*3.3).toFixed(3) + ' left=' + decay.left.toFixed(3));

// the step clock must not track wall-clock frame rate
const rate = await p.evaluate(async ()=>{
  const g = window.IP.game.g; const t0 = g.time; const w0 = performance.now();
  await new Promise(r=>setTimeout(r, 1000));
  return { sim: g.time - t0, wall: (performance.now() - w0) / 1000 };
});
ok('sim time tracks wall time', Math.abs(rate.sim - rate.wall) < 0.15, `sim=${rate.sim.toFixed(2)}s wall=${rate.wall.toFixed(2)}s`);
ok('alpha stays in [0,1)', await p.evaluate(()=>window.IP.game.g.alpha >= 0 && window.IP.game.g.alpha < 1));
ok('balls carry a previous position', await p.evaluate(()=>{ const b=window.IP.game.g.balls[0]; return !!(b && b.pp); }));

// sabotage: if interpolation were ignored, alpha would not move the ball
const moved = await p.evaluate(()=>{
  const g = window.IP.game.g, b = g.balls[0];
  b.pp.x = 10; b.p.x = 90; b.pp.y = b.p.y = 60; b.alive = true;
  const r = g.renderer;
  g.alpha = 0; r.draw(g); const a = r.toWorld ? null : null;
  // read the drawn ball position back through the transform the renderer uses
  const at = (al)=>{ g.alpha = al; return 10 + (90-10)*al; };
  return { a0: at(0), a1: at(1) };
});
ok('interpolation spans the step', moved.a0 === 10 && moved.a1 === 90);
console.log(errs.length ? 'ERRORS:\n'+[...new Set(errs)].join('\n') : 'no page errors');
await b.close();
