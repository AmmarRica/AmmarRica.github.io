/* =========================================================================
 * TOWER OF CHIPS — interface
 * Two screens in one page: the live table, and a menu drawer that collapses
 * out of the way to reveal it. Everything else (shop, build, balls,
 * trinkets, upgrades, panels, stats) lives inside the drawer.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;
  const D = IP.data;
  const G = IP.game;
  const g = G.g;
  const { $, el, fmt } = U;

  const UI = {
    tab: 'shop',
    menuOpen: true,
    armed: null,          // part id queued for placement
    bulk: 1,              // upgrade purchase batch size
    dragUid: null,
    dirty: true,
    lastCoins: 0,
    rebinding: -1,
  };

  /* ==================================================================
   * SMALL BUILDING BLOCKS (Balatro-ish cards & buttons)
   * =============================================================== */
  function btn(label, opts) {
    opts = opts || {};
    return el('button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), {
      type: 'button',
      onclick: opts.onclick,
      disabled: opts.disabled,
      title: opts.title || '',
      'aria-label': opts.aria || opts.title || null,
    }, label);
  }

  function card(opts) {
    const c = el('div.card' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''));
    if (opts.accent) c.style.setProperty('--accent', opts.accent);
    return c;
  }

  function statRow(k, v, cls) {
    return el('div.srow', el('span.sk', k), el('span.sv' + (cls ? '.' + cls : ''), v));
  }

  function section(title, sub) {
    return el('div.sectitle', el('h2', title), sub ? el('p', sub) : null);
  }

  /* ==================================================================
   * HUD
   * =============================================================== */
  function buildHud() {
    const hud = $('hud');
    hud.innerHTML = '';
    hud.appendChild(el('div.hudrow',
      el('div.hcell.score', el('div.hlabel', 'SCORE'), el('div.hval#hScore', '0')),
      el('div.hcell.coins', el('div.hlabel', 'COINS'), el('div.hval#hCoins', '0')),
    ));
    hud.appendChild(el('div.hudrow.chipsrow',
      el('div.chipbox', el('span#hChips', '0'), el('small', 'CHIPS')),
      el('div.xbox', '×'),
      el('div.multbox', el('span#hMult', '1.0'), el('small', 'MULT')),
    ));
    hud.appendChild(el('div.hudrow.small',
      el('div#hBalls.hmini', '●●●'),
      el('div#hFloor.hmini', 'F0'),
      el('div#hCombo.hmini.combo', ''),
      el('div#hIdle.hmini', '+0/s'),
    ));
    hud.appendChild(el('div.hudrow.meters',
      el('div.meter#mSave', el('i'), el('span', 'BALL SAVE')),
      el('div.meter.tilt#mTilt', el('i'), el('span', 'TILT')),
    ));
  }

  function updateHud() {
    const s = g.state;
    const set = (id, v) => { const n = $(id); if (n && n.textContent !== v) n.textContent = v; };
    set('hScore', U.fmtFull(g.run.score));
    set('hCoins', fmt(s.coins));
    set('hChips', fmt(g.run.chipsThisBall));
    set('hMult', g.mult.toFixed(g.mult < 10 ? 2 : 1));
    const mb = $('hMult');
    if (mb) mb.parentElement.classList.toggle('hot', g.mult > 6);
    set('hBalls', '●'.repeat(Math.max(0, g.run.ballsLeft)) || '—');
    const f = g.balls.length ? G.floorOf(g.balls[0].p.y) : 0;
    set('hFloor', 'F' + f + '  ×' + fmt(D.floorMult(f)));
    set('hIdle', '+' + fmt(g.idleRate) + '/s');
    const cb = $('hCombo');
    if (cb) {
      const live = (g.combo || 0) > 1 && (g.sinceHit || 0) < G.comboWindow();
      cb.textContent = live ? '🔗 ' + g.combo : '';
      cb.classList.toggle('live', live);
    }
    const ns = $('hNudge');
    if (ns) ns.textContent = 'NUDGE ' + g.nudgesLeft;

    // Ball-save and tilt meters only matter mid-ball, so they fade in and out.
    const saveMax = 2.5 * G.up('ballSave');
    const ms = $('mSave');
    if (ms) {
      const on = g.ballSaveT > 0 && saveMax > 0;
      ms.classList.toggle('on', on);
      if (on) ms.firstChild.style.width = (100 * g.ballSaveT / saveMax).toFixed(0) + '%';
    }
    const mt = $('mTilt');
    if (mt) {
      mt.classList.toggle('on', g.tilt > 0.02);
      mt.firstChild.style.width = (100 * U.clamp(g.tilt, 0, 1)).toFixed(0) + '%';
    }
  }

  /* ==================================================================
   * MENU DRAWER
   * =============================================================== */
  const TABS = [
    { id: 'shop', name: 'SHOP', emoji: '🛒' },
    { id: 'build', name: 'BUILD', emoji: '🔧' },
    { id: 'balls', name: 'BALLS', emoji: '⚪' },
    { id: 'trinkets', name: 'TRINKETS', emoji: '🃏' },
    { id: 'tasks', name: 'TASKS', emoji: '📋' },
    { id: 'upgrades', name: 'UPGRADES', emoji: '⬆️' },
    { id: 'tower', name: 'TOWER', emoji: '🏗️' },
    { id: 'panels', name: 'PANELS', emoji: '🎛️' },
    { id: 'stats', name: 'STATS', emoji: '📊' },
  ];

  function buildMenu() {
    const head = $('menuHead');
    head.innerHTML = '';
    head.appendChild(el('div.brand', el('span.bmark', '🏛'), el('span', 'TOWER OF CHIPS')));
    head.appendChild(el('div.purse',
      el('div.pcoin', el('span', '🪙'), el('b#mCoins', '0')),
      el('div.pgem', el('span', '💎'), el('b#mGems', '0')),
    ));
    head.appendChild(btn('▼ PLAY', { cls: 'collapse', onclick: () => setMenu(false) }));

    const tabs = $('menuTabs');
    tabs.innerHTML = '';
    for (const t of TABS) {
      tabs.appendChild(el('button.tab', {
        type: 'button', role: 'tab', 'data-tab': t.id, 'aria-label': t.name,
        onclick: () => { UI.tab = t.id; renderMenu(); },
      }, el('span.temoji', { 'aria-hidden': 'true' }, t.emoji), el('span.tname', t.name)));
    }
  }

  function setMenu(open) {
    UI.menuOpen = open;
    $('menu').classList.toggle('collapsed', !open);
    $('app').classList.toggle('menu-open', open);
    $('menu').setAttribute('aria-hidden', String(!open));
    if (open) renderMenu();
    // On desktop the drawer docks beside the table, so the canvas resizes.
    setTimeout(layout, 20);
    setTimeout(layout, 380);
    G.Sfx.resume();
  }

  function renderMenu() {
    U.$$('#menuTabs .tab').forEach((t) => {
      const on = t.dataset.tab === UI.tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    });
    const body = $('menuBody');
    body.innerHTML = '';
    body.scrollTop = 0;
    ({
      shop: renderShop, build: renderBuild, balls: renderBalls,
      trinkets: renderTrinkets, upgrades: renderUpgrades, tower: renderTower,
      panels: renderPanels, stats: renderStats, tasks: renderTasks,
    }[UI.tab] || renderShop)(body);
    updatePurse();
  }

  function updatePurse() {
    const c = $('mCoins'), gm = $('mGems');
    if (c) c.textContent = fmt(g.state.coins);
    if (gm) gm.textContent = fmt(g.state.gems);
  }

  /* ==================================================================
   * TAB: SHOP — buy parts
   * =============================================================== */
  const CATS = [
    { id: 'bounce', name: 'BOUNCERS', color: D.C.red },
    { id: 'score', name: 'SCORERS', color: D.C.gold },
    { id: 'flow', name: 'FLOW', color: D.C.teal },
    { id: 'control', name: 'CONTROL', color: D.C.cream },
    { id: 'idle', name: 'INCOME', color: D.C.green },
  ];

  function renderShop(root) {
    root.appendChild(section('THE SHOP', 'Buy a part, then drop it anywhere on an unlocked floor. Every part can be moved, levelled and sold later.'));

    const openFloors = g.state.floors;
    for (const cat of CATS) {
      const list = D.PARTS.filter((p) => p.cat === cat.id);
      if (!list.length) continue;
      root.appendChild(el('div.cathead', { style: { '--accent': cat.color } }, cat.name));
      const grid = el('div.grid');
      for (const def of list) {
        const cost = IP.table.partCost(g.state, def);
        const owned = g.state.parts.filter((p) => p.id === def.id).length;
        const lockedFloor = def.floor >= openFloors;
        const afford = g.state.coins >= cost && !lockedFloor;
        const c = card({ cls: 'part' + (afford ? '' : ' dim'), accent: def.color });
        c.appendChild(el('div.pico', { style: { background: def.color } }, def.emoji));
        c.appendChild(el('div.pname', def.name));
        c.appendChild(el('div.pdesc', def.desc));
        c.appendChild(el('div.pmeta',
          el('span.owned', owned ? '×' + owned : ''),
          lockedFloor ? el('span.lock', 'Needs floor ' + def.floor) : el('span.cost', '🪙 ' + fmt(cost)),
        ));
        c.appendChild(btn(lockedFloor ? 'LOCKED' : 'BUY & PLACE', {
          cls: 'buy', disabled: !afford,
          onclick: () => armPlacement(def.id),
        }));
        grid.appendChild(c);
      }
      root.appendChild(grid);
    }
  }

  function armPlacement(id) {
    const def = D.PART_BY_ID[id];
    const cost = IP.table.partCost(g.state, def);
    if (g.state.coins < cost) { toast('Not enough coins'); G.Sfx.play('error'); return; }
    UI.armed = id;
    enterBuild(Math.max(def.floor, g.build.floor));
    setMenu(false);
    toast('Tap the table to place ' + def.name);
    renderBuildBar();
  }

  /* ==================================================================
   * TAB: BUILD — manage what is already on the table
   * =============================================================== */
  function renderBuild(root) {
    root.appendChild(section('YOUR TOWER', 'Everything you own, floor by floor. Level parts up for more chips, or move them from the table view.'));
    root.appendChild(btn('🔧 OPEN BUILD MODE', { cls: 'wide primary', onclick: () => { enterBuild(g.build.floor); setMenu(false); } }));

    if (!g.state.parts.length) {
      root.appendChild(el('div.empty', 'No parts yet. Head to the SHOP and buy a Pop Bumper — it pays for itself fast.'));
      return;
    }
    for (let f = g.state.floors - 1; f >= 0; f--) {
      const ps = g.state.parts.filter((p) => p.floor === f);
      const fl = D.FLOORS[f];
      root.appendChild(el('div.cathead', { style: { '--accent': fl.accent } },
        'FLOOR ' + f + ' · ' + fl.name + '  ×' + fmt(D.floorMult(f)),
        el('span.slots', ps.length + '/' + IP.table.slotLimit(g.state))));
      if (!ps.length) { root.appendChild(el('div.empty.sm', 'Empty floor.')); continue; }
      const list = el('div.plist');
      for (const inst of ps) {
        const def = D.PART_BY_ID[inst.id];
        const cost = IP.table.upgradeCost(g.state, inst);
        const maxed = inst.lvl >= def.maxLevel;
        const row = el('div.prow');
        row.appendChild(el('div.pico.sm', { style: { background: def.color } }, def.emoji));
        const sub = def.uses
          ? def.usesLeft(inst) + ' / ' + def.maxUses(inst) + ' pops left'
          : def.idle
            ? '+' + fmt(def.idle(inst) * (1 + 0.16 * G.up('idleRate'))) + ' coins/s'
            : def.desc.slice(0, 46);
        row.appendChild(el('div.pinfo',
          el('b', def.name + ' · Lv' + inst.lvl),
          el('small', sub),
        ));
        row.appendChild(btn(maxed ? 'MAX' : '⬆ ' + fmt(cost), {
          cls: 'sm', disabled: maxed || g.state.coins < cost,
          onclick: () => { if (G.levelPart(inst.uid)) renderMenu(); },
        }));
        row.appendChild(btn('📍', {
          cls: 'sm ghost', title: 'Locate on table',
          onclick: () => { enterBuild(inst.floor); g.build.sel = inst; setMenu(false); renderBuildBar(); },
        }));
        row.appendChild(btn('💰', {
          cls: 'sm ghost', title: 'Sell for ' + fmt(IP.table.refundValue(g.state, inst)),
          onclick: () => confirmModal('Sell ' + def.name + '?', 'You get back 🪙 ' + fmt(IP.table.refundValue(g.state, inst)) + '.', () => { G.sellPart(inst.uid); renderMenu(); }),
        }));
        list.appendChild(row);
      }
      root.appendChild(list);
    }
  }

  /* ==================================================================
   * TAB: BALLS
   * =============================================================== */
  function renderBalls(root) {
    root.appendChild(section('BALL COLLECTION', 'Each ball rewrites how the table plays. The selected ball is used for every ball of every run.'));
    const grid = el('div.grid.balls');
    for (const b of D.BALLS) {
      const owned = !!g.state.balls[b.id];
      const sel = g.state.loadout === b.id;
      const c = card({ cls: 'ball' + (sel ? ' sel' : '') + (owned ? '' : ' dim'), accent: b.color });
      c.appendChild(el('div.borb', { style: { background: `radial-gradient(circle at 32% 30%, #fff, ${b.color} 55%, ${U.shade(b.color, -0.35)})` } }));
      c.appendChild(el('div.pname', b.name));
      c.appendChild(el('div.pdesc', b.desc));
      const lvl = G.ballLevel(b.id);
      c.appendChild(el('div.bstats',
        chip('CHIPS', '×' + (owned ? D.ballScore(b, lvl) : b.score).toFixed(2), D.C.blue),
        chip('COINS', '×' + (owned ? D.ballCoin(b, lvl) : b.coin).toFixed(2), D.C.gold),
        chip('GRAV', b.grav.toFixed(2), D.C.purple),
        chip('BOUNCE', b.e.toFixed(2), D.C.red),
        chip('MASS', b.mass.toFixed(2), D.C.cream),
      ));
      c.appendChild(owned
        ? btn(sel ? '✔ EQUIPPED' : 'EQUIP', { cls: 'buy' + (sel ? ' on' : ''), disabled: sel, onclick: () => { G.selectBall(b.id); renderMenu(); } })
        : btn('🪙 ' + fmt(b.cost), { cls: 'buy', disabled: g.state.coins < b.cost, onclick: () => { if (G.buyBall(b.id)) { G.selectBall(b.id); renderMenu(); } } }));
      if (owned) {
        const maxed = lvl >= D.BALL_MAX_LEVEL;
        const pc = D.ballPolishCost(b, lvl);
        c.appendChild(btn(maxed ? 'POLISHED · MAX' : 'POLISH Lv' + lvl + ' → ' + (lvl + 1) + '  🪙 ' + fmt(pc), {
          cls: 'sm', disabled: maxed || g.state.coins < pc,
          onclick: () => { G.polishBall(b.id); renderMenu(); },
        }));
      }
      grid.appendChild(c);
    }
    root.appendChild(grid);
  }

  function chip(k, v, color) {
    return el('div.bstat', { style: { '--accent': color } }, el('small', k), el('b', v));
  }

  /* ==================================================================
   * TAB: TRINKETS
   * =============================================================== */
  function renderTrinkets(root) {
    const slots = G.trinketSlots();
    root.appendChild(section('TRINKETS', `Rule-benders. You may hold ${slots} at once (raise that in UPGRADES).`));

    const held = el('div.slots');
    for (let i = 0; i < slots; i++) {
      const id = g.state.trinkets[i];
      const t = id ? D.TRINKET_BY_ID[id] : null;
      const r = t ? D.RARITY[t.rarity] : null;
      const s = el('div.slot' + (t ? ' filled' : ''), { style: { '--accent': r ? r.color : '#555' } });
      if (t) {
        s.appendChild(el('div.temoji', t.emoji));
        s.appendChild(el('div.tname', t.name));
        s.appendChild(btn('SELL', { cls: 'sm ghost', onclick: () => { G.sellTrinket(t.id); renderMenu(); } }));
      } else s.appendChild(el('div.tempty', 'EMPTY'));
      held.appendChild(s);
    }
    root.appendChild(held);

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.purple } }, 'AVAILABLE'));
    const grid = el('div.grid');
    for (const t of D.TRINKETS) {
      const have = g.state.trinkets.includes(t.id);
      const r = D.RARITY[t.rarity];
      const full = g.state.trinkets.length >= slots;
      const c = card({ cls: 'trinket' + (have ? ' sel' : ''), accent: r.color });
      c.appendChild(el('div.trare', { style: { background: r.color } }, r.name));
      c.appendChild(el('div.temoji.big', t.emoji));
      c.appendChild(el('div.pname', t.name));
      c.appendChild(el('div.pdesc', t.desc));
      c.appendChild(have
        ? btn('OWNED', { cls: 'buy on', disabled: true })
        : btn('🪙 ' + fmt(t.cost), { cls: 'buy', disabled: g.state.coins < t.cost || full, onclick: () => { if (G.buyTrinket(t.id)) renderMenu(); else toast(full ? 'No free trinket slots' : 'Not enough coins'); } }));
      grid.appendChild(c);
    }
    root.appendChild(grid);
  }

  /* ==================================================================
   * TAB: TASKS — three rolling objectives
   * =============================================================== */
  function renderTasks(root) {
    G.ensureMissions();
    root.appendChild(section('TASKS', 'Three jobs at a time. Finish one, claim the coins, and a harder one takes its place.'));
    const rerollCost = 150 + 60 * (g.state.stats.missionsDone || 0);

    g.state.missions.forEach((m, i) => {
      const pr = G.missionProgress(m);
      if (!pr.def) return;
      const pct = U.clamp(pr.have / pr.need, 0, 1);
      const c = card({ cls: 'task' + (pr.done ? ' done' : ''), accent: pr.done ? D.C.green : D.C.blue });
      c.appendChild(el('div.trow2',
        el('div.pico.sm', { style: { background: pr.done ? D.C.green : D.C.blue } }, pr.def.emoji),
        el('div.pinfo', el('b', pr.def.text(pr.need)), el('small', 'Tier ' + (m.tier + 1))),
      ));
      c.appendChild(el('div.bar', el('div.fill', { style: { width: (pct * 100).toFixed(1) + '%' } })));
      c.appendChild(el('div.pmeta',
        el('span.owned', fmt(Math.min(pr.have, pr.need)) + ' / ' + fmt(pr.need)),
        el('span.cost', '🪙 ' + fmt(pr.pay)),
      ));
      c.appendChild(el('div.taskacts',
        btn(pr.done ? 'CLAIM' : 'IN PROGRESS', {
          cls: 'buy' + (pr.done ? ' on' : ''), disabled: !pr.done,
          onclick: () => { G.claimMission(i); renderMenu(); },
        }),
        btn('SWAP 🪙' + fmt(rerollCost), {
          cls: 'sm ghost', title: 'Swap this task for another',
          disabled: g.state.coins < rerollCost,
          onclick: () => { G.rerollMission(i); renderMenu(); },
        }),
      ));
      root.appendChild(c);
    });

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.gold } }, 'CAREER'));
    const box = el('div.statbox');
    box.appendChild(statRow('Tasks completed', fmt(g.state.stats.missionsDone || 0)));
    box.appendChild(statRow('Best combo', fmt(g.state.stats.bestCombo || 0) + ' hits'));
    box.appendChild(statRow('Lifetime part hits', fmt(g.state.counters.hits || 0)));
    box.appendChild(statRow('Floor openings climbed', fmt(g.state.counters.climbs || 0)));
    box.appendChild(statRow('Jackpots collected', fmt(g.state.counters.jackpots || 0)));
    root.appendChild(box);
  }

  /* ==================================================================
   * TAB: UPGRADES
   * =============================================================== */
  const UGROUPS = [
    { id: 'table', name: 'TABLE FEEL', color: D.C.teal },
    { id: 'run', name: 'THE RUN', color: D.C.red },
    { id: 'score', name: 'SCORING', color: D.C.gold },
    { id: 'idle', name: 'AUTOMATION', color: D.C.green },
    { id: 'build', name: 'CONSTRUCTION', color: D.C.purple },
  ];

  /** Cost of buying `n` more levels of `u` from its current level. */
  function bulkCost(u, lvl, n) {
    let c = 0;
    for (let i = 0; i < n && lvl + i < u.max; i++) c += D.upgradeCost(u, lvl + i);
    return c;
  }
  /** How many levels the current purse can actually cover. */
  function affordableLevels(u, lvl, want) {
    let c = 0, n = 0;
    while (n < want && lvl + n < u.max) {
      const next = D.upgradeCost(u, lvl + n);
      if (c + next > g.state.coins) break;
      c += next; n++;
    }
    return { n, c };
  }

  function renderUpgrades(root) {
    root.appendChild(section('UPGRADES', 'Permanent. These survive every run — only a Reforge resets them.'));

    const bulks = [1, 10, 'MAX'];
    const picker = el('div.bulkrow', el('span', 'BUY'));
    for (const b of bulks) {
      picker.appendChild(btn('×' + b, {
        cls: 'sm' + (UI.bulk === b ? ' primary' : ' ghost'),
        onclick: () => { UI.bulk = b; renderMenu(); },
      }));
    }
    root.appendChild(picker);

    for (const grp of UGROUPS) {
      root.appendChild(el('div.cathead', { style: { '--accent': grp.color } }, grp.name));
      const list = el('div.plist');
      for (const u of D.UPGRADES.filter((x) => x.group === grp.id)) {
        const lvl = G.up(u.id);
        const maxed = lvl >= u.max;
        const want = UI.bulk === 'MAX' ? u.max - lvl : UI.bulk;
        const aff = affordableLevels(u, lvl, Math.max(1, want));
        const buyN = Math.max(1, UI.bulk === 'MAX' ? aff.n : Math.min(want, u.max - lvl));
        const cost = UI.bulk === 'MAX' ? aff.c : bulkCost(u, lvl, buyN);
        const row = el('div.prow.up');
        row.appendChild(el('div.pico.sm', { style: { background: grp.color } }, u.emoji));
        row.appendChild(el('div.pinfo',
          el('b', u.name + '  ' + (maxed ? 'MAX' : 'Lv' + lvl + '/' + u.max)),
          el('small', u.desc),
          el('small.eff', u.fmt(lvl) + (maxed || buyN < 2 ? '' : '  →  ' + u.fmt(lvl + buyN))),
        ));
        row.appendChild(btn(maxed ? 'MAX' : (buyN > 1 ? '×' + buyN + '  ' : '') + '🪙 ' + fmt(cost), {
          cls: 'sm', disabled: maxed || cost <= 0 || g.state.coins < cost,
          onclick: () => { for (let i = 0; i < buyN; i++) if (!G.buyUpgrade(u.id)) break; renderMenu(); },
        }));
        list.appendChild(row);
      }
      root.appendChild(list);
    }
  }

  /* ==================================================================
   * TAB: TOWER — floors + prestige
   * =============================================================== */
  function renderTower(root) {
    root.appendChild(section('THE TOWER', 'Every floor multiplies the chips scored on it. Buy height, then fill it with parts.'));
    const list = el('div.floors');
    for (let k = D.W.MAX_FLOORS - 1; k >= 0; k--) {
      const open = k < g.state.floors;
      const next = k === g.state.floors;
      const f = D.FLOORS[k];
      const row = el('div.frow' + (open ? ' open' : next ? ' next' : ' locked'), { style: { '--accent': f.accent } });
      row.appendChild(el('div.fnum', 'F' + k));
      row.appendChild(el('div.finfo', el('b', f.name), el('small', f.blurb)));
      row.appendChild(el('div.fmult', '×' + fmt(D.floorMult(k))));
      if (open) row.appendChild(el('div.fstate', G.slotsUsed(k) + '/' + IP.table.slotLimit(g.state) + ' built'));
      else if (next) row.appendChild(btn('🪙 ' + fmt(D.floorCost(k)), { cls: 'sm', disabled: g.state.coins < D.floorCost(k), onclick: () => { if (G.buyFloor()) renderMenu(); } }));
      else row.appendChild(el('div.fstate', '🔒'));
      list.appendChild(row);
    }
    root.appendChild(list);

    const gems = D.prestigeGems(g.state.stats.totalChips);
    root.appendChild(el('div.cathead', { style: { '--accent': D.C.pink } }, 'REFORGE'));
    const p = card({ cls: 'prestige', accent: D.C.pink });
    p.appendChild(el('div.pname', '♻️ Reforge the Tower'));
    p.appendChild(el('div.pdesc', 'Melt the whole tower down for GEMS. You lose coins, parts, floors, balls, trinkets and upgrades — but every gem permanently boosts all chips and coins by 15%.'));
    p.appendChild(el('div.bstats',
      chip('GEMS NOW', fmt(g.state.gems), D.C.pink),
      chip('ON REFORGE', '+' + fmt(gems), D.C.gold),
      chip('BONUS', '×' + D.gemBonus(g.state.gems).toFixed(2), D.C.green),
      chip('AFTER', '×' + D.gemBonus(g.state.gems + gems).toFixed(2), D.C.blue),
    ));
    p.appendChild(btn(gems > 0 ? 'REFORGE FOR ' + fmt(gems) + ' 💎' : 'NEED MORE LIFETIME CHIPS', {
      cls: 'buy', disabled: gems <= 0,
      onclick: () => confirmModal('Reforge the tower?', 'You will restart with ' + fmt(g.state.gems + gems) + ' gems and a permanent ×' + D.gemBonus(g.state.gems + gems).toFixed(2) + ' to chips and coins.', () => { G.prestige(); renderMenu(); }),
    }));
    root.appendChild(p);

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.purple } }, 'GEM PERKS',
      el('span.slots', '💎 ' + fmt(g.state.gems))));
    root.appendChild(el('div.sectitle', el('p', 'Bought with gems and never reset — not even by a Reforge.')));
    const plist = el('div.plist');
    for (const pk of D.PERKS) {
      const lvl = G.perk(pk.id);
      const maxed = lvl >= pk.max;
      const cost = D.perkCost(pk, lvl);
      const row = el('div.prow.up');
      row.appendChild(el('div.pico.sm', { style: { background: D.C.pink } }, pk.emoji));
      row.appendChild(el('div.pinfo',
        el('b', pk.name + '  ' + (maxed ? 'MAX' : 'Lv' + lvl + '/' + pk.max)),
        el('small', pk.desc),
        el('small.eff', pk.fmt(lvl)),
      ));
      row.appendChild(btn(maxed ? 'MAX' : '💎 ' + fmt(cost), {
        cls: 'sm', disabled: maxed || g.state.gems < cost,
        onclick: () => { if (G.buyPerk(pk.id)) renderMenu(); },
      }));
      plist.appendChild(row);
    }
    root.appendChild(plist);
  }

  /* ==================================================================
   * TAB: PANELS — manual control config
   * =============================================================== */
  function renderPanels(root) {
    root.appendChild(section('CONTROL PANELS', 'Six panels, each a key of your choosing. Assign any paddle you build to any panel, then flip them yourself.'));

    const flippers = (g.world ? g.world.flippers : []);
    for (let i = 0; i < 6; i++) {
      const pan = g.state.panels[i];
      const mine = flippers.filter((f) => f.panel === i);
      const c = card({ cls: 'panelcard', accent: i < 2 ? D.C.gold : D.C.teal });
      c.appendChild(el('div.pname', 'PANEL ' + (i + 1)));
      c.appendChild(el('div.keyrow',
        el('span', 'KEY'),
        btn(UI.rebinding === i ? 'PRESS A KEY…' : keyLabel(pan.key), {
          cls: 'key' + (UI.rebinding === i ? ' listening' : ''),
          onclick: () => { UI.rebinding = UI.rebinding === i ? -1 : i; renderMenu(); },
        }),
      ));
      c.appendChild(el('div.pdesc', mine.length
        ? mine.map((f) => (f.part ? D.PART_BY_ID[f.part.id].name + ' (F' + f.part.floor + ')' : 'Main flipper')).join(' · ')
        : 'Nothing assigned yet.'));
      // Test button — press-and-hold to see it move.
      const t = btn('HOLD TO TEST', { cls: 'sm ghost' });
      const press = (v) => () => { mine.forEach((f) => { f.humanPress = v; f.pressed = v; }); };
      t.addEventListener('pointerdown', press(true));
      t.addEventListener('pointerup', press(false));
      t.addEventListener('pointerleave', press(false));
      c.appendChild(t);
      root.appendChild(c);
    }

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.cream } }, 'PADDLE ASSIGNMENT'));
    const pads = g.state.parts.filter((p) => { const d = D.PART_BY_ID[p.id]; return d && d.flipper; });
    if (!pads.length) root.appendChild(el('div.empty', 'Buy a Paddle in the SHOP to add flippers on higher floors.'));
    for (const inst of pads) {
      const def = D.PART_BY_ID[inst.id];
      const row = el('div.prow');
      row.appendChild(el('div.pico.sm', { style: { background: def.color } }, def.emoji));
      row.appendChild(el('div.pinfo', el('b', def.name + ' · F' + inst.floor), el('small', 'Side ' + (inst.side || 'L'))));
      row.appendChild(btn('SIDE ' + (inst.side === 'R' ? 'R' : 'L'), {
        cls: 'sm ghost', onclick: () => { inst.side = inst.side === 'R' ? 'L' : 'R'; G.rebuild(); G.save(); renderMenu(); },
      }));
      const sel = el('select.psel', { onchange: (e) => { inst.panel = +e.target.value; G.rebuild(); G.save(); } });
      for (let i = 0; i < 6; i++) sel.appendChild(el('option', { value: i, selected: (inst.panel || 0) === i }, 'PANEL ' + (i + 1)));
      if (def.auto) { sel.disabled = true; }
      row.appendChild(sel);
      root.appendChild(row);
    }

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.purple } }, 'OTHER CONTROLS'));
    const help = el('div.helpgrid');
    [['SPACE / hold', 'Charge and fire the plunger'],
     ['N / ←→ while playing', 'Nudge the table (limited, tilts if spammed)'],
     ['B', 'Toggle build mode'],
     ['TAB or ESC', 'Open and close the menu'],
     ['Tap left / right of the table', 'Panels 1 and 2'],
     ['Drag in build mode', 'Move parts around'],
     ['Drag from a loaded cannon', 'Aim, release to fire']].forEach(([k, v]) => help.appendChild(el('div.hrow', el('kbd', k), el('span', v))));
    root.appendChild(help);
  }

  function keyLabel(k) {
    if (!k) return '—';
    return ({ ' ': 'SPACE', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓' }[k] || k).toUpperCase();
  }

  /* ==================================================================
   * TAB: STATS + settings
   * =============================================================== */
  function renderStats(root) {
    const s = g.state.stats;
    root.appendChild(section('STATS', 'How the tower is doing.'));
    const box = el('div.statbox');
    [
      ['Lifetime chips', U.fmtFull(s.totalChips)],
      ['Best run', U.fmtFull(s.bestRun)],
      ['Highest floor', 'F' + s.bestFloor + (D.FLOORS[s.bestFloor] ? ' · ' + D.FLOORS[s.bestFloor].name : '')],
      ['Best MULT', '×' + s.bestMult.toFixed(1)],
      ['Runs played', fmt(s.runs)],
      ['Balls drained', fmt(s.drains)],
      ['Parts placed', fmt(s.placed)],
      ['Idle income', fmt(G.idlePerSec()) + ' coins/s'],
      ['Coins per chip', G.coinRate().toFixed(4)],
      ['Balls per run', String(G.ballsPerRun())],
      ['Gems', fmt(g.state.gems) + '  (×' + D.gemBonus(g.state.gems).toFixed(2) + ')'],
      ['Time played', U.fmtTime(s.playTime)],
      ['Reforges', fmt(s.prestiges)],
    ].forEach(([k, v]) => box.appendChild(statRow(k, v)));
    root.appendChild(box);

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.gold } }, 'MEDALS'));
    const mg = el('div.medals');
    for (const m of D.MEDALS) {
      const got = !!g.state.medals[m.id];
      mg.appendChild(el('div.medal' + (got ? ' got' : ''), { title: m.desc },
        el('div.mem', m.emoji), el('div.mname', m.name), el('div.mdesc', m.desc)));
    }
    root.appendChild(mg);

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.teal } }, 'SETTINGS'));
    const st = el('div.plist');
    const toggles = [
      ['sound', 'Sound effects'], ['shake', 'Screen shake'],
      ['particles', 'Particles'], ['autoRun', 'Start the next run automatically'],
      ['assist', 'Flipper assist (needs the Autoplunger upgrade)'],
    ];
    for (const [k, name] of toggles) {
      const row = el('div.prow');
      row.appendChild(el('div.pinfo', el('b', name)));
      const b = btn(g.state.settings[k] ? 'ON' : 'OFF', {
        cls: 'sm' + (g.state.settings[k] ? '' : ' ghost'),
        onclick: () => {
          g.state.settings[k] = !g.state.settings[k];
          if (k === 'sound') G.Sfx.enabled = g.state.settings[k];
          G.save(); renderMenu();
        },
      });
      row.appendChild(b);
      st.appendChild(row);
    }
    root.appendChild(st);

    root.appendChild(el('div.dangerrow',
      btn('HOW TO PLAY', { cls: 'ghost', onclick: showTutorial }),
      btn('WIPE SAVE', { cls: 'danger', onclick: () => confirmModal('Wipe your save?', 'Everything goes: coins, parts, floors, gems. There is no undo.', () => { G.wipe(); renderMenu(); }) }),
    ));
  }

  /* ==================================================================
   * BUILD MODE
   * =============================================================== */
  function enterBuild(floor) {
    g.build.on = true;
    g.build.floor = U.clamp(floor != null ? floor : g.build.floor, 0, g.state.floors - 1);
    $('app').classList.add('building');
    renderBuildBar();
  }

  function exitBuild() {
    g.build.on = false;
    g.build.sel = null;
    g.build.ghost = null;
    UI.armed = null;
    $('app').classList.remove('building');
    renderBuildBar();
  }

  function renderBuildBar() {
    const bar = $('buildBar');
    bar.innerHTML = '';
    if (!g.build.on) return;

    const top = el('div.bbtop');
    top.appendChild(btn('◀', { cls: 'sm', disabled: g.build.floor <= 0, onclick: () => { g.build.floor--; renderBuildBar(); } }));
    top.appendChild(el('div.bfloor',
      el('b', 'FLOOR ' + g.build.floor),
      el('small', (D.FLOORS[g.build.floor] || {}).name + ' · ' + G.slotsUsed(g.build.floor) + '/' + IP.table.slotLimit(g.state) + ' slots')));
    top.appendChild(btn('▶', { cls: 'sm', disabled: g.build.floor >= g.state.floors - 1, onclick: () => { g.build.floor++; renderBuildBar(); } }));
    top.appendChild(btn('✕ DONE', { cls: 'sm primary', onclick: exitBuild }));
    bar.appendChild(top);

    if (UI.armed) {
      const def = D.PART_BY_ID[UI.armed];
      bar.appendChild(el('div.bbhint', 'Tap the table to place ', el('b', def.emoji + ' ' + def.name),
        ' — 🪙 ' + fmt(IP.table.partCost(g.state, def)),
        btn('CANCEL', { cls: 'sm ghost', onclick: () => { UI.armed = null; g.build.ghost = null; renderBuildBar(); } })));
      return;
    }

    const sel = g.build.sel;
    if (sel) {
      const def = D.PART_BY_ID[sel.id];
      const row = el('div.bbsel');
      row.appendChild(el('div.pico.sm', { style: { background: def.color } }, def.emoji));
      row.appendChild(el('div.pinfo', el('b', def.name + ' Lv' + sel.lvl), el('small', 'Drag it to move')));
      if (def.rot) {
        row.appendChild(btn('↺', { cls: 'sm', onclick: () => { G.rotatePart(sel.uid, -Math.PI / 12); } }));
        row.appendChild(btn('↻', { cls: 'sm', onclick: () => { G.rotatePart(sel.uid, Math.PI / 12); } }));
      }
      if (def.flipper) {
        row.appendChild(btn('SIDE ' + (sel.side === 'R' ? 'R' : 'L'), { cls: 'sm', onclick: () => { sel.side = sel.side === 'R' ? 'L' : 'R'; G.rebuild(); G.save(); renderBuildBar(); } }));
        row.appendChild(btn('P' + ((sel.panel || 0) + 1), { cls: 'sm', title: 'Cycle control panel', onclick: () => { sel.panel = ((sel.panel || 0) + 1) % 6; G.rebuild(); G.save(); renderBuildBar(); } }));
      }
      const cost = IP.table.upgradeCost(g.state, sel);
      row.appendChild(btn(sel.lvl >= def.maxLevel ? 'MAX' : '⬆ ' + fmt(cost), {
        cls: 'sm', disabled: sel.lvl >= def.maxLevel || g.state.coins < cost,
        onclick: () => { G.levelPart(sel.uid); renderBuildBar(); },
      }));
      row.appendChild(btn('💰 ' + fmt(IP.table.refundValue(g.state, sel)), {
        cls: 'sm ghost', onclick: () => { G.sellPart(sel.uid); g.build.sel = null; renderBuildBar(); },
      }));
      bar.appendChild(row);
    } else {
      bar.appendChild(el('div.bbhint', 'Tap a part to select it, or ',
        btn('OPEN SHOP', { cls: 'sm primary', onclick: () => { UI.tab = 'shop'; setMenu(true); } })));
    }

    // Quick tray of the cheapest few parts for fast building.
    const tray = el('div.tray');
    const affordable = D.PARTS
      .filter((p) => p.floor <= g.build.floor)
      .map((p) => ({ p, c: IP.table.partCost(g.state, p) }))
      .sort((a, b) => a.c - b.c).slice(0, 10);
    for (const { p, c } of affordable) {
      tray.appendChild(el('button.trayitem' + (g.state.coins >= c ? '' : '.dim'), {
        type: 'button', style: { '--accent': p.color },
        title: p.name + ' — ' + fmt(c) + ' coins',
        'aria-label': 'Buy ' + p.name + ' for ' + fmt(c) + ' coins',
        onclick: () => armPlacement(p.id),
      }, el('span.tie', { 'aria-hidden': 'true' }, p.emoji), el('span.tic', fmt(c))));
    }
    bar.appendChild(tray);
  }

  /* ==================================================================
   * CANVAS INPUT
   * =============================================================== */
  function setupCanvas() {
    const cv = $('cv');
    const pointers = new Map();

    function worldAt(ev) {
      const r = cv.getBoundingClientRect();
      return g.renderer.toWorld(ev.clientX - r.left, ev.clientY - r.top);
    }

    function hitPart(w) {
      let best = null, bd = 1e9;
      for (const p of g.state.parts) {
        if (p.floor !== g.build.floor) continue;
        const def = D.PART_BY_ID[p.id];
        const d = Math.hypot(p.x - w.x, p.y - w.y);
        if (d < (def.r + 3) && d < bd) { bd = d; best = p; }
      }
      return best;
    }

    cv.addEventListener('pointerdown', (ev) => {
      cv.setPointerCapture(ev.pointerId);
      G.Sfx.resume();
      const w = worldAt(ev);
      pointers.set(ev.pointerId, { start: w, w, mode: null });
      const P = pointers.get(ev.pointerId);

      if (g.build.on) {
        if (UI.armed) { P.mode = 'ghost'; updateGhost(w); return; }
        const hit = hitPart(w);
        if (hit) { g.build.sel = hit; P.mode = 'drag'; P.uid = hit.uid; P.off = { x: hit.x - w.x, y: hit.y - w.y }; renderBuildBar(); }
        else { g.build.sel = null; P.mode = 'pan'; renderBuildBar(); }
        return;
      }

      if (g.cannon) { P.mode = 'aim'; aimCannon(w); return; }

      const r = cv.getBoundingClientRect();
      const relX = (ev.clientX - r.left) / r.width;
      const relY = (ev.clientY - r.top) / r.height;
      // Bottom-right corner while waiting = plunger.
      if (g.awaitLaunch && relX > 0.72 && relY > 0.62) { P.mode = 'plunge'; G.plungerDown(); return; }
      P.mode = 'flip';
      P.panel = relX < 0.5 ? 0 : 1;
      pressPanel(P.panel, true);
    });

    cv.addEventListener('pointermove', (ev) => {
      const P = pointers.get(ev.pointerId);
      if (!P) return;
      const w = worldAt(ev);
      P.w = w;
      if (P.mode === 'ghost') updateGhost(w);
      else if (P.mode === 'drag') {
        const inst = g.state.parts.find((p) => p.uid === P.uid);
        if (inst) {
          const def = D.PART_BY_ID[inst.id];
          const pos = IP.table.clampPos(w.x + P.off.x, w.y + P.off.y, g.build.floor, def);
          g.build.ghost = Object.assign({}, inst, { x: IP.table.snap(pos.x), y: IP.table.snap(pos.y) });
          g.build.ghostErr = IP.table.placeError(g.state, def, g.build.ghost.x, g.build.ghost.y, g.build.floor, inst.uid);
        }
      } else if (P.mode === 'aim') aimCannon(w);
    });

    function endPointer(ev) {
      const P = pointers.get(ev.pointerId);
      if (!P) return;
      pointers.delete(ev.pointerId);
      if (P.mode === 'flip') pressPanel(P.panel, false);
      else if (P.mode === 'plunge') G.plungerRelease();
      else if (P.mode === 'aim') G.fireCannon();
      else if (P.mode === 'ghost') {
        const w = P.w;
        const def = D.PART_BY_ID[UI.armed];
        const pos = IP.table.clampPos(w.x, w.y, g.build.floor, def);
        const res = G.buyPart(UI.armed, IP.table.snap(pos.x), IP.table.snap(pos.y), g.build.floor, 0);
        if (res.ok) {
          g.build.sel = res.inst;
          toast(def.name + ' placed');
          const nextCost = IP.table.partCost(g.state, def);
          if (g.state.coins < nextCost) UI.armed = null;
        } else { toast(res.err); G.Sfx.play('error'); }
        g.build.ghost = null;
        renderBuildBar();
      } else if (P.mode === 'drag') {
        const gh = g.build.ghost;
        if (gh && !g.build.ghostErr) G.movePart(P.uid, gh.x, gh.y, g.build.floor);
        else if (gh) toast(g.build.ghostErr);
        g.build.ghost = null;
        renderBuildBar();
      }
    }
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);

    function updateGhost(w) {
      const def = D.PART_BY_ID[UI.armed];
      if (!def) return;
      const pos = IP.table.clampPos(w.x, w.y, g.build.floor, def);
      g.build.ghost = IP.table.newInstance(UI.armed, IP.table.snap(pos.x), IP.table.snap(pos.y), g.build.floor, 0);
      g.build.ghostErr = IP.table.placeError(g.state, def, g.build.ghost.x, g.build.ghost.y, g.build.floor, null);
    }

    function aimCannon(w) {
      if (!g.cannon) return;
      const dx = w.x - g.cannon.inst.x, dy = w.y - g.cannon.inst.y;
      g.cannon.ang = Math.atan2(dy, dx);
      g.cannon.power = U.clamp(Math.hypot(dx, dy) / 30, 0.35, 1);
    }
  }

  function pressPanel(i, down) {
    if (!g.world) return;
    for (const f of g.world.flippers) {
      if (f.panel !== i || f.auto || f.wheel) continue;
      f.humanPress = down;
      f.pressed = down || (f.autoPress && (g.demo || (g.state.settings.assist && G.up('autoPlay') > 0))) || false;
    }
    if (down) G.Sfx.enabled && G.Sfx.play('flip', U.rand(-0.05, 0.05));
  }

  /* ==================================================================
   * KEYBOARD
   * =============================================================== */
  function setupKeys() {
    const down = new Set();
    global.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (UI.rebinding >= 0) {
        e.preventDefault();
        g.state.panels[UI.rebinding].key = k;
        UI.rebinding = -1;
        G.save(); renderMenu();
        return;
      }
      if (e.repeat) return;
      if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      down.add(k);
      G.Sfx.resume();

      const pi = g.state.panels.findIndex((p) => p.key === k);
      if (pi >= 0) { pressPanel(pi, true); e.preventDefault(); return; }

      switch (k) {
        case ' ': G.plungerDown(); e.preventDefault(); break;
        case 'n': G.nudge(0); break;
        case 'arrowleft': if (!UI.menuOpen) G.nudge(-1); break;
        case 'arrowright': if (!UI.menuOpen) G.nudge(1); break;
        case 'b': g.build.on ? exitBuild() : (setMenu(false), enterBuild(g.build.floor)); break;
        case 'tab': case 'escape': e.preventDefault(); setMenu(!UI.menuOpen); break;
        case 'r': if (e.shiftKey) G.startRun(); break;
        default: break;
      }
    });
    global.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      down.delete(k);
      const pi = g.state.panels.findIndex((p) => p.key === k);
      if (pi >= 0) pressPanel(pi, false);
      if (k === ' ') G.plungerRelease();
    });
    global.addEventListener('blur', () => {
      down.clear();
      if (g.world) g.world.flippers.forEach((f) => { f.humanPress = false; f.pressed = false; });
    });
  }

  /* ==================================================================
   * GAMEPAD — shoulder buttons are flippers, exactly like a real cabinet.
   * =============================================================== */
  const PAD_MAP = [
    { btns: [4, 6], act: 'panel', panel: 0 },
    { btns: [5, 7], act: 'panel', panel: 1 },
    { btns: [2], act: 'panel', panel: 2 },
    { btns: [3], act: 'panel', panel: 3 },
    { btns: [0], act: 'plunge' },
    { btns: [1], act: 'nudge' },
    { btns: [14], act: 'nudgeL' },
    { btns: [15], act: 'nudgeR' },
    { btns: [9], act: 'menu' },
  ];
  const padPrev = {};

  function pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let any = null;
    for (const p of pads) if (p && p.connected) { any = p; break; }
    if (!any) return;
    for (let i = 0; i < PAD_MAP.length; i++) {
      const m = PAD_MAP[i];
      const down = m.btns.some((b) => any.buttons[b] && any.buttons[b].pressed);
      const was = !!padPrev[i];
      if (down === was) continue;
      padPrev[i] = down;
      switch (m.act) {
        case 'panel': pressPanel(m.panel, down); break;
        case 'plunge': down ? G.plungerDown() : G.plungerRelease(); break;
        case 'nudge': if (down) G.nudge(0); break;
        case 'nudgeL': if (down) G.nudge(-1); break;
        case 'nudgeR': if (down) G.nudge(1); break;
        case 'menu': if (down) setMenu(!UI.menuOpen); break;
        default: break;
      }
    }
  }

  /* ==================================================================
   * TABLE-SIDE CONTROLS
   * =============================================================== */
  function buildTableUI() {
    const ui = $('tableUI');
    ui.innerHTML = '';
    ui.appendChild(el('div.tleft',
      btn('☰ MENU', { cls: 'chip', onclick: () => setMenu(true) }),
      btn('🔧 BUILD', { cls: 'chip', onclick: () => { g.build.on ? exitBuild() : enterBuild(g.build.floor); } }),
    ));
    ui.appendChild(el('div.tright',
      btn('👊 NUDGE', { cls: 'chip', id: 'hNudge', onclick: () => G.nudge(U.chance(0.5) ? -1 : 1) }),
      btn('🔁 NEW RUN', { cls: 'chip', onclick: () => G.startRun() }),
    ));

    const pads = el('div.panelbtns#panelBtns');
    ui.appendChild(pads);

    ui.appendChild(el('button.guide#guide', { type: 'button', onclick: () => {
      const step = D.nextGuide(g.state);
      if (step && step.tab) { UI.tab = step.tab; setMenu(true); }
    } }, el('span.gmark', '▶'), el('span.gtext#guideText', '')));

    const launch = el('button.launchbtn#launchBtn', 'PULL & LAUNCH');
    launch.addEventListener('pointerdown', (e) => { e.preventDefault(); G.plungerDown(); });
    launch.addEventListener('pointerup', () => G.plungerRelease());
    launch.addEventListener('pointerleave', () => { if (g.plunger.holding) G.plungerRelease(); });
    ui.appendChild(launch);
  }

  /** On-screen buttons for panels 3-6 (only when something uses them). */
  function refreshPanelButtons() {
    const host = $('panelBtns');
    if (!host || !g.world) return;
    const used = new Set(g.world.flippers.filter((f) => !f.auto && !f.wheel).map((f) => f.panel));
    const want = [2, 3, 4, 5].filter((i) => used.has(i));
    const sig = want.join(',');
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig;
    host.innerHTML = '';
    for (const i of want) {
      const b = el('button.pbtn', { type: 'button', 'aria-label': 'Control panel ' + (i + 1) }, 'P' + (i + 1));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); pressPanel(i, true); b.classList.add('on'); });
      b.addEventListener('pointerup', () => { pressPanel(i, false); b.classList.remove('on'); });
      b.addEventListener('pointerleave', () => { pressPanel(i, false); b.classList.remove('on'); });
      host.appendChild(b);
    }
  }

  /** One-line "do this next" prompt; disappears once you have outgrown it. */
  function updateGuide() {
    const host = $('guide');
    if (!host) return;
    const step = D.nextGuide(g.state);
    const show = !!step && !g.build.on && !g.demo;
    host.classList.toggle('on', show);
    if (!show) return;
    const txt = $('guideText');
    if (txt && txt.textContent !== step.text) {
      txt.textContent = step.text;
      host.classList.remove('pulse');
      void host.offsetWidth;      // restart the attention animation
      host.classList.add('pulse');
    }
  }

  /* ==================================================================
   * MODALS / TOASTS / FLASHES
   * =============================================================== */
  function modal(title, bodyNodes, actions) {
    const host = $('modal');
    host.innerHTML = '';
    host.classList.add('on');
    const box = el('div.modalbox');
    box.appendChild(el('h2', title));
    const body = el('div.mbody');
    [].concat(bodyNodes).forEach((n) => body.appendChild(typeof n === 'string' ? el('p', n) : n));
    box.appendChild(body);
    const act = el('div.macts');
    (actions || [{ label: 'OK', cls: 'primary' }]).forEach((a) => {
      act.appendChild(btn(a.label, { cls: a.cls, onclick: () => { closeModal(); if (a.onclick) a.onclick(); } }));
    });
    box.appendChild(act);
    host.appendChild(box);
    return box;
  }
  function closeModal() { const h = $('modal'); h.classList.remove('on'); h.innerHTML = ''; }

  function confirmModal(title, text, onYes) {
    modal(title, [text], [
      { label: 'CANCEL', cls: 'ghost' },
      { label: 'CONFIRM', cls: 'danger', onclick: onYes },
    ]);
  }

  let toastT = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 1700);
  }

  function flash(data) {
    const f = $('flash');
    const n = el('div.flashline', { style: { color: data.color } }, data.text);
    f.appendChild(n);
    setTimeout(() => n.classList.add('go'), 20);
    setTimeout(() => n.remove(), 1500);
    while (f.childElementCount > 5) f.firstChild.remove();
  }

  /* ==================================================================
   * TUTORIAL + RUN SUMMARY
   * =============================================================== */
  function showTutorial() {
    const body = el('div.tut');
    [
      ['🏗️', 'It is a tower', 'The table stacks upward. Chips scored on floor 4 are worth ' + fmt(D.floorMult(4)) + '× what they are worth on floor 0. Getting the ball higher is the whole game.'],
      ['🔧', 'You build it', 'The table starts completely empty. Flipping the ball pays chips on its own — that is your seed money. Spend it in the SHOP, drop parts wherever you like, and drag them around any time in BUILD mode.'],
      ['⭕', 'Bumpers wear out', 'Each pop bumper only has so many pops in it. The number above it counts down; it trickles back on its own and refills at the start of every ball. Spread the load, or buy Bumper Coils.'],
      ['🏓', 'You flip it', 'Two flippers at the bottom to start. Buy Paddles to add your own flippers on higher floors and bind them to any of six control panels.'],
      ['🔷', 'Chips × Mult', 'Every hit pays CHIPS, and most hits also raise your MULT. Score is chips × mult, so keep the ball alive and keep the streak hot.'],
      ['💨', 'How to climb', 'Each floor has one opening, and the next one is 25 units to the side. Jet Pads are the only part you may hang directly over an opening — put one there and it blows arriving balls up through the next.'],
      ['🪙', 'It keeps earning', 'Chips convert to coins as you play, and Chip Mints keep printing even when the tab is closed.'],
    ].forEach(([e, t, d]) => body.appendChild(el('div.trow', el('div.te', e), el('div', el('b', t), el('p', d)))));
    modal('HOW TO PLAY', [body], [{ label: "LET'S GO", cls: 'primary', onclick: () => { g.state.tutorialSeen = true; G.save(); } }]);
  }

  function showRunEnd(res) {
    if (g.demo) return;
    const body = el('div.runend');
    body.appendChild(el('div.bigscore', U.fmtFull(res.score)));
    body.appendChild(el('div.sub', 'chips this run'));
    const box = el('div.statbox');
    box.appendChild(statRow('Coins banked', '🪙 ' + fmt(res.bonus)));
    box.appendChild(statRow('Best run', U.fmtFull(res.best)));
    box.appendChild(statRow('Highest floor this run', 'F' + g.run.floorsThisRun));
    body.appendChild(box);
    modal('RUN OVER', [body], [
      { label: 'SPEND COINS', cls: 'ghost', onclick: () => { setMenu(true); UI.tab = 'shop'; renderMenu(); } },
      { label: 'PLAY AGAIN', cls: 'primary', onclick: () => G.startRun() },
    ]);
  }

  function showOffline(info) {
    modal('WHILE YOU WERE OUT', [
      el('div.offline', el('div.bigscore', '🪙 ' + fmt(info.earned)), el('div.sub', 'earned over ' + U.fmtTime(info.seconds))),
    ], [{ label: 'NICE', cls: 'primary' }]);
  }

  /* ==================================================================
   * BOOT
   * =============================================================== */
  function layout() {
    const stage = $('stage');
    const r = stage.getBoundingClientRect();
    if (g.renderer) g.renderer.resize(r.width, r.height);
  }

  function boot() {
    buildHud();
    buildMenu();
    buildTableUI();
    G.init($('cv'));
    layout();
    setupCanvas();
    setupKeys();
    G.recomputeTrinkets();

    G.on('runEnd', showRunEnd);
    G.on('flash', flash);
    G.on('ball', (run) => {
      if (g.demo) return;
      flash({ text: 'BALL ' + run.ballNo + ' / ' + (run.ballNo + run.ballsLeft - 1), color: D.C.cream });
    });
    G.on('rebuild', () => { refreshPanelButtons(); });
    G.on('tick', () => {
      updateHud();
      updateGuide();
      pollGamepads();
      if (UI.menuOpen) updatePurse();
    });
    G.on('cannon', (c) => { $('app').classList.toggle('aiming', !!c); });

    global.addEventListener('resize', layout);
    global.addEventListener('orientationchange', () => setTimeout(layout, 200));
    // Never lose progress to a closed tab or a backgrounded phone.
    global.addEventListener('pagehide', () => G.save());
    global.addEventListener('beforeunload', () => G.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { G.save(); return; }
      g.world.flippers.forEach((f) => { f.humanPress = false; f.pressed = false; });
    });

    const off = G.collectOffline();
    G.startRun();
    setMenu(true);
    refreshPanelButtons();

    if (!g.state.tutorialSeen) showTutorial();
    else if (off && off.earned > 0) showOffline(off);

    // Auto-collapse straight into the table when the URL asks for it.
    const q = new URLSearchParams(location.search);
    if (q.get('play') === '1' || q.get('demo') === '1') setMenu(false);
  }

  IP.ui = { boot, setMenu, renderMenu, toast, modal, closeModal, enterBuild, exitBuild, renderBuildBar, refreshPanelButtons, UI, layout };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
