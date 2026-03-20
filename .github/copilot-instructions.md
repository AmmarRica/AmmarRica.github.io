# Copilot / AI Agent Instructions

## Navigation Linking Rule

**Whenever a new top-level page directory is added to this repository (i.e. a direct child of the repo root that contains a browsable `index.html` or an `index.md` with a `permalink`), you must link it from the main site navigation.**

### What counts as a "top-level page directory"

A directory placed directly under the repository root that is intended to be a standalone page or section of the site.

Current examples:
- `videogames-ishkur/` → linked as "Videogames Ishkur"
- `AIGeneratedGames/` → linked as "AI-Generated Games"
- `blog/` → linked as "Blog"
- `about.md` (top-level page file) → linked as "About"

### What does NOT need a main-page link

Grandchild directories (sub-pages inside an existing section) do **not** need a direct link from the main navigation. For example:
- `AIGeneratedGames/game-51/` — this is a sub-page inside `AIGeneratedGames/`, not a top-level section
- Individual blog posts inside `_posts/`

### How to add a link

1. Open `_config.yml` and add a new entry to the `navigation` list:

   ```yaml
   navigation:
     - title: My New Page
       url: /my-new-page/
   ```

2. If the new section should also be highlighted on the home page (e.g. as a featured project card), update `_layouts/home.html` accordingly.

### Sub-section gallery pages (e.g. AIGeneratedGames)

If a new sub-section (series) of games or content is added inside `AIGeneratedGames/`:
- Add the new game entries to `AIGeneratedGames/games.json` with the correct `"series"` value.
- Add a corresponding entry to the `SECTIONS` array in `AIGeneratedGames/index.html` so the new series appears in the gallery.

### Summary checklist for merging a new page directory

- [ ] Is it a direct child of the repo root? → Add to `_config.yml` `navigation`
- [ ] Should it appear on the home page? → Update `_layouts/home.html`
- [ ] Is it a new series inside `AIGeneratedGames/`? → Add `SECTIONS` entry in `AIGeneratedGames/index.html` and entries in `AIGeneratedGames/games.json`
