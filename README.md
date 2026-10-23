# Geocaching Map – Custom Tile Layers

Userscript that adds custom map layers and tools to the geocaching.com maps (`/map` and `/play/map`).

- **Install:** <https://knutos.github.io/custom-tiles/geocaching-custom-tiles.user.js>
- **Homepage:** <https://knutos.github.io/custom-tiles/>
- **Greasy Fork:** <https://greasyfork.org/scripts/600873-geocaching-map-custom-tile-layers>

## Files

| Path | What |
|---|---|
| `geocaching-custom-tiles.user.js` | The script (single source – the homepage, updates and Greasy Fork all use this file) |
| `index.html`, `screenshot.png` | Homepage (GitHub Pages) |
| `docs/` | User guide (English), brukerveiledning (norsk), presentasjon (PDF and PowerPoint) |
| `greasyfork/` | Descriptions for the Greasy Fork page (English and Norwegian) and its screenshots |

## Releasing

1. Add the release's highlights at the top of **What's new** (`#news` in `index.html`, English text plus Norwegian `data-no`) and move the *Latest* label.
1. Raise `@version` in the script, and the version on the homepage (`index.html`, the `meta` line – in the text and in its Norwegian `data-no`).

The homepage is in English with Norwegian in `data-no` attributes; the English/Norsk switch at the top swaps them (remembered, and `?lang=no` links work).
2. Push to `main`. GitHub Pages publishes the homepage and the script, and installed copies update from there.
3. Greasy Fork syncs from the raw file on `main` (see below).

### Greasy Fork sync

The Greasy Fork script is set to sync its code from
`https://raw.githubusercontent.com/knutos/custom-tiles/main/geocaching-custom-tiles.user.js`
and its additional info from `greasyfork/greasyfork-description-en.html` (English) and
`greasyfork/greasyfork-description-no.html` (Norwegian) on `main`. A GitHub webhook to Greasy Fork
makes it sync at once on every push; without it Greasy Fork checks about once a day.

## Install counts

The homepage shows the total and daily installs from Greasy Fork. The workflow
`.github/workflows/greasyfork-stats.yml` fetches them every 6 hours into `stats.json` (and can be
run by hand under *Actions*). Installs straight from GitHub Pages aren't counted – Pages has no statistics.

## Licence

MIT – see [LICENSE](LICENSE).
