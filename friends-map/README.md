# Friends Map

A Google-Maps-style page for the people you recommend around your city:
pin each friend, write why you vouch for them, and share the whole list
with one link. Mock / local-first: **everything is stored in the browser's
localStorage on your own phone**. Nothing is uploaded anywhere.

## Features

- Full-screen map (Leaflet, vendored in `vendor/`, CARTO Voyager tiles)
- Friend = name, category, pin, place label, "why I recommend them", tags, favourite
- Search box and category chips filter the list and the pins together
- Bottom sheet list (drag or tap the handle), Google-style detail card
- Add by hand: **Pick on map** drops a crosshair, drag the map, tap *Place here*
- **Paste a Google Maps link** (🔗 button, the empty state, or paste into the search box):
  - `google.com/maps/place/<Name>/@…!3d<lat>!4d<lng>` → name + exact pin
  - `?q=lat,lng`, `?api=1&query=lat,lng`, `ll=`, `geo:` → pin
  - `maps.app.goo.gl/…` short links → name from the share text, link kept, you place the pin
    (a static page cannot expand Google's short links; that needs a server)
  - several links at once, one per line, queue through the editor
- **Android share target**: install the page, then Google Maps → Share → *Friends Map*
  lands in the importer (`share_target` in `manifest.json`)
- **Share**: the list is encoded into the URL hash (`#s=…`), so the link *is* the data.
  Recipients see a purple-pinned read-only view with a banner, can save one or all
  friends into their own map (deduped by name + location). Also Web Share and copy-as-text.
- Export / import JSON backup, delete all, geolocate, city centre

## Storage

`localStorage["friendsmap.v1"]`:

```json
{
  "me": { "name": "Ammar", "city": "Austin", "center": [30.27, -97.74], "zoom": 14 },
  "friends": [
    { "id": "…", "name": "Sara — barber", "cat": "hair", "lat": 30.28, "lng": -97.73,
      "place": "Old town", "why": "Best fade in the city.", "tags": ["cash only"],
      "fav": true, "maps": "https://maps.app.goo.gl/…", "addedAt": 1758153600000 }
  ],
  "view": { "c": [30.27, -97.74], "z": 14 }
}
```

## Test

```sh
node tests/friends-map.mjs
```
