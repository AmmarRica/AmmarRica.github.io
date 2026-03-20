/* videogames-ishkur.js
 * Interactive video-game genre evolution visualization.
 * Inspired by Ishkur's Guide to Electronic Music (https://music.ishkur.com/)
 */
(function () {
  'use strict';

  // ── Layout constants ──────────────────────────────────────────────────────
  var YEAR_START  = 1972;
  var YEAR_END    = 2024;
  var PX_PER_YEAR = 30;
  var ROW_H       = 64;
  var NODE_W      = 108;
  var NODE_H      = 36;
  var ML          = 152;   // left margin — family labels
  var MT          = 54;    // top  margin — timeline
  var MR          = 80;
  var MB          = 30;
  // Derived after FAMILIES is defined; placeholder until then
  var NUM_ROWS    = 0; // set below after FAMILIES declaration

  var TOTAL_W = ML + (YEAR_END - YEAR_START + 1) * PX_PER_YEAR + MR;

  function yearToX(y) { return ML + (y - YEAR_START) * PX_PER_YEAR; }
  function rowToY(r)  { return MT + r * ROW_H; }

  // ── Palette ───────────────────────────────────────────────────────────────
  var C = {
    adventure:  '#06b6d4',
    shooter:    '#f97316',
    fps:        '#ef4444',
    platformer: '#22c55e',
    rpg:        '#a855f7',
    strategy:   '#3b82f6',
    fighting:   '#f43f5e',
    sim:        '#14b8a6',
    unique:     '#fbbf24',
  };

  // ── Family bands ──────────────────────────────────────────────────────────
  var FAMILIES = [
    { id: 'adventure',  label: 'Adventure',   rows: [0,  0],  color: C.adventure  },
    { id: 'shooter',    label: 'Shooter',      rows: [1,  2],  color: C.shooter    },
    { id: 'fps',        label: 'FPS',          rows: [3,  4],  color: C.fps        },
    { id: 'platformer', label: 'Platformer',   rows: [5,  6],  color: C.platformer },
    { id: 'rpg',        label: 'RPG',          rows: [7,  10], color: C.rpg        },
    { id: 'strategy',   label: 'Strategy',     rows: [11, 13], color: C.strategy   },
    { id: 'fighting',   label: 'Fighting',     rows: [14, 15], color: C.fighting   },
    { id: 'sim',        label: 'Simulation',   rows: [16, 17], color: C.sim        },
    { id: 'unique',     label: '★ Unique',     rows: [18, 21], color: C.unique     },
  ];

  // Derive total row count from family definitions so it always stays in sync
  NUM_ROWS = FAMILIES.reduce(function (max, f) {
    return Math.max(max, f.rows[1] + 1);
  }, 0);

  var TOTAL_H = MT + NUM_ROWS * ROW_H + MB;

  // ── Genre data ────────────────────────────────────────────────────────────
  // Each entry: id, name, year (birth year), row (vertical slot), family, unique
  var GENRES = [
    // ── Adventure ────────────────────────────────────────────────────────
    { id: 'text-adv',
      name: 'Text Adventure', year: 1976, row: 0, family: 'adventure', unique: false,
      examples: ['Colossal Cave Adventure (1976)', 'Zork (1977)', "Hitchhiker's Guide to the Galaxy (1984)"],
      desc: 'Pure typed commands, pure imagination. Before graphics, players painted entire worlds with words. The genre that proved games could tell stories.' },

    { id: 'graphic-adv',
      name: 'Graphic Adventure', year: 1984, row: 0, family: 'adventure', unique: false,
      examples: ["King's Quest (1984)", 'Maniac Mansion (1987)', 'Space Quest (1986)'],
      desc: 'Text parsers met pixel art. The world finally had a face. Sierra On-Line and LucasArts would define a golden age of adventure gaming.' },

    { id: 'point-click',
      name: 'Point-and-Click', year: 1990, row: 0, family: 'adventure', unique: false,
      examples: ['The Secret of Monkey Island (1990)', 'Day of the Tentacle (1993)', 'Myst (1993)', 'Grim Fandango (1998)'],
      desc: 'The mouse killed the text parser. Click objects, combine inventory items, solve puzzles. Adventure gaming at its most beloved.' },

    { id: '3d-adv',
      name: '3D Adventure', year: 1999, row: 0, family: 'adventure', unique: false,
      examples: ['Grim Fandango (1998)', 'Fahrenheit / Indigo Prophecy (2005)', 'Heavy Rain (2010)'],
      desc: 'Adventure games stepped into three dimensions — trading pixel-art charm for cinematic scope and free-roaming cameras.' },

    { id: 'walking-sim',
      name: 'Walking Simulator', year: 2012, row: 0, family: 'adventure', unique: false,
      examples: ['Dear Esther (2012)', 'Gone Home (2013)', 'Firewatch (2016)', 'What Remains of Edith Finch (2017)'],
      desc: 'Stripped of puzzles and fail states, pure story walks remain. Divisive, atmospheric, and unforgettable.' },

    // ── Shooter ───────────────────────────────────────────────────────────
    { id: 'space-shooter',
      name: 'Space Shooter', year: 1978, row: 1, family: 'shooter', unique: false,
      examples: ['Space Invaders (1978)', 'Asteroids (1979)', 'Galaga (1981)'],
      desc: "Mankind's first mass obsession. Fixed turrets, descending alien waves, limited ammunition. The Big Bang of arcade gaming." },

    { id: 'scroll-shooter',
      name: 'Scrolling Shooter', year: 1984, row: 1, family: 'shooter', unique: false,
      examples: ['1942 (1984)', 'Gradius (1985)', 'R-Type (1987)', 'Raiden (1990)'],
      desc: 'The battlefield scrolled forward — intricate power-up systems, memorisation over pure reaction. The golden era of arcade shooters.' },

    { id: 'bullet-hell',
      name: 'Bullet Hell', year: 1995, row: 2, family: 'shooter', unique: false,
      examples: ['DoDonPachi (1997)', 'Touhou Project (1996)', 'Ikaruga (2001)', 'Mushihimesama (2004)'],
      desc: 'Danmaku — the screen floods with patterned curtains of projectiles. Weave between the art. Meditative destruction.' },

    // ── FPS ───────────────────────────────────────────────────────────────
    { id: 'fps',
      name: 'First-Person Shooter', year: 1992, row: 3, family: 'fps', unique: false,
      examples: ['Wolfenstein 3D (1992)', 'Doom (1993)', 'Quake (1996)', 'Half-Life (1998)'],
      desc: 'See through the barrel. Doom defined the template for a decade; Half-Life redefined narrative in shooters forever.' },

    { id: 'arena-fps',
      name: 'Arena Shooter', year: 1999, row: 3, family: 'fps', unique: false,
      examples: ['Quake III Arena (1999)', 'Unreal Tournament (1999)', 'Quake Champions (2017)'],
      desc: 'Pure skill, no story. Fast movement, rocket-jumping, instant-kill weapons. The highest mechanical expression of the FPS.' },

    { id: 'tactical-fps',
      name: 'Tactical Shooter', year: 1999, row: 4, family: 'fps', unique: false,
      examples: ['Counter-Strike (1999)', 'Rainbow Six (1998)', 'ARMA II (2009)', 'Squad (2015)'],
      desc: 'One bullet can kill. Every round is a chess match of information and teamwork over pure mechanical skill.' },

    { id: 'hero-shooter',
      name: 'Hero Shooter', year: 2016, row: 3, family: 'fps', unique: false,
      examples: ['Overwatch (2016)', 'Apex Legends (2019)', 'Valorant (2020)'],
      desc: 'Distinct heroes with unique abilities fight in team objectives. Ability synergy and counter-picks replace pure aim.' },

    { id: 'battle-royale',
      name: 'Battle Royale', year: 2017, row: 4, family: 'fps', unique: false,
      examples: ['PUBG (2017)', 'Fortnite (2017)', 'Apex Legends (2019)', 'Warzone (2020)'],
      desc: '100 players drop onto one map, a zone shrinks, last one standing wins. The defining genre of the late 2010s.' },

    // ── Platformer ────────────────────────────────────────────────────────
    { id: 'platformer',
      name: 'Platformer', year: 1981, row: 5, family: 'platformer', unique: false,
      examples: ['Donkey Kong (1981)', 'Super Mario Bros. (1985)', 'Mega Man (1987)', 'Sonic the Hedgehog (1991)'],
      desc: 'Jump. The simplest verb in gaming elevated to an art form. The defining genre of the 8-bit and 16-bit eras.' },

    { id: 'run-gun',
      name: 'Run-and-Gun', year: 1987, row: 5, family: 'platformer', unique: false,
      examples: ['Contra (1987)', 'Gunstar Heroes (1993)', 'Metal Slug (1996)'],
      desc: 'Platforming plus relentless gunfire. Memorise patterns, master the bullet dance. Hard as nails and twice as satisfying.' },

    { id: '3d-platformer',
      name: '3D Platformer', year: 1996, row: 5, family: 'platformer', unique: false,
      examples: ['Super Mario 64 (1996)', 'Crash Bandicoot (1996)', 'Banjo-Kazooie (1998)', 'Jak & Daxter (2001)'],
      desc: 'The quantum leap to 3D. New camera challenges, spatial puzzles, and an entirely fresh vocabulary of movement.' },

    { id: 'metroidvania',
      name: 'Metroidvania', year: 1994, row: 6, family: 'platformer', unique: false,
      examples: ['Super Metroid (1994)', 'Castlevania: Symphony of the Night (1997)', 'Hollow Knight (2017)', 'Ori and the Blind Forest (2015)'],
      desc: 'The map is the puzzle. Ability-gated exploration creates a growing mastery of the world. Backtrack to unlock.' },

    { id: 'auto-runner',
      name: 'Auto-Runner', year: 2009, row: 6, family: 'platformer', unique: false,
      examples: ['Canabalt (2009)', 'Temple Run (2011)', 'Geometry Dash (2013)', 'Bit.Trip Runner (2010)'],
      desc: 'The character runs automatically — just time your jumps. Born for mobile, surprisingly deep in its rhythm.' },

    // ── RPG ───────────────────────────────────────────────────────────────
    { id: 'rpg',
      name: 'RPG', year: 1980, row: 7, family: 'rpg', unique: false,
      examples: ['Ultima (1981)', 'Wizardry (1981)', "Bard's Tale (1985)", 'Baldur\'s Gate (1998)'],
      desc: "Born from tabletop D&D. Stats, classes, levelling, exploration. Every decision shapes your character's fate." },

    { id: 'jrpg',
      name: 'JRPG', year: 1986, row: 7, family: 'rpg', unique: false,
      examples: ['Dragon Quest (1986)', 'Final Fantasy (1987)', 'Chrono Trigger (1995)', 'Persona 5 (2016)'],
      desc: 'Japan took the RPG template and layered on linear storytelling, turn-based battles, anime aesthetics, and emotional arcs that last 80 hours.' },

    { id: 'action-rpg',
      name: 'Action RPG', year: 1984, row: 8, family: 'rpg', unique: false,
      examples: ['Dragon Slayer (1984)', 'The Legend of Zelda (1986)', 'Secret of Mana (1993)', 'The Witcher 3 (2015)'],
      desc: 'RPG depth in real-time combat. No turn menus — dodge, slash, and cast in the moment.' },

    { id: 'hack-slash',
      name: 'Hack & Slash', year: 1997, row: 8, family: 'rpg', unique: false,
      examples: ['Diablo (1997)', 'Torchlight (2009)', 'Path of Exile (2013)', 'Grim Dawn (2016)'],
      desc: 'The loot loop perfected. Kill, collect, upgrade. The numbers go up and so does the dopamine. One more dungeon.' },

    { id: 'soulslike',
      name: 'Soulslike', year: 2009, row: 8, family: 'rpg', unique: false,
      examples: ["Demon's Souls (2009)", 'Dark Souls (2011)', 'Bloodborne (2015)', 'Elden Ring (2022)'],
      desc: "Die to learn. Every death is information. The world is the tutorial. Punishing, but never unfair. FromSoftware's contribution to the cultural canon." },

    { id: 'roguelike',
      name: 'Roguelike', year: 1980, row: 9, family: 'rpg', unique: false,
      examples: ['Rogue (1980)', 'NetHack (1987)', 'Angband (1990)', 'DCSS (2006)'],
      desc: 'Procedural dungeons, permadeath, turn-based movement. Every run is a new story. Die and begin again wiser.' },

    { id: 'roguelite',
      name: 'Roguelite', year: 2008, row: 9, family: 'rpg', unique: false,
      examples: ['Spelunky (2008)', 'The Binding of Isaac (2011)', 'Dead Cells (2017)', 'Hades (2020)'],
      desc: 'Roguelike structure meets meta-progression. Die and grow. The loop rewards persistence over perfect play.' },

    { id: 'mmorpg',
      name: 'MMORPG', year: 1997, row: 10, family: 'rpg', unique: false,
      examples: ['Ultima Online (1997)', 'EverQuest (1999)', 'World of Warcraft (2004)', 'Final Fantasy XIV (2013)'],
      desc: 'Thousands of players sharing one persistent world. Guilds, raids, economies. The genre that swallowed lives whole.' },

    // ── Strategy ──────────────────────────────────────────────────────────
    { id: 'strategy',
      name: 'Strategy', year: 1983, row: 11, family: 'strategy', unique: false,
      examples: ['M.U.L.E. (1983)', 'Archon (1983)', 'Reach for the Stars (1983)'],
      desc: 'Think before you act. Resources, positioning, and long-term planning. The ancestor of every genre that followed.' },

    { id: 'tbs',
      name: 'Turn-Based Strategy', year: 1990, row: 11, family: 'strategy', unique: false,
      examples: ['Civilization (1991)', 'X-COM: UFO Defense (1994)', 'Heroes of Might and Magic (1995)', 'Fire Emblem (1990)'],
      desc: 'Take your time. Each turn is a decision; each campaign a war. The patience of a chess match at epic scale.' },

    { id: 'rts',
      name: 'Real-Time Strategy', year: 1992, row: 12, family: 'strategy', unique: false,
      examples: ['Dune II (1992)', 'Warcraft (1994)', 'StarCraft (1998)', 'Age of Empires II (1999)'],
      desc: 'Build base, gather resources, command armies — all simultaneously. APM matters. Preparation meets improvisation.' },

    { id: 'tower-def',
      name: 'Tower Defense', year: 2007, row: 12, family: 'strategy', unique: false,
      examples: ['Desktop Tower Defense (2007)', 'Plants vs. Zombies (2009)', 'Kingdom Rush (2011)'],
      desc: 'Place static units to defend a path. Born from WarCraft III custom maps, perfected on mobile.' },

    { id: 'moba',
      name: 'MOBA', year: 2009, row: 13, family: 'strategy', unique: false,
      examples: ['DotA (2003, WarCraft III mod)', 'League of Legends (2009)', 'Dota 2 (2013)', 'Smite (2014)'],
      desc: '5v5. Control one hero. Destroy the enemy base. Strategy stripped to a single unit, born from a WarCraft III mod.' },

    { id: 'autobattler',
      name: 'Auto Battler', year: 2019, row: 13, family: 'strategy', unique: false,
      examples: ['Dota Auto Chess (2019)', 'Teamfight Tactics (2019)', 'Dota Underlords (2019)'],
      desc: 'Draft and position your pieces — then watch them fight automatically. Strategy without micromanagement.' },

    // ── Fighting ──────────────────────────────────────────────────────────
    { id: 'fighting',
      name: 'Fighting', year: 1984, row: 14, family: 'fighting', unique: false,
      examples: ['Karate Champ (1984)', 'Street Fighter (1987)', 'Yie Ar Kung-Fu (1985)'],
      desc: 'Two characters, one screen. Hit harder, dodge faster, read your opponent. The most direct competitive genre.' },

    { id: '2d-fighter',
      name: '2D Fighter', year: 1991, row: 14, family: 'fighting', unique: false,
      examples: ['Street Fighter II (1991)', 'Mortal Kombat (1992)', 'King of Fighters (1994)', 'Marvel vs. Capcom (1996)'],
      desc: 'The golden age. Quarter-circles and dragon punches. Frame data, mix-ups, devastating combos. Billions of quarters.' },

    { id: 'platform-fighter',
      name: 'Platform Fighter', year: 1999, row: 14, family: 'fighting', unique: false,
      examples: ['Super Smash Bros. (1999)', 'Rivals of Aether (2015)', 'MultiVersus (2022)'],
      desc: 'Fight on floating platforms, knock opponents off the stage. The most accessible face of competitive fighting games.' },

    { id: '3d-fighter',
      name: '3D Fighter', year: 1993, row: 15, family: 'fighting', unique: false,
      examples: ['Virtua Fighter (1993)', 'Tekken (1994)', 'Soul Calibur (1998)', 'Dead or Alive (1996)'],
      desc: 'Sidestep. Guard from all angles. The third dimension added counterplay depth to the combat chess match.' },

    // ── Simulation ────────────────────────────────────────────────────────
    { id: 'sim',
      name: 'Simulation', year: 1982, row: 16, family: 'sim', unique: false,
      examples: ['Microsoft Flight Simulator (1982)', 'SimCity (1989)', "Sid Meier's Railroad Tycoon (1990)"],
      desc: 'Model a slice of reality with interactive systems. Whether a city, a machine, or a life — make it work.' },

    { id: 'life-sim',
      name: 'Life Simulation', year: 2000, row: 16, family: 'sim', unique: false,
      examples: ['The Sims (2000)', 'Animal Crossing (2001)', 'Stardew Valley (2016)', 'Story of Seasons (1996)'],
      desc: 'Simulate everyday life — relationships, chores, hobbies, seasons. Oddly therapeutic. A whole world in miniature.' },

    { id: 'city-builder',
      name: 'City Builder', year: 1989, row: 17, family: 'sim', unique: false,
      examples: ['SimCity (1989)', 'Caesar III (1998)', 'Tropico (2001)', 'Cities: Skylines (2015)'],
      desc: "Zone land. Lay roads. Balance budgets. The zen of urban planning from God's eye view." },

    { id: 'survival-craft',
      name: 'Open World Survival', year: 2011, row: 17, family: 'sim', unique: false,
      examples: ['Minecraft (2011)', 'Rust (2013)', 'Subnautica (2018)', 'Valheim (2021)'],
      desc: 'Gather, craft, build, survive. Infinite procedural worlds to shape entirely in your own image.' },

    // ── ★ Unique ──────────────────────────────────────────────────────────
    { id: 'katamari',
      name: 'Katamari Damacy', year: 2004, row: 18, family: 'unique', unique: true,
      examples: ['Katamari Damacy (2004)', 'We ❤ Katamari (2005)', 'Noby Noby Boy (2009)'],
      desc: "Roll a sticky ball. Collect everything in the universe — paperclips, people, continents. No genre before or since. A cosmic stress-relief toy by Keita Takahashi that utterly defies classification. It just is what it is." },

    { id: 'portal',
      name: 'Portal', year: 2007, row: 19, family: 'unique', unique: true,
      examples: ['Portal (2007)', 'Portal 2 (2011)'],
      desc: 'Place two linked portals and exploit spatial physics to navigate test chambers. Puzzle design as poetry — completely original, wildly influential, and still nothing else quite plays like it.' },

    { id: 'braid',
      name: 'Braid', year: 2008, row: 20, family: 'unique', unique: true,
      examples: ['Braid (2008)'],
      desc: "Rewind time to solve puzzles. Each world has its own temporal rules. A meditation on regret, memory, and the impossibility of going back. Jonathan Blow's singular vision." },

    { id: 'journey',
      name: 'Journey', year: 2012, row: 21, family: 'unique', unique: true,
      examples: ['Journey (2012)'],
      desc: 'Walk through a desert toward a distant mountain. Encounter anonymous strangers. Communicate only in chimes. Emotional resonance without a word of explanation. thatgamecompany at their zenith.' },
  ];

  // ── Connections (parent → child genre) ───────────────────────────────────
  var CONNECTIONS = [
    // Adventure lineage
    { from: 'text-adv',      to: 'graphic-adv'   },
    { from: 'graphic-adv',   to: 'point-click'   },
    { from: 'point-click',   to: '3d-adv'        },
    { from: '3d-adv',        to: 'walking-sim'   },
    // Shooter lineage
    { from: 'space-shooter', to: 'scroll-shooter'},
    { from: 'scroll-shooter',to: 'bullet-hell'   },
    // FPS lineage
    { from: 'fps',           to: 'arena-fps'     },
    { from: 'fps',           to: 'tactical-fps'  },
    { from: 'arena-fps',     to: 'hero-shooter'  },
    { from: 'tactical-fps',  to: 'battle-royale' },
    // Platformer lineage
    { from: 'platformer',    to: 'run-gun'       },
    { from: 'platformer',    to: '3d-platformer' },
    { from: 'platformer',    to: 'metroidvania'  },
    { from: '3d-platformer', to: 'auto-runner'   },
    // RPG lineage
    { from: 'rpg',           to: 'jrpg'          },
    { from: 'rpg',           to: 'action-rpg'    },
    { from: 'rpg',           to: 'roguelike'     },
    { from: 'rpg',           to: 'mmorpg'        },
    { from: 'action-rpg',    to: 'hack-slash'    },
    { from: 'hack-slash',    to: 'soulslike'     },
    { from: 'roguelike',     to: 'roguelite'     },
    // Strategy lineage
    { from: 'strategy',      to: 'tbs'           },
    { from: 'strategy',      to: 'rts'           },
    { from: 'rts',           to: 'tower-def'     },
    { from: 'rts',           to: 'moba'          },
    { from: 'moba',          to: 'autobattler'   },
    // Fighting lineage
    { from: 'fighting',      to: '2d-fighter'    },
    { from: 'fighting',      to: '3d-fighter'    },
    { from: '2d-fighter',    to: 'platform-fighter'},
    // Simulation lineage
    { from: 'sim',           to: 'city-builder'  },
    { from: 'sim',           to: 'life-sim'      },
    { from: 'life-sim',      to: 'survival-craft'},
  ];

  // ── Build lookup map ──────────────────────────────────────────────────────
  var byId = {};
  GENRES.forEach(function (g) { byId[g.id] = g; });

  // ── Initialise ────────────────────────────────────────────────────────────
  function init() {
    var container = document.getElementById('viz-container');
    if (!container || typeof d3 === 'undefined') return;

    var svg = d3.select(container)
      .append('svg')
      .attr('width',  TOTAL_W)
      .attr('height', TOTAL_H)
      .attr('class',  'vgishkur-svg')
      .attr('role', 'img')
      .attr('aria-label', 'Video game genre evolution timeline');

    // Glow filter for unique genres
    var defs = svg.append('defs');
    var glow = defs.append('filter').attr('id', 'vg-glow');
    glow.append('feGaussianBlur')
      .attr('stdDeviation', '3.5')
      .attr('result', 'coloredBlur');
    var fm = glow.append('feMerge');
    fm.append('feMergeNode').attr('in', 'coloredBlur');
    fm.append('feMergeNode').attr('in', 'SourceGraphic');

    // Background
    svg.append('rect')
      .attr('width',  TOTAL_W)
      .attr('height', TOTAL_H)
      .attr('fill', '#0a1120');

    drawBands(svg);
    drawTimeline(svg);
    drawConnections(svg);
    drawNodes(svg);
    buildLegend();
  }

  // ── Family bands ──────────────────────────────────────────────────────────
  function drawBands(svg) {
    var g = svg.append('g').attr('class', 'vg-bands');

    FAMILIES.forEach(function (fam, i) {
      var y1 = rowToY(fam.rows[0]);
      var y2 = rowToY(fam.rows[1] + 1);
      var h  = y2 - y1;

      // Background stripe
      g.append('rect')
        .attr('x', 0).attr('y', y1)
        .attr('width', TOTAL_W).attr('height', h)
        .attr('fill', fam.color)
        .attr('opacity', i % 2 === 0 ? 0.07 : 0.03);

      // Separator line
      g.append('line')
        .attr('x1', ML - 18).attr('y1', y1)
        .attr('x2', ML - 18).attr('y2', y2)
        .attr('stroke', fam.color)
        .attr('stroke-width', 3)
        .attr('opacity', 0.75);

      // Label
      g.append('text')
        .attr('x', ML - 24)
        .attr('y', y1 + h / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', fam.color)
        .attr('font-size', 10.5)
        .attr('font-weight', '700')
        .attr('font-family', 'Inter, sans-serif')
        .attr('letter-spacing', '0.06em')
        .text(fam.label.toUpperCase());
    });
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  function drawTimeline(svg) {
    var g = svg.append('g').attr('class', 'vg-timeline');

    // Axis base line
    g.append('line')
      .attr('x1', ML).attr('y1', MT - 8)
      .attr('x2', TOTAL_W - MR).attr('y2', MT - 8)
      .attr('stroke', '#334155').attr('stroke-width', 1);

    for (var y = YEAR_START; y <= YEAR_END; y++) {
      var isDecade = (y % 10 === 0);
      var isFive   = (y % 5 === 0);
      if (!isDecade && !isFive) continue;

      var x = yearToX(y);

      // Vertical guide line
      g.append('line')
        .attr('x1', x).attr('y1', MT - 8)
        .attr('x2', x).attr('y2', TOTAL_H - MB)
        .attr('stroke', isDecade ? '#334155' : '#1e2d40')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', isDecade ? null : '4 6');

      // Year label
      g.append('text')
        .attr('x', x).attr('y', MT - 16)
        .attr('text-anchor', 'middle')
        .attr('fill', isDecade ? '#94a3b8' : '#475569')
        .attr('font-size', isDecade ? 12 : 9.5)
        .attr('font-weight', isDecade ? '700' : '400')
        .attr('font-family', 'Fira Code, monospace')
        .text(y);
    }
  }

  // ── Connection curves ─────────────────────────────────────────────────────
  function drawConnections(svg) {
    var g = svg.append('g').attr('class', 'vg-connections');

    CONNECTIONS.forEach(function (conn) {
      var src = byId[conn.from];
      var tgt = byId[conn.to];
      if (!src || !tgt) return;

      var x1 = yearToX(src.year) + NODE_W;
      var y1 = rowToY(src.row)   + ROW_H / 2;
      var x2 = yearToX(tgt.year);
      var y2 = rowToY(tgt.row)   + ROW_H / 2;
      var mx = (x1 + x2) / 2;

      var color = C[src.family] || '#64748b';

      g.append('path')
        .attr('d', 'M ' + x1 + ' ' + y1 +
                   ' C ' + mx + ' ' + y1 +
                   ' ' + mx + ' ' + y2 +
                   ' ' + x2 + ' ' + y2)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.38);
    });
  }

  // ── Genre nodes ───────────────────────────────────────────────────────────
  function drawNodes(svg) {
    var g = svg.append('g').attr('class', 'vg-nodes');

    var nodes = g.selectAll('.vg-node')
      .data(GENRES)
      .enter()
      .append('g')
      .attr('class', function (d) {
        return 'vg-node vg-node--' + d.family + (d.unique ? ' vg-node--unique' : '');
      })
      .attr('transform', function (d) {
        return 'translate(' + yearToX(d.year) + ',' +
               (rowToY(d.row) + (ROW_H - NODE_H) / 2) + ')';
      })
      .attr('cursor', 'pointer')
      .attr('tabindex', '0')
      .attr('role', 'button')
      .attr('aria-label', function (d) { return d.name + ' (' + d.year + ')'; })
      .on('click', function (event, d) { showPanel(d); })
      .on('keydown', function (event, d) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showPanel(d);
        }
      })
      .on('mouseenter', function () {
        d3.select(this).select('rect')
          .transition().duration(100)
          .attr('opacity', 1)
          .attr('stroke-width', 2.5);
        d3.select(this).select('text.vg-label')
          .transition().duration(100)
          .attr('fill', '#fff');
      })
      .on('mouseleave', function (event, d) {
        d3.select(this).select('rect')
          .transition().duration(100)
          .attr('opacity', d.unique ? 1 : 0.82)
          .attr('stroke-width', d.unique ? 2 : 1);
        d3.select(this).select('text.vg-label')
          .transition().duration(100)
          .attr('fill', d.unique ? '#0f172a' : '#e2e8f0');
      });

    // Box
    nodes.append('rect')
      .attr('width', NODE_W)
      .attr('height', NODE_H)
      .attr('rx', 6).attr('ry', 6)
      .attr('fill', function (d) { return d.unique ? C[d.family] : '#1a2540'; })
      .attr('stroke', function (d) { return C[d.family]; })
      .attr('stroke-width', function (d) { return d.unique ? 2 : 1; })
      .attr('opacity', function (d) { return d.unique ? 1 : 0.82; })
      .attr('filter', function (d) { return d.unique ? 'url(#vg-glow)' : null; });

    // Star badge for unique genres
    nodes.filter(function (d) { return d.unique; })
      .append('text')
      .attr('x', 7)
      .attr('y', NODE_H / 2 + 4)
      .attr('font-size', 10)
      .attr('fill', '#0f172a')
      .text('★');

    // Genre label
    nodes.append('text')
      .attr('class', 'vg-label')
      .attr('x', function (d) { return d.unique ? NODE_W / 2 + 5 : NODE_W / 2; })
      .attr('y', NODE_H / 2 + 1)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', function (d) { return d.unique ? '#0f172a' : '#e2e8f0'; })
      .attr('font-size', 9.5)
      .attr('font-weight', function (d) { return d.unique ? '700' : '500'; })
      .attr('font-family', 'Inter, sans-serif')
      .text(function (d) { return clip(d.name, 15); });
  }

  // ── Info panel ────────────────────────────────────────────────────────────
  function showPanel(genre) {
    var panel   = document.getElementById('info-panel');
    var content = document.getElementById('panel-content');
    if (!panel || !content) return;

    var color    = C[genre.family] || '#64748b';
    var famLabel = '';
    for (var i = 0; i < FAMILIES.length; i++) {
      if (FAMILIES[i].id === genre.family) { famLabel = FAMILIES[i].label; break; }
    }

    var exLis = genre.examples.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('');

    content.innerHTML =
      '<div class="vgp">' +
        '<div class="vgp__badges">' +
          '<span class="vgp__badge" style="background:' + color + '22;color:' + color + ';border-color:' + color + '44">' + esc(famLabel) + '</span>' +
          (genre.unique ? '<span class="vgp__badge vgp__badge--unique">★ Unique Genre</span>' : '') +
        '</div>' +
        '<h2 class="vgp__name">' + (genre.unique ? '★ ' : '') + esc(genre.name) + '</h2>' +
        '<p class="vgp__year">Born: <strong>' + genre.year + '</strong></p>' +
        '<p class="vgp__desc">' + esc(genre.desc) + '</p>' +
        '<div class="vgp__examples"><h3>Notable Games</h3><ul>' + exLis + '</ul></div>' +
      '</div>';

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  function buildLegend() {
    var legend = document.getElementById('viz-legend');
    if (!legend) return;
    legend.innerHTML = FAMILIES.map(function (fam) {
      return '<span class="vg-legend-item">' +
               '<span class="vg-legend-dot" style="background:' + fam.color + '"></span>' +
               esc(fam.label) +
             '</span>';
    }).join('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clip(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '\u2026' : str;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    init();

    var closeBtn = document.getElementById('panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        var panel = document.getElementById('info-panel');
        if (panel) panel.hidden = true;
      });
    }
  });

}());
