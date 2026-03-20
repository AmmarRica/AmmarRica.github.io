/* videogames-ishkur.js
 * Interactive video-game genre evolution visualization — mobile-first rewrite.
 * Inspired by Ishkur's Guide to Electronic Music (https://music.ishkur.com/)
 *
 * Features:
 *  - Horizontally scrollable on phone (touch-scroll the wrapper)
 *  - Mouse-wheel zoom + pinch-to-zoom on mobile
 *  - ~300 influential games shown as impact circles sized by cultural significance
 *  - Game-to-game influence links (e.g. Magic Survival → Vampire Survivors)
 *  - Expanded families: Arcade Classics, Puzzle
 */
(function () {
  'use strict';

  // ── Layout constants ──────────────────────────────────────────────────────
  var YEAR_START  = 1972;
  var YEAR_END    = 2025;
  var PX_PER_YEAR = 30;
  var ROW_H       = 64;
  var NODE_W      = 108;
  var NODE_H      = 36;
  var ML          = 152;
  var MT          = 54;
  var MR          = 80;
  var MB          = 40;
  var NUM_ROWS    = 0;

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
    arcade:     '#fb923c',
    puzzle:     '#06d6a0',
  };

  // ── Family bands ──────────────────────────────────────────────────────────
  var FAMILIES = [
    { id: 'adventure',  label: 'Adventure',       rows: [0,  0],  color: C.adventure  },
    { id: 'shooter',    label: 'Shooter',          rows: [1,  2],  color: C.shooter    },
    { id: 'fps',        label: 'FPS',              rows: [3,  4],  color: C.fps        },
    { id: 'platformer', label: 'Platformer',       rows: [5,  6],  color: C.platformer },
    { id: 'rpg',        label: 'RPG',              rows: [7,  10], color: C.rpg        },
    { id: 'strategy',   label: 'Strategy',         rows: [11, 13], color: C.strategy   },
    { id: 'fighting',   label: 'Fighting',         rows: [14, 15], color: C.fighting   },
    { id: 'sim',        label: 'Simulation',       rows: [16, 17], color: C.sim        },
    { id: 'unique',     label: '★ Unique',         rows: [18, 21], color: C.unique     },
    { id: 'arcade',     label: 'Arcade Classics',  rows: [22, 23], color: C.arcade     },
    { id: 'puzzle',     label: 'Puzzle',           rows: [24, 25], color: C.puzzle     },
  ];

  NUM_ROWS = FAMILIES.reduce(function (max, f) {
    return Math.max(max, f.rows[1] + 1);
  }, 0);

  var TOTAL_H = MT + NUM_ROWS * ROW_H + MB;

  // ── Genre data ────────────────────────────────────────────────────────────
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
      examples: ['Ultima (1981)', 'Wizardry (1981)', "Bard's Tale (1985)", "Baldur's Gate (1998)"],
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

    { id: 'bullet-heaven',
      name: 'Bullet Heaven', year: 2022, row: 9, family: 'rpg', unique: false,
      examples: ['Magic Survival (2011)', 'Vampire Survivors (2022)', 'Brotato (2022)', '20 Minutes Till Dawn (2022)'],
      desc: 'The reverse bullet hell: YOU are the danger. Auto-attack waves of enemies, collect XP, choose upgrades. Simple, infinitely replayable. Vampire Survivors sparked a genre.' },

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
      desc: "Roll a sticky ball. Collect everything in the universe — paperclips, people, continents. No genre before or since. A cosmic stress-relief toy by Keita Takahashi that utterly defies classification." },

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
      desc: 'Walk through a desert toward a distant mountain. Encounter anonymous strangers. Communicate only in chimes. Emotional resonance without a word of explanation.' },

    // ── Arcade Classics ───────────────────────────────────────────────────
    { id: 'early-arcade',
      name: 'Early Arcade', year: 1972, row: 23, family: 'arcade', unique: false,
      examples: ['Pong (1972)', 'Breakout (1976)', 'Space Invaders (1978)', 'Pac-Man (1980)'],
      desc: 'The birth of an industry. Quarter-hungry machines in dark rooms. Before stories, before characters — just reflexes, scores, and one more credit. Every modern game descends from these first machines.' },

    { id: 'maze-chase',
      name: 'Maze & Chase', year: 1980, row: 22, family: 'arcade', unique: false,
      examples: ['Pac-Man (1980)', 'Dig Dug (1982)', "Q*bert (1982)", 'Pengo (1982)'],
      desc: 'Navigate a maze, eat dots, avoid ghosts. The simple loop became a cultural phenomenon — Pac-Man was the first game with a character, a personality, a face.' },

    { id: 'beat-em-up',
      name: "Beat 'em Up", year: 1984, row: 22, family: 'arcade', unique: false,
      examples: ['Kung-Fu Master (1984)', 'Double Dragon (1987)', 'Final Fight (1989)', 'Streets of Rage (1991)'],
      desc: "Walk right. Punch everything. Double Dragon defined co-op brawling; Final Fight and Streets of Rage perfected it. The purest form of cathartic arcade action." },

    { id: 'racing-arcade',
      name: 'Arcade Racing', year: 1973, row: 23, family: 'arcade', unique: false,
      examples: ['Space Race (1973)', 'Night Driver (1976)', 'Pole Position (1982)', 'Out Run (1986)', 'Crazy Taxi (1999)'],
      desc: 'Fast cars, tight corners, burning rubber. Arcade racers are about the thrill of speed — not simulation. Out Run invented the power fantasy of the open road.' },

    // ── Puzzle ────────────────────────────────────────────────────────────
    { id: 'abstract-puzzle',
      name: 'Abstract Puzzle', year: 1984, row: 24, family: 'puzzle', unique: false,
      examples: ['Tetris (1984)', 'Sokoban (1982)', 'Lemmings (1991)', 'Minesweeper (1990)'],
      desc: 'No shooting, no combat — pure spatial and logical challenge. Tetris proved that simplicity and depth are not opposites. Every falling block carries the weight of a thousand sessions.' },

    { id: 'puzzle-platformer',
      name: 'Puzzle Platformer', year: 2008, row: 24, family: 'puzzle', unique: false,
      examples: ['Braid (2008)', 'Limbo (2010)', 'Inside (2016)', 'The Witness (2016)', 'Baba Is You (2019)'],
      desc: 'The thinking platformer. Each world introduces a new rule and tests your mastery. Mechanics become metaphors; puzzles become emotion.' },

    { id: 'mobile-casual',
      name: 'Mobile Casual', year: 2009, row: 25, family: 'puzzle', unique: false,
      examples: ['Angry Birds (2009)', 'Cut the Rope (2010)', 'Candy Crush Saga (2012)', 'Clash of Clans (2012)'],
      desc: 'Born on smartphones, designed for five-minute sessions but played for five-hour binges. Angry Birds put gaming in a billion pockets. Candy Crush made it a pastime for everyone.' },

    { id: 'escape-mystery',
      name: 'Escape & Mystery', year: 2012, row: 25, family: 'puzzle', unique: false,
      examples: ['The Room (2012)', 'Her Story (2015)', 'Outer Wilds (2019)', 'Return of the Obra Dinn (2018)'],
      desc: 'Observation over combat. Hidden rooms, cryptic clues, and the intoxicating moment when it all clicks into place. The puzzle genre grown up and deeply literary.' },
  ];

  // ── Connections (genre → genre) ───────────────────────────────────────────
  var CONNECTIONS = [
    // Adventure
    { from: 'text-adv',       to: 'graphic-adv'     },
    { from: 'graphic-adv',    to: 'point-click'     },
    { from: 'point-click',    to: '3d-adv'          },
    { from: '3d-adv',         to: 'walking-sim'     },
    // Shooter
    { from: 'space-shooter',  to: 'scroll-shooter'  },
    { from: 'scroll-shooter', to: 'bullet-hell'     },
    // FPS
    { from: 'fps',            to: 'arena-fps'       },
    { from: 'fps',            to: 'tactical-fps'    },
    { from: 'arena-fps',      to: 'hero-shooter'    },
    { from: 'tactical-fps',   to: 'battle-royale'   },
    // Platformer
    { from: 'platformer',     to: 'run-gun'         },
    { from: 'platformer',     to: '3d-platformer'   },
    { from: 'platformer',     to: 'metroidvania'    },
    { from: '3d-platformer',  to: 'auto-runner'     },
    // RPG
    { from: 'rpg',            to: 'jrpg'            },
    { from: 'rpg',            to: 'action-rpg'      },
    { from: 'rpg',            to: 'roguelike'       },
    { from: 'rpg',            to: 'mmorpg'          },
    { from: 'action-rpg',     to: 'hack-slash'      },
    { from: 'hack-slash',     to: 'soulslike'       },
    { from: 'roguelike',      to: 'roguelite'       },
    { from: 'roguelite',      to: 'bullet-heaven'   },
    // Strategy
    { from: 'strategy',       to: 'tbs'             },
    { from: 'strategy',       to: 'rts'             },
    { from: 'rts',            to: 'tower-def'       },
    { from: 'rts',            to: 'moba'            },
    { from: 'moba',           to: 'autobattler'     },
    // Fighting
    { from: 'fighting',       to: '2d-fighter'      },
    { from: 'fighting',       to: '3d-fighter'      },
    { from: '2d-fighter',     to: 'platform-fighter'},
    // Simulation
    { from: 'sim',            to: 'city-builder'    },
    { from: 'sim',            to: 'life-sim'        },
    { from: 'life-sim',       to: 'survival-craft'  },
    // Arcade → other genres
    { from: 'early-arcade',   to: 'space-shooter'   },
    { from: 'early-arcade',   to: 'platformer'      },
    { from: 'early-arcade',   to: 'fighting'        },
    { from: 'maze-chase',     to: 'beat-em-up'      },
    // Puzzle lineage
    { from: 'abstract-puzzle',    to: 'puzzle-platformer' },
    { from: 'abstract-puzzle',    to: 'mobile-casual'     },
    { from: 'puzzle-platformer',  to: 'escape-mystery'    },
  ];

  // ── Individual game circles ───────────────────────────────────────────────
  // Format: [id, name, year, row, family, impact 1-5]
  // impact: 1 = minor, 3 = important, 5 = genre-defining / cultural landmark
  var GAMES = (function () {
    var raw = [
      // ── Early Arcade (row 23) ──────────────────────────────────────────
      ['pong',          'Pong',                    1972, 23, 'arcade', 5],
      ['space-race',    'Space Race',              1973, 23, 'arcade', 2],
      ['tank-arcade',   'Tank',                    1974, 23, 'arcade', 2],
      ['night-driver',  'Night Driver',            1976, 23, 'arcade', 3],
      ['breakout',      'Breakout',                1976, 23, 'arcade', 4],
      ['sprint2',       'Sprint 2',                1976, 23, 'arcade', 2],
      ['death-race',    'Death Race',              1976, 23, 'arcade', 2],
      ['atari-football','Football (Atari)',         1977, 23, 'arcade', 2],
      ['circus',        'Circus',                  1977, 23, 'arcade', 2],
      ['space-wars',    'Space Wars',              1977, 23, 'arcade', 2],
      ['pole-pos',      'Pole Position',           1982, 23, 'arcade', 4],
      ['spy-hunter',    'Spy Hunter',              1983, 23, 'arcade', 3],
      ['outrun',        'Out Run',                 1986, 23, 'arcade', 4],
      ['after-burner',  'After Burner II',         1987, 23, 'arcade', 3],
      ['virtua-racing', 'Virtua Racing',           1992, 23, 'arcade', 4],
      ['gran-turismo',  'Gran Turismo',            1997, 23, 'arcade', 4],
      ['crazy-taxi',    'Crazy Taxi',              1999, 23, 'arcade', 3],
      ['mk-kart',       'Mario Kart 64',           1996, 23, 'arcade', 4],
      ['super-mk',      'Super Mario Kart',        1992, 23, 'arcade', 5],
      ['need-speed',    'Need for Speed Underground',2003, 23, 'arcade', 4],
      ['burnout3',      'Burnout 3: Takedown',     2004, 23, 'arcade', 4],
      ['rocket-league', 'Rocket League',           2015, 23, 'arcade', 5],
      ['f-zero',        'F-Zero',                  1990, 23, 'arcade', 3],
      ['trackmania',    'TrackMania Nations',      2006, 23, 'arcade', 3],

      // ── Maze / Beat-em-Up (row 22) ─────────────────────────────────────
      ['pac-man',       'Pac-Man',                 1980, 22, 'arcade', 5],
      ['rally-x',       'Rally-X',                 1980, 22, 'arcade', 2],
      ['dig-dug',       'Dig Dug',                 1982, 22, 'arcade', 3],
      ['qbert',         "Q*bert",                  1982, 22, 'arcade', 3],
      ['joust',         'Joust',                   1982, 22, 'arcade', 3],
      ['tron',          'Tron',                    1982, 22, 'arcade', 3],
      ['pengo',         'Pengo',                   1982, 22, 'arcade', 2],
      ['popeye',        'Popeye',                  1982, 22, 'arcade', 2],
      ['food-fight',    'Food Fight',              1983, 22, 'arcade', 2],
      ['paperboy',      'Paperboy',                1984, 22, 'arcade', 3],
      ['marble-mad',    'Marble Madness',          1984, 22, 'arcade', 3],
      ['kung-fu',       'Kung-Fu Master',          1984, 22, 'arcade', 4],
      ['dragons-lair',  "Dragon's Lair",           1983, 22, 'arcade', 3],
      ['ghng',          "Ghosts 'n Goblins",       1985, 22, 'arcade', 4],
      ['rampage',       'Rampage',                 1986, 22, 'arcade', 2],
      ['arkanoid',      'Arkanoid',                1986, 22, 'arcade', 3],
      ['double-dragon', 'Double Dragon',           1987, 22, 'arcade', 4],
      ['shinobi',       'Shinobi',                 1987, 22, 'arcade', 3],
      ['altered-beast', 'Altered Beast',           1988, 22, 'arcade', 3],
      ['golden-axe',    'Golden Axe',              1989, 22, 'arcade', 3],
      ['final-fight',   'Final Fight',             1989, 22, 'arcade', 4],
      ['streets-rage',  'Streets of Rage',         1991, 22, 'arcade', 4],
      ['tmnt-arcade',   'TMNT: Turtles in Time',   1991, 22, 'arcade', 3],
      ['simpsons-arc',  'The Simpsons Arcade',     1991, 22, 'arcade', 3],
      ['castle-crisis', 'Alien vs. Predator',      1994, 22, 'arcade', 2],
      ['god-of-war',    'God of War',              2005, 22, 'arcade', 5],
      ['bayonetta',     'Bayonetta',               2009, 22, 'arcade', 4],
      ['devil-may-cry', 'Devil May Cry',           2001, 22, 'arcade', 4],
      ['hades-beat',    'Hades',                   2020, 22, 'rpg',    5],
      ['metal-slug',    'Metal Slug',              1996, 22, 'arcade', 4],

      // ── Space / Scroll Shooters (rows 1-2) ─────────────────────────────
      ['space-inv',     'Space Invaders',          1978, 1, 'shooter', 5],
      ['asteroids',     'Asteroids',               1979, 1, 'shooter', 5],
      ['galaxian',      'Galaxian',                1979, 1, 'shooter', 4],
      ['centipede',     'Centipede',               1980, 1, 'shooter', 3],
      ['missile-cmd',   'Missile Command',         1980, 1, 'shooter', 4],
      ['defender',      'Defender',                1981, 1, 'shooter', 4],
      ['galaga',        'Galaga',                  1981, 1, 'shooter', 5],
      ['zaxxon',        'Zaxxon',                  1982, 1, 'shooter', 3],
      ['time-pilot',    'Time Pilot',              1982, 1, 'shooter', 2],
      ['xevious',       'Xevious',                 1982, 1, 'shooter', 3],
      ['1942',          '1942',                    1984, 1, 'shooter', 3],
      ['gradius',       'Gradius',                 1985, 1, 'shooter', 4],
      ['ikari',         'Ikari Warriors',          1986, 1, 'shooter', 2],
      ['rtype',         'R-Type',                  1987, 1, 'shooter', 4],
      ['raiden',        'Raiden',                  1990, 1, 'shooter', 3],
      ['radiant-sv',    'Radiant Silvergun',        1998, 2, 'shooter', 3],
      ['battle-gareg',  'Battle Garegga',          1996, 2, 'shooter', 3],
      ['touhou',        'Touhou Project',           1996, 2, 'shooter', 4],
      ['dodunpachi',    'DoDonPachi',              1997, 2, 'shooter', 4],
      ['ikaruga',       'Ikaruga',                 2001, 2, 'shooter', 4],
      ['espgaluda',     'Espgaluda',               2003, 2, 'shooter', 2],
      ['mushihimesama', 'Mushihimesama',           2004, 2, 'shooter', 3],
      ['azure-striker', 'Azure Striker Gunvolt',   2014, 2, 'shooter', 2],
      ['nex-machina',   'Nex Machina',             2017, 1, 'shooter', 3],

      // ── FPS (rows 3-4) ─────────────────────────────────────────────────
      ['wolfenstein',   'Wolfenstein 3D',          1992, 3, 'fps', 5],
      ['doom',          'Doom',                    1993, 3, 'fps', 5],
      ['heretic',       'Heretic',                 1994, 3, 'fps', 2],
      ['doom2',         'Doom II',                 1994, 3, 'fps', 4],
      ['duke3d',        'Duke Nukem 3D',           1996, 3, 'fps', 4],
      ['quake',         'Quake',                   1996, 3, 'fps', 5],
      ['turok',         'Turok',                   1997, 3, 'fps', 3],
      ['goldeneye',     'GoldenEye 007',           1997, 3, 'fps', 5],
      ['unreal',        'Unreal',                  1998, 3, 'fps', 4],
      ['half-life',     'Half-Life',               1998, 3, 'fps', 5],
      ['cs',            'Counter-Strike',          2000, 4, 'fps', 5],
      ['hl2',           'Half-Life 2',             2004, 3, 'fps', 5],
      ['quake3',        'Quake III Arena',         1999, 3, 'fps', 4],
      ['ut99',          'Unreal Tournament',       1999, 3, 'fps', 4],
      ['halo',          'Halo: Combat Evolved',    2001, 3, 'fps', 5],
      ['halo3',         'Halo 3',                  2007, 3, 'fps', 4],
      ['cod4',          'Call of Duty 4: MW',      2007, 3, 'fps', 5],
      ['mw2',           'Call of Duty: MW2',       2009, 3, 'fps', 4],
      ['farcry',        'Far Cry',                 2004, 3, 'fps', 4],
      ['bioshock',      'BioShock',                2007, 3, 'fps', 5],
      ['l4d',           'Left 4 Dead',             2008, 3, 'fps', 4],
      ['borderlands',   'Borderlands',             2009, 3, 'fps', 4],
      ['titanfall2',    'Titanfall 2',             2016, 3, 'fps', 4],
      ['overwatch',     'Overwatch',               2016, 3, 'fps', 5],
      ['apex',          'Apex Legends',            2019, 3, 'fps', 5],
      ['r6siege',       'Rainbow Six Siege',       2015, 4, 'fps', 4],
      ['pubg',          'PUBG',                    2017, 4, 'fps', 5],
      ['fortnite',      'Fortnite',                2017, 4, 'fps', 5],
      ['valorant',      'Valorant',                2020, 4, 'fps', 4],
      ['warzone',       'Call of Duty: Warzone',   2020, 4, 'fps', 4],
      ['battlefield42', 'Battlefield 1942',        2002, 4, 'fps', 4],
      ['destiny',       'Destiny',                 2014, 3, 'fps', 4],
      ['csgo',          'CS:GO',                   2012, 4, 'fps', 5],

      // ── Platformer (rows 5-6) ──────────────────────────────────────────
      ['pitfall',       'Pitfall!',                1982, 5, 'platformer', 3],
      ['mario-bros',    'Mario Bros.',             1983, 5, 'platformer', 4],
      ['donkey-kong',   'Donkey Kong',             1981, 5, 'platformer', 5],
      ['super-mario',   'Super Mario Bros.',       1985, 5, 'platformer', 5],
      ['mega-man',      'Mega Man',                1987, 5, 'platformer', 4],
      ['contra',        'Contra',                  1987, 5, 'platformer', 4],
      ['bionic-cmd',    'Bionic Commando',         1987, 5, 'platformer', 3],
      ['ghoul-ghosts',  "Ghouls 'n Ghosts",        1988, 5, 'platformer', 3],
      ['super-mario3',  'Super Mario Bros. 3',     1988, 5, 'platformer', 5],
      ['duck-tales',    'DuckTales',               1989, 5, 'platformer', 3],
      ['snes-mario',    'Super Mario World',       1990, 5, 'platformer', 5],
      ['sonic',         'Sonic the Hedgehog',      1991, 5, 'platformer', 5],
      ['battletoads',   'Battletoads',             1991, 5, 'platformer', 3],
      ['kirby',         "Kirby's Dream Land",      1992, 5, 'platformer', 4],
      ['aladdin-snes',  'Aladdin (SNES)',          1993, 5, 'platformer', 3],
      ['dk-country',    'Donkey Kong Country',     1994, 5, 'platformer', 4],
      ['yoshis-island', "Yoshi's Island",          1995, 5, 'platformer', 4],
      ['rayman',        'Rayman',                  1995, 5, 'platformer', 3],
      ['mario64',       'Super Mario 64',          1996, 5, 'platformer', 5],
      ['crash',         'Crash Bandicoot',         1996, 5, 'platformer', 4],
      ['banjo',         'Banjo-Kazooie',           1998, 5, 'platformer', 4],
      ['spyro',         'Spyro the Dragon',        1998, 5, 'platformer', 4],
      ['ape-escape',    'Ape Escape',              1999, 5, 'platformer', 3],
      ['jak',           'Jak and Daxter',          2001, 5, 'platformer', 3],
      ['ratchet',       'Ratchet & Clank',         2002, 5, 'platformer', 4],
      ['mega-man-x',    'Mega Man X',              1993, 5, 'platformer', 4],
      ['shovel-knight', 'Shovel Knight',           2014, 5, 'platformer', 4],
      ['super-mario-od','Super Mario Odyssey',     2017, 5, 'platformer', 5],
      ['a-hat-in-time', 'A Hat in Time',           2017, 5, 'platformer', 3],
      ['astro-bot',     "Astro Bot",               2024, 5, 'platformer', 4],
      ['super-metroid', 'Super Metroid',           1994, 6, 'platformer', 5],
      ['castlevania-sotn',"Castlevania: SotN",     1997, 6, 'platformer', 5],
      ['ori',           'Ori and the Blind Forest',2015, 6, 'platformer', 4],
      ['hollow-knight', 'Hollow Knight',           2017, 6, 'platformer', 5],
      ['celeste',       'Celeste',                 2018, 6, 'platformer', 4],
      ['axiom-verge',   'Axiom Verge',             2015, 6, 'platformer', 3],
      ['rain-world',    'Rain World',              2017, 6, 'platformer', 3],
      ['canabalt',      'Canabalt',                2009, 6, 'platformer', 3],
      ['temple-run',    'Temple Run',              2011, 6, 'platformer', 4],
      ['geometry-dash', 'Geometry Dash',           2013, 6, 'platformer', 4],
      ['cuphead',       'Cuphead',                 2017, 5, 'platformer', 4],

      // ── RPG (row 7 - JRPG / classic RPG) ──────────────────────────────
      ['ultima',        'Ultima',                  1981, 7, 'rpg', 4],
      ['wizardry',      'Wizardry',                1981, 7, 'rpg', 4],
      ['ultima4',       'Ultima IV',               1985, 7, 'rpg', 4],
      ['dragon-quest',  'Dragon Quest',            1986, 7, 'rpg', 5],
      ['final-fantasy', 'Final Fantasy',           1987, 7, 'rpg', 5],
      ['ff4',           'Final Fantasy IV',        1991, 7, 'rpg', 4],
      ['ff6',           'Final Fantasy VI',        1994, 7, 'rpg', 5],
      ['chrono-trig',   'Chrono Trigger',          1995, 7, 'rpg', 5],
      ['earthbound',    'EarthBound',              1994, 7, 'rpg', 4],
      ['baldurs-gate',  "Baldur's Gate",           1998, 7, 'rpg', 5],
      ['ff7',           'Final Fantasy VII',       1997, 7, 'rpg', 5],
      ['pokemon-rb',    'Pokémon Red/Blue',        1996, 7, 'rpg', 5],
      ['dq5',           'Dragon Quest V',          1992, 7, 'rpg', 4],
      ['breath-fire',   'Breath of Fire',          1993, 7, 'rpg', 3],
      ['kotor',         'KOTOR',                   2003, 7, 'rpg', 5],
      ['ff10',          'Final Fantasy X',         2001, 7, 'rpg', 4],
      ['persona4',      'Persona 4',               2008, 7, 'rpg', 4],
      ['persona5',      'Persona 5',               2016, 7, 'rpg', 5],
      ['skyrim',        'The Elder Scrolls V: Skyrim',2011, 7, 'rpg', 5],
      ['witcher3',      'The Witcher 3',           2015, 7, 'rpg', 5],
      ['ni-no-kuni',    'Ni no Kuni',              2011, 7, 'rpg', 3],
      ['genshin',       'Genshin Impact',          2020, 7, 'rpg', 5],
      ['octopath',      'Octopath Traveler',       2018, 7, 'rpg', 3],
      ['pokemon-go',    'Pokémon GO',              2016, 7, 'rpg', 5],

      // ── Action RPG / Hack & Slash / Soulslike (row 8) ─────────────────
      ['zelda',         'The Legend of Zelda',     1986, 8, 'rpg', 5],
      ['zelda-lttp',    'Zelda: A Link to the Past',1991, 8, 'rpg', 5],
      ['zelda-oot',     'Zelda: Ocarina of Time',  1998, 8, 'rpg', 5],
      ['secret-mana',   'Secret of Mana',          1993, 8, 'rpg', 4],
      ['diablo',        'Diablo',                  1997, 8, 'rpg', 5],
      ['diablo2',       'Diablo II',               2000, 8, 'rpg', 5],
      ['diablo3',       'Diablo III',              2012, 8, 'rpg', 4],
      ['torchlight',    'Torchlight',              2009, 8, 'rpg', 3],
      ['poe',           'Path of Exile',           2013, 8, 'rpg', 4],
      ['grim-dawn',     'Grim Dawn',               2016, 8, 'rpg', 3],
      ['demon-souls',   "Demon's Souls",           2009, 8, 'rpg', 4],
      ['dark-souls',    'Dark Souls',              2011, 8, 'rpg', 5],
      ['dark-souls3',   'Dark Souls III',          2016, 8, 'rpg', 4],
      ['bloodborne',    'Bloodborne',              2015, 8, 'rpg', 5],
      ['sekiro',        'Sekiro',                  2019, 8, 'rpg', 4],
      ['elden-ring',    'Elden Ring',              2022, 8, 'rpg', 5],
      ['zelda-botw',    'Zelda: Breath of the Wild',2017, 8, 'rpg', 5],
      ['zelda-totk',    'Zelda: Tears of the Kingdom',2023, 8, 'rpg', 5],

      // ── Roguelike / Roguelite / Bullet Heaven (row 9) ─────────────────
      ['rogue',         'Rogue',                   1980, 9, 'rpg', 5],
      ['moria',         'Moria',                   1983, 9, 'rpg', 2],
      ['nethack',       'NetHack',                 1987, 9, 'rpg', 4],
      ['angband',       'Angband',                 1990, 9, 'rpg', 3],
      ['dcss',          'Dungeon Crawl Stone Soup', 2006, 9, 'rpg', 3],
      ['spelunky',      'Spelunky',                2008, 9, 'rpg', 4],
      ['isaac',         'The Binding of Isaac',    2011, 9, 'rpg', 5],
      ['ftl',           'FTL: Faster Than Light',  2012, 9, 'rpg', 4],
      ['rogue-legacy',  'Rogue Legacy',            2013, 9, 'rpg', 4],
      ['gungeon',       'Enter the Gungeon',       2016, 9, 'rpg', 4],
      ['dead-cells',    'Dead Cells',              2017, 9, 'rpg', 4],
      ['slay-spire',    'Slay the Spire',          2019, 9, 'rpg', 5],
      ['risk-rain2',    'Risk of Rain 2',          2019, 9, 'rpg', 4],
      ['hades-game',    'Hades',                   2020, 9, 'rpg', 5],
      ['noita',         'Noita',                   2020, 9, 'rpg', 3],
      ['magic-surv',    'Magic Survival',          2011, 9, 'rpg', 2],
      ['vamp-surv',     'Vampire Survivors',       2022, 9, 'rpg', 5],
      ['brotato',       'Brotato',                 2022, 9, 'rpg', 3],
      ['20min-till-dawn','20 Minutes Till Dawn',   2022, 9, 'rpg', 3],
      ['gunfire-reborn','Gunfire Reborn',          2021, 9, 'rpg', 3],
      ['undertale',     'Undertale',               2015, 9, 'rpg', 5],

      // ── MMORPG (row 10) ────────────────────────────────────────────────
      ['uo',            'Ultima Online',           1997, 10, 'rpg', 4],
      ['eq',            'EverQuest',               1999, 10, 'rpg', 5],
      ['wow',           'World of Warcraft',       2004, 10, 'rpg', 5],
      ['ff11',          'Final Fantasy XI',        2002, 10, 'rpg', 3],
      ['guild-wars',    'Guild Wars',              2005, 10, 'rpg', 3],
      ['ff14',          'Final Fantasy XIV',       2013, 10, 'rpg', 5],
      ['eso',           'Elder Scrolls Online',    2014, 10, 'rpg', 3],
      ['swtor',         'SW: The Old Republic',    2011, 10, 'rpg', 3],

      // ── Strategy TBS (row 11) ──────────────────────────────────────────
      ['civ',           'Civilization',            1991, 11, 'strategy', 5],
      ['civ2',          'Civilization II',         1996, 11, 'strategy', 4],
      ['civ4',          'Civilization IV',         2005, 11, 'strategy', 4],
      ['civ5',          'Civilization V',          2010, 11, 'strategy', 4],
      ['civ6',          'Civilization VI',         2016, 11, 'strategy', 4],
      ['xcom-ufo',      'X-COM: UFO Defense',      1994, 11, 'strategy', 5],
      ['xcom2012',      'XCOM: Enemy Unknown',     2012, 11, 'strategy', 4],
      ['heroes3',       'Heroes of M&M III',       1999, 11, 'strategy', 4],
      ['fire-emblem',   'Fire Emblem',             1990, 11, 'strategy', 3],
      ['fe3h',          'Fire Emblem: Three Houses',2019, 11, 'strategy', 4],
      ['into-breach',   'Into the Breach',         2018, 11, 'strategy', 4],
      ['wargroove',     'Wargroove',               2019, 11, 'strategy', 2],
      ['advance-wars',  'Advance Wars',            2001, 11, 'strategy', 3],
      ['hearthstone',   'Hearthstone',             2014, 11, 'strategy', 4],
      ['gwent',         'Gwent',                   2018, 11, 'strategy', 3],
      ['slay-throne',   'Monster Train',           2020, 11, 'strategy', 3],
      ['age-wonders',   'Age of Wonders',          1999, 11, 'strategy', 3],

      // ── Strategy RTS / Tower Def (row 12) ──────────────────────────────
      ['dune2',         'Dune II',                 1992, 12, 'strategy', 5],
      ['warcraft',      'Warcraft: Orcs & Humans', 1994, 12, 'strategy', 4],
      ['warcraft2',     'Warcraft II',             1995, 12, 'strategy', 4],
      ['warcraft3',     'Warcraft III',            2002, 12, 'strategy', 5],
      ['starcraft',     'StarCraft',               1998, 12, 'strategy', 5],
      ['starcraft2',    'StarCraft II',            2010, 12, 'strategy', 4],
      ['aoe',           'Age of Empires',          1997, 12, 'strategy', 4],
      ['aoe2',          'Age of Empires II',       1999, 12, 'strategy', 5],
      ['aoe4',          'Age of Empires IV',       2021, 12, 'strategy', 3],
      ['company-heros', 'Company of Heroes',       2006, 12, 'strategy', 4],
      ['pvz',           'Plants vs. Zombies',      2009, 12, 'strategy', 4],
      ['clash-clans',   'Clash of Clans',          2012, 12, 'strategy', 4],
      ['kingdom-rush',  'Kingdom Rush',            2011, 12, 'strategy', 3],

      // ── MOBA / Auto Battler (row 13) ───────────────────────────────────
      ['dota-mod',      'DotA (WC3 mod)',           2003, 13, 'strategy', 4],
      ['hon',           'Heroes of Newerth',        2010, 13, 'strategy', 2],
      ['lol',           'League of Legends',        2009, 13, 'strategy', 5],
      ['dota2',         'Dota 2',                   2013, 13, 'strategy', 4],
      ['smite',         'Smite',                    2014, 13, 'strategy', 3],
      ['tft',           'Teamfight Tactics',        2019, 13, 'strategy', 4],
      ['dota-chess',    'Dota Auto Chess',          2019, 13, 'strategy', 4],
      ['underlords',    'Dota Underlords',          2019, 13, 'strategy', 3],

      // ── Fighting (rows 14-15) ──────────────────────────────────────────
      ['karate-champ',  'Karate Champ',            1984, 14, 'fighting', 4],
      ['yie-ar',        'Yie Ar Kung-Fu',          1985, 14, 'fighting', 3],
      ['street-fighter','Street Fighter',           1987, 14, 'fighting', 4],
      ['sf2',           'Street Fighter II',        1991, 14, 'fighting', 5],
      ['mk',            'Mortal Kombat',            1992, 14, 'fighting', 5],
      ['mk2',           'Mortal Kombat II',         1993, 14, 'fighting', 4],
      ['kof94',         'King of Fighters \'94',   1994, 14, 'fighting', 3],
      ['kof98',         "King of Fighters '98",    1998, 14, 'fighting', 4],
      ['mvc',           'Marvel vs. Capcom 2',     2000, 14, 'fighting', 4],
      ['sf4',           'Street Fighter IV',       2008, 14, 'fighting', 4],
      ['smash64',       'Super Smash Bros.',        1999, 14, 'fighting', 5],
      ['smash-melee',   'Smash Bros. Melee',       2001, 14, 'fighting', 5],
      ['smash-ult',     'Smash Bros. Ultimate',    2018, 14, 'fighting', 5],
      ['guilty-gear',   'Guilty Gear Strive',      2021, 14, 'fighting', 3],
      ['dragon-ball-fg','Dragon Ball FighterZ',    2018, 14, 'fighting', 3],
      ['virtua-fight',  'Virtua Fighter',           1993, 15, 'fighting', 4],
      ['tekken',        'Tekken',                  1994, 15, 'fighting', 4],
      ['tekken3',       'Tekken 3',                1997, 15, 'fighting', 5],
      ['soul-calibur',  'Soul Calibur',            1998, 15, 'fighting', 4],
      ['doa',           'Dead or Alive',           1996, 15, 'fighting', 3],

      // ── Simulation (rows 16-17) ────────────────────────────────────────
      ['mfs',           'Microsoft Flight Sim.',   1982, 16, 'sim', 4],
      ['pitfall2',      'SimLife',                 1992, 16, 'sim', 2],
      ['sims',          'The Sims',                2000, 16, 'sim', 5],
      ['sims2',         'The Sims 2',              2004, 16, 'sim', 4],
      ['sims4',         'The Sims 4',              2014, 16, 'sim', 4],
      ['animal-cross',  'Animal Crossing',         2001, 16, 'sim', 5],
      ['ac-nh',         'Animal Crossing: NH',     2020, 16, 'sim', 5],
      ['stardew',       'Stardew Valley',          2016, 16, 'sim', 5],
      ['story-seasons', 'Story of Seasons',        1996, 16, 'sim', 3],
      ['harvest-moon',  'Harvest Moon',            1996, 16, 'sim', 4],
      ['tamagotchi',    'Tamagotchi',              1996, 16, 'sim', 4],
      ['simcity',       'SimCity',                 1989, 17, 'sim', 5],
      ['simcity4',      'SimCity 4',               2003, 17, 'sim', 4],
      ['caesar3',       'Caesar III',              1998, 17, 'sim', 3],
      ['tropico',       'Tropico',                 2001, 17, 'sim', 3],
      ['cities-sky',    'Cities: Skylines',        2015, 17, 'sim', 4],
      ['minecraft',     'Minecraft',               2011, 17, 'sim', 5],
      ['terraria',      'Terraria',                2011, 17, 'sim', 4],
      ['rust',          'Rust',                    2013, 17, 'sim', 4],
      ['subnautica',    'Subnautica',              2018, 17, 'sim', 4],
      ['valheim',       'Valheim',                 2021, 17, 'sim', 4],

      // ── Puzzle (rows 24-25) ────────────────────────────────────────────
      ['tetris',        'Tetris',                  1984, 24, 'puzzle', 5],
      ['sokoban',       'Sokoban',                 1982, 24, 'puzzle', 3],
      ['lemmings',      'Lemmings',                1991, 24, 'puzzle', 4],
      ['minesweeper',   'Minesweeper',             1990, 24, 'puzzle', 3],
      ['tetris-ds',     'Tetris DS',               2006, 24, 'puzzle', 3],
      ['portal-game',   'Portal',                  2007, 24, 'puzzle', 5],
      ['portal2',       'Portal 2',                2011, 24, 'puzzle', 4],
      ['braid-g',       'Braid',                   2008, 24, 'puzzle', 4],
      ['limbo',         'Limbo',                   2010, 24, 'puzzle', 4],
      ['inside',        'Inside',                  2016, 24, 'puzzle', 4],
      ['witness',       'The Witness',             2016, 24, 'puzzle', 4],
      ['baba-is-you',   'Baba Is You',             2019, 24, 'puzzle', 4],
      ['antichamber',   'Antichamber',             2013, 24, 'puzzle', 3],
      ['stephen-saus',  "Stephen's Sausage Roll",  2016, 24, 'puzzle', 3],
      ['angry-birds',   'Angry Birds',             2009, 25, 'puzzle', 5],
      ['cut-rope',      'Cut the Rope',            2010, 25, 'puzzle', 3],
      ['candy-crush',   'Candy Crush Saga',        2012, 25, 'puzzle', 4],
      ['room-puzzle',   'The Room',                2012, 25, 'puzzle', 3],
      ['2048',          '2048',                    2014, 25, 'puzzle', 3],
      ['among-us',      'Among Us',                2018, 25, 'puzzle', 4],
      ['fnaf',          "Five Nights at Freddy's", 2014, 25, 'puzzle', 4],
      ['her-story',     'Her Story',               2015, 25, 'puzzle', 3],
      ['outer-wilds',   'Outer Wilds',             2019, 25, 'puzzle', 5],
      ['obra-dinn',     'Return of the Obra Dinn', 2018, 25, 'puzzle', 4],

      // ── Adventure (row 0) ─────────────────────────────────────────────
      ['cave-adv',      'Colossal Cave Adventure', 1976,  0, 'adventure', 4],
      ['zork',          'Zork',                    1977,  0, 'adventure', 4],
      ['kings-quest',   "King's Quest",            1984,  0, 'adventure', 4],
      ['monkey-island', 'Secret of Monkey Island', 1990,  0, 'adventure', 5],
      ['myst',          'Myst',                    1993,  0, 'adventure', 5],
      ['day-tent',      'Day of the Tentacle',     1993,  0, 'adventure', 4],
      ['sam-max-adv',   'Sam & Max Hit the Road',  1993,  0, 'adventure', 3],
      ['grim-fandango', 'Grim Fandango',           1998,  0, 'adventure', 5],
      ['longest-journ', 'The Longest Journey',     1999,  0, 'adventure', 3],
      ['broken-sword',  'Broken Sword',            1996,  0, 'adventure', 3],
      ['syberia',       'Syberia',                 2002,  0, 'adventure', 3],
      ['dear-esther',   'Dear Esther',             2012,  0, 'adventure', 3],
      ['gone-home',     'Gone Home',               2013,  0, 'adventure', 4],
      ['firewatch',     'Firewatch',               2016,  0, 'adventure', 4],
      ['edith-finch',   'What Remains of Edith Finch',2017,0,'adventure', 4],
      ['obra-dinn-adv', 'Return of the Obra Dinn', 2018,  0, 'adventure', 4],
    ];

    return raw.map(function (g) {
      return { id: g[0], name: g[1], year: g[2], row: g[3], family: g[4], impact: g[5] };
    });
  }());

  // ── Game-to-game influence connections ────────────────────────────────────
  // These show specific game-to-game lineage (e.g. precursor → successor)
  var GAME_LINKS = [
    // Vampire Survivors lineage
    { from: 'magic-surv',    to: 'vamp-surv',    label: 'direct inspiration' },
    // Roguelike → Roguelite bridge
    { from: 'rogue',         to: 'spelunky',     label: 'roguelike DNA' },
    { from: 'spelunky',      to: 'isaac',        label: 'roguelite influence' },
    { from: 'isaac',         to: 'gungeon',      label: 'roguelite influence' },
    { from: 'isaac',         to: 'hades-game',   label: 'roguelite influence' },
    { from: 'slay-spire',    to: 'vamp-surv',    label: 'roguelite crossover' },
    // FPS lineage key bridges
    { from: 'doom',          to: 'quake',        label: 'id Software evolution' },
    { from: 'quake',         to: 'half-life',    label: 'FPS evolution' },
    { from: 'half-life',     to: 'hl2',          label: 'sequel' },
    { from: 'doom',          to: 'wolfenstein',  label: 'predecessor' },
    // Minecraft ancestry
    { from: 'terraria',      to: 'minecraft',    label: '2D inspiration' },
    // Fighting game key bridges
    { from: 'sf2',           to: 'mk',           label: 'fighting game boom' },
    { from: 'sf2',           to: 'kof94',        label: 'influenced' },
    // Zelda evolution
    { from: 'zelda',         to: 'zelda-lttp',   label: 'series evolution' },
    { from: 'zelda-lttp',    to: 'zelda-oot',    label: 'series evolution' },
    { from: 'zelda-oot',     to: 'zelda-botw',   label: 'series evolution' },
  ];

  // ── Build lookup map ──────────────────────────────────────────────────────
  var byId = {};
  GENRES.forEach(function (g) { byId[g.id] = g; });

  var gamesById = {};
  GAMES.forEach(function (g) { gamesById[g.id] = g; });

  // ── Current zoom state ────────────────────────────────────────────────────
  var currentZoom = 1.0;
  var MIN_ZOOM = 0.35;
  var MAX_ZOOM = 4.0;

  // ── Initialise ────────────────────────────────────────────────────────────
  function init() {
    var container = document.getElementById('viz-container');
    if (!container || typeof d3 === 'undefined') return;

    var svg = d3.select(container)
      .append('svg')
      .attr('viewBox', '0 0 ' + TOTAL_W + ' ' + TOTAL_H)
      .attr('width',  TOTAL_W)
      .attr('height', TOTAL_H)
      .attr('class',  'vgishkur-svg')
      .attr('role', 'img')
      .attr('aria-label', 'Video game genre evolution timeline');

    // Glow filter
    var defs = svg.append('defs');
    var glow = defs.append('filter').attr('id', 'vg-glow');
    glow.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'coloredBlur');
    var fm = glow.append('feMerge');
    fm.append('feMergeNode').attr('in', 'coloredBlur');
    fm.append('feMergeNode').attr('in', 'SourceGraphic');

    // Background
    svg.append('rect').attr('width', TOTAL_W).attr('height', TOTAL_H).attr('fill', '#0a1120');

    drawBands(svg);
    drawTimeline(svg);
    drawGames(svg);          // game circles — drawn before connections so nodes sit on top
    drawGameLinks(svg);      // game-to-game influence curves
    drawConnections(svg);
    drawNodes(svg);
    buildLegend();
    setupZoom(svg);
  }

  // ── Family bands ──────────────────────────────────────────────────────────
  function drawBands(svg) {
    var g = svg.append('g').attr('class', 'vg-bands');

    FAMILIES.forEach(function (fam, i) {
      var y1 = rowToY(fam.rows[0]);
      var y2 = rowToY(fam.rows[1] + 1);
      var h  = y2 - y1;

      g.append('rect')
        .attr('x', 0).attr('y', y1)
        .attr('width', TOTAL_W).attr('height', h)
        .attr('fill', fam.color)
        .attr('opacity', i % 2 === 0 ? 0.07 : 0.03);

      g.append('line')
        .attr('x1', ML - 18).attr('y1', y1)
        .attr('x2', ML - 18).attr('y2', y2)
        .attr('stroke', fam.color)
        .attr('stroke-width', 3)
        .attr('opacity', 0.75);

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

    g.append('line')
      .attr('x1', ML).attr('y1', MT - 8)
      .attr('x2', TOTAL_W - MR).attr('y2', MT - 8)
      .attr('stroke', '#334155').attr('stroke-width', 1);

    for (var y = YEAR_START; y <= YEAR_END; y++) {
      var isDecade = (y % 10 === 0);
      var isFive   = (y % 5  === 0);
      if (!isDecade && !isFive) continue;

      var x = yearToX(y);

      g.append('line')
        .attr('x1', x).attr('y1', MT - 8)
        .attr('x2', x).attr('y2', TOTAL_H - MB)
        .attr('stroke', isDecade ? '#334155' : '#1e2d40')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', isDecade ? null : '4 6');

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

  // ── Game circles ──────────────────────────────────────────────────────────
  function drawGames(svg) {
    var g = svg.append('g').attr('class', 'vg-games');

    // impact (1-5) → circle radius
    var rMap = [0, 2.5, 4, 6, 9, 13];

    // Tooltip div (absolute inside the scroll container so it scrolls with content)
    var tooltipDiv = document.createElement('div');
    tooltipDiv.className = 'vg-game-tooltip';
    tooltipDiv.style.display = 'none';
    var wrapper = document.querySelector('.vgishkur__scroll-wrapper');
    if (wrapper) wrapper.style.position = 'relative';
    var container = document.getElementById('viz-container');
    if (container) container.appendChild(tooltipDiv);

    function showTip(d, clientX, clientY) {
      tooltipDiv.innerHTML =
        '<strong>' + esc(d.name) + '</strong>' +
        ' <span class="vg-tt-year">(' + d.year + ')</span>';
      tooltipDiv.style.display = 'block';
      positionTip(clientX, clientY);
    }

    function positionTip(clientX, clientY) {
      var rect = (container || document.body).getBoundingClientRect();
      var svgEl = document.querySelector('.vgishkur-svg');
      var scale = svgEl ? svgEl.getBoundingClientRect().width / TOTAL_W : 1;
      var scrollLeft = wrapper ? wrapper.scrollLeft : 0;
      var tx = (clientX - rect.left + scrollLeft) / scale + 10;
      var ty = (clientY - rect.top) / scale - 30;
      tooltipDiv.style.left = tx + 'px';
      tooltipDiv.style.top  = ty + 'px';
    }

    function hideTip() {
      tooltipDiv.style.display = 'none';
    }

    g.selectAll('.vg-game')
      .data(GAMES)
      .enter()
      .append('circle')
      .attr('class', 'vg-game')
      .attr('cx', function (d) { return yearToX(d.year); })
      .attr('cy', function (d) { return rowToY(d.row) + ROW_H / 2; })
      .attr('r',  function (d) { return rMap[d.impact] || 3; })
      .attr('fill',    function (d) { return C[d.family] || '#64748b'; })
      .attr('opacity', 0.30)
      .attr('cursor', 'pointer')
      .attr('tabindex', '0')
      .attr('role', 'img')
      .attr('aria-label', function (d) { return d.name + ' (' + d.year + ')'; })
      .on('mouseenter', function (event, d) {
        d3.select(this).raise().attr('opacity', 0.80)
          .attr('r', (rMap[d.impact] || 3) * 1.25);
        showTip(d, event.clientX, event.clientY);
      })
      .on('mousemove', function (event) {
        positionTip(event.clientX, event.clientY);
      })
      .on('mouseleave', function (event, d) {
        d3.select(this).attr('opacity', 0.30).attr('r', rMap[d.impact] || 3);
        hideTip();
      })
      .on('click', function (event, d) {
        // Works for both desktop click and mobile tap
        if (tooltipDiv.style.display === 'none') {
          d3.select(this).raise().attr('opacity', 0.80);
          showTip(d, event.clientX, event.clientY);
        } else {
          hideTip();
          d3.select(this).attr('opacity', 0.30);
        }
        event.stopPropagation();
      })
      .on('keydown', function (event, d) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showTip(d, 0, 0);
        }
      });

    // Dismiss tooltip when clicking elsewhere
    if (typeof document !== 'undefined') {
      document.addEventListener('click', function () { hideTip(); }, { passive: true });
    }
  }

  // ── Game-to-game influence curves ────────────────────────────────────────
  function drawGameLinks(svg) {
    var g = svg.append('g').attr('class', 'vg-game-links');

    GAME_LINKS.forEach(function (link) {
      var src = gamesById[link.from];
      var tgt = gamesById[link.to];
      if (!src || !tgt) return;

      var x1 = yearToX(src.year);
      var y1 = rowToY(src.row) + ROW_H / 2;
      var x2 = yearToX(tgt.year);
      var y2 = rowToY(tgt.row) + ROW_H / 2;
      var mx = (x1 + x2) / 2;

      var color = C[src.family] || '#64748b';

      g.append('path')
        .attr('d', 'M ' + x1 + ' ' + y1 +
                   ' C ' + mx + ' ' + y1 +
                   ' ' + mx + ' ' + y2 +
                   ' ' + x2 + ' ' + y2)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5 3')
        .attr('opacity', 0.42);
    });
  }

  // ── Connection curves (genre → genre) ────────────────────────────────────
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
          .attr('opacity', 1).attr('stroke-width', 2.5);
        d3.select(this).select('text.vg-label')
          .transition().duration(100).attr('fill', '#fff');
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

    nodes.append('rect')
      .attr('width', NODE_W).attr('height', NODE_H)
      .attr('rx', 6).attr('ry', 6)
      .attr('fill',   function (d) { return d.unique ? C[d.family] : '#1a2540'; })
      .attr('stroke', function (d) { return C[d.family]; })
      .attr('stroke-width', function (d) { return d.unique ? 2 : 1; })
      .attr('opacity',      function (d) { return d.unique ? 1 : 0.82; })
      .attr('filter',       function (d) { return d.unique ? 'url(#vg-glow)' : null; });

    nodes.filter(function (d) { return d.unique; })
      .append('text')
      .attr('x', 7).attr('y', NODE_H / 2 + 4)
      .attr('font-size', 10).attr('fill', '#0f172a').text('★');

    nodes.append('text')
      .attr('class', 'vg-label')
      .attr('x', function (d) { return d.unique ? NODE_W / 2 + 5 : NODE_W / 2; })
      .attr('y', NODE_H / 2 + 1)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', function (d) { return d.unique ? '#0f172a' : '#e2e8f0'; })
      .attr('font-size', 9.5)
      .attr('font-weight', function (d) { return d.unique ? '700' : '500'; })
      .attr('font-family', 'Inter, sans-serif')
      .text(function (d) { return clip(d.name, 15); });
  }

  // ── Zoom (mouse wheel + pinch) ────────────────────────────────────────────
  function setupZoom(svg) {
    var svgEl = svg.node();
    if (!svgEl) return;

    // ── Mouse wheel zoom ──────────────────────────────────────────────────
    svgEl.addEventListener('wheel', function (e) {
      // Only intercept wheel events over the SVG (not page-level scroll)
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.1 : 0.9;
      applyZoom(svg, currentZoom * factor, e.clientX, e.clientY);
    }, { passive: false });

    // ── Pinch-to-zoom (mobile) ────────────────────────────────────────────
    var lastPinchDist = null;
    var lastPinchMid  = null;

    svgEl.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        lastPinchDist = pinchDist(e);
        lastPinchMid  = pinchMid(e);
      } else {
        lastPinchDist = null;
      }
    }, { passive: true });

    svgEl.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && lastPinchDist !== null) {
        e.preventDefault();
        var dist  = pinchDist(e);
        var mid   = pinchMid(e);
        var ratio = dist / lastPinchDist;
        applyZoom(svg, currentZoom * ratio, mid.x, mid.y);
        lastPinchDist = dist;
        lastPinchMid  = mid;
      }
    }, { passive: false });

    svgEl.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) lastPinchDist = null;
    }, { passive: true });
  }

  function applyZoom(svg, newScale, pivotClientX, pivotClientY) {
    newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
    currentZoom = newScale;
    var w = Math.round(TOTAL_W * currentZoom);
    var h = Math.round(TOTAL_H * currentZoom);
    svg.attr('width', w).attr('height', h);
  }

  function pinchDist(e) {
    var dx = e.touches[1].clientX - e.touches[0].clientX;
    var dy = e.touches[1].clientY - e.touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pinchMid(e) {
    return {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    };
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

    // Genre family dots
    var html = FAMILIES.map(function (fam) {
      return '<span class="vg-legend-item">' +
               '<span class="vg-legend-dot" style="background:' + fam.color + '"></span>' +
               esc(fam.label) +
             '</span>';
    }).join('');

    // Impact circle legend
    html += '<span class="vg-legend-sep"></span>';
    html += '<span class="vg-legend-item vg-legend-item--impact">' +
              '<svg width="84" height="18" viewBox="0 0 84 18" style="vertical-align:middle">' +
                '<circle cx="6"  cy="9" r="2.5" fill="#94a3b8" opacity="0.55"/>' +
                '<circle cx="20" cy="9" r="4"   fill="#94a3b8" opacity="0.55"/>' +
                '<circle cx="36" cy="9" r="6"   fill="#94a3b8" opacity="0.55"/>' +
                '<circle cx="55" cy="9" r="9"   fill="#94a3b8" opacity="0.55"/>' +
                '<circle cx="78" cy="9" r="13"  fill="#94a3b8" opacity="0.55"/>' +
              '</svg>' +
              '<span style="color:#64748b;font-size:10px"> circle = game impact</span>' +
            '</span>';

    legend.innerHTML = html;
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
