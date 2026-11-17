# User guide sources

`no/body.html` and `en/body.html` are the text of the Norwegian and English user guides; `img/` holds their pictures.
The cover, table of contents, page footer and styling are added by `build_guide.py`:

    python3 doc/build_guide.py doc <version> docs

writes `docs/Geocaching-Map-Custom-Tile-Layers-Brukerveiledning.pdf` and `…-Guide.pdf` (needs Python Playwright with Chromium).
