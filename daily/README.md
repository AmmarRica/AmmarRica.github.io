# Daily

One page, one thing per day. Opens `/daily/`, shows today's date and a live
clock, and loads **only** the media scheduled for today. At midnight it fetches
the schedule again and swaps to the next day's entry in place.

Only the repo owner can change what shows: there is no admin UI. Editing
`daily/schedule.json` and pushing is the whole configuration system.

## Add a day

1. Drop the file into `daily/media/` (or use a full URL / YouTube link).
2. Add one object to `entries` in `daily/schedule.json`.
3. Commit + push.

```json
{ "date": "09-21", "type": "image", "src": "media/earth-wind-fire.gif", "title": "do you remember?" }
```

Preview any day without waiting: `/daily/?date=2026-09-21` (or `?date=09-21`).

## Entry fields

| Field      | Required | Values / notes |
|------------|----------|----------------|
| `date`     | yes      | `"MM-DD"` (every year), `"YYYY-MM-DD"` (once), or an array of either |
| `type`     | yes      | `image` · `youtube` · `video` · `text` |
| `src`      | for media| Path relative to `daily/` (e.g. `media/x.gif`), absolute URL, or YouTube URL / 11-char ID |
| `title`    | no       | Big Impact-font text |
| `subtitle` | no       | Smaller line under the title |
| `position` | no       | `top` · `middle` · `bottom` (default) |
| `bg`       | no       | CSS colour behind the media (default `#000`) |
| `color`    | no       | Text colour (default white with black outline) |
| `fit`      | no       | `contain` (default) or `cover` — image / video only |
| `tile`     | no       | `true` repeats the image YTMND-style across the whole screen |
| `tileSize` | no       | CSS `background-size` when tiling, e.g. `"160px"` |
| `audio`    | no       | Path to a looping sound (image / video / text only); shows a "click for sound" button if autoplay is blocked |
| `link`     | no       | URL opened in a new tab when the image / video is clicked |

Matching order: exact `YYYY-MM-DD` → recurring `MM-DD` → `fallback` → built-in
"nothing today" text. Within a tier the first entry in the file wins.

## Top-level keys

| Key        | Default   | Notes |
|------------|-----------|-------|
| `timezone` | `"local"` | `"local"` flips at the viewer's midnight; an IANA name (e.g. `"America/New_York"`) flips at yours |
| `clock`    | `"12h"`   | `"12h"` or `"24h"` |
| `fallback` | —         | An entry object shown on days with nothing scheduled |
| `entries`  | `[]`      | The schedule |

## Examples

```json
{ "date": "2026-10-31", "type": "youtube", "src": "https://youtu.be/dQw4w9WgXcQ", "title": "boo" }
{ "date": ["12-24", "12-25"], "type": "image", "src": "media/snow.gif", "tile": true, "tileSize": "200px", "audio": "media/bells.mp3", "title": "merry" }
{ "date": "07-04", "type": "video", "src": "media/fireworks.mp4", "fit": "cover", "position": "top", "title": "america" }
{ "date": "01-01", "type": "text", "title": "happy new year", "bg": "#111" }
```

## Test

```sh
node tests/daily.mjs
```
