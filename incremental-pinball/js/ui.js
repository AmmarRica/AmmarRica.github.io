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
    viewedTab: null,
    helpOpen: false,
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

  /* ------------------------------------------------------------------
   * Progressive disclosure helpers.
   * ---------------------------------------------------------------- */
  /** Prefixed unlock keys that belong to a tab, for NEW badges. */
  function keysForTab(id) {
    if (id === 'shop') return D.PART_ORDER.filter(([p]) => D.partUnlocked(p, g.state)).map(([p]) => 'part:' + p);
    if (id === 'balls') return D.BALLS.filter((b) => D.ballUnlocked(b, g.state)).map((b) => 'ball:' + b.id);
    if (id === 'trinkets') return D.TRINKETS.filter((t) => D.trinketUnlocked(t, g.state)).map((t) => 'trinket:' + t.id);
    if (id === 'upgrades') return D.UPGRADES.filter((u) => D.upgradeUnlocked(u, g.state)).map((u) => 'upgrade:' + u.id);
    return [];
  }
  const unseenCount = (tabId) => keysForTab(tabId).filter((k) => !G.isSeen(k)).length;

  /** The "there is more coming" card shown at the frontier of each list. */
  function lockedTeaser(gate, what) {
    const c = card({ cls: 'locked', accent: D.C.steel });
    c.appendChild(el('div.qmark', '?'));
    c.appendChild(el('div.pname', 'LOCKED'));
    c.appendChild(el('div.pdesc', 'Another ' + what + ' opens up at ' + fmt(gate) + ' lifetime chips.'));
    const have = D.lifetime(g.state);
    c.appendChild(el('div.bar.sm', el('div.fill', { style: { width: (U.clamp(have / gate, 0, 1) * 100).toFixed(0) + '%' } })));
    c.appendChild(el('div.pmeta', el('span.owned', fmt(have) + ' / ' + fmt(gate))));
    return c;
  }

  /** Wraps a card so newly-revealed content announces itself in the list. */
  function withNew(node, key) {
    if (G.isSeen(key)) return node;
    return el('div.newwrap', node, el('div.newtag', 'NEW'));
  }

  function buildMenu() {
    const head = $('menuHead');
    head.innerHTML = '';
    head.appendChild(el('div.brand', el('span.bmark', '🏛'), el('span', 'TOWER OF CHIPS')));
    head.appendChild(el('div.purse',
      el('div.pcoin', el('span', '🪙'), el('b#mCoins', '0')),
      el('div.pgem', el('span', '💎'), el('b#mGems', '0')),
    ));
    head.appendChild(btn('▼ PLAY', { cls: 'collapse', onclick: () => setMenu(false) }));

    buildTabs();
  }

  /** Rebuilt whenever a tab unlocks, so the strip grows with the player. */
  function buildTabs() {
    const tabs = $('menuTabs');
    const open = TABS.filter((t) => D.tabUnlocked(t.id, g.state));
    const sig = open.map((t) => t.id).join(',');
    if (tabs.dataset.sig === sig) return;
    tabs.dataset.sig = sig;
    tabs.innerHTML = '';
    for (const t of open) {
      tabs.appendChild(el('button.tab', {
        type: 'button', role: 'tab', 'data-tab': t.id, 'aria-label': t.name,
        onclick: () => { markViewed(); UI.tab = t.id; renderMenu(); },
      }, el('span.temoji', { 'aria-hidden': 'true' }, t.emoji), el('span.tname', t.name),
        el('span.dot')));
    }
    if (!open.some((t) => t.id === UI.tab)) UI.tab = 'shop';
  }

  /** Paint the unseen-content dots without rebuilding the strip. */
  function refreshTabDots() {
    U.$$('#menuTabs .tab').forEach((el2) => {
      el2.classList.toggle('hasnew', unseenCount(el2.dataset.tab) > 0);
    });
  }

  function setMenu(open) {
    if (!open) markViewed();
    UI.menuOpen = open;
    $('menu').classList.toggle('collapsed', !open);
    $('app').classList.toggle('menu-open', open);
    $('menu').setAttribute('aria-hidden', String(!open));
    if (open) { renderMenu(); Update.maybeCheck(); }
    // On desktop the drawer docks beside the table, so the canvas resizes.
    setTimeout(layout, 20);
    setTimeout(layout, 380);
    G.Sfx.resume();
  }

  function renderMenu() {
    buildTabs();
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
    UI.viewedTab = UI.tab;
    refreshTabDots();
    updatePurse();
  }

  /**
   * Content is marked seen when the player *leaves* a tab, not when it
   * renders — otherwise an unlock arriving a moment later re-renders the
   * list and clears the NEW badges before anyone has looked at them.
   */
  function markViewed() {
    if (!UI.viewedTab) return;
    if (G.markSeen(keysForTab(UI.viewedTab))) refreshTabDots();
    UI.viewedTab = null;
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
      const list = D.PARTS.filter((p) => p.cat === cat.id && D.partUnlocked(p.id, g.state));
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
        // Milestone progress: the reason to keep buying the same part.
        const next = D.nextMilestone(owned);
        const mult = D.milestoneMult(owned);
        if (next) {
          const pct = U.clamp(owned / next, 0, 1);
          c.appendChild(el('div.mstone',
            el('div.bar.sm', el('div.fill', { style: { width: (pct * 100).toFixed(0) + '%' } })),
            el('small', (mult > 1 ? '×' + mult + ' now · ' : '') + '×' + (mult * 2) + ' at ' + next + ' owned'),
          ));
        } else if (mult > 1) {
          c.appendChild(el('div.mstone', el('small.maxed', '×' + mult + ' — all milestones banked')));
        }
        c.appendChild(btn(lockedFloor ? 'LOCKED' : 'BUY & PLACE', {
          cls: 'buy', disabled: !afford,
          onclick: () => armPlacement(def.id),
        }));
        grid.appendChild(withNew(c, 'part:' + def.id));
      }
      root.appendChild(grid);
    }

    // One locked card at the frontier: enough to promise more without
    // dumping the whole catalogue on a new player.
    const next = D.PART_ORDER.find(([id]) => !D.partUnlocked(id, g.state));
    if (next) {
      root.appendChild(el('div.cathead', { style: { '--accent': D.C.steel } }, 'COMING UP'));
      root.appendChild(el('div.grid', lockedTeaser(next[1], 'part')));
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
      const fl = D.floorAt(f);
      root.appendChild(el('div.cathead', { style: { '--accent': fl.accent } },
        'FLOOR ' + f + ' · ' + fl.name + '  ×' + fmt(D.floorMult(f)),
        el('span.slots', ps.length + '/' + IP.table.slotLimit(g.state))));
      if (!ps.length) { root.appendChild(el('div.empty.sm', 'Empty floor.')); continue; }
      if (ps.length > 1) {
        const worth = ps.reduce((n, p) => n + IP.table.refundValue(g.state, p), 0);
        root.appendChild(btn('🧹 CLEAR FLOOR ' + f + ' — 🪙 ' + fmt(worth), {
          cls: 'sm ghost wide',
          onclick: () => confirmModal('Clear floor ' + f + '?',
            'Removes all ' + ps.length + ' parts and refunds about 🪙 ' + fmt(worth) + '. You can undo it straight after.',
            () => { G.sellFloor(f); showUndo(); renderMenu(); }),
        }));
      }
      const list = el('div.plist');
      for (const inst of ps) {
        const def = D.PART_BY_ID[inst.id];
        const cost = IP.table.upgradeCost(g.state, inst);
        const maxed = inst.lvl >= def.maxLevel;
        const row = el('div.prow');
        row.appendChild(el('div.pico.sm', { style: { background: def.color } }, def.emoji));
        const earned = inst.earned ? '🔷 ' + fmt(inst.earned) + ' earned' : 'not scored yet';
        const sub = def.uses
          ? def.usesLeft(inst) + ' / ' + def.maxUses(inst) + ' pops · ' + earned
          : def.idle
            ? '+' + fmt(def.idle(inst) * (1 + 0.16 * G.up('idleRate'))) + ' coins/s · ' + earned
            : earned;
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
        // ⚠️ Was a bare 💰 with the meaning only in `title`, which does not
        // exist on touch — the one destructive control on the row was the
        // one you had to guess at.
        row.appendChild(btn('💰 ' + fmt(IP.table.refundValue(g.state, inst)), {
          cls: 'sm ghost', title: 'Remove and refund',
          onclick: () => confirmModal('Remove ' + def.name + '?',
            'You get back 🪙 ' + fmt(IP.table.refundValue(g.state, inst)) + ' of what you paid.',
            () => { G.sellPart(inst.uid); showUndo(); renderMenu(); }),
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
    for (const b of D.BALLS.filter((x) => D.ballUnlocked(x, g.state))) {
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
      grid.appendChild(withNew(c, 'ball:' + b.id));
    }
    const nextBall = D.BALLS.find((x) => !D.ballUnlocked(x, g.state));
    if (nextBall) grid.appendChild(lockedTeaser(D.ballGate(nextBall), 'ball'));
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
        s.appendChild(btn('REMOVE', {
          cls: 'sm ghost',
          onclick: () => confirmModal('Remove ' + t.name + '?',
            'It goes back to the shop and you are refunded part of the price. This one cannot be undone.',
            () => { G.sellTrinket(t.id); renderMenu(); }),
        }));
      } else s.appendChild(el('div.tempty', 'EMPTY'));
      held.appendChild(s);
    }
    root.appendChild(held);

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.purple } }, 'AVAILABLE'));
    const grid = el('div.grid');
    for (const t of D.TRINKETS.filter((x) => D.trinketUnlocked(x, g.state))) {
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
      grid.appendChild(withNew(c, 'trinket:' + t.id));
    }
    const nextT = D.TRINKETS.find((x) => !D.trinketUnlocked(x, g.state));
    if (nextT) grid.appendChild(lockedTeaser(D.trinketGate(nextT), 'trinket'));
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
      const shown = D.UPGRADES.filter((x) => x.group === grp.id && D.upgradeUnlocked(x, g.state));
      if (!shown.length) continue;
      root.appendChild(el('div.cathead', { style: { '--accent': grp.color } }, grp.name));
      const list = el('div.plist');
      for (const u of shown) {
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
        list.appendChild(withNew(row, 'upgrade:' + u.id));
      }
      root.appendChild(list);
    }
    const nextU = D.UPGRADES.find((x) => !D.upgradeUnlocked(x, g.state));
    if (nextU) {
      root.appendChild(el('div.cathead', { style: { '--accent': D.C.steel } }, 'COMING UP'));
      root.appendChild(el('div.grid', lockedTeaser(D.upgradeGate(nextU), 'upgrade')));
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
      const f = D.floorAt(k);
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

    // Gameplay-affecting help stays visible; the rest folds away. Built by
    // walking the list, so a new row cannot arrive without a home.
    const always = [
      ['SPACE / hold', 'Charge and fire the plunger'],
      ['Tap left / right of the table', 'Panels 1 and 2'],
      ['N / ←→ while playing', 'Nudge the table (limited, tilts if spammed)'],
    ];
    const extra = [
      ['B', 'Toggle build mode'],
      ['TAB or ESC', 'Open and close the menu'],
      ['Drag in build mode', 'Move parts around'],
      ['Drag from a loaded cannon', 'Aim, release to fire'],
    ];
    if (padPresent) extra.push(['Gamepad', 'Shoulders flip · A plunges · D-pad nudges · Start opens the menu']);

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.purple } }, 'OTHER CONTROLS'));
    const mkHelp = (rows) => {
      const h = el('div.helpgrid');
      rows.forEach(([k, v]) => h.appendChild(el('div.hrow', el('kbd', k), el('span', v))));
      return h;
    };
    root.appendChild(mkHelp(always));
    const more = mkHelp(extra);
    more.style.display = UI.helpOpen ? 'flex' : 'none';
    root.appendChild(btn(UI.helpOpen ? 'FEWER CONTROLS ▲' : 'MORE CONTROLS ▼', {
      cls: 'sm ghost wide',
      onclick: () => { UI.helpOpen = !UI.helpOpen; renderMenu(); },
    }));
    root.appendChild(more);
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
      ['Highest floor', 'F' + s.bestFloor + ' · ' + D.floorAt(s.bestFloor).name],
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
      ['particles', 'Particles'], ['depth', 'Parallax depth layers'],
      ['autoRun', 'Start the next run automatically'],
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

    // ⚠️ `beforeinstallprompt` cannot be summoned — it arrives once, as an
    // event. So the install button only exists while that event is live, or
    // on iOS where the manual route is the only route. An always-on button
    // is dead in standalone and in browsers that will never offer it.
    root.appendChild(el('div.cathead', { style: { '--accent': D.C.green } }, 'APP'));
    if (Install.offerable()) {
      const inst = card({ cls: 'installcard', accent: D.C.green });
      inst.appendChild(el('div.pname', '📲 Install as an app'));
      inst.appendChild(el('div.pdesc', 'Add Tower of Chips to your home screen or desktop: its own icon, no browser bars, and it keeps working offline.'));
      inst.appendChild(btn(Install.prompt ? 'INSTALL NOW' : 'HOW TO INSTALL',
        { cls: 'buy', onclick: () => Install.run() }));
      root.appendChild(inst);
    } else {
      const box = el('div.statbox');
      box.appendChild(statRow('App', Install.isInstalled() ? 'Installed ✔' : 'Running in the browser'));
      box.appendChild(statRow('Version', IP.VERSION));
      box.appendChild(statRow('Offline play', 'Ready'));
      const dl = G.updateDeadline();
      box.appendChild(statRow('Update status', dl
        ? (dl.overdue ? 'Required now' : 'Required in ' + Math.ceil(dl.daysLeft) + 'd')
        : 'Up to date'));
      root.appendChild(box);
    }
    root.appendChild(btn('📋 WHAT\'S NEW', { cls: 'wide ghost', onclick: () => showChangelog() }));
    root.appendChild(btn(Update.found ? 'UPDATE TO ' + Update.found : 'CHECK FOR UPDATES', {
      cls: 'wide' + (Update.found ? ' primary' : ' ghost'),
      onclick: () => (Update.found ? Update.apply() : Update.check(true)),
    }));

    root.appendChild(el('div.cathead', { style: { '--accent': D.C.blue } }, 'SAVE FILE'));
    const sf = el('div.plist');
    const srow = (name, note, label, fn, cls) => {
      const row = el('div.prow');
      row.appendChild(el('div.pinfo', el('b', name), el('small', note)));
      row.appendChild(btn(label, { cls: 'sm ' + (cls || ''), onclick: fn }));
      return row;
    };
    sf.appendChild(srow('Export save', 'Downloads a .json you can back up or move to another device', '⬇ EXPORT', () => SaveFile.download(), 'primary'));
    sf.appendChild(srow('Import save', 'Replaces this tower with one from a file', '⬆ IMPORT', () => SaveFile.pick(), 'ghost'));
    root.appendChild(sf);

    // Device controls, each shown only where it has a job to do.
    const dev = [];
    if (Full.supported()) {
      dev.push(srow('Fullscreen', 'Hide the browser chrome while you play',
        Full.active() ? '⤢ EXIT FULL' : '⤢ FULLSCREEN', () => Full.toggle().then(renderMenu), 'ghost'));
    }
    if (Tilt.supported()) {
      dev.push(srow('Tilt to nudge', 'Lean the device to nudge the table. Uses the motion sensor.',
        Tilt.enabled ? 'ON' : 'OFF',
        async () => {
          if (Tilt.enabled) Tilt.disable();
          else await Tilt.enable();      // may prompt; only ever from this tap
          renderMenu();
        },
        Tilt.enabled ? 'primary' : 'ghost'));
    }
    if (padPresent) {
      dev.push(srow('Gamepad', 'Shoulders flip · A plunges · D-pad nudges · Start opens the menu', 'CONNECTED', () => {}, 'ghost'));
    }
    if (dev.length) {
      root.appendChild(el('div.cathead', { style: { '--accent': D.C.purple } }, 'DEVICE'));
      const dl = el('div.plist'); dev.forEach((d) => dl.appendChild(d)); root.appendChild(dl);
    }

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
    g.build.raze = false;
    $('app').classList.remove('razing');
    $('app').classList.remove('building');
    renderBuildBar();
  }

  /**
   * Bulldozer mode: while it is on, tapping a part removes it. Arming a
   * mode is what makes clearing a floor bearable — the alternative is
   * select, hunt for the button, confirm, repeat.
   */
  function setRaze(on) {
    g.build.raze = !!on;
    if (on) { UI.armed = null; g.build.ghost = null; g.build.sel = null; }
    $('app').classList.toggle('razing', !!on);
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
      el('small', D.floorAt(g.build.floor).name + ' · ' + G.slotsUsed(g.build.floor) + '/' + IP.table.slotLimit(g.state) + ' slots')));
    top.appendChild(btn('▶', { cls: 'sm', disabled: g.build.floor >= g.state.floors - 1, onclick: () => { g.build.floor++; renderBuildBar(); } }));
    top.appendChild(btn('🧨 REMOVE', {
      cls: 'sm raze' + (g.build.raze ? ' on' : ' ghost'),
      title: 'Tap parts on the table to remove them',
      'aria-pressed': g.build.raze ? 'true' : 'false',
      onclick: () => { setRaze(!g.build.raze); },
    }));
    top.appendChild(btn('✕ DONE', { cls: 'sm primary', onclick: exitBuild }));
    bar.appendChild(top);

    if (g.build.raze) {
      bar.appendChild(el('div.bbhint.raze', 'Tap any part to remove it — every removal can be undone. ',
        btn('DONE REMOVING', { cls: 'sm primary', onclick: () => setRaze(false) })));
      return;
    }

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
      row.appendChild(btn('💰 REMOVE ' + fmt(IP.table.refundValue(g.state, sel)), {
        cls: 'sm ghost',
        onclick: () => { G.sellPart(sel.uid); g.build.sel = null; showUndo(); renderBuildBar(); },
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
        if (g.build.raze) {
          P.mode = 'pan';
          if (hit) {
            const def = D.PART_BY_ID[hit.id];
            G.sellPart(hit.uid);
            showUndo();
            toast('Removed ' + ((def && def.name) || 'part'));
            renderBuildBar();
          }
          return;
        }
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
   * INSTALL — the game is a PWA, so it can be added to the home screen
   * or installed as a desktop app and then played offline.
   * =============================================================== */
  const Install = {
    prompt: null,          // the deferred beforeinstallprompt event
    dismissed: false,

    /** Already running as an installed app? */
    isInstalled() {
      return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches)
        || global.navigator.standalone === true;
    },
    /** iOS has no install prompt API — it needs written instructions. */
    isIOS() {
      const ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    },
    /** Can we offer the banner? Either the browser told us, or it is iOS,
     *  where installing is manual and the hint is worth more, not less. */
    offerable() {
      return !Install.isInstalled() && (!!Install.prompt || Install.isIOS());
    },

    async run() {
      if (Install.isInstalled()) { toast('Already installed'); return; }
      if (Install.prompt) {
        const ev = Install.prompt;
        Install.prompt = null;
        ev.prompt();
        let outcome = 'dismissed';
        try { outcome = (await ev.userChoice).outcome; } catch (e) { /* user closed it */ }
        if (outcome === 'accepted') toast('Installing…');
        refreshInstallUI();
        return;
      }
      Install.howTo();
    },

    /** Fallback for browsers that never fire beforeinstallprompt. */
    howTo() {
      const rows = Install.isIOS()
        ? [['1.', 'Tap the Share button in Safari’s toolbar.'],
           ['2.', 'Scroll down and choose “Add to Home Screen”.'],
           ['3.', 'Tap Add. The tower gets its own icon and runs full screen.']]
        : [['1.', 'Open your browser’s menu (⋮ or ⋯) while on this page.'],
           ['2.', 'Choose “Install app”, “Add to Home screen” or “Create shortcut”.'],
           ['3.', 'Confirm. It then launches in its own window and plays offline.']];
      const body = el('div.tut');
      rows.forEach(([n, t]) => body.appendChild(el('div.trow', el('div.te', n), el('div', el('p', t)))));
      body.appendChild(el('p.hintline',
        'Your save lives in this browser either way — installing does not move it, it just gives the game its own icon, removes the browser bars and lets it run with no connection.'));
      modal('INSTALL THE GAME', [body], [{ label: 'GOT IT', cls: 'primary' }]);
    },
  };

  function refreshInstallUI() {
    const bar = $('installBar');
    if (bar) bar.classList.toggle('on', Install.offerable() && !Install.dismissed);
    const ub = $('updateBar');
    if (ub) {
      // ⚠️ Repaint, do not just toggle. The bar carries a countdown, and it
      // was built once at boot — a bar that still says "Update available" on
      // the day the game locks is worse than no warning at all.
      paintUpdateBar(ub);
      ub.classList.toggle('on', !!Update.found && Update.found !== Update.declined);
    }
    if (UI.menuOpen && UI.tab === 'stats') renderMenu();
  }

  function setupInstall() {
    global.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      Install.prompt = e;
      refreshInstallUI();
    });
    global.addEventListener('appinstalled', () => {
      Install.prompt = null;
      toast('🎉 Installed — you can play offline now');
      refreshInstallUI();
    });
  }

  /* ==================================================================
   * UPDATES
   * ⚠️ Version is read out of the served HTML, NOT from the service
   * worker. `registration.update()` fires `updatefound` for almost no
   * real deploys, so an SW-based check reports "up to date" through
   * every release. Installed players would never see a new build.
   * =============================================================== */
  const Update = {
    found: null,        // version string of a newer build
    declined: null,     // version the player said no to (silences auto only)
    lastCheck: 0,
    checking: false,

    async check(manual) {
      if (Update.checking) return null;
      if (!location.protocol.startsWith('http')) return null;   // file:// has no deploys
      Update.checking = true;
      try {
        // ⚠️ `cache: 'reload'` rather than a `?v=` buster: a query string
        // adds a junk cache entry per check, and reloading the clean URL
        // also refreshes the cached copy, which is what makes the reload
        // afterwards actually land on the new build.
        const res = await fetch('index.html', { cache: 'reload' });
        const html = await res.text();
        // ⚠️ requires a digit after the quote so this pattern can never
        // match its own text if it ever ends up in the fetched reply.
        const m = /name="app-version"\s+content="(\d[\w.\-]*)"/.exec(html);
        Update.lastCheck = Date.now();
        if (!m) return null;
        const v = m[1];
        // Feed the clock from every successful check, including the ones
        // that say we are current — that is what clears a stale deadline
        // after an update lands.
        G.noteVersionSeen(v);
        enforceLock();
        if (U.cmpVer(v, IP.VERSION) <= 0) {
          Update.found = null;
          refreshInstallUI();
          if (manual) toast('You are on the latest version (' + v + ')');
          return null;
        }
        Update.found = v;
        refreshInstallUI();
        return v;
      } catch (e) {
        if (manual) toast('Could not check — you are offline');
        return null;
      } finally { Update.checking = false; }
    },

    /**
     * Checked on every launch and every return to the foreground. The old
     * 15-minute throttle is gone deliberately; the only guard left is a few
     * seconds, purely so one tab-switch does not fire two overlapping
     * requests. A deadline the player cannot see coming would be unfair, so
     * the check has to be frequent enough to surface one.
     */
    maybeCheck() {
      if (Date.now() - Update.lastCheck < 4000) return;
      Update.check(false);
    },

    async apply() {
      G.save();
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch (e) { /* no SW here; a reload is still the right move */ }
      location.reload();
    },
  };

  function buildUpdateBar() {
    const bar = el('div.installbar.update#updateBar');
    paintUpdateBar(bar);
    return bar;
  }

  /** Rewrite the bar from the current deadline. Called on every refresh. */
  function paintUpdateBar(bar) {
    const b = updateBanner() || { head: 'Update available', sub: 'Reload to get the newest build', urgent: false };
    bar.classList.toggle('urgent', !!b.urgent);
    bar.innerHTML = '';
    bar.appendChild(el('div.iico', b.urgent ? '⚠️' : '⬆️'));
    bar.appendChild(el('div.itext', el('b', b.head), el('small', b.sub)));
    bar.appendChild(btn('UPDATE', { cls: 'sm primary', onclick: () => Update.apply() }));
    // Past the deadline there is no "not now" — declining is the thing the
    // 30 days were for.
    if (!b.urgent) {
      bar.appendChild(btn('✕', {
        cls: 'sm ghost', aria: 'Not now',
        onclick: () => { Update.declined = Update.found; refreshInstallUI(); },
      }));
    }
  }

  /* ==================================================================
   * REQUIRED UPDATES
   *
   * An update becomes mandatory 30 days after this install first saw it.
   * The bar counts down long before then, and the lock screen still offers
   * the save file — locking someone out of their progress as well as the
   * game would be a different thing entirely.
   * =============================================================== */
  function updateBanner() {
    const d = G.updateDeadline();
    if (!d) return null;
    const days = Math.ceil(d.daysLeft);
    if (d.overdue) return { urgent: true, head: 'Update required', sub: 'Version ' + d.version + ' is out and this build is no longer supported' };
    if (days <= 7) return { urgent: true, head: 'Update required in ' + days + (days === 1 ? ' day' : ' days'), sub: 'Version ' + d.version + ' is out' };
    return { urgent: false, head: 'Update available', sub: 'Version ' + d.version + ' · required in ' + days + ' days' };
  }

  /** Patch notes. `since` shows only what landed after that version. */
  function showChangelog(since) {
    const list = since ? D.changesSince(since) : D.CHANGELOG;
    const body = [];
    if (!list.length) body.push(el('p', 'Nothing new since you last played.'));
    for (const c of list) {
      const box = el('div.patch');
      box.appendChild(el('div.phead', el('b', 'v' + c.v + (c.title ? ' — ' + c.title : '')), el('small', c.date)));
      const ul = el('ul.pnotes');
      for (const n of c.notes) ul.appendChild(el('li', n));
      if (c.fixes) ul.appendChild(el('li.pfix', c.fixes));
      box.appendChild(ul);
      body.push(box);
    }
    modal(since ? "WHAT'S NEW" : 'PATCH NOTES', body, [{ label: 'GOT IT', cls: 'primary' }]);
  }

  /**
   * After an update lands, show what changed — once, and only for someone
   * who was actually running an older build. A fresh install has nothing to
   * catch up on and should not be handed a wall of release notes.
   */
  function maybeShowPatchNotes() {
    const u = g.state.update || {};
    const ran = u.ran;
    if (ran !== IP.VERSION) {
      const first = !ran;
      u.ran = IP.VERSION;
      u.notesFor = IP.VERSION;
      G.save();
      if (!first && D.changesSince(ran).length) {
        setTimeout(() => showChangelog(ran), 400);
      }
    }
  }

  let lockShown = false;
  function enforceLock() {
    const locked = G.enforceUpdate();
    $('app').classList.toggle('locked', locked);
    if (!locked) { lockShown = false; return false; }
    if (lockShown) return true;
    lockShown = true;
    showLockScreen();
    return true;
  }

  function showLockScreen() {
    const d = G.updateDeadline();
    const body = [
      el('p', 'This build is ' + Math.floor(d ? d.elapsed : G.GRACE_DAYS) + ' days behind. Version '
        + (d ? d.version : '') + ' has been out for more than ' + G.GRACE_DAYS + ' days, so play is paused until you update.'),
      el('p', 'Updating keeps your tower — it is stored on this device, not in the build. You can also export it to a file first if you would rather have a copy.'),
    ];
    modal('UPDATE REQUIRED', body, [
      { label: '⬇ EXPORT SAVE', cls: 'ghost', keepOpen: true, onclick: () => SaveFile.download() },
      { label: 'UPDATE NOW', cls: 'primary', keepOpen: true, onclick: () => Update.apply() },
    ], { sticky: true });
  }

  /** Dismissible banner that appears once the browser says it can install. */
  function buildInstallBar() {
    const bar = el('div.installbar#installBar',
      el('div.iico', '📲'),
      el('div.itext', el('b', 'Install Tower of Chips'), el('small', 'Own icon, full screen, plays offline')),
      btn('INSTALL', { cls: 'sm primary', onclick: () => Install.run() }),
      btn('✕', { cls: 'sm ghost', aria: 'Dismiss', onclick: () => { Install.dismissed = true; refreshInstallUI(); } }),
    );
    return bar;
  }

  /* ==================================================================
   * SAVE FILES
   * =============================================================== */
  const SaveFile = {
    download() {
      let data;
      try { data = G.exportSave(); } catch (e) { toast('Could not read your save'); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: G.suggestedFileName() });
      document.body.appendChild(a);
      a.click();
      a.remove();
      // ⚠️ Safari is not finished with the blob when click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Save exported');
    },

    /** ⚠️ One reused input, and `value` reset in the handler — otherwise
     *  picking the same file twice never fires `change`. */
    input: null,
    pick() {
      if (!SaveFile.input) {
        SaveFile.input = el('input', {
          type: 'file', accept: 'application/json,.json',
          style: { position: 'fixed', left: '-9999px', width: '1px', height: '1px' },
          onchange: (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = '';
            if (f) SaveFile.read(f);
          },
        });
        document.body.appendChild(SaveFile.input);
      }
      SaveFile.input.click();
    },

    read(file) {
      const fr = new FileReader();
      fr.onerror = () => toast('Could not read that file');
      fr.onload = () => {
        let obj;
        try { obj = JSON.parse(fr.result); }
        catch (e) { modal('IMPORT FAILED', ['That file is not valid JSON.'], [{ label: 'OK', cls: 'primary' }]); return; }
        confirmModal('Load this save?', 'It replaces the tower you have now. Export the current one first if you want to keep it.', () => {
          try {
            const r = G.importSave(obj);
            renderMenu();
            toast('Loaded: ' + r.parts + ' parts, ' + r.floors + ' floors');
          } catch (e) {
            modal('IMPORT FAILED', [String(e.message || e)], [{ label: 'OK', cls: 'primary' }]);
          }
        });
      };
      fr.readAsText(file);
    },
  };

  /* ==================================================================
   * FULLSCREEN — verify it actually entered/exited; the promise rejects
   * silently in plenty of contexts and the label must track reality.
   * =============================================================== */
  const Full = {
    supported() {
      const e = document.documentElement;
      return !!(e.requestFullscreen || e.webkitRequestFullscreen);
    },
    active() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    async toggle() {
      const e = document.documentElement;
      try {
        if (!Full.active()) await (e.requestFullscreen ? e.requestFullscreen() : e.webkitRequestFullscreen());
        else await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
      } catch (err) { /* refused — fall through and report actual state */ }
      Full.sync();
      if (!Full.active() && !Full.wanted) toast('Fullscreen was refused here');
    },
    wanted: false,
    sync() {
      Full.wanted = Full.active();
      const b = $('fsBtn');
      if (b) b.textContent = Full.active() ? '⤢ EXIT FULL' : '⤢ FULLSCREEN';
      setTimeout(layout, 60);
    },
  };

  /* ==================================================================
   * MOTION — reduced-motion and tilt-to-nudge.
   * =============================================================== */
  // ⚠️ Built once. This used to be queried per entity per frame.
  const reducedMotionMQ = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersReducedMotion = () => !!(reducedMotionMQ && reducedMotionMQ.matches);

  const Tilt = {
    enabled: false,
    granted: false,
    raw: null,          // ⚠️ written by the sensor at ITS rate; smoothed in step
    neutral: 0,
    value: 0,
    supported() { return typeof global.DeviceOrientationEvent !== 'undefined'; },
    needsPermission() {
      return typeof global.DeviceOrientationEvent !== 'undefined'
        && typeof global.DeviceOrientationEvent.requestPermission === 'function';
    },
    async enable() {
      if (!Tilt.supported()) { toast('This device has no tilt sensor'); return false; }
      // ⚠️ iOS only grants this from a user gesture, never from page load.
      if (Tilt.needsPermission() && !Tilt.granted) {
        try {
          const res = await global.DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') { toast('Motion access denied'); return false; }
        } catch (e) { toast('Motion access denied'); return false; }
      }
      Tilt.granted = true;
      Tilt.enabled = true;
      global.addEventListener('deviceorientation', Tilt.onEvent);
      toast('Tilt nudge on — lean the phone to nudge');
      return true;
    },
    disable() {
      Tilt.enabled = false;
      global.removeEventListener('deviceorientation', Tilt.onEvent);
      Tilt.raw = null; Tilt.value = 0;
    },
    onEvent(e) {
      // ⚠️ Readings are fixed to the DEVICE, not the screen. Rotate by the
      // screen angle or the effect goes sideways in landscape. And only
      // store here — all smoothing happens in the step loop.
      const beta = e.beta || 0, gamma = e.gamma || 0;
      const ang = ((screen.orientation && screen.orientation.angle) || global.orientation || 0) * Math.PI / 180;
      const c = Math.cos(ang), s = Math.sin(ang);
      Tilt.raw = gamma * c - beta * s;
    },
    /** Called from the game tick: smoothing and neutral drift live here. */
    step(dt) {
      if (!Tilt.enabled || Tilt.raw == null) return;
      // ⚠️ The neutral drifts toward how the device is actually being held.
      // Assuming "level = flat on a table" pins someone playing lying down
      // at full deflection forever.
      Tilt.neutral = U.approach(Tilt.neutral, Tilt.raw, 0.25, dt);
      const off = U.clamp((Tilt.raw - Tilt.neutral) / 22, -1, 1);
      Tilt.value = U.approach(Tilt.value, off, 9, dt);
      if (Math.abs(Tilt.value) > 0.72) {
        Tilt.value = 0;
        Tilt.neutral = Tilt.raw;
        G.nudge(off > 0 ? 1 : -1);
      }
    },
  };

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
  // ⚠️ Never decide once at boot: pads come and go. Re-evaluated on
  // gamepadconnected/disconnected, and nothing gamepad-shaped is offered in
  // the UI while this is false.
  let padPresent = false;
  function padsAttached() {
    if (!navigator.getGamepads) return false;
    for (const pad of navigator.getGamepads()) if (pad && pad.connected) return true;
    return false;
  }

  function pollGamepads() {
    if (!padPresent || !navigator.getGamepads) return;
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
      if (step && step.tab) { markViewed(); UI.tab = step.tab; setMenu(true); }
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
  /**
   * `opts.sticky` marks a modal the player is not allowed to dismiss — the
   * required-update screen. An action can set `keepOpen` so it runs without
   * closing, which is what lets EXPORT SAVE work from behind the lock.
   */
  function modal(title, bodyNodes, actions, opts) {
    const o = opts || {};
    const host = $('modal');
    host.innerHTML = '';
    host.classList.add('on');
    host.classList.toggle('sticky', !!o.sticky);
    const box = el('div.modalbox' + (o.sticky ? '.sticky' : ''));
    box.appendChild(el('h2', title));
    const body = el('div.mbody');
    [].concat(bodyNodes).forEach((n) => body.appendChild(typeof n === 'string' ? el('p', n) : n));
    box.appendChild(body);
    const act = el('div.macts');
    (actions || [{ label: 'OK', cls: 'primary' }]).forEach((a) => {
      act.appendChild(btn(a.label, {
        cls: a.cls,
        onclick: () => { if (!a.keepOpen) closeModal(); if (a.onclick) a.onclick(); },
      }));
    });
    box.appendChild(act);
    host.appendChild(box);
    return box;
  }
  function closeModal(force) {
    const h = $('modal');
    // A sticky modal only closes when the code that raised it says so; ESC,
    // a backdrop tap and a stray closeModal() all have to bounce off it.
    if (h.classList.contains('sticky') && !force) return;
    h.classList.remove('on', 'sticky');
    h.innerHTML = '';
  }

  function confirmModal(title, text, onYes) {
    modal(title, [text], [
      { label: 'CANCEL', cls: 'ghost' },
      { label: 'CONFIRM', cls: 'danger', onclick: onYes },
    ]);
  }

  /**
   * Undo bar. Removing a part is the only destructive thing you can do to a
   * table you spent an hour arranging, and the refund is well under what you
   * paid — so every removal offers to put it back before the price of a
   * mis-tap is locked in.
   */
  let undoT = 0;
  function showUndo() {
    const bar = $('undoBar');
    const info = G.undoInfo();
    clearTimeout(undoT);
    if (!info) { bar.classList.remove('on'); bar.innerHTML = ''; return; }
    bar.innerHTML = '';
    bar.appendChild(el('div.undotext',
      el('b', 'Removed ' + info.label),
      el('small', '+🪙 ' + fmt(info.refund) + (info.afford ? '' : ' · spent, cannot undo'))));
    bar.appendChild(btn('↶ UNDO', {
      cls: 'sm' + (info.afford ? '' : ' ghost'), disabled: !info.afford,
      onclick: () => {
        const r = G.undoSell();
        hideUndo();
        if (!r.ok) { toast(r.err); return; }
        toast('Put back ' + r.n + (r.n === 1 ? ' part' : ' parts'));
        renderBuildBar(); if (UI.menuOpen) renderMenu();
      },
    }));
    bar.appendChild(btn('✕', { cls: 'sm ghost', 'aria-label': 'Dismiss', onclick: hideUndo }));
    bar.classList.add('on');
    // Long enough to notice and react to, short enough not to sit over the
    // table. Dismissing only hides the bar; the undo itself stays available
    // until the next removal replaces it.
    undoT = setTimeout(() => bar.classList.remove('on'), 9000);
  }
  function hideUndo() {
    clearTimeout(undoT);
    const bar = $('undoBar');
    bar.classList.remove('on');
    bar.innerHTML = '';
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
      ['📂', 'It opens up slowly', 'You start with one menu tab and one part. Everything else — parts, balls, trinkets, upgrades, whole sections of the menu — reveals itself as your lifetime chips grow. A LOCKED card at the end of each list tells you what the next one costs.'],
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
    setupInstall();
    $('menu').insertBefore(buildInstallBar(), $('menuTabs'));
    $('menu').insertBefore(buildUpdateBar(), $('menuTabs'));
    refreshInstallUI();
    // ⚠️ Update prompts live in the menu only. Never interrupt a live ball.
    setTimeout(() => Update.check(false), 4000);
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
    G.on('tick', (dt) => {
      updateHud();
      updateGuide();
      pollGamepads();
      Tilt.step(dt);
      if (UI.menuOpen) updatePurse();
    });
    G.on('cannon', (c) => { $('app').classList.toggle('aiming', !!c); });
    G.on('unlock', ({ info }) => {
      toast(info.emoji + '  ' + info.what + ' UNLOCKED: ' + info.name);
      buildTabs();
      refreshTabDots();
      if (UI.menuOpen) renderMenu();
    });

    // Gamepad presence drives what the UI offers; re-checked, never assumed.
    const syncPads = () => {
      const now = padsAttached();
      if (now === padPresent) return;
      padPresent = now;
      if (UI.menuOpen && UI.tab === 'panels') renderMenu();
    };
    global.addEventListener('gamepadconnected', syncPads);
    global.addEventListener('gamepaddisconnected', syncPads);
    global.addEventListener('resize', syncPads);
    syncPads();

    document.addEventListener('fullscreenchange', Full.sync);
    document.addEventListener('webkitfullscreenchange', Full.sync);

    // ⚠️ Reduced motion: default the loud settings off rather than deciding
    // per frame, and follow the user if they change it mid-session.
    if (prefersReducedMotion() && g.state.settings.shake !== false) {
      g.state.settings.shake = false;
      g.state.settings.particles = false;
    }
    if (reducedMotionMQ && reducedMotionMQ.addEventListener) {
      reducedMotionMQ.addEventListener('change', (e) => {
        if (e.matches) { g.state.settings.shake = false; g.state.settings.particles = false; G.save(); }
        if (UI.menuOpen) renderMenu();
      });
    }

    global.addEventListener('resize', layout);
    global.addEventListener('orientationchange', () => setTimeout(layout, 200));
    // Never lose progress to a closed tab or a backgrounded phone.
    global.addEventListener('pagehide', () => G.save());
    global.addEventListener('beforeunload', () => G.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { G.save(); return; }
      g.world.flippers.forEach((f) => { f.humanPress = false; f.pressed = false; });
      // Coming back to the app counts as opening it. This is also the only
      // thing that moves an installed copy forward — a PWA can sit
      // foregrounded for days without ever reloading.
      enforceLock();
      Update.maybeCheck();
    });

    // Launch check, before anything else touches the table: if this build is
    // already past its deadline the run should never start.
    enforceLock();
    Update.check(false);
    maybeShowPatchNotes();

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

  IP.ui = {
    boot, setMenu, renderMenu, toast, modal, closeModal, enterBuild, exitBuild,
    renderBuildBar, refreshPanelButtons, UI, layout,
    __t: { Install, Update, refreshInstallUI, showUndo, setRaze,
           enforceLock, showChangelog, maybeShowPatchNotes, updateBanner },   // test surface
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
