// ==UserScript==
// @name         Geocaching Map – Custom Tile Layers
// @namespace    https://geocaching.com/userscripts/custom-tiles
// @version      1.51.7
// @description:no  Egne kartlag (XYZ/TMS/WMS/WMTS), stedssøk, koordinater, måling og 161 m-sirkler på geocaching.com-kartene
// @description  Any XYZ/TMS/WMS/WMTS layer on the geocaching.com maps (/map and /play/map), with a layer editor (URL auto-detect, capabilities browser, live preview, import/export) plus place/address search, coordinate, measuring and 161 m tools
// @match        https://www.geocaching.com/map/*
// @match        https://www.geocaching.com/play/map*
// @match        https://www.geocaching.com/geocache/*
// @match        https://www.geocaching.com/seek/cache_details.aspx*
// @run-at       document-start
// @grant        none
// @author       Knut Olav Sunde
// @license      MIT
// @homepageURL  https://knutos.github.io/custom-tiles/
// @supportURL   https://github.com/knutos/custom-tiles/issues
// @updateURL    https://knutos.github.io/custom-tiles/geocaching-custom-tiles.user.js
// @downloadURL  https://knutos.github.io/custom-tiles/geocaching-custom-tiles.user.js
// ==/UserScript==

/*
 * MIT License
 *
 * Copyright (c) 2026 Knut Olav Sunde
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
 * EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
 * USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

(function () {
  'use strict';

  const STORE_LAYERS = 'gcct.customLayers';
  const STORE_STATE = 'gcct.state';

  // Built-in presets. Use "Copy & edit" in the panel to customise one.
  // Layer definition fields:
  //   kind: 'xyz' (default) | 'wmts' | 'wms'
  //   url:  xyz  → {z} {x} {y} {-y} {s} {q}(quadkey)
  //         wmts → {TileMatrix} {TileRow} {TileCol}  (+ optional matrixIds {z: id})
  //         wms  → service endpoint; plus layers, styles, format, version, transparent
  const PRESETS = [
    { id: 'kv-topo', name: 'Kartverket Topo', type: 'base',
      url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
      maxNativeZoom: 18, attribution: '© Kartverket' },
    { id: 'kv-grey', name: 'Kartverket Gråtone', type: 'base',
      url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
      maxNativeZoom: 18, attribution: '© Kartverket' },
    { id: 'kv-raster', name: 'Kartverket Toporaster', type: 'base',
      url: 'https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png',
      maxNativeZoom: 18, attribution: '© Kartverket' },
    { id: 'otm', name: 'OpenTopoMap', type: 'base',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', subdomains: 'abc',
      maxNativeZoom: 17, attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)' },
    { id: 'esri-img', name_no: 'Esri flyfoto', name: 'Esri World Imagery', type: 'base',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxNativeZoom: 19, attribution: 'Tiles © Esri' },
    { id: 'osm', name: 'OpenStreetMap', type: 'base',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxNativeZoom: 19, attribution: '© OpenStreetMap contributors' },
    { id: 'esri-topo', name_no: 'Esri topografisk', name: 'Esri World Topo', type: 'base',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      maxNativeZoom: 18, attribution: 'Tiles © Esri' },

    // --- Overlays ---
    { id: 'kv-ruter', name: 'Turruter (Kartverket)', type: 'overlay', kind: 'wms',
      url: 'https://wms.geonorge.no/skwms1/wms.friluftsruter2', layers: 'Ruter', format: 'image/png',
      version: '1.3.0', transparent: true, attribution: '© Kartverket' },
    { id: 'kv-eiendom', name: 'Eiendomsgrenser (Kartverket)', type: 'overlay', kind: 'wms',
      url: 'https://wms.geonorge.no/skwms1/wms.matrikkel', layers: 'eiendomsgrense,eiendoms_id', format: 'image/png',
      version: '1.3.0', transparent: true, minZoom: 14, attribution: '© Kartverket (CC BY 4.0)' },
    { id: 'esri-hillshade', name_no: 'Terrengskygge (Esri)', name: 'Hillshade (Esri)', type: 'overlay', blend: 'multiply', opacity: 0.6,
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
      maxNativeZoom: 16, attribution: 'Hillshade © Esri' },
  ];

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  // --- Language (English / Norsk bokmål) ------------------------------------
  // English text is written directly in the code; T() swaps in Norwegian when that is chosen.
  // Default: Norwegian if the page or browser is Norwegian, otherwise English. Change it in the layer panel.
  const NO_TEXT = {
    "Map layers": "Kartlag",
    "Edit this layer": "Rediger dette laget",
    "Delete this layer": "Slett dette laget",
    "Make an editable copy": "Lag en kopi du kan redigere",
    "Opacity (drag to make the layer more transparent)": "Synlighet (dra for å gjøre laget mer gjennomsiktig)",
    "Dim the map (drag left to fade it towards white)": "Demp kartet (dra mot venstre for å bleke det mot hvitt)",
    "Dim the selected background map (drag left to fade it towards white)": "Demp det valgte bakgrunnskartet (dra mot venstre for å bleke det mot hvitt)",
    "Opacity of the selected overlays (drag left to make them more transparent)": "Synlighet for de valgte overleggene (dra mot venstre for å gjøre dem mer gjennomsiktige)",
    "Close": "Lukk",
    "Close (Esc)": "Lukk (Esc)",
    "Paste a map address to add it…": "Lim inn en kartadresse for å legge den til …",
    "Add a map layer from this address": "Legg til et kartlag fra denne adressen",
    "Add": "Legg til",
    "Background map": "Bakgrunnskart",
    "Geocaching.com map": "Geocaching.com-kartet",
    "Open geocaching.com’s own map style menu": "Åpne geocaching.coms egen meny for kartstiler",
    "Geocaching.com map styles…": "Geocaching.com-kartstiler …",
    "Overlays": "Overlegg",
    "none": "ingen",
    "Show geocaching.com’s own map buttons too": "Vis også geocaching.coms egne kartknapper",
    "Add your own map layer": "Legg til ditt eget kartlag",
    "＋ New layer": "＋ Nytt lag",
    "Load layers from a file or text": "Hent kartlag fra en fil eller tekst",
    "Import": "Importer",
    "Save your layers to move or share them": "Lagre kartlagene dine for å flytte eller dele dem",
    "Export": "Eksporter",
    "Language": "Språk",
    "Toolbar": "Verktøylinje",
    "Favourite points": "Favorittpoeng",
    "Show ♥ and the number by caches on the map (from zoom 15)": "Vis ♥ og antallet ved cachene på kartet (fra zoom 15)",
    "From": "Fra",
    "favourite points": "favorittpoeng",
    "Show difficulty/terrain (D/T) below caches on the map (from zoom 15)": "Vis vanskelighet/terreng (D/T) under cachene på kartet (fra zoom 15)",
    "Difficulty/terrain (D/T) below the caches on the map (from zoom {z}, on/off)": "Vanskelighet/terreng (D/T) under cachene på kartet (fra zoom {z}, av/på)",
    "D/T is shown from zoom level {z}. Zoom in to see it.": "D/T vises fra zoomnivå {z}. Zoom inn for å se det.",
    "Mark caches nobody has found yet (FTF) on the map (from zoom 15)": "Merk cacher ingen har funnet ennå (FTF) på kartet (fra zoom 15)",
    "Caches nobody has found yet – FTF (from zoom {z}, on/off)": "Cacher ingen har funnet ennå – FTF (fra zoom {z}, av/på)",
    "FTF marks are shown from zoom level {z}. Zoom in to see them.": "FTF-merker vises fra zoomnivå {z}. Zoom inn for å se dem.",
    "Never found – first to find is still open": "Aldri funnet – første funn er fortsatt ledig",
    "Right-click on /play/map opens the site’s own menu (log, add to list, GPX) instead of ours": "Høyreklikk på /play/map åpner nettstedets egen meny (logg, legg i liste, GPX) i stedet for vår",
    "Show the zoom and coordinates at the bottom": "Vis zoom og koordinater nederst",
    "Hide the zoom and coordinates (show them again in Settings)": "Skjul zoom og koordinater (vis dem igjen i Innstillinger)",
    "Settings": "Innstillinger",
    "Right": "Høyre",
    "Left": "Venstre",
    "Top": "Øverst",
    "Bottom": "Nederst",
    "Buttons in": "Knapper i",
    " (default)": " (standard)",
    "Drag to move the toolbar to another edge": "Dra for å flytte verktøylinjen til en annen kant",
    "One line": "Én rekke",
    "Two lines": "To rekker",
    " (automatic)": " (automatisk)",
    "Right, one column": "Høyre, én kolonne",
    "Right, two columns": "Høyre, to kolonner",
    "Left, one column": "Venstre, én kolonne",
    "Left, two columns": "Venstre, to kolonner",
    "Delete “{name}”?": "Slette «{name}»?",
    " (copy)": " (kopi)",
    "Edit map layer": "Rediger kartlag",
    "Add a map layer": "Legg til kartlag",
    "Map source": "Kartkilde",
    "Map address (URL)": "Kartadresse (URL)",
    "Detect": "Gjenkjenn",
    "Paste almost any map link and press <b>Detect</b>. It understands:": "Lim inn nesten hvilken som helst kartlenke og trykk <b>Gjenkjenn</b>. Disse forstås:",
    "tile addresses with <code>{z}</code>, <code>{x}</code> and <code>{y}</code>": "flisadresser med <code>{z}</code>, <code>{x}</code> og <code>{y}</code>",
    "a single map tile copied from the browser’s developer tools": "én enkelt kartflis kopiert fra nettleserens utviklerverktøy",
    "WMS and WMTS services – the list of layers is fetched for you": "WMS- og WMTS-tjenester – lagoversikten hentes automatisk",
    "ArcGIS addresses ending in <code>/MapServer</code>": "ArcGIS-adresser som slutter på <code>/MapServer</code>",
    "How it is shown": "Visning",
    "Name in the layer list": "Navn i lagoversikten",
    "e.g. Turkart Buskerud": "f.eks. Turkart Buskerud",
    "Show as": "Vis som",
    "Overlay on top": "Overlegg oppå kartet",
    "Service type": "Tjenestetype",
    "Map tiles (XYZ)": "Kartfliser (XYZ)",
    "WMTS tiles": "WMTS-fliser",
    "WMS layer names": "WMS-lagnavn",
    "e.g. Ruter": "f.eks. Ruter",
    "Separate several names with commas.": "Skill flere navn med komma.",
    "Transparent background": "Gjennomsiktig bakgrunn",
    "More settings": "Flere innstillinger",
    "Highest zoom with real tiles": "Høyeste zoom med ekte fliser",
    "Closer than this, tiles are enlarged.": "Nærmere enn dette forstørres flisene.",
    "Subdomains for <code>{s}</code>": "Underdomener for <code>{s}</code>",
    "Flip the Y axis (TMS servers)": "Snu Y-aksen (TMS-servere)",
    "Image format": "Bildeformat",
    "WMS version": "WMS-versjon",
    "Styles": "Stiler",
    "Leave empty for the default": "La stå tom for standard",
    "Show from zoom level": "Vis fra zoomnivå",
    "Credit text": "Kildehenvisning",
    "e.g. © Kartverket": "f.eks. © Kartverket",
    "Preview on map": "Forhåndsvis på kartet",
    "Stop preview": "Stopp forhåndsvisning",
    "Cancel": "Avbryt",
    "Geocache": "Geocache",
    "Use clicked point": "Bruk klikkpunktet",
    "Remove pin": "Fjern merkenålen",
    "Your pin": "Merkenål",
    "Pin name": "Navn på merkenålen",
    "Click to rename": "Klikk for å gi nytt navn",
    "Drag to resize": "Dra for å endre høyden",
    "Looking up {code} …": "Slår opp {code} …",
    "Places and addresses": "Steder og adresser",
    "Searching places …": "Søker etter steder …",
    "Place (tag)": "Sted",
    "{code} not found.": "Fant ikke {code}.",
    "Route": "Rute",
    "Route: pick geocaches and pins, and export them as a GPX route": "Rute: velg geocacher og merkenåler, og eksporter dem som en GPX-rute",
    "Search code or name …": "Søk etter kode eller navn …",
    "Geocaches and pins nearest the middle of the map. Click one to add it to the route.": "Geocacher og merkenåler nærmest midten av kartet. Klikk på en for å legge den til i ruten.",
    "No stops yet.": "Ingen stopp ennå.",
    "Sort by nearest": "Sorter etter nærmeste",
    "Clear route": "Tøm ruten",
    "{n} stops · {d}": "{n} stopp · {d}",
    "Solved": "Løst",
    "Found": "Funnet",
    "Owned": "Eiet",
    "Pin (tag)": "Nål",
    "In the route": "I ruten",
    "Move up": "Flytt opp",
    "Add to route": "Legg til i ruten",
    "Preview": "Forhåndsvis",
    "Back": "Tilbake",
    "Download GPX route": "Last ned GPX-rute",
    "Full cache data": "Fulle cachedata",
    "Back to the start": "Tilbake til start",
    "End the route at the first stop again": "Avslutt ruten ved første stopp igjen",
    "round trip": "rundtur",
    "Each geocache with description, hint, attributes, logs and additional waypoints, like the GPX file on the cache page. Takes a moment, as every cache page is fetched.": "Hver geocache med beskrivelse, hint, attributter, logger og ekstra veipunkter, som GPX-fila på cachesiden. Tar litt tid, siden hver cacheside hentes.",
    "This is what the GPX file will contain – the map shows the whole route.": "Slik blir GPX-filen – kartet viser hele ruten.",
    "Name in GPS": "Navn i GPS",
    "Description": "Beskrivelse",
    "Coordinates": "Koordinater",
    "Leg": "Etappe",
    "Total": "Totalt",
    "Show on the map": "Vis på kartet",
    "Straight-line distances; the way there is always longer.": "Avstander i luftlinje; veien dit er alltid lengre.",
    "Added to the route: {name}": "Lagt til i ruten: {name}",
    "Geocaches and pins nearest the middle of the map. Click one – here or on the map – to add it to the route.": "Geocacher og merkenåler nærmest midten av kartet. Klikk på en – her eller på kartet – for å legge den til i ruten.",
    "Move down": "Flytt ned",
    "Remove": "Fjern",
    "Download GPX": "Last ned GPX",
    "All pins as GPX ({n})": "Alle merkenåler som GPX ({n})",
    "Pin {n}": "Nål {n}",
    "Zoom": "Zoom",
    "Zoom level – type a number to zoom": "Zoomnivå – skriv et tall for å zoome",
    "Hide all geocaches": "Skjul alle geocacher",
    "Favourite points on the map (from zoom {z}, on/off). The lowest number is set in Settings.": "Favorittpoeng på kartet (fra zoom {z}, av/på). Laveste antall velges i Innstillinger.",
    "Favourite points are shown from zoom level {z}. Zoom in to see them.": "Favorittpoeng vises fra zoomnivå {z}. Zoom inn for å se dem.",
    "Marks at solved caches (from zoom {z}, on/off). Always shown with the 161 m circles.": "Merker ved løste cacher (fra zoom {z}, av/på). Vises alltid sammen med 161 m-sirklene.",
    "Marks are shown from zoom level {z}. Zoom in to see them.": "Merkene vises fra zoomnivå {z}. Zoom inn for å se dem.",
    "Show the geocaches again": "Vis geocachene igjen",
    "Physical stage": "Fysisk steg",
    "Final location": "Endelig plassering",
    "Drag to change the order (or use ↑ ↓)": "Dra for å endre rekkefølgen (eller bruk ↑ ↓)",
    "The overlay at the top of the list is drawn on top.": "Overlegget øverst i listen tegnes øverst.",
    "Geocaching": "Geocaching",
    "Background maps": "Bakgrunnskart",
    "Dimming": "Demping",
    "Opacity": "Synlighet",
    "geocaching.com’s own maps": "geocaching.coms egne kart",
    "Background maps from this script and your own": "Bakgrunnskart fra skriptet og dine egne",
    "Overlays from this script and your own": "Overlegg fra skriptet og dine egne",
    "All of geocaching.com’s maps are removed from the list.": "Alle geocaching.coms kart er fjernet fra listen.",
    "The cache types are not known yet, so no 161 m circles are drawn. (Details: type gcctReport() in the console.)": "Cachetypene er ikke kjent ennå, så ingen 161 m-sirkler tegnes. (Detaljer: skriv gcctReport() i konsollen.)",
    "161 m circles around traditional caches, physical stages and caches with solved coordinates (from zoom {z}). Right-click the map for a single circle anywhere.": "161 m-sirkler rundt tradisjonelle cacher, fysiske steg og cacher med løste koordinater (fra zoom {z}). Høyreklikk på kartet for én sirkel hvor som helst.",
    "Open the cache page": "Åpne cachesiden",
    "Estimated from the cache icon – can be a few metres off.": "Beregnet fra cacheikonet – kan være noen meter unna.",
    "Project a waypoint": "Projiser et veipunkt",
    "From": "Fra",
    "Bearing": "Retning",
    "Distance": "Avstand",
    "Unit": "Enhet",
    "Waypoint": "Veipunkt",
    "Project": "Projiser",
    "Any coordinate format works. Filled in with the point you clicked.": "Alle koordinatformater virker. Fylt ut med punktet du klikket på.",
    "The starting point is not a coordinate I understand.": "Startpunktet er ikke en koordinat jeg forstår.",
    "The bearing must be a number from 0 to 360.": "Retningen må være et tall fra 0 til 360.",
    "The distance must be a number greater than 0.": "Avstanden må være et tall større enn 0.",
    "Delete layer": "Slett kartlag",
    "Delete": "Slett",
    "Remove map": "Fjern kart",
    "Remove": "Fjern",
    "Drag to move": "Dra for å flytte",
    "Save layer": "Lagre laget",
    "Untitled layer": "Kartlag uten navn",
    "Preview: none of the {n} tiles could be loaded. Check the address, layer name and zoom levels.": "Forhåndsvisning: ingen av de {n} flisene kunne lastes. Sjekk adressen, lagnavnet og zoomnivåene.",
    "Preview: {n} tile loaded": "Forhåndsvisning: {n} flis lastet",
    "Preview: {n} tiles loaded": "Forhåndsvisning: {n} fliser lastet",
    ", {n} failed (usually just areas without data).": ", {n} feilet (vanligvis bare områder uten data).",
    "Preview: loading tiles…": "Forhåndsvisning: laster fliser …",
    "Fetching the list of layers…": "Henter lagoversikten …",
    "The server did not let the script read its list of layers directly.": "Serveren lot ikke skriptet lese lagoversikten direkte.",
    "Open {link} in a new tab, select everything (Ctrl+A), copy it, and paste it here:": "Åpne {link} i en ny fane, merk alt (Ctrl+A), kopier og lim det inn her:",
    "the layer list": "lagoversikten",
    "Paste the layer list here": "Lim inn lagoversikten her",
    "Read layer list": "Les lagoversikten",
    "Could not read the layer list ({e}).": "Kunne ikke lese lagoversikten ({e}).",
    "This service has no layers in the projection this map uses (Web Mercator).": "Tjenesten har ingen lag i projeksjonen dette kartet bruker (Web Mercator).",
    "This service lists no layers that can be shown.": "Tjenesten har ingen lag som kan vises.",
    "Type to filter the {n} layers…": "Skriv for å filtrere de {n} lagene …",
    "Hold Ctrl (⌘ on Mac) to choose several layers.": "Hold Ctrl (⌘ på Mac) for å velge flere lag.",
    "Showing “{name}”. Press Save layer to keep it.": "Viser «{name}». Trykk Lagre laget for å beholde det.",
    "Found {n} layers. Choose one in the list.": "Fant {n} lag. Velg ett i listen.",
    "This doesn't look like a map address the script knows. See the list of supported links above.": "Dette ser ikke ut som en kartadresse skriptet kjenner. Se listen over støttede lenker ovenfor.",
    "URL must start with http:// or https://": "Adressen må begynne med http:// eller https://",
    "A WMS layer needs at least one layer name.": "Et WMS-lag trenger minst ett lagnavn.",
    "Unknown placeholder {p} in the URL.": "Ukjent plassholder {p} i adressen.",
    "A WMTS template needs {TileMatrix}, {TileRow} and {TileCol}.": "En WMTS-mal trenger {TileMatrix}, {TileRow} og {TileCol}.",
    "A tile URL needs {z}, {x} and {y} (or {-y}, or {q}).": "En flisadresse trenger {z}, {x} og {y} (eller {-y} eller {q}).",
    "Filled {TileMatrixSet} with \"GoogleMapsCompatible\" – change it if the server names its Web Mercator set differently.": "Fylte inn {TileMatrixSet} med «GoogleMapsCompatible» – endre det hvis serveren kaller Web Mercator-settet noe annet.",
    "ArcGIS cached service – only works if it is tiled in Web Mercator.": "Bufret ArcGIS-tjeneste – fungerer bare hvis den er flislagt i Web Mercator.",
    "Converted a single tile URL to a template (guessed {o} order from the current view) – check the preview.": "Gjorde én flisadresse om til en mal (gjettet rekkefølgen {o} ut fra kartutsnittet) – sjekk forhåndsvisningen.",
    "Converted tile query parameters to a template.": "Gjorde flisparametrene om til en mal.",
    "Import map layers": "Importer kartlag",
    "Paste layers exported from this script, or open a saved <code>.json</code> file. You can also paste a single map address.": "Lim inn kartlag eksportert fra dette skriptet, eller åpne en lagret <code>.json</code>-fil. Du kan også lime inn én enkelt kartadresse.",
    "Paste here": "Lim inn her",
    "…or open a file": "… eller åpne en fil",
    "This is neither exported layer settings nor a map address.": "Dette er verken eksporterte laginnstillinger eller en kartadresse.",
    "Imported layer": "Importert kartlag",
    "Nothing was imported – the layer is already there or not valid.": "Ingenting ble importert – laget finnes allerede eller er ugyldig.",
    "Nothing was imported – the layers are already there or not valid.": "Ingenting ble importert – lagene finnes allerede eller er ugyldige.",
    "Imported {n} layer.": "Importerte {n} lag.",
    "Imported {n} layers.": "Importerte {n} lag.",
    " ({k} skipped)": " ({k} hoppet over)",
    "They are now in the layer panel.": "De ligger nå i kartlagpanelet.",
    "Export map layers": "Eksporter kartlag",
    "Your layer is below.": "Kartlaget ditt står nedenfor.",
    "Your {n} layers are below.": "De {n} kartlagene dine står nedenfor.",
    "Copy the text or save it as a file, then use <b>Import</b> on another computer or share it with a friend.": "Kopier teksten eller lagre den som fil, og bruk <b>Importer</b> på en annen datamaskin eller del den med en venn.",
    "Copy text": "Kopier teksten",
    "Save as file": "Lagre som fil",
    "Copied": "Kopiert",
    "You haven’t added any layers of your own yet. Use <b>＋ New layer</b> in the layer panel to add one.": "Du har ikke lagt til egne kartlag ennå. Bruk <b>＋ Nytt lag</b> i kartlagpanelet for å legge til ett.",
    "Click to switch coordinate format": "Klikk for å bytte koordinatformat",
    "Copy to clipboard": "Kopier",
    "Remove this map from the list": "Fjern dette kartet fra listen",
    "Remove “{name}” from the list? You can bring it back with “Restore removed maps”.": "Fjerne «{name}» fra listen? Du kan hente det tilbake med «Hent tilbake fjernede kart».",
    "Restore removed maps ({n})": "Hent tilbake fjernede kart ({n})",
    "Go home: {name}  (right-click the button to change)": "Gå hjem: {name}  (høyreklikk på knappen for å endre)",
    "Set your home address": "Angi hjemadressen din",
    "Set home address": "Angi hjemadresse",
    "Search for your address and pick it from the list. You can also right-click the map and choose “Set as home”.": "Søk etter adressen din og velg den i listen. Du kan også høyreklikke på kartet og velge «Sett som hjem».",
    "Remove home address": "Fjern hjemadressen",
    "Set as home": "Sett som hjem",
    "Home set: {name}": "Hjem satt: {name}",
    "Pin": "Merk",
    "Project…": "Projiser …",
    "Remove circle": "Fjern sirkelen",
    "161 m circle": "161 m-sirkel",
    "Measure from here": "Mål herfra",
    "Project a waypoint from this point.\n\nType the bearing in degrees and the distance in metres, for example:  45 250": "Projiser et veipunkt fra dette punktet.\n\nSkriv retningen i grader og avstanden i meter, for eksempel:  45 250",
    "Please type two numbers: the bearing in degrees and the distance in metres, for example 45 250.": "Skriv to tall: retningen i grader og avstanden i meter, for eksempel 45 250.",
    "No geocache positions found on this map yet, so no circles can be drawn. (Details: type gcctReport() in the console.)": "Fant ingen cacheposisjoner på kartet ennå, så ingen sirkler kan tegnes. (Detaljer: skriv gcctReport() i konsollen.)",
    "161 m circles are shown from zoom level {z}. Zoom in to see them.": "161 m-sirkler vises fra zoomnivå {z}. Zoom inn for å se dem.",
    "Zoom in  ( + )": "Zoom inn  ( + )",
    "Zoom out  ( − )": "Zoom ut  ( − )",
    "Search place, address or coordinates  ( / )": "Søk etter sted, adresse eller koordinater  ( / )",
    "Measure distance & bearing (click points, double-click for new line, Esc to stop)": "Mål avstand og retning (klikk punkter, dobbeltklikk for ny linje, Esc for å stoppe)",
    "161 m circles around all geocaches (from zoom {z}). Right-click the map for a single circle anywhere.": "161 m-sirkler rundt alle geocacher (fra zoom {z}). Høyreklikk på kartet for én sirkel hvor som helst.",
    "Show my location": "Vis min posisjon",
    "Hide my location": "Skjul min posisjon",
    "Fullscreen": "Fullskjerm",
    "Exit fullscreen": "Avslutt fullskjerm",
    "Clear all drawings": "Fjern alle tegninger",
    "Location unavailable: {e}": "Posisjonen er ikke tilgjengelig: {e}",
    "Find a place": "Finn et sted",
    "Place name, address or coordinates": "Stedsnavn, adresse eller koordinater",
    "Place name, address, coordinates or GC code": "Stedsnavn, adresse, koordinater eller GC-kode",
    "Posted coordinates": "Publiserte koordinater",
    "Solved coordinates": "Løste koordinater",
    "Places in Norway, addresses and places abroad appear as you type. A GC code finds the geocache. Use <b>↑</b> <b>↓</b> and <b>Enter</b> to pick one. Tip: press <b>/</b> on the map to open this box.": "Steder i Norge, adresser og steder i utlandet vises mens du skriver. En GC-kode finner geocachen. Bruk <b>↑</b> <b>↓</b> og <b>Enter</b> for å velge. Tips: trykk <b>/</b> på kartet for å åpne denne boksen.",
    "Search the whole world (OpenStreetMap)": "Søk i hele verden (OpenStreetMap)",
    "Coordinates": "Koordinater",
    "Places in Norway": "Steder i Norge",
    "Addresses in Norway": "Adresser i Norge",
    "Worldwide (OpenStreetMap)": "Hele verden (OpenStreetMap)",
    "Searching…": "Søker …",
    "Place": "Sted",
    "Abroad": "Utland",
    "Fetching {n} geocaches …": "Henter {n} geocacher …",
    "Could not fetch {list} – only in the route, without description.": "Fikk ikke hentet {list} – bare med i ruten, uten beskrivelse.",
    "Route with {n} stops from geocaching.com": "Rute med {n} stopp fra geocaching.com",
    "Some search services did not answer: {list}": "Noen søketjenester svarte ikke: {list}",
    "Places in Norway, addresses and places abroad appear as you type. Use <b>↑</b> <b>↓</b> and <b>Enter</b> to pick one. Tip: press <b>/</b> on the map to open this box.": "Steder i Norge, adresser og steder i utlandet vises mens du skriver. Bruk <b>↑</b> <b>↓</b> og <b>Enter</b> for å velge. Tips: trykk <b>/</b> på kartet for å åpne denne boksen.",
    "Nothing found.": "Ingen treff.",
    "Nothing found in Norway. Press Enter to search the whole world.": "Ingen treff i Norge. Trykk Enter for å søke i hele verden.",
    "The search service did not answer ({e}). Try again in a moment.": "Søketjenesten svarte ikke ({e}). Prøv igjen om litt.",
    "Address": "Adresse",
    "Could not find the cache positions on this page, so no circles can be drawn.": "Fant ikke cacheposisjonene på denne siden, så ingen sirkler kan tegnes."
    };
  function detectLang() {
    const saved = load('gcct.lang', null);
    if (saved === 'en' || saved === 'no') return saved;
    const l = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
    return /^(nb|nn|no)\b/.test(l) ? 'no' : 'en';
  }
  let LANG = detectLang();
  function T(text, vars) {
    let out = (LANG === 'no' && NO_TEXT[text]) || text;
    if (vars) out = out.replace(/\{([\w-]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }
  const presetName = d => (LANG === 'no' && d.name_no) || d.name;
  // Local date and time for file names (2026-10-28-121305), so several files on one day don't overwrite each other.
  const fileStamp = (n = new Date(), p2 = v => String(v).padStart(2, '0')) => `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}-${p2(n.getHours())}${p2(n.getMinutes())}${p2(n.getSeconds())}`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Shared look: one set of colours, corner radii and shadows for every part of the interface.
  const UI_TOKENS = `.gcct,.gcct-dlg,.gcct-dock,.gcct-bar,.gcct-pop,.gcct-popup,.gcct-coord,.gcct-toast,.gcct-label{
      --ink:#1f2328;--muted:#59636e;--line:#e1e4e8;--line2:#c4cbd3;--soft:#f5f7f9;--hover:#edf0f3;
      --acc:#0969da;--acc-bg:#e8f2fd;--brand:#1f7a34;--brand-h:#186429;--danger:#c0262d;--danger-bg:#fdecec;
      --r:12px;--rc:8px;--ring:0 0 0 3px rgba(9,105,218,.2);
      --shadow:0 14px 36px rgba(16,24,40,.2),0 2px 6px rgba(16,24,40,.08);--shadow-s:0 2px 10px rgba(16,24,40,.2),0 0 0 1px rgba(16,24,40,.05)}
    @keyframes gcct-in{from{transform:translateY(-6px) scale(.985)}to{transform:none}}`;

  // Line icons (24×24, drawn with the current text colour) – same look in every browser, unlike emoji.
  const ICONS = {
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    ftf: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    dt: '<path d="m2 20 7-12 4 6.5 2.5-3.5L22 20Z"/><path d="M7.5 20h9"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.8 6.8 4.6c2.1-.1 3.9 1.1 5.2 3 1.3-1.9 3.1-3.1 5.2-3 3.4.2 5.3 3.6 4.1 6.7-1.8 4.6-9.3 9.2-9.3 9.2Z"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    ruler: '<path d="M2 17 17 2l5 5L7 22Z"/><path d="m6 13 2.5 2.5M9.5 9.5 12 12M13 6l2.5 2.5"/>',
    circles: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 2.4"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
    locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/>',
    expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    shrink: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9Z"/>',
    ring: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    solved: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.8-2.5 2.2-2.5 3.8"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 20 4"/>',
    person: '<circle cx="12" cy="4.8" r="2.3"/><path d="M9 21v-6.5H7.5V10a2.5 2.5 0 0 1 2.5-2.5h4a2.5 2.5 0 0 1 2.5 2.5v4.5H15V21Z"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M14.5 12v5M12 14.5h5"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
    eraser: '<path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1l9.9-9.9a1.5 1.5 0 0 1 2.1 0l5.6 5.6a1.5 1.5 0 0 1 0 2.1L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  };
  const icon = (name, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  // geocaching.com wraps the whole page in one ASP.NET <form>. Any <button> without a type is a
  // submit button there, and clicking it posts the form and reloads the page. So every button we
  // create gets type="button", and as a safety net we cancel any submit that starts in our UI.
  const OUR_UI = '.gcct, .gcct-dlg, .gcct-bar, .gcct-pop, .gcct-coord';
  const noSubmit = root => { root.querySelectorAll('button:not([type])').forEach(b => { b.type = 'button'; }); return root; };
  document.addEventListener('submit', e => {
    const src = e.submitter || document.activeElement;
    if (src && src.closest && src.closest(OUR_UI)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // Links to cache pages in our popups. The pages' own scripts (and Leaflet) react to mouse events on the
  // map and can swallow a plain link click or close the popup on mousedown. These listeners are added
  // before the site's own (the script runs at document-start), so we open the page ourselves and stop
  // the event before anything else sees it.
  const gcLink = e => e.target && e.target.closest && e.target.closest('a.gcct-gc');
  ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'dblclick'].forEach(t => document.addEventListener(t, e => {
    if (gcLink(e)) e.stopImmediatePropagation();
  }, true));
  ['click', 'auxclick'].forEach(t => document.addEventListener(t, e => {
    const a = gcLink(e);
    if (!a || (e.type === 'auxclick' && e.button !== 1)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.open(a.href, '_blank', 'noopener');
  }, true));
  document.addEventListener('keydown', e => {
    // Enter in one of our text fields would trigger the site's form ("implicit submission").
    if (e.key === 'Enter' && e.target.closest && e.target.closest(OUR_UI) && /^(INPUT|SELECT)$/.test(e.target.tagName)) e.preventDefault();
  }, true);

  // ---------------------------------------------------------------------------
  // What kind of cache is each GC code? (for the automatic 161 m circles)
  // The map tiles and the hidden cache grid only carry the GC code, so the script reads cache data the
  // site's own pages load anyway: every JSON answer from geocaching.com is scanned for cache objects
  // (code + type + corrected coordinates). On the old browse map, codes still unknown are looked up one
  // by one with the same request the site uses for its cache pop-up. Types are remembered in the
  // browser; solved coordinates only for the session, since you can change them.
  // ---------------------------------------------------------------------------
  const SCRIPT_VERSION = (() => { try { return GM_info.script.version; } catch (e) { return '?'; } })();
  try { localStorage.removeItem('gcct.physical'); } catch (e) { /* the old "Physical here" marks (removed in 1.33) */ }
  const TRADITIONAL = 2;

  const CACHE_INFO = new Map();              // code -> { type, solved, corrected: {lat,lng} | null }
  const seenThisVisit = new Set();           // codes the site has told us about since the page loaded
  const infoStats = { responses: 0, records: 0, lookups: 0, lookupFails: 0, urls: new Set(), keys: new Set(), solvedFields: new Set(), statusFields: new Set() };
  let typeStore = {};
  try { typeStore = JSON.parse(localStorage.getItem('gcct.cacheTypes') || '{}') || {}; } catch (e) { typeStore = {}; }
  Object.entries(typeStore).forEach(([c, t]) => CACHE_INFO.set(c, { type: t, solved: false, corrected: null }));
  // Your solved caches, remembered between visits (in this browser only): the site's search only knows a
  // cache when its posted coordinates are in view, but a puzzle's or Wherigo's final can be far from them.
  // So the mark at the solved position shows even where the posted coordinates are off the map.
  const SOLVED_KEY = 'gcct.solvedCaches', SOLVED_TTL = 60 * 864e5;
  let solvedStore = {};
  try { solvedStore = JSON.parse(localStorage.getItem(SOLVED_KEY) || '{}') || {}; } catch (e) { solvedStore = {}; }
  Object.entries(solvedStore).forEach(([c, e]) => {
    if (!e || !e.c || Date.now() - (e.ts || 0) > SOLVED_TTL) { delete solvedStore[c]; return; }
    const prev = CACHE_INFO.get(c) || {};
    CACHE_INFO.set(c, Object.assign({}, prev, { type: e.t ?? prev.type ?? null, solved: true, corrected: { lat: e.c[0], lng: e.c[1] },
      posted: e.p ? { lat: e.p[0], lng: e.p[1] } : prev.posted, found: e.f, owned: e.o, name: e.n || prev.name, fav: e.fav, diff: e.d, terr: e.te, fromStore: true }));
  });
  let solvedSaveTimer = null;
  function rememberSolved(code, i) {
    try {
      if (i.solved && i.corrected) {
        solvedStore[code] = { c: [+i.corrected.lat.toFixed(6), +i.corrected.lng.toFixed(6)], p: i.posted ? [+i.posted.lat.toFixed(6), +i.posted.lng.toFixed(6)] : null,
          f: i.found, o: i.owned, n: i.name, t: i.type, fav: i.fav, d: i.diff, te: i.terr, ts: Date.now() };
      } else if (solvedStore[code]) delete solvedStore[code];          // no longer solved
      else return;
      clearTimeout(solvedSaveTimer);
      solvedSaveTimer = setTimeout(() => { try { localStorage.setItem(SOLVED_KEY, JSON.stringify(solvedStore)); } catch (e) { /* full or blocked */ } }, 1000);
    } catch (e) { /* ignore */ }
  }
  let typeSaveTimer = null;
  function saveTypes() {
    clearTimeout(typeSaveTimer);
    typeSaveTimer = setTimeout(() => {
      try {
        const keys = Object.keys(typeStore);
        if (keys.length > 6000) keys.slice(0, keys.length - 5000).forEach(k => delete typeStore[k]);
        localStorage.setItem('gcct.cacheTypes', JSON.stringify(typeStore));
      } catch (e) { /* storage full or blocked – fine */ }
    }, 1000);
  }
  const toLL = c => {
    if (!c || typeof c !== 'object') return null;
    const lat = +(c.latitude ?? c.lat ?? c.Latitude ?? c.Lat), lng = +(c.longitude ?? c.lng ?? c.lon ?? c.Longitude ?? c.Lng);
    return isFinite(lat) && isFinite(lng) && (lat || lng) ? { lat, lng } : null;
  };
  function typeOf(t) {
    if (t == null) return null;
    if (typeof t === 'number') return t;
    if (typeof t === 'string') return /^\d+$/.test(t) ? +t : /tradi/i.test(t) ? TRADITIONAL : -1;
    if (typeof t === 'object') {
      const v = t.value ?? t.id ?? t.typeId ?? t.geocacheTypeId;
      if (v != null && /^\d+$/.test(String(v))) return +v;
      const txt = String(t.text ?? t.name ?? '');
      return /tradi/i.test(txt) ? TRADITIONAL : txt ? -1 : null;
    }
    return null;
  }
  // Caches that were in an answer from the site's cache search. That search leaves out your own caches,
  // so only this – not any other answer the site gets, e.g. when you hover or click a cache – says "not yours".
  const inSearch = new Set();
  // Your user name, if the page shows it – only compared with a cache's owner here, never stored or sent.
  function myName() {
    try {
      const sp = window.serverParameters && window.serverParameters['user:info'];
      if (sp && typeof sp.username === 'string' && sp.username.trim()) return sp.username.trim().toLowerCase();
      const g = window._gcUser || window.gcUser || (window.chromeSettings && window.chromeSettings.user) || {};
      const n = g.username || g.userName || g.name ||
        ((document.querySelector('.username, .user-name, [data-username], #ctl00_uxLoginStatus_hlHeaderAccount') || {}).dataset || {}).username ||
        (document.querySelector('.username, .user-name') || {}).textContent;
      return typeof n === 'string' && n.trim() ? n.trim().toLowerCase() : null;
    } catch (e) { return null; }
  }
  function recordCache(code, o, src, fromSearch) {
    let prev = CACHE_INFO.get(code) || { type: null, solved: false, corrected: null };
    // A remembered solved cache that the search now answers for: the search's answer decides again.
    if (fromSearch && prev.fromStore) prev = Object.assign({}, prev, { solved: false, corrected: null, fromStore: false });
    const t = typeOf(o.geocacheType ?? o.cacheType ?? o.geocacheTypeId ?? o.cacheTypeId ?? o.typeId ?? o.type);
    const type = t != null && t !== -1 ? t : (prev.type ?? t);
    let { solved, corrected } = prev;
    const cc = o.userCorrectedCoordinates ?? o.correctedCoordinates ?? o.correctedCoords ?? o.userCoordinates;
    const ll = toLL(cc);
    if (ll) { solved = true; corrected = ll; }
    if (o.hasCorrectedCoordinates === true || o.hasUserCorrectedCoordinates === true || o.isCorrected === true ||
        o.corrected === true || o.correctedCoordinatesSet === true || o.hasSolvedCoordinates === true) solved = true;
    // Whatever the site calls it: any field about corrected / solved / user coordinates.
    for (const k in o) {
      if (!/correct|solved|usercoord|modified.?coord/i.test(k)) continue;
      const v = o[k];
      if (v === true) solved = true;
      else if (v && typeof v === 'object') {
        const p = toLL(v) || toLL(v.coordinates) || toLL(v.coords) || toLL(v.location);
        if (p) { solved = true; corrected = p; }
      } else if (typeof v === 'string' && v.trim()) {
        const q = parseCoord(v);
        if (q) { solved = true; corrected = { lat: q[0], lng: q[1] }; }
      }
      if (infoStats.solvedFields.size < 10) infoStats.solvedFields.add(k + ':' + (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v));
    }
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : prev.name;
    // Have you found it, and is it yours? (whatever the site calls it)
    let found = prev.found, owned = prev.owned;
    for (const k in o) {
      const v = o[k];
      if (/^(user)?(has)?(is)?found$|^userfound|^foundbyuser|^isfound/i.test(k) && typeof v === 'boolean') found = v;
      else if (/^(user)?(is)?own(er|ed)$|^userowned|^isowner|^ownedbyuser/i.test(k) && typeof v === 'boolean') owned = v;
      if (/found|own/i.test(k) && infoStats.statusFields.size < 10) infoStats.statusFields.add(k + ':' + (v === null ? 'null' : typeof v));
    }
    if (o.userLog && /found/i.test(String(o.userLog.type || o.userLog))) found = true;
    // The owner's name, whatever the site calls it (compared with yours when filtering My Hides).
    let ownerName = prev.ownerName;
    const ow = o.owner ?? o.ownerUser ?? o.cacheOwner ?? o.placedBy ?? o.ownerName ?? o.ownerUsername ?? o.ownerUserName;
    const on = typeof ow === 'string' ? ow : ow && typeof ow === 'object' ? (ow.username ?? ow.userName ?? ow.name ?? ow.text ?? ow.displayName) : null;
    if (typeof on === 'string' && on.trim()) ownerName = on.trim().toLowerCase();
    // Exact posted coordinates (the old map only lets us estimate them from the cache icon).
    const posted = toLL(o.postedCoordinates) || toLL(o.postedCoords) || toLL(o.coordinates) || toLL(o.location) ||
      (o.latitude != null && o.longitude != null ? toLL(o) : null) || prev.posted || null;
    // Difficulty and terrain: a number, or { text: 1.5, value: "1_5" } on the old map.
    const dtNum = v => {
      if (v == null) return null;
      if (typeof v === 'object') v = v.text ?? v.value ?? v.rating;
      const n = parseFloat(String(v).replace('_', '.').replace(',', '.'));
      return isFinite(n) && n >= 1 && n <= 5 ? n : null;
    };
    const diff = dtNum(o.difficulty ?? o.difficultyRating ?? o.diff) ?? prev.diff ?? null;
    const terr = dtNum(o.terrain ?? o.terrainRating ?? o.terr) ?? prev.terr ?? null;
    // Never found by anyone: the cache search gives the date of the last find, empty when there is none.
    // (The answer may leave the field out altogether when there is no find – a cache-search result then
    // counts as never found too.)
    const searchLike = fromSearch || ('geocacheType' in o && 'favoritePoints' in o && ('postedCoordinates' in o || 'placedDate' in o));
    // A missing find is not always empty: an "empty" date (year 1) or one before the cache was placed counts too.
    const lastFound = 'lastFoundDate' in o ? o.lastFoundDate : prev.lastFound;
    const placed = o.placedDate || prev.placed;
    const noFind = d => {
      if (!d) return true;
      const t = Date.parse(d);
      if (!isFinite(t) || t < Date.UTC(2000, 0, 1)) return true;
      const p = placed && Date.parse(placed);
      return !!(p && isFinite(p) && t < p);
    };
    const neverFound = 'lastFoundDate' in o ? noFind(o.lastFoundDate) : (searchLike ? true : prev.neverFound);
    const status = o.cacheStatus != null ? o.cacheStatus : prev.status;
    // Favourite points, whatever the site calls the field.
    let fav = prev.fav;
    for (const k in o) {
      if (/^(favou?rite|fav)(s|points?|count|pointcount|score)?$/i.test(k) && isFinite(o[k]) && o[k] !== null && o[k] !== '') { fav = Number(o[k]); break; }
    }
    CACHE_INFO.set(code, Object.assign({}, prev, { type, solved, corrected, name, found, owned, ownerName, posted, fav, diff, terr, neverFound, status, lastFound, placed, fromPage: fromSearch ? false : prev.fromPage }));
    if (fromSearch) { inSearch.add(code); rememberSolved(code, CACHE_INFO.get(code)); }
    if (type != null && type !== -1 && typeStore[code] !== type) { typeStore[code] = type; saveTypes(); }
    if (src === 'net') { seenThisVisit.add(code); infoStats.records++; if (infoStats.keys.size < 60) Object.keys(o).forEach(k => infoStats.keys.size < 60 && infoStats.keys.add(k)); }
  }
  function harvest(obj, depth = 0, src = 'net') {
    if (!obj || typeof obj !== 'object' || depth > 9) return;
    if (Array.isArray(obj)) { for (let i = 0; i < obj.length && i < 5000; i++) harvest(obj[i], depth + 1, src); return; }
    const code = [obj.code, obj.gc, obj.referenceCode, obj.geocacheCode, obj.cacheCode].find(v => typeof v === 'string' && /^GC[0-9A-Z]{1,7}$/i.test(v));
    if (code) recordCache(code.toUpperCase(), obj, 'net', src === 'search');
    for (const k in obj) { const v = obj[k]; if (v && typeof v === 'object') harvest(v, depth + 1, src); }
  }
  // The structure of a JSON answer: keys and value types only, a few levels deep (for gcctCacheDebug).
  function shapeOf(v, d = 0) {
    if (v == null) return String(v);
    if (Array.isArray(v)) {
      if (d > 3) return `[${v.length}]`;
      if (!v.length) return ['empty', '×0'];
      if (v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
        const merged = {};
        v.slice(0, 500).forEach(x => Object.keys(x).forEach(k => { if (!(k in merged) || merged[k] == null) merged[k] = x[k]; }));
        return [shapeOf(merged, d + 1), `×${v.length}`];
      }
      return [shapeOf(v[0], d + 1), `×${v.length}`];
    }
    if (typeof v === 'object') {
      if (d > 3) return '{…}';
      const o = {};
      Object.keys(v).slice(0, 30).forEach(k => { o[k] = shapeOf(v[k], d + 1); });
      return o;
    }
    if (typeof v === 'string') return /^GC[0-9A-Z]+$/i.test(v) ? 'GC-code' : 'text';   // never the value itself
    return typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) < 100 ? v : 'number') : typeof v;
  }
  const shapes = [];
  function sniffed(url, json) {
    try {
      infoStats.responses++;
      const path = new URL(url, location.href).pathname;
      if (shapes.length < 12 && !/account|email|token|oauth|profile|user|communication|message|lists/i.test(path)) shapes.push({ url: new URL(url, location.href).pathname.replace(/GC[0-9A-Z]+/gi, 'GC…'), shape: shapeOf(json) });
      if (infoStats.urls.size < 25 && !/account|email|token|oauth|profile|communication/i.test(path)) infoStats.urls.add(path.replace(/GC[0-9A-Z]+/gi, 'GC…').replace(/\d{3,}|[0-9a-f-]{20,}/gi, '…'));
      harvest(json);
    } catch (e) { /* never disturb the page */ }
  }
  let siteAuth = null;            // the site's own "Bearer …" header for its web API – kept in memory only
  const sameSite = u => { try { return /(^|\.)geocaching\.com$/i.test(new URL(u, location.href).hostname); } catch (e) { return false; } };
  // fetch()
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      const p = origFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : input && input.url;
        try {
          const h = (init && init.headers) || (input && input.headers);
          const a = h && (typeof h.get === 'function' ? h.get('Authorization') : h.Authorization || h.authorization);
          if (a && /^bearer /i.test(a) && url && sameSite(url)) siteAuth = a;
        } catch (e) { /* ignore */ }
        if (url && sameSite(url)) p.then(r => {
          if (/json/i.test(r.headers.get('content-type') || '')) r.clone().json().then(j => sniffed(url, j)).catch(() => {});
        }).catch(() => {});
      } catch (e) { /* ignore */ }
      return p;
    };
  }
  // XMLHttpRequest (jQuery on the old map)
  try {
    const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      try { if (/^authorization$/i.test(k) && /^bearer /i.test(v) && this.__gcctUrl && sameSite(String(this.__gcctUrl))) siteAuth = v; } catch (e) { /* ignore */ }
      return XH.apply(this, arguments);
    };
    XMLHttpRequest.prototype.open = function (m, url) { this.__gcctUrl = url; return XO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      try {
        if (this.__gcctUrl && sameSite(String(this.__gcctUrl))) this.addEventListener('load', () => {
          try {
            if (!/json/i.test(this.getResponseHeader('content-type') || '')) return;
            const j = this.responseType === 'json' ? this.response : (this.responseType === '' || this.responseType === 'text') ? JSON.parse(this.responseText) : null;
            if (j) sniffed(String(this.__gcctUrl), j);
          } catch (e) { /* not JSON after all */ }
        });
      } catch (e) { /* ignore */ }
      return XS.apply(this, arguments);
    };
  } catch (e) { /* ignore */ }
  // Data embedded in the page itself (Next.js and similar)
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('script[type="application/json"]').forEach(sc => { try { harvest(JSON.parse(sc.textContent)); } catch (e) { /* ignore */ } });
  });
  // Ask the site's own cache search (the one the new map uses) for the caches in the current view. The
  // answer holds each cache's code, type and any solved coordinates. Areas already asked are skipped.
  const searchState = { requests: 0, lastStatus: null, lastCount: null, format: null, authUsed: false, error: null };
  const searched = [];
  const searchedAreas = () => searched;
  const searchedComplete = [];     // areas whose search answer was complete (fewer than 500 caches)
  let searchBusy = false;
  async function siteToken() {
    if (siteAuth) return siteAuth;
    try {
      const r = await fetch('/account/oauth/token', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const j = r.ok ? await r.json() : null;
      if (j && j.access_token) siteAuth = 'Bearer ' + j.access_token;
    } catch (e) { /* not available */ }
    return siteAuth;
  }
  async function searchArea(b) {
    if (searchBusy || !b || searchedComplete.some(x => x.contains(b))) return;
    const sz = x => (x.getNorth() - x.getSouth()) * (x.getEast() - x.getWest());
    // An earlier answer that hit the 500-cache limit doesn't tell which caches are missing: ask again for
    // this smaller area (unless it is hardly smaller), so your own caches can be told apart.
    const cut = searched.find(x => x.contains(b));
    if (cut && sz(cut) < 3 * sz(b)) return;
    searchBusy = true;
    try {
      const area = cut ? b : (b.pad ? b.pad(0.3) : b);
      const n = area.getNorth(), so = area.getSouth(), w = area.getWest(), e = area.getEast();
      const formats = searchState.format ? [searchState.format] : ['nwse', 'swne'];
      for (const f of formats) {
        const box = (f === 'nwse' ? [n, w, so, e] : [so, w, n, e]).map(v => v.toFixed(5)).join(',');
        const url = `/api/proxy/web/search/v2?skip=0&take=500&asc=true&sort=distance&box=${box}`;
        const get = auth => fetch(url, { credentials: 'same-origin', headers: Object.assign({ Accept: 'application/json' }, auth ? { Authorization: auth } : {}) });
        searchState.requests++;
        let r = await get(siteAuth);
        if (r.status === 401 || r.status === 403) { const a = await siteToken(); if (a) { searchState.authUsed = true; r = await get(a); } }
        searchState.lastStatus = r.status;
        if (!r.ok) continue;
        const j = await r.json();
        harvest(j, 0, 'search');
        const list = (j && (j.results || j.data || j.geocaches)) || [];
        searchState.lastCount = list.length;
        if (list.length || f === formats[formats.length - 1]) {
          searchState.format = f; searched.push(area);
          if (list.length < 500) searchedComplete.push(area);     // every cache there was in the answer
          break;
        }
      }
    } catch (e) { searchState.error = String(e); }
    searchBusy = false;
    if (window.__gcctFavKick) window.__gcctFavKick();     // favourite points have arrived
    if (window.__gcctInfoChanged) window.__gcctInfoChanged();
  }
  // Old browse map: look up codes the page has not told us about, a few at a time.
  const lookupQueue = [], lookupBusy = new Set(), lookupDone = new Set();
  function lookupTypes(codes) {
    codes.forEach(c => { if (!lookupDone.has(c) && !lookupBusy.has(c) && !lookupQueue.includes(c)) lookupQueue.push(c); });
    while (lookupBusy.size < 3 && lookupQueue.length) {
      const c = lookupQueue.shift();
      lookupBusy.add(c);
      infoStats.lookups++;
      fetch('/map/map.details?i=' + encodeURIComponent(c), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(j => { harvest(j); (j && j.data || []).forEach(d => d && !d.gc && !d.code && recordCache(c, d, 'lookup')); })
        .catch(e => { infoStats.lookupFails++; infoStats.lastLookupError = String(e); })
        .finally(() => { lookupBusy.delete(c); lookupDone.add(c); if (window.__gcctInfoChanged) window.__gcctInfoChanged(); lookupTypes([]); });
    }
  }
  // Physical stages and final locations of multis, mysteries, Wherigos and letterboxes, read from the
  // "Additional Waypoints" list on each cache page (only the ones the owner has made visible – hidden
  // coordinates show as ??? there). Two pages at a time, at most 40 per area, remembered for 14 days.
  const STAGE_TYPES = new Set([3, 8, 5, 1858]);            // multi, mystery, letterbox, Wherigo
  const STAGE_TTL = 14 * 864e5;
  let stageStore = {};
  try { stageStore = JSON.parse(localStorage.getItem('gcct.stages') || '{}') || {}; } catch (e) { stageStore = {}; }
  const stageStats = { pages: 0, fails: 0, lastError: null, withStages: 0 };
  const stageQueue = [], stageBusy = new Set();
  let stageSaveTimer = null;
  function saveStages() {
    clearTimeout(stageSaveTimer);
    stageSaveTimer = setTimeout(() => {
      try {
        const now = Date.now();
        Object.keys(stageStore).forEach(k => { if (now - stageStore[k].t > STAGE_TTL) delete stageStore[k]; });
        localStorage.setItem('gcct.stages', JSON.stringify(stageStore));
      } catch (e) { /* storage full or blocked */ }
    }, 1000);
  }
  // (Finals "at the posted coordinates" remembered by versions before 1.39.22 are dropped.)
  const stagesOf = code => { const e = stageStore[code]; return e && Date.now() - e.t < STAGE_TTL ? e.s.filter(w => !(w[4] === 'posted' && w[2] === 'final')) : null; };
  // Waypoint rows on a cache page: type (from the icon's alt/title or the text), name and coordinates.
  function parseStages(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
    doc.querySelectorAll('table[id*="Waypoints" i] tr, table.Table.alternatingRow tr, #ctl00_ContentBody_Waypoints tr').forEach(tr => {
      const txt = tr.textContent.replace(/\s+/g, ' ');
      const kindTxt = [...tr.querySelectorAll('img')].map(i => (i.getAttribute('alt') || '') + ' ' + (i.getAttribute('title') || '')).join(' ') + ' ' + txt;
      // The waypoint icon's file name is the same in every language: 219 = physical stage, 220 = final.
      const src = [...tr.querySelectorAll('img')].map(i => i.getAttribute('src') || '').join(' ');
      const kind = /wpttypes\/(?:sm\/)?(?:219\b|stage[^/]*\.|physical[^/]*\.)/i.test(src) ? 'stage' : /wpttypes\/(?:sm\/)?(?:220\b|flag\.|final[^/]*\.)/i.test(src) ? 'final'
        : /wpttypes\/(?:sm\/)?(?:pkg|trailhead|puzzle|waypoint|reference|parking)[^/]*\./i.test(src) ? null
        : /physical stage|stage physique|fysisk/i.test(kindTxt) ? 'stage' : /final location|final|endelig/i.test(kindTxt) ? 'final' : null;
      if (!kind) return;
      const m = txt.match(/[NS]\s*\d{1,2}°\s*\d{1,2}[.,]\d+\s*[EWØV]\s*\d{1,3}°\s*\d{1,2}[.,]\d+/i);
      if (!m) {
        // A physical stage listed with no coordinates of its own (not hidden as ???) is at the posted coordinates.
        // Never a final: a final without coordinates is simply not shown (e.g. Wherigos and mysteries).
        if (kind === 'stage' && !/\?\?\?/.test(txt)) out.push([null, null, kind, ((tr.querySelector('a') || {}).textContent || '').trim().slice(0, 60), 'posted']);
        return;
      }
      const q = parseCoord(m[0].replace(/,/g, '.').replace(/Ø/gi, 'E').replace(/\bV\b/gi, 'W'));
      if (!q) return;
      const a = tr.querySelector('a');
      out.push([+q[0].toFixed(6), +q[1].toFixed(6), kind, ((a && a.textContent) || '').trim().slice(0, 60)]);
    });
    const seen = new Set();
    return out.filter(w => { const k = w[4] === 'posted' ? 'posted' : w[0] + ',' + w[1]; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // Exact coordinates from a cache page: the posted ones, and your corrected ones if you have set them
  // (the page's userDefinedCoords). Used when the site's cache search hasn't told us – e.g. your own caches.
  function jsonAfter(html, name, max = 20000) {
    const i = html.search(new RegExp('\\b' + name + '\\s*=\\s*\\{'));
    if (i < 0) return null;
    const s = html.indexOf('{', i);
    let depth = 0, inStr = false, esc = false;
    for (let k = s; k < html.length && k < s + max; k++) {
      const ch = html[k];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { try { return JSON.parse(html.slice(s, k + 1)); } catch (e) { return null; } }
    }
    return null;
  }
  function pageCoords(html) {
    const out = { posted: null, corrected: null };
    const u = jsonAfter(html, 'userDefinedCoords'), d = u && u.data;
    if (d && d.isUserDefined && Array.isArray(d.newLatLng) && d.newLatLng.length === 2) {
      out.corrected = { lat: +d.newLatLng[0], lng: +d.newLatLng[1] };
      const q = d.oldLatLngDisplay && parseCoord(String(d.oldLatLngDisplay).replace(/,/g, '.'));
      if (q) out.posted = { lat: q[0], lng: q[1] };
    }
    if (!out.posted && !out.corrected) {
      const m = jsonAfter(html, 'mapLatLng');
      if (m && isFinite(m.lat) && isFinite(m.lng)) out.posted = { lat: +m.lat, lng: +m.lng };
      else {
        const t = html.match(/id="uxLatLon"[^>]*>([^<]+)</);
        const q = t && parseCoord(t[1].replace(/,/g, '.'));
        if (q) out.posted = { lat: q[0], lng: q[1] };
      }
    }
    return out;
  }
  function applyPageCoords(code, html) {
    const pc = pageCoords(html);
    if (!pc.posted && !pc.corrected) return false;
    const i = Object.assign({ type: null, solved: false, corrected: null }, CACHE_INFO.get(code) || {});
    if (pc.posted) i.posted = pc.posted;
    const fv = html.match(/class="favorite-value"[^>]*>\s*(\d+)/i) || html.match(/(\d+)\s*(?:Favorites|Favoritter)\b/i);
    if (fv && i.fav == null) i.fav = Number(fv[1]);
    // D/T from the star images: stars1_5.gif = 1.5.
    const star = id => { const m = html.match(new RegExp(id + '[\\s\\S]{0,400}?stars(\\d)(?:_(5))?\\.')); return m ? Number(m[1]) + (m[2] ? 0.5 : 0) : null; };
    if (i.diff == null) i.diff = star('uxLegendScale');
    if (i.terr == null) i.terr = star('Localize12');
    const nm = html.match(/id="ctl00_ContentBody_CacheName"[^>]*>([^<]{1,120})</);
    if (nm && !i.name) { const el = document.createElement('textarea'); el.innerHTML = nm[1].trim(); i.name = el.value; }
    const searched = inSearch.has(code);
    // Missing from an answer that hit the 500-cache limit says nothing: not taken as yours then.
    const at = pc.posted && L.latLng ? L.latLng(pc.posted.lat, pc.posted.lng) : null;
    const capped = at && !searchedComplete.some(x => x.contains(at)) && searchedAreas().some(x => x.contains(at));
    if (!searched && !capped) i.fromPage = true;          // not in the site's search: in practice your own caches
    if (pc.corrected) { i.corrected = pc.corrected; i.solved = true; }
    else if (pc.posted && !searched) { i.corrected = null; i.solved = false; }   // the search's answer wins
    CACHE_INFO.set(code, i);
    return true;
  }
  const pageCoordsTried = new Set();
  function fetchPageCoords(code) {
    if (pageCoordsTried.has(code)) return Promise.resolve(false);
    pageCoordsTried.add(code);
    return fetch('/geocache/' + encodeURIComponent(code), { credentials: 'same-origin' })
      .then(r => (r.ok ? r.text() : Promise.reject('HTTP ' + r.status)))
      .then(html => { const ok = applyPageCoords(code, html); if (ok && window.__gcctInfoChanged) window.__gcctInfoChanged(); return ok; })
      .catch(() => false);
  }
  // gcctStageTest('GCxxxx') in the console: reads one cache page and shows what the script finds there –
  // the tables and waypoint-like rows on the page, and the stages it picks out. Cache data only.
  window.gcctStageTest = async function (code) {
    const out = { code, cacheType: (CACHE_INFO.get(String(code || '').toUpperCase()) || {}).type ?? null };
    try {
      const r = await fetch('/geocache/' + encodeURIComponent(code), { credentials: 'same-origin' });
      out.status = r.status;
      const html = await r.text();
      out.bytes = html.length;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      out.tables = [...doc.querySelectorAll('table')].slice(0, 12).map(t => `${t.id || '-'} .${t.className || '-'} rows=${t.rows.length}`);
      out.waypointImages = [...new Set([...doc.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(x => /wpt|waypoint/i.test(x)))].slice(0, 12);
      out.coordinateTexts = (html.match(/[NS]\s*\d{1,2}°\s*\d{1,2}[.,]\d+\s*[EWØV]\s*\d{1,3}°\s*\d{1,2}[.,]\d+/gi) || []).slice(0, 12);
      out.mentions = ['Physical Stage', 'Final Location', 'Additional Waypoints', 'Waypoints', 'Fysisk', 'Endelig', 'Veipunkt', '__NEXT_DATA__', 'additionalWaypoints', 'waypoints']
        .filter(w => html.includes(w));
      out.found = parseStages(html);
    } catch (e) { out.error = String(e); }
    console.log(JSON.stringify(out, null, 1));
    return out;
  };
  function fetchStages(codes) {
    codes.forEach(c => { if (!stagesOf(c) && !stageBusy.has(c) && !stageQueue.includes(c)) stageQueue.push(c); });
    while (stageBusy.size < 2 && stageQueue.length) {
      const c = stageQueue.shift();
      stageBusy.add(c);
      stageStats.pages++;
      fetch('/geocache/' + encodeURIComponent(c), { credentials: 'same-origin' })
        .then(r => (r.ok ? r.text() : Promise.reject('HTTP ' + r.status)))
        .then(html => { pageCoordsTried.add(c); applyPageCoords(c, html); const st = parseStages(html); stageStore[c] = { t: Date.now(), s: st }; if (st.length) stageStats.withStages++; saveStages(); })
        .catch(e => { stageStats.fails++; stageStats.lastError = String(e); stageStore[c] = { t: Date.now() - STAGE_TTL + 36e5, s: [] }; })  // try again in an hour
        .finally(() => { stageBusy.delete(c); if (window.__gcctInfoChanged) window.__gcctInfoChanged(); fetchStages([]); });
    }
  }

  // Which caches get an automatic 161 m circle, and where: traditionals at their position, and any
  // cache with solved (corrected) coordinates at the solved position.
  function circlePosition(code, ll) {
    const i = code && CACHE_INFO.get(code);
    if (!i) return null;
    if (i.solved) return i.corrected || i.posted || ll;
    return i.type === TRADITIONAL ? (i.posted || ll) : null;
  }

  let map = null;
  let cacheHider = null;   // set by init(): hide / show all geocaches (used by the toolbar)
  // Cache pages: only show the chosen map layers on the page's small map – no toolbar, panel or other changes.
  const LITE = /^\/(geocache\/|seek\/cache_details)/i.test(location.pathname);
  const siteCtls = [];   // the site's L.control.layers instances

  // --- Find the Leaflet map instance -------------------------------------
  // Works on the old browse map (/map) and the new search map (/play/map, a single-page app).
  function onMap(m) {
    if (!m || !m.addLayer || m === map) return;
    // Keep the map we already have while it's on the page; take a new one if the app replaced it.
    if (map && map.getContainer && document.contains(map.getContainer())) return;
    map = m;
    // Run after the site has finished its own setup, and never let our errors reach the site's code.
    m.whenReady(() => setTimeout(() => {
      if (map !== m) return;
      try { init(); } catch (e) { console.error('[gcct] init failed', e); }
    }, 0));
  }

  function hookLeaflet(L) {
    if (!L || !L.Map || L.__gcctHooked) return;
    L.__gcctHooked = true;
    L.Map.addInitHook(function () { onMap(this); });
    // A map created before we got here is caught the next time it fires any event (they fire constantly).
    const fire = L.Map.prototype.fire;
    L.Map.prototype.fire = function () {
      if (this !== map) { try { onMap(this); } catch (e) { /* never break the site */ } }
      return fire.apply(this, arguments);
    };
    if (L.Control && L.Control.Layers) L.Control.Layers.addInitHook(function () { siteCtls.push(this); });
  }

  // Catch Leaflet the moment the page defines window.L, before the site can create its map.
  if (!window.L) {
    try {
      let realL;
      Object.defineProperty(window, 'L', {
        configurable: true, enumerable: true,
        get() { return realL; },
        set(v) { realL = v; try { hookLeaflet(v); } catch (e) { /* ignore */ } },
      });
    } catch (e) { /* fall back to polling */ }
  }
  const poll = setInterval(() => {
    if (window.L) hookLeaflet(window.L);
    if (window.MapSettings && window.MapSettings.Map) onMap(window.MapSettings.Map);
    if (map) clearInterval(poll);
  }, 50);
  setTimeout(() => clearInterval(poll), 60000);

  // Troubleshooting: type gcctReport() in the browser console. The report is printed and copied.
  // Where are the cache types on this page? Prints samples of the site's cache data: the structure of the
  // JSON answers the page loaded, a few cache markers, the hidden cache grid and the WebGL map's features.
  window.gcctCacheDebug = function () {
    const vals = [...CACHE_INFO.values()];
    const out = { page: location.pathname, script: SCRIPT_VERSION, cacheSearch: Object.assign({}, searchState, { siteAuthSeen: !!siteAuth }),
      caches: { seenThisVisit: seenThisVisit.size, known: vals.length, traditional: vals.filter(v => v.type === TRADITIONAL).length, solved: vals.filter(v => v.solved).length, solvedWithCoords: vals.filter(v => v.corrected).length },
      solvedFieldsSeen: [...infoStats.solvedFields], foundOwnFieldsSeen: [...infoStats.statusFields],
      foundSolved: vals.filter(v => v.solved && v.found).length, withExactPosition: vals.filter(v => v.posted).length,
      stagePages: Object.assign({ remembered: Object.keys(stageStore).length, queued: stageQueue.length }, stageStats), jsonAnswers: shapes };
    try {
      const L = window.L, markers = [];
      const visit = l => {
        if (!l || markers.length >= 3) return;
        if (L.Marker && l instanceof L.Marker && !(typeof l.getChildCount === 'function')) {
          const o = l.options || {}, ic = (o.icon && o.icon.options) || {};
          markers.push({ optionKeys: Object.keys(o), title: o.title, alt: o.alt, iconKeys: Object.keys(ic), iconUrl: ic.iconUrl, className: ic.className,
            html: ic.html && String(ic.html).slice(0, 300), element: l._icon && l._icon.outerHTML.slice(0, 400),
            extra: Object.keys(l).filter(k => !k.startsWith('_') && typeof l[k] !== 'function').slice(0, 15) });
        } else if (typeof l.getLayers === 'function') l.getLayers().forEach(visit);
      };
      if (map) map.eachLayer(visit);
      out.markers = markers;
      const g = window.MapSettings && window.MapSettings.MapLayers && window.MapSettings.MapLayers.UTFGrid;
      if (g && g._cache) {
        const cells = [];
        Object.values(g._cache).some(t => t && t.data && Object.values(t.data).some(arr => { (arr || []).forEach(x => cells.length < 3 && cells.push(x)); return cells.length >= 3; }));
        out.utfGridSample = cells;
      }
      const gl = [];
      if (map) map.eachLayer(l => { if (l._glMap) gl.push(l._glMap); });
      out.webgl = gl.map(m => {
        const r = { sources: Object.keys((m.getStyle() || {}).sources || {}), layers: ((m.getStyle() || {}).layers || []).map(x => x.id).slice(-25) };
        try {
          r.features = m.queryRenderedFeatures().filter(f => f.properties && Object.keys(f.properties).length).slice(0, 4)
            .map(f => ({ layer: f.layer && f.layer.id, source: f.source, sourceLayer: f.sourceLayer, properties: f.properties }));
        } catch (e) { r.features = String(e); }
        return r;
      });
    } catch (e) { out.error = String(e); }
    const text = JSON.stringify(out, null, 1);
    console.log(text);
    try { navigator.clipboard.writeText(text).then(() => console.log('[gcct] cache debug copied to the clipboard'), () => console.log('[gcct] could not copy – select the text above and copy it')); } catch (e) { /* ignore */ }
    return out;
  };
  window.gcctReport = function () {
    const L = window.L, out = { page: location.pathname, leaflet: L && L.version, mapFound: !!map, script: SCRIPT_VERSION };
    if (map) {
      out.zoom = map.getZoom();
      if (window.__gcctTiles) { try { Object.assign(out, window.__gcctTiles()); } catch (e) { out.tiles = String(e); } }
      if (window.__gcctSiteButtons) { try { out.siteButtons = window.__gcctSiteButtons(); } catch (e) { out.siteButtons = String(e); } }
      const mr = map.getContainer().getBoundingClientRect();
      out.mapBox = `${Math.round(mr.left)},${Math.round(mr.top)} ${Math.round(mr.width)}×${Math.round(mr.height)}`;
      const kinds = {};
      map.eachLayer(l => {
        const k = [L.Marker && l instanceof L.Marker ? 'marker' : L.TileLayer && l instanceof L.TileLayer ? 'tiles' : L.GridLayer && l instanceof L.GridLayer ? 'grid'
          : l._glMap ? 'webgl' : L.LayerGroup && l instanceof L.LayerGroup ? `group(${l.getLayers().length})` : L.Path && l instanceof L.Path ? 'path' : 'other',
          l.options && l.options.pane, String(l._url || '').slice(0, 90)].filter(Boolean).join(' | ');
        kinds[k] = (kinds[k] || 0) + 1;
      });
      out.layers = kinds;
      try {
        out.panes = Object.entries(map.getPanes()).map(([n, el]) =>
          `${n}: z=${getComputedStyle(el).zIndex} children=${el.children.length} canvas=${el.querySelectorAll('canvas').length} img=${el.querySelectorAll('img').length}`);
      } catch (e) { out.panes = String(e); }
      out.layerControls = siteCtls.length;
      out.utfGrid = !!(window.MapSettings && window.MapSettings.MapLayers && window.MapSettings.MapLayers.UTFGrid);
    }
    const vals = [...CACHE_INFO.values()];
    out.cacheInfo = { known: vals.length, withType: vals.filter(v => v.type != null && v.type !== -1).length,
      traditional: vals.filter(v => v.type === TRADITIONAL).length, solved: vals.filter(v => v.solved).length,
      solvedWithCoords: vals.filter(v => v.corrected).length, jsonResponses: infoStats.responses, recordsSeen: infoStats.records,
      cacheSearch: Object.assign({}, searchState), urls: [...infoStats.urls], fields: [...infoStats.keys].join(',') };
    if (window.__gcctAutoStats) { try { out.autoCircles = window.__gcctAutoStats(); } catch (e) { out.autoCircles = String(e); } }
    const text = JSON.stringify(out, null, 2);
    console.log(text);
    try { navigator.clipboard.writeText(text).then(() => console.log('[gcct] report copied to the clipboard'), () => console.log('[gcct] could not copy – select the text above and copy it')); } catch (e) { /* ignore */ }
    return out;
  };

  // ===========================================================================
  // Source detection & capabilities parsing
  // ===========================================================================
  const OGC_PARAMS = /^(service|request|version|layers?|styles?|format|transparent|crs|srs|bbox|width|height|exceptions|bgcolor|tiled|tilematrixset|tilematrix|tilerow|tilecol)$/i;
  function stripOgc(url) {
    const [b, q = ''] = url.split('?');
    const keep = q.split('&').filter(p => p && !OGC_PARAMS.test(p.split('=')[0]));
    return keep.length ? `${b}?${keep.join('&')}` : b;
  }
  const addQ = (u, p) => u + (u.includes('?') ? (/[?&]$/.test(u) ? '' : '&') : '?') + p;

  function quadkey(x, y, z) {
    let q = '';
    for (let i = z; i > 0; i--) {
      const m = 1 << (i - 1);
      q += ((x & m) ? 1 : 0) + ((y & m) ? 2 : 0);
    }
    return q;
  }
  function tileXY(lat, lng, z) {
    const n = 2 ** z, r = lat * Math.PI / 180;
    return {
      x: Math.floor((lng + 180) / 360 * n),
      y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n),
    };
  }

  // Turns whatever the user pasted into a (partial) layer definition.
  // Returns { kind, url, name, …fields, note? } or { caps: 'wms'|'wmts', capsUrl, … } or null.
  function analyzeUrl(raw, center) {
    let url = raw.trim().replace(/%7B/gi, '{').replace(/%7D/gi, '}').replace(/\$\{/g, '{');
    if (!url) return null;
    if (/^\/\//.test(url)) url = 'https:' + url;
    else if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\{(zoom|Z|level)\}/g, '{z}').replace(/\{X\}/g, '{x}').replace(/\{Y\}/g, '{y}')
      .replace(/\{-Y\}/g, '{-y}').replace(/\{quad[kK]ey\}|\{QuadKey\}/g, '{q}');

    const host = (url.match(/^https?:\/\/([^/?#:]+)/i) || [])[1] || '';
    const name = host.replace(/^[^.]*\{s\}[^.]*\./, '').replace(/^(www|tiles?|cache|maps?|server|services|[a-d])\./i, '');
    const [base, query = ''] = url.split('?');
    const param = n => { const m = new RegExp('(?:^|&)' + n + '=([^&#]*)', 'i').exec(query); return m ? decodeURIComponent(m[1]) : ''; };
    const svc = param('service').toUpperCase(), req = param('request').toLowerCase();
    // {s} right after a letter/digit (t{s}, mt{s}, server{s}) is usually numbered 0–3, otherwise a/b/c.
    const guessSub = u => !/\{s\}/.test(u) ? '' : /[a-z0-9]\{s\}/i.test(u) ? '0123' : 'abc';
    const xyz = (u, note = '') => ({ kind: 'xyz', name, url: u, tms: false, subdomains: guessSub(u), matrixIds: null, note });

    // WMTS RESTful template
    if (/\{TileMatrix\}/i.test(url)) {
      const unknownSet = /\{TileMatrixSet\}/i.test(url);
      return {
        kind: 'wmts', name, matrixIds: null,
        url: url.replace(/\{Style\}/gi, 'default').replace(/\{TileMatrixSet\}/gi, 'GoogleMapsCompatible'),
        note: unknownSet ? T('Filled {TileMatrixSet} with "GoogleMapsCompatible" – change it if the server names its Web Mercator set differently.') : '',
      };
    }
    // Ordinary XYZ / TMS / quadkey template
    if (/\{z\}|\{q\}/.test(url)) return xyz(url);

    // ArcGIS REST cached service
    const ags = base.match(/^(.*\/rest\/services\/(?:.*\/)?([^/]+)\/(?:MapServer|ImageServer))\/?$/i);
    if (ags) {
      return Object.assign(xyz(ags[1] + '/tile/{z}/{y}/{x}', T('ArcGIS cached service – only works if it is tiled in Web Mercator.')),
        { name: ags[2].replace(/_/g, ' ') });
    }

    // WMTS capabilities / endpoint
    if (svc === 'WMTS' || /WMTSCapabilities\.xml$/i.test(base) || (/\/wmts\/?$/i.test(base) && !query)) {
      const capsUrl = /WMTSCapabilities\.xml$/i.test(base) ? url : addQ(stripOgc(url), 'SERVICE=WMTS&REQUEST=GetCapabilities');
      return { name, caps: 'wmts', capsUrl };
    }

    // WMS (GetMap URL, endpoint or GetCapabilities)
    if (svc === 'WMS' || /wms/i.test(base)) {
      const ep = stripOgc(url), layers = param('layers');
      if (layers && req !== 'getcapabilities') {
        return {
          kind: 'wms', name, url: ep, layers, styles: param('styles'), matrixIds: null,
          format: param('format') || 'image/png', version: param('version') || '1.3.0',
          transparent: param('transparent') ? /true/i.test(param('transparent')) : true,
        };
      }
      return { name, kind: 'wms', url: ep, caps: 'wms', capsUrl: addQ(ep, 'SERVICE=WMS&REQUEST=GetCapabilities') };
    }

    // A single tile copied from DevTools: …/12/2154/1196.png
    const m = base.match(/\/(\d{1,2})\/(\d+)\/(\d+)(\.[a-z0-9]+)?$/i);
    if (m && +m[1] <= 24) {
      const z = +m[1], a = +m[2], b = +m[3], t = tileXY(center.lat, center.lng, z);
      const xyOrder = Math.abs(a - t.x) + Math.abs(b - t.y) <= Math.abs(a - t.y) + Math.abs(b - t.x);
      const u = base.slice(0, m.index) + (xyOrder ? '/{z}/{x}/{y}' : '/{z}/{y}/{x}') + (m[4] || '') + (query ? '?' + query : '');
      return xyz(u, T('Converted a single tile URL to a template (guessed {o} order from the current view) – check the preview.', { o: xyOrder ? 'z/x/y' : 'z/y/x' }));
    }
    // Tile as query parameters: …?z=12&x=2154&y=1196
    if (/(^|&)(z|zoom)=\d+/i.test(query) && /(^|&)x=\d+/i.test(query) && /(^|&)y=\d+/i.test(query)) {
      const q = query.replace(/((?:^|&)(?:z|zoom)=)\d+/i, '$1{z}').replace(/((?:^|&)x=)\d+/i, '$1{x}').replace(/((?:^|&)y=)\d+/i, '$1{y}');
      return xyz(`${base}?${q}`, T('Converted tile query parameters to a template.'));
    }
    return null;
  }

  const XLINK = 'http://www.w3.org/1999/xlink';
  function parseXml(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('not valid XML');
    return doc;
  }
  const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const txt = (el, n) => ((kids(el, n)[0] || {}).textContent || '').trim();
  const href = el => el ? (el.getAttributeNS(XLINK, 'href') || el.getAttribute('xlink:href') || '') : '';

  function parseWMTS(xml) {
    const doc = parseXml(xml);
    const contents = doc.getElementsByTagNameNS('*', 'Contents')[0];
    if (!contents) throw new Error('no <Contents> – is this WMTS capabilities?');

    // Web Mercator tile matrix sets → { zoom: matrixIdentifier }
    const sets = {};
    kids(contents, 'TileMatrixSet').forEach(ts => {
      const id = txt(ts, 'Identifier'), crs = txt(ts, 'SupportedCRS');
      if (!/3857|900913|GoogleMaps|webmercator/i.test(`${id} ${crs}`)) return;
      const ids = {};
      kids(ts, 'TileMatrix').forEach(m => {
        const z = Math.round(Math.log2(559082264.0287178 / parseFloat(txt(m, 'ScaleDenominator'))));
        if (z >= 0 && z <= 25) ids[z] = txt(m, 'Identifier');
      });
      if (Object.keys(ids).length) sets[id] = ids;
    });

    let kvp = '';
    for (const op of doc.getElementsByTagNameNS('*', 'Operation')) {
      if (op.getAttribute('name') === 'GetTile') kvp = href(op.getElementsByTagNameNS('*', 'Get')[0]);
    }

    const out = [];
    kids(contents, 'Layer').forEach(ly => {
      const id = txt(ly, 'Identifier'), title = txt(ly, 'Title') || id;
      const styles = kids(ly, 'Style');
      const styleEl = styles.find(s => s.getAttribute('isDefault') === 'true') || styles[0];
      const style = styleEl ? txt(styleEl, 'Identifier') : 'default';
      const formats = kids(ly, 'Format').map(f => f.textContent.trim());
      const res = kids(ly, 'ResourceURL').filter(r => (r.getAttribute('resourceType') || 'tile') === 'tile');
      kids(ly, 'TileMatrixSetLink').forEach(link => {
        const setId = txt(link, 'TileMatrixSet'), ids = sets[setId];
        if (!ids) return;
        let url = '';
        const r = res.find(r => /png/i.test(r.getAttribute('format'))) || res[0];
        if (r) url = r.getAttribute('template');
        else if (kvp) {
          const fmt = formats.find(f => /png/i.test(f)) || formats[0] || 'image/png';
          url = addQ(kvp, `SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(id)}&STYLE=${encodeURIComponent(style)}` +
            `&TILEMATRIXSET=${encodeURIComponent(setId)}&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}&FORMAT=${encodeURIComponent(fmt)}`);
        }
        if (!url) return;
        url = url.replace(/\{Style\}/gi, style).replace(/\{TileMatrixSet\}/gi, setId);
        const zs = Object.keys(ids).map(Number);
        out.push({
          label: `${title} [${setId}]`,
          def: { kind: 'wmts', name: title, url, matrixIds: ids, minZoom: Math.min(...zs), maxNativeZoom: Math.max(...zs) },
        });
      });
    });
    return out;
  }

  function parseWMS(xml) {
    const doc = parseXml(xml);
    const version = doc.documentElement.getAttribute('version') || '1.3.0';
    const getMap = doc.getElementsByTagNameNS('*', 'GetMap')[0];
    const formats = kids(getMap, 'Format').map(f => f.textContent.trim());
    const format = formats.find(f => f === 'image/png') || formats.find(f => /png/i.test(f)) || formats[0] || 'image/png';
    const url = getMap ? stripOgc(href(getMap.getElementsByTagNameNS('*', 'OnlineResource')[0])) : '';
    const out = [];
    for (const ly of doc.getElementsByTagNameNS('*', 'Layer')) {
      const name = txt(ly, 'Name');
      if (!name) continue;
      const title = txt(ly, 'Title') || name;
      out.push({
        label: title === name ? name : `${title} (${name})`,
        def: { kind: 'wms', name: title, url, layers: name, styles: '', format, version, transparent: true,
          attribution: txt(kids(ly, 'Attribution')[0], 'Title'), matrixIds: null },
      });
    }
    return out;
  }

  // ===========================================================================
  // Main
  // ===========================================================================
  function init() {
    const L = window.L;
    const state = Object.assign({ base: null, overlays: [], opacity: {}, showSiteSwitcher: false, removed: [], tbSide: 'right', tbCols: 1 }, load(STORE_STATE, {}));
    // One slider per group, acting on what is selected: dimming of the background map, opacity of the overlays.
    if (typeof state.dimBase !== 'number') state.dimBase = (state.base && state.opacity && state.opacity[state.base]) ?? 1;
    const MIN_DIM = 0.5;                                // background maps are dimmed at most 50 %
    state.dimBase = Math.max(MIN_DIM, Math.min(1, state.dimBase));
    if (typeof state.overlayOpacity !== 'number') state.overlayOpacity = 1;
    state.overlayOpacity = Math.max(MIN_DIM, Math.min(1, state.overlayOpacity));   // overlays: 50–100 % too
    const live = {}; // id -> layer

    // geocaching.com draws the caches as transparent tiles (…/map.png) in the normal tile pane,
    // not as markers. We NEVER remove or hide any of the site's own layers. Instead we stack:
    //   cache tiles      raised above everything of ours
    //   preview          site base + 3
    //   our overlays     site base + 2
    //   our base map     site base + 1   (opaque, so it covers the site's base map)
    //   site base map    untouched
    // Site base layers are taken from the site's own layer switcher when we can see it,
    // otherwise recognised as "not cache tiles" by URL.
    const ours = new Set();                // every layer this script creates
    const role = new WeakMap();            // our layer -> 'base' | 'overlay' | 'preview'

    // The site's own layer switcher (L.control.layers). Caught when it's created, or – if it was
    // created before this script ran – found through the map events it listens to.
    function siteControl() {
      const live = siteCtls.filter(c => c._map === map);
      if (live.length) return live[live.length - 1];
      const LC = L.Control && L.Control.Layers;
      const evs = map._events || map._leaflet_events;          // Leaflet 1.x / 0.7
      if (!LC || !evs) return null;
      for (const type of Object.keys(evs)) {
        for (const h of [].concat(evs[type] || [])) {
          const ctx = h && (h.ctx || h.context);
          if (ctx instanceof LC && ctx._map === map) { siteCtls.push(ctx); return ctx; }
        }
      }
      return null;
    }
    const siteEntries = () => { const c = siteControl(); return c ? Object.values(c._layers || {}).filter(o => o && o.layer) : []; };
    const plainName = n => String(n || '').replace(/<[^>]*>/g, '').trim() || 'Map';
    function siteBaseSet() {
      return new Set(siteEntries().filter(o => !o.overlay).map(o => o.layer));
    }
    // Choose one of the site's own background maps (what its switcher would do).
    function switchSiteBase(layer) {
      siteEntries().forEach(o => { if (!o.overlay && o.layer !== layer && map.hasLayer(o.layer)) map.removeLayer(o.layer); });
      if (!map.hasLayer(layer)) map.addLayer(layer);
      arrange();
      applyLevels();
    }
    // Hide the site's switcher button: its choices are listed in our layer panel instead.
    function applySwitcherVisibility() {
      map.getContainer().classList.toggle('gcct-hide-site-switcher', !state.showSiteSwitcher);
      hideSiteZoom();
      if (typeof layoutControls === 'function') setTimeout(layoutControls, 0);
    }
    // --- The site's own floating map buttons -------------------------------------
    // Find small buttons floating over the map that aren't ours, and recognise them by everything that
    // describes them: text, labels, ids, test-ids, class names and their icon's name (icon sets such as
    // Lucide put e.g. "lucide-plus" / "lucide-locate-fixed" on the SVG).
    //   zoom in / zoom out / my location  → hidden (the toolbar has them)
    //   map style / layers               → made invisible but left in place; the layer panel opens it
    let siteStyleBtn = null;
    function siteSignature(el) {
      // Every attribute (names and values) on the button and its first descendants, plus its text.
      const bits = [el.tagName, el.textContent.trim().slice(0, 24)];
      [el, ...[...el.querySelectorAll('*')].slice(0, 25)].forEach(n => {
        if (n.tagName && n.tagName.toLowerCase() === 'title') bits.push(n.textContent);
        (n.getAttributeNames ? n.getAttributeNames() : []).forEach(a => {
          if (a === 'style' || a === 'd' || a === 'points' || a === 'viewbox') return;   // shapes say nothing useful
          bits.push(a, n.getAttribute(a));
        });
      });
      return bits.filter(Boolean).join(' ').toLowerCase();
    }
    function classifySiteButton(el) {
      const sig = siteSignature(el), text = el.textContent.trim();
      // Exact patterns only: words like "location" or "layer" inside other text also appear on cache icons.
      // (?![a-z]) instead of \b so class names such as "MapBtn_zoomIn__q7" match.
      const end = '(?![a-z])';
      // Icon names: an attribute whose whole value is the name, or an icon-set class like "mdi-plus".
      const iconNames = [];
      [el, ...el.querySelectorAll('*')].slice(0, 26).forEach(n => {
        (n.getAttributeNames ? n.getAttributeNames() : []).forEach(a => {
          const v = String(n.getAttribute(a) || '').trim().toLowerCase();
          if (a === 'class') v.split(/\s+/).forEach(c => { const m = c.match(/^(?:mdi|fa|fas|far|lucide|icon|bi|ti|ri|material-icons?|gc-icon|svg-icon)[-_](.+)$/); if (m) iconNames.push(m[1]); });
          else if (/^(data-icon|data-testid|data-test|name|icon|aria-label|title|alt|href|xlink:href)$/.test(a)) iconNames.push(v.replace(/^#/, ''));
        });
        if (n.tagName && /^(i|span|mat-icon)$/i.test(n.tagName) && n.children.length === 0) iconNames.push(n.textContent.trim().toLowerCase());
      });
      const icon = re => iconNames.some(v => re.test(v));
      if (text === '+' || new RegExp(`zoom[-_ ]?in${end}|zoom inn|forstørr`).test(sig) || icon(/^(plus|add|zoom[-_]?in)$/)) return 'zoomin';
      if (/^[-−–]$/.test(text) || new RegExp(`zoom[-_ ]?out${end}|zoom ut|forminsk`).test(sig) || icon(/^(minus|remove|zoom[-_]?out)$/)) return 'zoomout';
      if (new RegExp(`geolocat|locate[-_ ]?(me|user|control|button|fixed)${end}|(my|your|current|user)[-_ ]?(position|location)${end}`
          + `|show my location|cent(er|re)[-_ ]?(on[-_ ]?)?(me|user|my)${end}|re-?cent(er|re)${end}|location[-_ ]?(button|control|toggle)${end}`
          + `|crosshairs?-gps|gps[-_ ]?(button|fixed|control)${end}|min posisjon|finn meg|din posisjon`).test(sig)
        || icon(/^(locate|locate-fixed|location|my[-_]?location|current[-_]?location|gps|gps[-_]?fixed|crosshairs?(-gps)?|near[-_]?me|navigation|target|crosshair)$/)) return 'locate';
      if (new RegExp(`map[-_ ]?(layers?|type|style|view)${end}|layers?[-_ ]?(button|toggle|switch|picker|control)${end}|basemap|kartlag|karttype`).test(sig)
        || icon(/^(layers?|layers?-outline|layer-group|map-layers?|stack|map)$/)) return 'layers';
      return null;
    }
    const OUR_UI_SEL = '.gcct-dock, .gcct-dlg, .gcct-coord, .gcct-toast, .leaflet-pane, .leaflet-popup, .gcct-site, .leaflet-control-attribution';
    // A clickable thing: a real button/link, or a small element the site made clickable (cursor: pointer).
    function clickableFor(n) {
      const real = n.closest('button, a, [role="button"]');
      if (real) return real;
      // cursor is inherited, so take the OUTERMOST small HTML element that shows a pointer.
      let best = null;
      for (let p = n, i = 0; p && i < 6; p = p.parentElement, i++) {
        const r = p.getBoundingClientRect();
        if (r.width > 64 || r.height > 64) break;
        if (p instanceof HTMLElement && getComputedStyle(p).cursor === 'pointer') best = p;
      }
      return best;
    }
    // Candidates: (1) real buttons and icons anywhere, (2) whatever is actually drawn along the map's
    // left and right edges (probed with elementsFromPoint), so buttons are found however they're built.
    function siteButtonCandidates() {
      const root = map.getContainer(), mr = root.getBoundingClientRect(), cands = new Set();
      // Site buttons already moved into our toolbar (its .gcct-site part) still count as site buttons.
      const ours = n => !!n.closest(OUR_UI_SEL) && !n.closest('.gcct-site');
      const add = n => {
        if (!n || !n.closest || ours(n) || n === root || n.contains(root)) return;
        const el = n.closest('button, a, [role="button"]') || clickableFor(n);
        if (el && !ours(el)) cands.add(el);
      };
      // Cheap tests first: skip anything inside the map's own panes (tiles, cache icons) and anything
      // not near the map's left/right edge, before doing the more expensive checks.
      const edge = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.top < mr.bottom && r.bottom > mr.top
        && (r.left - mr.left < 140 || mr.right - r.right < 140 || !!n.closest('.gcct-site')); };
      document.querySelectorAll('button, a, [role="button"], svg, img').forEach(n => {
        if (n.closest('.leaflet-pane') || !edge(n)) return;
        if (/^(svg|img)$/i.test(n.tagName)) add(n); else if (!ours(n)) cands.add(n);
      });
      document.querySelectorAll('[data-gcct-hidden], [data-gcct-proxied]').forEach(el => cands.add(el));   // already handled
      if (mr.width > 0 && mr.height > 0 && document.elementsFromPoint) {
        const xs = [mr.right - 22, mr.right - 50, mr.left + 22, mr.left + 50];
        for (let y = mr.top + 8; y < mr.bottom - 4; y += 28) {
          xs.forEach(x => { try { document.elementsFromPoint(x, y).slice(0, 6).forEach(add); } catch (e) { /* ignore */ } });
        }
      }
      return cands;
    }
    // Why (not) a floating map button – used for filtering and for gcctReport().
    function floatingReason(el) {
      if (el.dataset.gcctHidden || el.dataset.gcctProxied) return 'ok (already handled)';
      const root = map.getContainer(), mr = root.getBoundingClientRect(), mapArea = mr.width * mr.height;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return 'not visible';
      if (r.width > 64 || r.height > 64) return `too big (${Math.round(r.width)}×${Math.round(r.height)})`;
      if (r.left < mr.left - 1 || r.right > mr.right + 1 || r.top < mr.top - 1 || r.bottom > mr.bottom + 1) return 'outside the map';
      const coversMap = p => {
        const q = p.getBoundingClientRect();
        const w = Math.min(q.right, mr.right) - Math.max(q.left, mr.left), h = Math.min(q.bottom, mr.bottom) - Math.max(q.top, mr.top);
        return w > 0 && h > 0 && w * h >= 0.6 * mapArea;
      };
      // The first container that is both wide AND tall decides. Narrow columns (e.g. a full-height
      // strip along the map edge that pushes buttons to the bottom) and thin rows are just layout.
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pr = p.getBoundingClientRect();
        if (p === root || p.contains(root)) return 'ok';
        if (pr.width > 140 && pr.height > 90) {
          return coversMap(p) ? 'ok' : `inside a panel (${Math.round(pr.width)}×${Math.round(pr.height)})`;
        }
      }
      return 'no container found';
    }
    function floatingSiteButtons() {
      return [...siteButtonCandidates()].filter(el => floatingReason(el).startsWith('ok'));
    }
    const markHidden = el => { if (el && !el.dataset.gcctHidden) { el.dataset.gcctHidden = el.style.display || '-'; el.style.display = 'none'; } };
    function hideSiteZoom() {
      try {
        // The site's own zoom buttons are always hidden (ours replace them); the setting only brings
        // back its other buttons (location, map style).
        const hide = !state.showSiteSwitcher;
        const isZoom = el => {
          const k = classifySiteButton(el);
          if (k === 'zoomin' || k === 'zoomout') return true;
          return !!(el.matches && el.matches('.leaflet-control-zoom, .leaflet-control-zoom *')) ||
            !![...(el.querySelectorAll ? el.querySelectorAll('button, a, [role="button"]') : [])].find(b => /^zoom(in|out)$/.test(classifySiteButton(b) || ''));
        };
        if (!hide) {
          document.querySelectorAll('[data-gcct-hidden]').forEach(el => {
            if (isZoom(el)) return;
            el.style.display = el.dataset.gcctHidden === '-' ? '' : el.dataset.gcctHidden;
            el.removeAttribute('data-gcct-hidden');
          });
          document.querySelectorAll('[data-gcct-proxied]').forEach(el => {
            el.style.opacity = ''; el.style.pointerEvents = ''; el.removeAttribute('data-gcct-proxied');
          });
          siteStyleBtn = null;
        }
        // Safety rules, so map content (cache icons) is never mistaken for a site button:
        //  · only near the map's left or right edge, where map buttons sit;
        //  · never an element among many similar siblings (icons in a layer, list rows);
        //  · a page has one zoom-in, one zoom-out, one locate and one style button – if more than two
        //    things of one kind match, the match is wrong and none of them is touched.
        const mr = map.getContainer().getBoundingClientRect();
        // (Buttons already moved into our toolbar count as "near the edge" wherever the toolbar is.)
        const nearEdge = el => { if (el.closest && el.closest('.gcct-site')) return true; const r = el.getBoundingClientRect(); return r.left - mr.left < 130 || mr.right - r.right < 130; };
        const crowded = el => { const p = el.parentElement; return !!p && p.children.length > 8; };
        const found = floatingSiteButtons()
          .filter(el => !el.dataset.gcctHidden && !el.dataset.gcctProxied && nearEdge(el) && !crowded(el))
          .map(el => ({ el, kind: classifySiteButton(el) })).filter(x => x.kind);
        const perKind = {};
        found.forEach(x => { perKind[x.kind] = (perKind[x.kind] || 0) + 1; });
        found.filter(x => perKind[x.kind] <= 2 && (hide || x.kind === 'zoomin' || x.kind === 'zoomout')).forEach(({ el, kind }) => {
          if (kind === 'zoomin' || kind === 'zoomout' || kind === 'locate') {
            markHidden(el);
            // Hide now-empty frames around it (a bordered box that only held hidden buttons).
            for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
              const r = p.getBoundingClientRect();
              if (p === map.getContainer() || p.contains(map.getContainer()) || r.width > 90 || r.height > 260) break;
              const kids = [...p.children];
              if (kids.length && kids.every(ch => ch.dataset.gcctHidden || getComputedStyle(ch).display === 'none')) markHidden(p); else break;
            }
          } else if (kind === 'layers') {
            el.dataset.gcctProxied = '1';
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            siteStyleBtn = el;
          }
        });
        // Site buttons already moved into the toolbar's bottom section: same rules, simply hidden there.
        const slot = map.getContainer().querySelector('.gcct-site');
        if (slot) [...slot.querySelectorAll('button, a, [role="button"]')].forEach(el => {
          if (el.dataset.gcctHidden) return;
          const kind = classifySiteButton(el);
          if (!kind || (!hide && kind !== 'zoomin' && kind !== 'zoomout')) return;
          const ctlEl = el.closest('.leaflet-control');
          const target = ctlEl && slot.contains(ctlEl) && ctlEl.querySelectorAll('button, a, [role="button"]').length === 1 ? ctlEl : el;
          if (kind === 'layers') { el.dataset.gcctProxied = '1'; siteStyleBtn = el; }
          markHidden(target);
        });
        if (siteStyleBtn && !siteStyleBtn.isConnected) siteStyleBtn = null;
        if (!siteStyleBtn) siteStyleBtn = document.querySelector('[data-gcct-proxied]');
      } catch (e) { console.error('[gcct] hiding duplicate site buttons failed', e); }
    }
    // Open the site's own map-style menu (its button is invisible but still in place, so the menu
    // appears where it always did).
    function openSiteStyles() {
      if (!siteStyleBtn) return;
      siteStyleBtn.style.pointerEvents = '';
      if (typeof siteStyleBtn.click === 'function') siteStyleBtn.click();
      else siteStyleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      setTimeout(() => { if (siteStyleBtn) siteStyleBtn.style.pointerEvents = 'none'; }, 0);
    }
    // Grid layers = anything drawn as tiles (image tiles, canvas/vector tiles). Leaflet 0.7 only has TileLayer.
    const zOf = l => Number(l.options && l.options.zIndex) || 1;
    const GridClass = L.GridLayer || L.TileLayer;
    const isTile = l => l instanceof GridClass;
    const CACHE_URL = /map\.(png|info)|geocaching\.com\/map|utfgrid/i;
    // Which of the site's tile layers is its background map?
    //  1. what its own layer switcher calls a base layer;  2. image tiles that aren't cache tiles;
    //  3. otherwise the first tile layer the site added (background maps are added first).
    // Without the site's layer switcher: the site's background is its LOWEST tile layer (background maps are
    // added first), plus any layer from a well-known base-map provider. Every other site tile layer –
    // e.g. cache icons drawn as tiles at an address we don't recognise – is raised above our layers.
    // Which layer the site added first: the order of their containers on the page, else Leaflet's ids.
    function addOrder(a, b) {
      const ca = a.getContainer && a.getContainer(), cb = b.getContainer && b.getContainer();
      if (ca && cb && ca !== cb && ca.isConnected && cb.isConnected) {
        return ca.compareDocumentPosition(cb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      return L.stamp(a) - L.stamp(b);
    }
    const KNOWN_BASEMAP = /openstreetmap|mapbox|maptiler|arcgisonline|google|thunderforest|stadiamaps|cartocdn|basemaps|here\.com|bing|virtualearth/i;
    function siteBases(site) {
      const fromCtl = siteBaseSet();
      if (fromCtl.size) return fromCtl;
      const cands = site.filter(l => !l._utfGrid && !CACHE_URL.test(l._url || ''))
        .sort((a, b) => zOf(a) - zOf(b) || addOrder(a, b));
      const bases = new Set(cands.slice(0, 1));
      cands.forEach(l => { if (KNOWN_BASEMAP.test(l._url || '')) bases.add(l); });
      return bases;
    }
    // For gcctReport(): how each of the site's tile layers was classified.
    window.__gcctTiles = () => {
      const site = [];
      map.eachLayer(l => { if (isTile(l) && !ours.has(l)) site.push(l); });
      const bases = siteBases(site), gl = [];
      map.eachLayer(l => { if (l._glMap) gl.push(l); });
      return {
        siteTiles: site.map(l => `${bases.has(l) ? 'background' : 'raised (caches?)'} | z${zOf(l)} | ${String(l._url || '(no url: canvas/grid)').slice(0, 110)}`),
        ourLayers: [...ours].map(l => `${role.get(l)} | z${zOf(l)} | ${String(l._url || '').slice(0, 70)}`),
        glLayers: gl.map(l => {
          try { const st = l._glMap.getStyle(); return `${l.options && l.options.pane} | z=${getComputedStyle(l._container || l.getContainer()).zIndex} | ${st.layers.length} style layers: `
            + st.layers.slice(-12).map(x => `${x.id}(${x.type}${x.source ? ',' + x.source : ''})`).join(' '); }
          catch (e) { return 'webgl layer (style not readable)'; }
        }),
      };
    };

    function arrange() {
      try {
        const site = [];
        map.eachLayer(l => { if (isTile(l) && !ours.has(l)) site.push(l); });
        const bases = siteBases(site);
        const bz = Math.max(1, ...site.filter(l => bases.has(l)).map(zOf));
        // Overlays are stacked in the order of the list: the top one is drawn on top.
        const ovIds = byOrder(state.overlays.slice(), id => id, 'overlay');
        const nOv = Math.max(1, ovIds.length);
        const top = bz + 3 + nOv;                              // preview, then the site's other tiles above it
        const want = { base: bz + 1, preview: top };
        ours.forEach(l => {
          let z = want[role.get(l)];
          if (role.get(l) === 'overlay') { const id = Object.keys(live).find(k => live[k] === l); const r = ovIds.indexOf(id); z = bz + 2 + (r < 0 ? 0 : nOv - 1 - r); }
          if (z && zOf(l) !== z && l.setZIndex) l.setZIndex(z);
        });
        // Everything else the site draws as tiles (cache icons) goes above our layers.
        site.filter(l => !bases.has(l)).forEach(l => { if (zOf(l) < top + 7 && l.setZIndex) l.setZIndex(top + 7); });
      } catch (e) { console.error('[gcct] arrange failed', e); }
    }
    // Dimming a background map: our background is always drawn fully opaque (so the geocaching.com map
    // never shines through) and faded towards white with a colour filter. invert → darken by the dim
    // factor → invert maps every colour c to  a·c + (1−a)·white  exactly. No extra elements are added,
    // and at full brightness no filter is set at all. The site's own layers are never hidden.
    function setDim(layer, opacity) {
      const c = layer && ((layer.getContainer && layer.getContainer()) || layer._container);
      if (!c) return;
      c.querySelectorAll(':scope > .gcct-veil').forEach(v => v.remove());     // left over from v1.18.2–1.19.3
      const a = Math.max(0, Math.min(1, Number(opacity)));
      c.style.filter = a < 1 ? `invert(1) brightness(${a}) invert(1)` : '';
    }

    // While one of our backgrounds is selected, the site's own background (tiles only – never the WebGL
    // layer, which also draws the caches) is hidden, so it can't show through while our tiles load.
    // It keeps loading in the background and reappears at once when you switch back to it.
    function setHidden(layer, hide) {
      if (layer && layer._glMap) return setGlHidden(layer, hide);
      const c = layer && ((layer.getContainer && layer.getContainer()) || layer._container);
      if (c) c.style.visibility = hide ? 'hidden' : '';
    }
    // /play/map draws its background with WebGL (MapLibre/Mapbox inside Leaflet). Instead of hiding the
    // whole layer – which could also hide caches drawn there – every style layer that is not about
    // caches is switched off, and switched back on exactly as it was when the site's map is chosen again.
    const GL_KEEP = /geocache|cache|\bgc|waypoint|marker|cluster|user|route|selected|highlight/i;
    function setGlHidden(layer, hide) {
      const m = layer._glMap;
      const saved = layer.__gcctSaved || (layer.__gcctSaved = {});
      layer.__gcctHide = hide;
      const apply = () => {
        try {
          const st = m.getStyle && m.getStyle();
          ((st && st.layers) || []).forEach(sl => {
            if (GL_KEEP.test([sl.id, sl.source, sl['source-layer']].filter(Boolean).join(' '))) return;
            if (layer.__gcctHide) {
              if (!(sl.id in saved)) saved[sl.id] = m.getLayoutProperty(sl.id, 'visibility') || 'visible';
              if (m.getLayoutProperty(sl.id, 'visibility') !== 'none') m.setLayoutProperty(sl.id, 'visibility', 'none');
            } else if (sl.id in saved) {
              m.setLayoutProperty(sl.id, 'visibility', saved[sl.id]);
              delete saved[sl.id];
            }
          });
        } catch (e) { /* style not ready yet – done on the next styledata event */ }
      };
      if (!layer.__gcctStyleHook && m.on) {
        layer.__gcctStyleHook = true;
        m.on('styledata', () => { if (layer.__gcctHide) apply(); });   // the site may load a new style later
      }
      apply();
    }

    // Hide / show all geocaches: the site's cache tiles (/map), cache layers in the WebGL map and the
    // site's markers (/play/map), and our own solved and stage marks. Circles and drawings stay.
    let cachesHidden = false;
    const GL_CACHES = /geocache|cache|\bgc|waypoint|cluster/i;
    const hideCss = document.createElement('style');
    hideCss.textContent = '.gcct-nocache .leaflet-marker-pane>:not([class*="gcct"]),.gcct-nocache .leaflet-shadow-pane>:not([class*="gcct"]),'
      + '.gcct-nocache .gcct-solved,.gcct-nocache .gcct-stage,.gcct-nocache .gcct-autocircle{visibility:hidden!important}';
    document.head.appendChild(hideCss);
    function applyCacheHide() {
      try {
        map.getContainer().classList.toggle('gcct-nocache', cachesHidden);
        const site = [];
        map.eachLayer(l => { if (isTile(l) && !ours.has(l)) site.push(l); });
        const bases = siteBases(site);
        site.filter(l => !bases.has(l)).forEach(l => {
          const c = (l.getContainer && l.getContainer()) || l._container;
          if (c) c.style.visibility = cachesHidden ? 'hidden' : '';
        });
        map.eachLayer(l => {
          if (!l._glMap) return;
          const m = l._glMap, saved = l.__gcctCacheSaved || (l.__gcctCacheSaved = {});
          const apply = () => {
            try {
              (((m.getStyle && m.getStyle()) || {}).layers || []).forEach(sl => {
                if (!GL_CACHES.test([sl.id, sl.source, sl['source-layer']].filter(Boolean).join(' '))) return;
                if (cachesHidden) {
                  if (!(sl.id in saved)) saved[sl.id] = m.getLayoutProperty(sl.id, 'visibility') || 'visible';
                  if (m.getLayoutProperty(sl.id, 'visibility') !== 'none') m.setLayoutProperty(sl.id, 'visibility', 'none');
                } else if (sl.id in saved) { m.setLayoutProperty(sl.id, 'visibility', saved[sl.id]); delete saved[sl.id]; }
              });
            } catch (e) { /* style not ready yet */ }
          };
          if (!l.__gcctCacheHook && m.on) { l.__gcctCacheHook = true; m.on('styledata', () => { if (cachesHidden) apply(); }); }
          apply();
        });
      } catch (e) { console.error('[gcct] hide caches failed', e); }
    }

    cacheHider = { on: () => cachesHidden, set: v => { cachesHidden = !!v; applyCacheHide(); } };

    let arrangeTimer = null;
    map.on('layeradd', e => {
      if (ours.has(e.layer) || arrangeTimer) return;
      arrangeTimer = setTimeout(() => { arrangeTimer = null; arrange(); applyLevels(); if (cachesHidden) applyCacheHide(); }, 50);   // a new site background is hidden too
    });
    // User picked a map in the site's own switcher → give way to it.
    map.on('baselayerchange', e => {
      try {
        if (!state.base || ours.has(e.layer)) return;
        show(state.base, false);
        if (LITE) return;                 // on a cache page: just give way, never change the saved choice
        state.base = null;
        save(STORE_STATE, state);
        if (ctl._box.classList.contains('open')) render();
      } catch (e2) { console.error('[gcct]', e2); }
    });

    const customs = () => load(STORE_LAYERS, []);
    const allDefs = () => PRESETS.concat(customs());
    const findDef = id => allDefs().find(d => d.id === id);
    // Maps that no longer exist (built-in maps taken out of the script) are dropped from the saved state.
    state.removed = state.removed.filter(id => findDef(id));
    if (!Array.isArray(state.removedSite)) state.removedSite = [];   // geocaching.com's own maps taken off the list
    if (!state.order || typeof state.order !== 'object') state.order = {};  // your order of the lists: { site, base, overlay }
    // Sort a list by the saved order; items not in it keep their place after the ordered ones.
    function byOrder(list, key, group) {
      const ord = (state.order || {})[group] || [];
      return list.map((x, i) => [x, i]).sort((a, b) => {
        const ia = ord.indexOf(key(a[0])), ib = ord.indexOf(key(b[0]));
        return (ia < 0 ? 1e6 + a[1] : ia) - (ib < 0 ? 1e6 + b[1] : ib);
      }).map(x => x[0]);
    }
    state.overlays = state.overlays.filter(id => findDef(id));
    if (state.base && !findDef(state.base)) state.base = null;
    const isCustom = id => customs().some(d => d.id === id);

    // Tile layer that also understands {q} (quadkey), {-y} (also on Leaflet 0.7, which lacks it)
    // and WMTS {TileMatrix}/{TileRow}/{TileCol}.
    // Close the hairline gaps between tiles at fractional zoom levels: make every tile 1 px larger than
    // the size Leaflet gives it (256 px normally, larger when zoomed past the map's own tiles), so
    // neighbours overlap instead of leaving a seam.
    // Tile seams: our tiles are drawn 1 px larger than the size Leaflet gives them (256 px normally,
    // larger when zoomed past a map's own tiles), so neighbours overlap and no gap can open at display
    // scaling such as 110 %/125 % or during zoom animations. Our tiles use normal blending (see the CSS
    // below): with Leaflet 1.9's plus-lighter blending the overlap would add up to bright lines.
    const withNoGap = Base => (Base && Base.prototype._initTile && Base.prototype.getTileSize) ? Base.extend({
      _initTile(tile) {
        Base.prototype._initTile.call(this, tile);
        const size = this.getTileSize();
        if (size && isFinite(size.x)) { tile.style.width = size.x + 1 + 'px'; tile.style.height = size.y + 1 + 'px'; }
      },
    }) : Base;                                   // Leaflet 0.7: leave as it is
    const WmsLayer = withNoGap(L.TileLayer.WMS);
    const GcctLayer = L.TileLayer.extend({
      initialize(url, opts) {
        L.TileLayer.prototype.initialize.call(this, url.replace(/\{TileRow\}/gi, '{y}').replace(/\{TileCol\}/gi, '{x}'), opts);
      },
      getTileUrl(c) {
        const tpl = this._url;
        if (!/\{q\}|\{TileMatrix\}|\{-y\}/i.test(tpl)) return L.TileLayer.prototype.getTileUrl.call(this, c);
        const z = this._getZoomForUrl(), ids = this.options.matrixIds || {};
        this._url = tpl.replace(/\{q\}/g, quadkey(c.x, c.y, z)).replace(/\{TileMatrix\}/gi, ids[z] ?? z)
          .replace(/\{-y\}/g, 2 ** z - 1 - c.y);
        try { return L.TileLayer.prototype.getTileUrl.call(this, c); } finally { this._url = tpl; }
      },
    });
    const GcctTiles = withNoGap(GcctLayer);

    // On cache pages our layers must not raise the map's zoom limit: the site fits its small map to
    // the highest zoom allowed, so a higher limit would zoom it in too far.
    let liteMaxZoom = 22;
    function makeLayer(def, preview) {
      const o = {
        zIndex: 1,
        className: 'gcct-tiles',
        minZoom: Number(def.minZoom) || 0,
        maxZoom: LITE ? liteMaxZoom : 22,
        opacity: preview || def.type === 'base' ? 1 : state.overlayOpacity * (def.opacity ?? 1),
        attribution: def.attribution || '',
      };
      const layer = def.kind === 'wms'
        ? (WmsLayer ? (u, x) => new WmsLayer(u, x) : L.tileLayer.wms)(def.url, Object.assign(o, {
          layers: def.layers || '', styles: def.styles || '', format: def.format || 'image/png',
          transparent: def.transparent !== false, version: def.version || '1.3.0',
        }))
        : new GcctTiles(def.url, Object.assign(o, {
          subdomains: def.subdomains || 'abc',
          maxNativeZoom: Number(def.maxNativeZoom) || 18,
          tms: !!def.tms,
          matrixIds: def.matrixIds || null,
        }));
      if (def.blend) {
        // e.g. hillshade: multiply onto the map below instead of greying it out
        const apply = () => { const c = layer.getContainer && layer.getContainer(); if (c) c.style.mixBlendMode = def.blend; };
        layer.on('add', apply).on('loading', apply).on('load', apply);
      }
      if (def.type === 'base' && !preview) {
        const dim = () => setDim(layer, state.dimBase);
        layer.on('add', dim).on('loading', dim).on('load', dim);
      }
      ours.add(layer);
      role.set(layer, preview ? 'preview' : def.type === 'base' ? 'base' : 'overlay');
      return layer;
    }

    function validate(d) {
      if (!/^https?:\/\//i.test(d.url || '')) return T('URL must start with http:// or https://');
      if (d.kind === 'wms') return d.layers ? '' : T('A WMS layer needs at least one layer name.');
      const left = d.url.match(/\{(?!(?:z|x|-?y|s|r|q|TileMatrix|TileRow|TileCol)\})[^}]*\}/i);
      if (left) return T('Unknown placeholder {p} in the URL.', { p: left[0] });
      if (d.kind === 'wmts') {
        return /\{TileMatrix\}/i.test(d.url) && /\{TileRow\}|\{-?y\}/i.test(d.url) && /\{TileCol\}|\{x\}/i.test(d.url)
          ? '' : T('A WMTS template needs {TileMatrix}, {TileRow} and {TileCol}.');
      }
      if (/\{q\}/.test(d.url)) return '';
      return /\{z\}/.test(d.url) && /\{x\}/.test(d.url) && /\{-?y\}/.test(d.url) ? '' : T('A tile URL needs {z}, {x} and {y} (or {-y}, or {q}).');
    }

    function show(id, on) {
      const def = findDef(id);
      if (on && def) {
        if (!live[id]) live[id] = makeLayer(def);
        live[id].addTo(map);
      } else if (live[id]) {
        map.removeLayer(live[id]);
      }
    }
    // Background slider: dims the selected background – ours, or the site's own map when that is selected.
    // Overlay slider: opacity of every selected overlay (times the layer's own default, e.g. hillshade 60 %).
    function applyLevels() {
      try {
        const site = [];
        map.eachLayer(l => { if (isTile(l) && !ours.has(l)) site.push(l); });
        const siteBg = siteBases(site), ourBase = state.base && live[state.base] && map.hasLayer(live[state.base]) ? live[state.base] : null;
        siteBg.forEach(l => { setDim(l, ourBase ? 1 : state.dimBase); setHidden(l, !!ourBase); });
        map.eachLayer(l => { if (l._glMap) setHidden(l, !!ourBase); });
        if (ourBase) setDim(ourBase, state.dimBase);
        state.overlays.forEach(id => { const d = findDef(id); if (live[id] && d) live[id].setOpacity(state.overlayOpacity * (d.opacity ?? 1)); });
      } catch (e) { console.error('[gcct] levels failed', e); }
    }
    function setBase(id) {
      if (state.base) show(state.base, false);
      state.base = id;
      if (id) show(id, true);
      arrange();
      applyLevels();
      save(STORE_STATE, state);
    }
    function toggleOverlay(id, on) {
      state.overlays = state.overlays.filter(x => x !== id);
      if (on) state.overlays.push(id);
      show(id, on);
      arrange();
      applyLevels();
      save(STORE_STATE, state);
    }
    function forget(id) {
      if (live[id]) { map.removeLayer(live[id]); ours.delete(live[id]); }
      delete live[id];
      if (state.base === id) state.base = null;
      state.overlays = state.overlays.filter(x => x !== id);
    }
    function saveDef(def) {
      const list = customs(), i = list.findIndex(x => x.id === def.id);
      if (i >= 0) list[i] = def; else list.push(def);
      save(STORE_LAYERS, list);
      forget(def.id);
      if (def.type === 'base') setBase(def.id); else toggleOverlay(def.id, true);
    }

    const bgCss = document.createElement('style');
    // Our tiles overlap by 1 px (withNoGap above) and are drawn with normal blending, which covers any
    // hairline gap. Leaflet's own plus-lighter blending is turned off for them, as it would add the
    // overlapping strips up to bright lines. Isolation keeps each layer's drawing separate.
    bgCss.textContent = '.gcct-tiles{isolation:isolate}'
      + '.leaflet-container .gcct-tiles img.leaflet-tile{mix-blend-mode:normal!important}';
    document.head.appendChild(bgCss);

    if (LITE) {
      // Read-only: show the background map and overlays chosen on the big map, nothing else.
      // Keep the site's own extent: same zoom limit as its map, and the view it had before.
      const mz = map.getMaxZoom();
      liteMaxZoom = isFinite(mz) && mz > 0 ? mz : 18;
      let view = null;
      try { view = map._loaded ? { c: map.getCenter(), z: map.getZoom() } : null; } catch (e) { view = null; }
      if (state.base && findDef(state.base)) show(state.base, true);
      state.overlays.filter(id => findDef(id)).forEach(id => show(id, true));
      arrange();
      applyLevels();
      if (view && (map.getZoom() !== view.z || !map.getCenter().equals(view.c))) map.setView(view.c, view.z, { animate: false });
      return;
    }

    // --- Styles -------------------------------------------------------------
    const css = document.createElement('style');
    css.textContent = UI_TOKENS + `
      /* Shared: readable system font, high-contrast text, and resets so geocaching.com's own CSS
         can't shrink or restyle our controls. */
      .gcct,.gcct-dlg{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:var(--ink)}
      .gcct *,.gcct-dlg *{box-sizing:border-box;letter-spacing:normal;text-transform:none;font-family:inherit;float:none;text-shadow:none}
      .gcct input[type=radio],.gcct input[type=checkbox],.gcct input[type=range],.gcct-dlg input[type=checkbox],.gcct-dlg input[type=radio]{accent-color:var(--acc)}

      /* Buttons – the same everywhere */
      .gcct button:not(.act),.gcct-dlg button{height:auto;min-height:34px;margin:0;font-size:13.5px;font-weight:500;line-height:1.3;padding:6px 13px;
        border:1px solid var(--line2);border-radius:var(--rc);background:#fff;color:var(--ink);cursor:pointer;white-space:nowrap;
        box-shadow:0 1px 0 rgba(16,24,40,.04);transition:background .12s,border-color .12s,box-shadow .12s}
      .gcct button:not(.act):hover,.gcct-dlg button:hover{background:var(--soft);border-color:#aab3bd}
      .gcct button:not(.act):focus-visible,.gcct-dlg button:focus-visible{outline:0;box-shadow:var(--ring);border-color:var(--acc)}
      .gcct button.primary,.gcct-dlg button.primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
      .gcct button.primary:hover,.gcct-dlg button.primary:hover{background:var(--brand-h);border-color:var(--brand-h)}
      .gcct-dlg button.danger{background:var(--danger);border-color:var(--danger);color:#fff;font-weight:600}
      .gcct-dlg button.danger:hover{background:#a51f25;border-color:#a51f25}
      .gcct-dlg button:disabled,.gcct-dlg button:disabled:hover{opacity:.45;cursor:default;background:#fff;border-color:var(--line2)}
      .gcct-dlg button.primary:disabled{background:var(--brand);border-color:var(--brand)}
      .gcct .x,.gcct-dlg .x{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;cursor:pointer;
        font-size:15px;line-height:1;color:var(--muted);border-radius:var(--rc)}
      .gcct .x:hover,.gcct-dlg .x:hover{background:var(--hover);color:var(--ink)}

      /* Text fields – the same everywhere */
      .gcct .quick input,.gcct-dlg input:not([type=checkbox]):not([type=file]):not([type=radio]),.gcct-dlg select,.gcct-dlg textarea,.gcct label.opt select{
        display:block;width:100%;height:auto;margin:0;font-size:14px;line-height:1.4;padding:7px 10px;
        border:1px solid var(--line2);border-radius:var(--rc);background:#fff;color:var(--ink);box-shadow:none;transition:border-color .12s,box-shadow .12s}
      .gcct .quick input:focus,.gcct-dlg input:focus,.gcct-dlg select:focus,.gcct-dlg textarea:focus,.gcct label.opt select:focus{outline:0;border-color:var(--acc);box-shadow:var(--ring)}
      .gcct .quick input::placeholder,.gcct-dlg input::placeholder{color:#8b949e}

      /* Layer panel */
      .gcct{position:relative;background:transparent;font-size:14px;line-height:1.45;border:0}
      .gcct-btn{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:var(--r);color:var(--tb-ink,#007d46);cursor:pointer;text-decoration:none;transition:background .15s,color .15s}
      .gcct-btn:hover{background:var(--soft);color:var(--tb-ink-h,#005e35)}
      .gcct-btn:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}
      .gcct-btn svg{display:block}
      .gcct-panel{display:none;position:absolute;top:0;right:calc(100% + 10px);z-index:1000;padding:0;max-height:75vh;overflow:auto;width:340px;
        background:#fff;border-radius:var(--r);box-shadow:var(--shadow);cursor:auto;overscroll-behavior:contain}
      .gcct-panel.flip{right:auto;left:calc(100% + 10px)}
      .gcct.open .gcct-panel{display:block;animation:gcct-in .14s ease-out}
      .gcct.open .gcct-btn{background:color-mix(in srgb,var(--tb-ink,#007d46) 12%,#fff);color:var(--tb-ink,#007d46)}
      .gcct .phd{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:10px 10px 10px 16px;background:#fff;border-bottom:1px solid var(--line)}
      .gcct .phd b{flex:1;font-size:15.5px;font-weight:650}
      .gcct .pbd{padding:12px 10px 14px}
      .gcct .quick{display:flex;gap:6px;margin:0 6px 4px}
      .gcct .quick input{flex:1;min-width:0;font-size:13.5px}
      .gcct .tabs{display:flex;gap:3px;margin:12px 4px 6px;padding:3px;border-radius:var(--rc);background:var(--soft)}
      .gcct .tabs button.tab{flex:1 1 auto;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:32px;padding:4px 5px;border:0;border-radius:6px;
        background:transparent;box-shadow:none;color:var(--muted);font-size:12.5px;font-weight:600;white-space:nowrap}
      .gcct .tabs button.tab:hover{background:rgba(255,255,255,.6);color:var(--ink)}
      .gcct .tabs button.tab.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.12)}
      .gcct .tabs .dot{width:6px;height:6px;border-radius:50%;background:var(--acc);flex:none}
      .gcct .tabs .cnt{font-style:normal;font-size:11px;line-height:16px;min-width:16px;padding:0 4px;border-radius:999px;background:var(--acc);color:#fff;text-align:center}
      .gcct .tabpane[hidden],.gcct [hidden]{display:none!important}
      .gcct .row{padding-left:2px}
      .gcct .grip{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:28px;margin-right:-4px;color:var(--muted);
        opacity:.3;cursor:grab;touch-action:none;border-radius:4px}
      .gcct .row:hover .grip,.gcct .grip:focus-visible{opacity:1}
      .gcct .grip:focus-visible{outline:2px solid var(--acc)}
      .gcct .sortable.sorting{cursor:grabbing}
      .gcct .sortable.sorting .row{transition:none}
      .gcct .row.dragging{background:#fff;box-shadow:0 4px 14px rgba(16,24,40,.18);position:relative;z-index:1;cursor:grabbing}
      .gcct .row.dragging .grip{opacity:1;cursor:grabbing}
      .gcct p.note{margin:8px 6px 0;font-size:12px;color:var(--muted)}
      .gcct .tabpane{min-height:120px}
      .gcct .grp{display:flex;align-items:center;gap:10px;margin:12px 6px 6px}
      .gcct .grp h4{flex:1;margin:0}
      .gcct .grp input[type=range]{width:104px;flex:none;margin:0}
      .gcct .grp output{flex:none;min-width:38px;text-align:right;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
      .gcct h4{margin:16px 6px 6px;font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
      .gcct label{display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0;margin:0;font-size:14px;font-weight:400;color:var(--ink)}
      .gcct label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gcct .row{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:36px;padding:3px 4px 3px 8px;border-radius:var(--rc);transition:background .12s}
      .gcct .row > label{flex:1;align-self:stretch}
      .gcct .row:hover{background:var(--soft)}
      .gcct .row:has(input:checked){background:var(--acc-bg)}
      .gcct .row:has(input:checked) label > span{font-weight:600}
      .gcct .row .tools{display:flex;align-items:center;gap:2px;flex:none}
      @media (hover:hover){.gcct .row .tools{opacity:0;transition:opacity .12s}.gcct .row:hover .tools,.gcct .row:focus-within .tools{opacity:1}}
      .gcct input[type=radio],.gcct input[type=checkbox]{margin:0;width:16px;height:16px;flex:none}
      .gcct .act{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:0;padding:0;line-height:1;border:0;
        background:none;cursor:pointer;font-size:14px;color:var(--muted);border-radius:6px}
      .gcct .act:hover{background:rgba(31,35,40,.08);color:var(--ink)}
      .gcct .act.del:hover{background:var(--danger-bg);color:var(--danger)}
      .gcct .none{display:block;margin:2px 8px;color:var(--muted);font-size:13px}
      .gcct small.src{font-size:11px;font-weight:500;color:var(--muted);margin-left:6px;padding:1px 6px;border-radius:999px;background:rgba(31,35,40,.06)}
      .gcct .stylesrow{min-height:0}
      .gcct .stylesrow:hover{background:none}
      .gcct button.sitestyles{display:block;margin:4px 0 4px 26px;min-height:30px;padding:4px 10px;font-size:13px}
      .gcct button.restore{display:block;min-height:0;margin:10px 6px 0;background:none!important;border:0!important;padding:0!important;box-shadow:none!important;color:var(--acc)!important;text-decoration:underline;font-size:13px!important}
      .gcct .opts{display:grid;gap:10px;margin:14px 6px 0;padding-top:12px;border-top:1px solid var(--line)}
      .gcct label.opt{font-size:13px;color:var(--muted)}
      .gcct label.opt span{white-space:normal}
      .gcct label.opt.lang{justify-content:space-between}
      .gcct label.opt select{width:auto;font-size:13px;padding:4px 8px}
      .gcct .foot{display:flex;gap:6px;margin:14px 6px 0;flex-wrap:wrap}
      .gcct .foot button:first-child{flex:1}

      /* The one toolbar */
      .gcct-dock{display:flex;flex-direction:column;background:#fff;border-radius:var(--r);box-shadow:var(--shadow-s);clear:both}
      .gcct-dock > .gcct,.gcct-dock > .gcct-bar{margin:0!important;float:none!important;clear:none!important;box-shadow:none!important;border-radius:0}
      .gcct-dock > .gcct .gcct-btn{border-radius:0;border-bottom:1px solid var(--line)}
      .gcct-dock > .gcct-bar{background:transparent}
      .leaflet-left > .gcct-dock,.leaflet-left > .gcct-coord{float:left!important}
      .gcct-dock.cols2 > .gcct-bar{display:grid;grid-template-columns:42px 42px}
      .gcct-dock.cols2 > .gcct-bar a{border-bottom:1px solid var(--line)}
      .gcct-dock.cols2 > .gcct-bar a:nth-child(odd){border-right:1px solid var(--line)}
      .gcct-dock.cols2 > .gcct-bar a.sep{border-top:0}
      .gcct-dock.cols2 > .gcct .gcct-btn{width:100%}
      .gcct-dock.cols2 > .gcct-site{display:flex;flex-wrap:wrap;justify-content:center}
      .leaflet-bottom > .gcct-dock{clear:both}
      .gcct-center{position:absolute;left:0;right:0;display:flex;justify-content:center;pointer-events:none;z-index:1001}
      .gcct-center.leaflet-top{top:0}.gcct-center.leaflet-bottom{bottom:0}
      .gcct-center > .gcct-dock{pointer-events:auto;float:none!important;margin-left:0;margin-right:0}
      .gcct-center.leaflet-top > .gcct-dock{margin-top:10px}.gcct-center.leaflet-bottom > .gcct-dock{margin-bottom:10px}
      .gcct-grip{display:flex;align-items:center;justify-content:center;height:13px;cursor:grab;color:#a3acb5;border-bottom:1px solid var(--line);touch-action:none}
      .gcct-grip:hover{color:var(--acc);background:var(--soft)}
      .gcct-grip svg{transform:rotate(90deg)}
      .gcct-dock.horiz > .gcct-grip{height:auto;width:13px;border-bottom:0;border-right:1px solid var(--line)}
      .gcct-dock.horiz > .gcct-grip svg{transform:none}
      .gcct-dock.dragging{opacity:.85;box-shadow:var(--shadow);cursor:grabbing;transition:none}
      .gcct-dropzone{position:absolute;z-index:999;pointer-events:none;background:rgba(9,105,218,.16);border:2px dashed var(--acc);border-radius:10px;transition:all .12s}
      .gcct-dock.horiz{flex-direction:row;align-items:stretch}
      .gcct-dock.horiz > .gcct-bar{flex-direction:row}
      .gcct-dock.horiz > .gcct-bar a{border-bottom:0;border-right:1px solid var(--line)}
      .gcct-dock.horiz > .gcct-bar a.sep{border-top:0;border-left:6px solid var(--soft)}
      .gcct-dock.horiz > .gcct .gcct-btn{border-radius:0;border-bottom:0;border-right:1px solid var(--line);width:42px;height:42px}
      .gcct-dock.horiz.cols2 > .gcct .gcct-btn{height:84px}
      .gcct-site [data-gcct-hidden],.gcct-site[data-gcct-hidden]{display:none!important}
      .leaflet-container .leaflet-control-zoom{display:none!important}
      .gcct-dock.dupes-off .gcct-site .leaflet-control-zoom,.gcct-dock.dupes-off .gcct-site [class*="findmylocation" i],.gcct-dock.dupes-off .gcct-site .leaflet-control-locate{display:none!important}
      .gcct-dock.horiz > .gcct-site{display:flex;flex-direction:row;align-items:center;gap:4px;padding:0 4px;border-left:1px solid var(--line);border-radius:0 var(--r) var(--r) 0}
      .gcct-dock.horiz > .gcct-site > *{margin:0!important;float:none!important;clear:none!important}
      .gcct-dock.horiz > .gcct-site .leaflet-bar{display:flex;flex-direction:row}
      .gcct-dock.horiz > .gcct-site .leaflet-bar a{border-bottom:0;border-right:1px solid #ccc}
      .gcct-dock.horiz > .gcct-site .leaflet-bar a:last-child{border-right:0}
      .gcct-dock.horiz{align-items:center}
      .gcct-dock.horiz > .gcct-grip{align-self:stretch}
      .gcct-dock.horiz.cols2 > .gcct-bar{display:grid;grid-auto-flow:column;grid-template-rows:42px 42px;grid-template-columns:none}
      .gcct-dock.horiz.cols2 > .gcct-bar a{border-bottom:1px solid var(--line);border-right:1px solid var(--line);border-left:0}
      .gcct-dock.horiz.cols2 > .gcct .gcct-btn{width:42px}
      .gcct-panel.up{top:auto;bottom:0}
      .gcct-dock.no-site > .gcct-bar,.gcct-dock > .gcct-site{border-radius:0 0 var(--r) var(--r);overflow:hidden}
      .gcct-dock.horiz.no-site > .gcct-bar{border-radius:0 var(--r) var(--r) 0}
      .gcct-site{display:flex;flex-direction:column;align-items:center;border-top:6px solid var(--soft);background:#fff}
      .gcct-site > .leaflet-control{margin:0!important;float:none!important;clear:none!important;position:static!important;
        box-shadow:none!important;border:0!important;border-radius:0!important;background:transparent!important}
      .gcct-site > .leaflet-control + .leaflet-control{border-top:1px solid var(--line)!important}
      .gcct-site button,.gcct-site a{box-shadow:none!important;border-color:transparent!important;background:transparent!important;
        border-radius:6px!important;margin:2px 0!important;min-width:38px;min-height:38px}
      .gcct-site button:hover,.gcct-site a:hover{background:var(--soft)!important}
      .gcct-hide-site-switcher .leaflet-control-layers,.gcct-hide-site-switcher .leaflet-control-zoom{display:none!important}

      /* Dialogs: a header you can drag, a scrolling body, and a footer with the buttons */
      .gcct-dlg{position:fixed;top:80px;right:70px;z-index:2147483000;width:min(480px,calc(100vw - 20px));max-height:calc(100vh - 100px);
        display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:var(--r);box-shadow:var(--shadow);
        padding:0;font-size:14px;line-height:1.5;cursor:auto;text-align:left;animation:gcct-in .14s ease-out}
      .gcct-dlg.sm{width:min(400px,calc(100vw - 20px))}
      .gcct-dlg .rz{position:absolute;left:14px;right:14px;height:9px;cursor:ns-resize;z-index:5;touch-action:none}
      .gcct-dlg .rz-top{top:-2px}
      .gcct-dlg .rz-bottom{bottom:-2px}
      .gcct-dlg .rz-bottom::after{content:"";position:absolute;left:50%;bottom:4px;width:36px;height:3px;margin-left:-18px;border-radius:2px;background:var(--line);opacity:.9}
      .gcct-dlg .rz:hover::after,.gcct-dlg .rz-bottom:hover::after{background:var(--acc)}
      .gcct-dlg.sized .bd{flex:1 1 auto}
      .gcct-route.sized .rt-list,.gcct-route.sized .rt-route,.gcct-route.sized .rt-tbl{max-height:none}
      .gcct-route.sized .rt-list{flex-grow:3}.gcct-route.sized .rt-route{flex-grow:2}
      .gcct-dlg .hd{flex:none;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 20px;border-bottom:1px solid var(--line);cursor:move;user-select:none}
      .gcct-dlg h3{flex:1;margin:0;font-size:16.5px;font-weight:650;line-height:1.3;color:var(--ink)}
      .gcct-dlg .bd{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 20px 18px;overscroll-behavior:contain}
      .gcct-dlg h4.sec{margin:20px 0 10px;font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
      .gcct-dlg h4.sec:first-child{margin-top:0}
      .gcct-dlg p{margin:0 0 10px}
      .gcct-dlg .f{display:block;margin:0 0 14px;cursor:default}
      .gcct-dlg .f .l{display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:var(--ink)}
      .gcct-dlg .f .h{display:block;font-size:12.5px;color:var(--muted);margin-top:5px}
      .gcct-dlg .chk{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:14px;cursor:pointer}
      .gcct-dlg .favset{margin:4px 0 14px;padding:10px 12px 2px;border:1px solid var(--line);border-radius:var(--rc)}
      .gcct-dlg .favset > b{display:block;margin:0 0 8px;font-size:13px}
      .gcct-dlg .fmin input{width:70px!important;display:inline-block!important}
      .gcct-dlg .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .gcct-dlg .row3{display:grid;grid-template-columns:1fr 1fr 92px;gap:12px}
      .gcct-dlg .sfx{position:relative;display:block}
      .gcct-dlg .sfx input{padding-right:28px!important}
      .gcct-dlg .sfx i{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-style:normal;color:var(--muted);pointer-events:none}
      .gcct-dlg[data-kind=wms] .t-only,.gcct-dlg:not([data-kind=wms]) .wms-only{display:none}
      .gcct-dlg select[size]{padding:4px}
      .gcct-dlg select[size] option{padding:4px 6px;border-radius:4px}
      .gcct-dlg input[type=checkbox]{width:16px;height:16px;margin:0;flex:none}
      .gcct-dlg input[type=file]{font-size:13.5px}
      .gcct-dlg textarea{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12.5px;line-height:1.45}
      .gcct-dlg code{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12.5px;background:#eff1f3;padding:1px 5px;border-radius:4px}
      .gcct-dlg .urlrow{display:flex;gap:8px}
      .gcct-dlg .urlrow input{flex:1;min-width:0}
      .gcct-dlg .hint{color:var(--muted);font-size:13.5px;margin:6px 0 10px}
      .gcct-dlg ul.hint{padding-left:20px;margin-top:-4px}
      .gcct-dlg ul.hint li{margin:2px 0}
      .gcct-dlg .caps{margin:8px 0 12px;display:grid;gap:8px}
      .gcct-dlg .caps:empty{display:none}
      .gcct-dlg details.more{margin:8px 0 0;border-top:1px solid var(--line);padding-top:12px}
      .gcct-dlg details.more summary{cursor:pointer;font-weight:600;font-size:14px;margin-bottom:12px;color:var(--acc)}
      .gcct-dlg .result{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin:2px 0 0;padding:9px 8px 10px 14px;border-radius:var(--rc);background:var(--acc-bg)}
      .gcct-dlg .result .k{flex-basis:100%;font-size:11.5px;font-weight:700;color:var(--acc);text-transform:uppercase;letter-spacing:.06em}
      .gcct-dlg .result code{flex:1;background:none;padding:0;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gcct-dlg .result.empty code{color:var(--muted)}
      .gcct-dlg button.ic{display:inline-flex;align-items:center;justify-content:center;min-height:32px;width:34px;padding:0;background:rgba(255,255,255,.7)}
      .gcct-dlg .status{margin:14px 0 0;padding:9px 12px;border-radius:var(--rc);font-size:13.5px;background:var(--soft);color:var(--ink)}
      .gcct-dlg .status:empty{display:none}
      .gcct-dlg .status.err{background:var(--danger-bg);color:#a40e26}
      .gcct-dlg .status.ok{background:#dafbe1;color:#116329}
      .gcct-dlg .btns{display:flex;gap:8px;align-items:center;margin:18px -20px -18px;padding:12px 20px;border-top:1px solid var(--line);background:var(--soft)}
      .gcct-dlg .bd > .btns:last-child{position:sticky;bottom:-18px;z-index:2}   /* the buttons stay in view; the rest scrolls */
      .gcct-dlg .btns .sp{flex:1}
      .gcct-dlg a{color:var(--acc)}`;
    document.head.appendChild(css);

    // --- Layer panel ---------------------------------------------------------
    const Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const box = L.DomUtil.create('div', 'gcct leaflet-control');
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        box.addEventListener('keydown', e => e.stopPropagation());
        box.innerHTML = `<a class="gcct-btn" href="#" role="button" title="${T('Map layers')}" aria-label="${T('Map layers')}">${icon('layers')}</a><div class="gcct-panel"></div>`;
        box.querySelector('.gcct-btn').onclick = e => {
          e.preventDefault();
          if (box.classList.contains('open')) { box.classList.remove('open'); return; }
          box.classList.add('open');
          render();
          // Open in the same place as the dialogs: beside the toolbar, at the top of the map.
          const p = box.querySelector('.gcct-panel');
          const pos = besideToolbar(p.offsetWidth || 340, p.offsetHeight || 500);
          Object.assign(p.style, { position: 'fixed', left: pos.left + 'px', right: 'auto', maxHeight: pos.maxHeight,
            top: pos.top == null ? 'auto' : pos.top + 'px', bottom: pos.top == null ? pos.bottom + 'px' : 'auto' });
          // A moved toolbar (centred at the top or bottom) makes "fixed" relative to the toolbar instead of the
          // window: measure where the panel ended up and correct for that.
          const r = p.getBoundingClientRect(), vh = window.innerHeight;
          const dx = r.left - pos.left;
          if (Math.abs(dx) > 1) p.style.left = (pos.left - dx) + 'px';
          if (pos.top != null) { const dy = r.top - pos.top; if (Math.abs(dy) > 1) p.style.top = (pos.top - dy) + 'px'; }
          else { const dy = (vh - r.bottom) - pos.bottom; if (Math.abs(dy) > 1) p.style.bottom = (pos.bottom - dy) + 'px'; }
        };
        this._box = box;
        return box;
      },
    });
    const ctl = new Ctl().addTo(map);
    // While the panel is open, lift the toolbar's control corner above the other corners: Leaflet gives
    // all corners the same z-index, so the bottom corner (coordinate readout, credits) would cover the panel.
    new MutationObserver(() => {
      const corner = ctl._box.closest('.leaflet-top, .leaflet-bottom');
      if (corner) corner.style.zIndex = ctl._box.classList.contains('open') ? '1001' : '';
    }).observe(ctl._box, { attributes: true, attributeFilter: ['class'] });

    let panelTab = ['site', 'base', 'overlay'].includes(load('gcct.tab', '')) ? load('gcct.tab', '') : (state.base ? 'base' : 'site');
    function render() {
      const panel = ctl._box.querySelector('.gcct-panel');
      const defs = allDefs().filter(d => !state.removed.includes(d.id));
      const siteAll = siteEntries(), siteBases = siteAll.filter(o => !o.overlay), siteOverlays = siteAll.filter(o => o.overlay);
      // geocaching.com's own maps can be taken off the list too, keyed by their name.
      const siteKey = o => 'site:' + plainName(o.name);
      const siteShown = o => !state.removedSite.includes(siteKey(o));
      const siteRm = (key, name) => `<span class="tools"><button class="act del" data-rmsite="${esc(key)}" data-name="${esc(name)}" title="${T('Remove this map from the list')}">${icon('x', 16)}</button></span>`;
      const removedCount = state.removed.length + state.removedSite.length;
      const acts = d => isCustom(d.id)
        ? `<button class="act" data-edit="${d.id}" title="${T('Edit this layer')}">${icon('pencil', 16)}</button><button class="act del" data-del="${d.id}" title="${T('Delete this layer')}">${icon('x', 16)}</button>`
        : `<button class="act" data-dup="${d.id}" title="${T('Make an editable copy')}">${icon('duplicate', 16)}</button><button class="act del" data-rm="${d.id}" title="${T('Remove this map from the list')}">${icon('x', 16)}</button>`;
      const grip = `<span class="grip" tabindex="0" role="button" title="${T('Drag to change the order (or use ↑ ↓)')}">${icon('grip', 14)}</span>`;
      const row = (d, input) => `
        <div class="row" data-key="${esc(d.id)}">${grip}
          <label title="${esc(presetName(d))}\n${esc(d.url)}">${input}<span>${esc(presetName(d))}</span></label>
          <span class="tools">${acts(d)}</span>
        </div>`;

      const pctOf = v => Math.round(v * 100) + ' %';
      // The background dimming applies to whichever background is selected, so it is on both background tabs.
      const dimRow = `<div class="grp"><h4>${T('Dimming')}</h4><input type="range" min="${MIN_DIM}" max="1" step="0.05" value="${state.dimBase}" data-grp="base"
          title="${T('Dim the selected background map (drag left to fade it towards white)')}"><output data-out="base">${pctOf(state.dimBase)}</output></div>`;
      panel.innerHTML = `
        <div class="phd"><b>${T('Map layers')}</b><span class="x" title="${T('Close')}">${icon('x', 18)}</span></div>
        <div class="pbd">
        <div class="quick"><input placeholder="${T('Paste a map address to add it…')}"><button title="${T('Add a map layer from this address')}">${T('Add')}</button></div>
        <div class="tabs" role="tablist">
          <button class="tab" data-tab="site" role="tab" title="${T('geocaching.com’s own maps')}">${T('Geocaching')}${!state.base ? '<i class="dot"></i>' : ''}</button>
          <button class="tab" data-tab="base" role="tab" title="${T('Background maps from this script and your own')}">${T('Background maps')}${state.base ? '<i class="dot"></i>' : ''}</button>
          <button class="tab" data-tab="overlay" role="tab" title="${T('Overlays from this script and your own')}">${T('Overlays')}${state.overlays.length ? `<i class="cnt">${state.overlays.length}</i>` : ''}</button>
        </div>
        <section class="tabpane" data-pane="site">
          ${dimRow}
          <div class="sortable" data-group="site">
          ${siteBases.length
            ? byOrder(siteBases.map((o, i) => [o, i]), x => siteKey(x[0]), 'site').map(([o, i]) => siteShown(o) ? `<div class="row" data-key="${esc(siteKey(o))}">${grip}<label title="${esc(plainName(o.name))} (geocaching.com)"><input type="radio" name="gcct-base" value="site:${i}"
                ${!state.base && map.hasLayer(o.layer) ? 'checked' : ''}><span>${esc(plainName(o.name))}</span></label>${siteRm(siteKey(o), plainName(o.name))}</div>` : '').join('')
            : (state.removedSite.includes('site:gc') ? '' : `<div class="row"><label><input type="radio" name="gcct-base" value="" ${!state.base ? 'checked' : ''}><span>${T('Geocaching.com map')}</span></label>${siteRm('site:gc', T('Geocaching.com map'))}</div>`)}
          </div>
          ${siteStyleBtn && !state.removedSite.includes('site:styles') ? `<div class="row stylesrow"><button class="sitestyles" data-a="sitestyles" title="${T('Open geocaching.com’s own map style menu')}">${T('Geocaching.com map styles…')}</button>${siteRm('site:styles', T('Geocaching.com map styles…'))}</div>` : ''}
          ${siteOverlays.some(siteShown) ? `<h4>${T('Overlays')}</h4>` : ''}
          <div class="sortable" data-group="siteov">
          ${byOrder(siteOverlays.map((o, i) => [o, i]), x => siteKey(x[0]), 'siteov').map(([o, i]) => siteShown(o) ? `<div class="row" data-key="${esc(siteKey(o))}">${grip}<label title="${esc(plainName(o.name))} (geocaching.com)"><input type="checkbox" data-sov="${i}"
              ${map.hasLayer(o.layer) ? 'checked' : ''}><span>${esc(plainName(o.name))}</span></label>${siteRm(siteKey(o), plainName(o.name))}</div>` : '').join('')}
          </div>
          <i class="none empty-note">${T('All of geocaching.com’s maps are removed from the list.')}</i>
        </section>
        <section class="tabpane" data-pane="base">
          ${dimRow}
          <div class="sortable" data-group="base">
          ${byOrder(defs.filter(d => d.type === 'base'), d => d.id, 'base').map(d =>
            row(d, `<input type="radio" name="gcct-base" value="${d.id}" ${state.base === d.id ? 'checked' : ''}>`)).join('') || `<i class="none">${T('none')}</i>`}
          </div>
        </section>
        <section class="tabpane" data-pane="overlay">
          <div class="grp"><h4>${T('Opacity')}</h4><input type="range" min="${MIN_DIM}" max="1" step="0.05" value="${state.overlayOpacity}" data-grp="overlay"
            title="${T('Opacity of the selected overlays (drag left to make them more transparent)')}"><output data-out="overlay">${pctOf(state.overlayOpacity)}</output></div>
          <div class="sortable" data-group="overlay">
          ${byOrder(defs.filter(d => d.type === 'overlay'), d => d.id, 'overlay').map(d =>
            row(d, `<input type="checkbox" data-ov="${d.id}" ${state.overlays.includes(d.id) ? 'checked' : ''}>`)).join('') || `<i class="none">${T('none')}</i>`}
          </div>
          <p class="note">${T('The overlay at the top of the list is drawn on top.')}</p>
        </section>
        ${removedCount ? `<button class="restore" data-a="restore">${T('Restore removed maps ({n})', { n: removedCount })}</button>` : ''}
        <div class="foot"><button data-a="new" title="${T('Add your own map layer')}">${T('＋ New layer')}</button><button data-a="imp" title="${T('Load layers from a file or text')}">${T('Import')}</button><button data-a="exp" title="${T('Save your layers to move or share them')}">${T('Export')}</button></div>
        </div>`;
      noSubmit(panel);
      dragBy(panel, panel.querySelector('.phd'));          // the layer panel can be moved like a dialog

      panel.querySelector('.x').onclick = () => ctl._box.classList.remove('open');
      const showTab = t => {
        panel.querySelectorAll('.tab').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        panel.querySelectorAll('.tabpane').forEach(p => { p.hidden = p.dataset.pane !== t; });
      };
      panel.querySelectorAll('.tab').forEach(b => b.onclick = () => { panelTab = b.dataset.tab; save('gcct.tab', panelTab); showTab(panelTab); });
      // Drag a row by its handle to move it; ↑ / ↓ on a focused handle moves it one step.
      const saveOrder = list => {
        state.order[list.dataset.group] = [...list.querySelectorAll(':scope > .row[data-key]')].map(r => r.dataset.key);
        save(STORE_STATE, state);
        if (list.dataset.group === 'overlay') arrange();
      };
      panel.querySelectorAll('.sortable').forEach(list => {
        list.querySelectorAll(':scope > .row > .grip').forEach(h => {
          const rowEl = h.parentElement;
          h.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            // Listen on the document: moving the row in the page releases any pointer capture.
            rowEl.classList.add('dragging');
            list.classList.add('sorting');
            const move = ev => {
              const rows = [...list.querySelectorAll(':scope > .row[data-key]')].filter(r => r !== rowEl);
              const after = rows.find(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
              if (after) { if (rowEl.nextElementSibling !== after) list.insertBefore(rowEl, after); }
              else if (rows.length && list.lastElementChild !== rowEl) rows[rows.length - 1].after(rowEl);
            };
            const up = () => {
              document.removeEventListener('pointermove', move, true);
              document.removeEventListener('pointerup', up, true);
              document.removeEventListener('pointercancel', up, true);
              rowEl.classList.remove('dragging');
              list.classList.remove('sorting');
              saveOrder(list);
            };
            document.addEventListener('pointermove', move, true);
            document.addEventListener('pointerup', up, true);
            document.addEventListener('pointercancel', up, true);
          });
          h.addEventListener('keydown', e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const sib = e.key === 'ArrowUp' ? rowEl.previousElementSibling : rowEl.nextElementSibling;
            if (!sib || !sib.classList.contains('row')) return;
            if (e.key === 'ArrowUp') list.insertBefore(rowEl, sib); else sib.after(rowEl);
            h.focus();
            saveOrder(list);
          });
        });
      });
      const sitePane = panel.querySelector('[data-pane=site]');
      sitePane.querySelector('.empty-note').hidden = !!sitePane.querySelector('.row');
      showTab(panelTab);
      const q = panel.querySelector('.quick input');
      const quick = () => q.value.trim() && openEditor({ url: q.value.trim() });
      panel.querySelector('.quick button').onclick = quick;
      q.onkeydown = e => { if (e.key === 'Enter') quick(); };

      panel.querySelectorAll('input[name=gcct-base]').forEach(r => r.onchange = () => {
        const v = r.value;
        if (v.startsWith('site:')) { setBase(null); switchSiteBase(siteBases[+v.slice(5)].layer); }
        else setBase(v || null);
      });
      panel.querySelectorAll('[data-sov]').forEach(c => c.onchange = () => {
        const l = siteOverlays[+c.dataset.sov].layer;
        if (c.checked) map.addLayer(l); else map.removeLayer(l);
      });
      const ssb = panel.querySelector('[data-a=sitestyles]');
      if (ssb) ssb.onclick = () => { setBase(null); ctl._box.classList.remove('open'); render(); openSiteStyles(); };
      panel.querySelectorAll('[data-ov]').forEach(c => c.onchange = () => toggleOverlay(c.dataset.ov, c.checked));
      panel.querySelectorAll('[data-grp]').forEach(sl => sl.oninput = () => {
        if (sl.dataset.grp === 'base') state.dimBase = Math.max(MIN_DIM, Number(sl.value)); else state.overlayOpacity = Math.max(MIN_DIM, Number(sl.value));
        const v = sl.dataset.grp === 'base' ? state.dimBase : state.overlayOpacity;
        panel.querySelectorAll(`[data-out=${sl.dataset.grp}]`).forEach(o => { o.textContent = pctOf(v); });
        panel.querySelectorAll(`[data-grp=${sl.dataset.grp}]`).forEach(o => { if (o !== sl) o.value = v; });
        applyLevels();
        save(STORE_STATE, state);
      });
      panel.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(findDef(b.dataset.edit)));
      panel.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
        const d = Object.assign({}, findDef(b.dataset.dup));
        delete d.id;
        d.name = presetName(d) + T(' (copy)');
        openEditor(d);
      });
      panel.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const id = b.dataset.del, def = findDef(id);
        askConfirm(T('Delete layer'), T('Delete “{name}”?', { name: def ? presetName(def) : id }), T('Delete'), () => {
          forget(id);
          save(STORE_STATE, state);
          save(STORE_LAYERS, customs().filter(d => d.id !== id));
          render();
        });
      });
      panel.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
        const id = b.dataset.rm, def = findDef(id);
        askConfirm(T('Remove map'), T('Remove “{name}” from the list? You can bring it back with “Restore removed maps”.', { name: def ? presetName(def) : id }), T('Remove'), () => {
          forget(id);
          if (!state.removed.includes(id)) state.removed.push(id);
          save(STORE_STATE, state);
          render();
        });
      });
      const rs = panel.querySelector('[data-a=restore]');
      if (rs) rs.onclick = () => { state.removed = []; state.removedSite = []; save(STORE_STATE, state); render(); };
      panel.querySelectorAll('[data-rmsite]').forEach(b => b.onclick = () => {
        const key = b.dataset.rmsite, name = b.dataset.name;
        askConfirm(T('Remove map'), T('Remove “{name}” from the list? You can bring it back with “Restore removed maps”.', { name }), T('Remove'), () => {
          // A geocaching.com overlay that is switched on is switched off, so it can't be left on out of reach.
          siteOverlays.forEach(o => { if (siteKey(o) === key && map.hasLayer(o.layer)) map.removeLayer(o.layer); });
          if (!state.removedSite.includes(key)) state.removedSite.push(key);
          save(STORE_STATE, state);
          render();
        });
      });
      panel.querySelector('[data-a=new]').onclick = () => openEditor({});
      panel.querySelector('[data-a=imp]').onclick = openImport;
      panel.querySelector('[data-a=exp]').onclick = openExport;
    }

    // --- Floating dialogs ----------------------------------------------------
    let dlgEl = null, dlgGuard = null;
    function closeDialog() {
      if (!dlgEl) return;
      const d = dlgEl;
      dlgEl = null;                         // mark as closed by us before removing
      if (dlgGuard) { dlgGuard.disconnect(); dlgGuard = null; }
      if (d._onClose) d._onClose();
      d.remove();
    }
    const dialogParent = () => document.fullscreenElement || document.documentElement;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && dlgEl) { e.stopPropagation(); closeDialog(); }
    }, true);
    // The site may remove or hide foreign elements (e.g. when re-rendering its sidebar).
    // Keep our open dialog attached and visible until *we* close it.
    function guardDialog(d) {
      const pin = () => {
        if (dlgEl !== d) return;
        if (!d.isConnected) { console.info('[gcct] dialog was removed by the page – restoring it'); dialogParent().appendChild(d); }
        // Only write when needed – writing the same style again would re-trigger the observer.
        [['display', 'flex'], ['visibility', 'visible'], ['opacity', '1']].forEach(([k, v]) => {
          if (d.style.getPropertyValue(k) !== v || d.style.getPropertyPriority(k) !== 'important') d.style.setProperty(k, v, 'important');
        });
      };
      pin();
      dlgGuard = new MutationObserver(pin);
      dlgGuard.observe(document.documentElement, { childList: true, subtree: true });
      dlgGuard.observe(d, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
    // Move a fixed box (dialog, layer panel) by dragging its header. Pointer events on the window,
    // before the page's own handlers, so the site can't swallow them; the drag always ends.
    function dragBy(box, handle) {
      handle.style.cursor = 'move';
      handle.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('.x, button, input, select, a')) return;
        e.preventDefault(); e.stopPropagation();
        const r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
        const mv = ev => {
          if (ev.buttons === 0) return up();
          const vw = document.documentElement.clientWidth;
          box.style.left = Math.max(0, Math.min(vw - 80, ev.clientX - ox)) + 'px';
          box.style.top = Math.max(0, Math.min(window.innerHeight - 50, ev.clientY - oy)) + 'px';
          box.style.right = 'auto'; box.style.bottom = 'auto';     // (from a bottom-anchored start too)
          box.style.maxHeight = `calc(100vh - ${parseInt(box.style.top, 10) + 10}px)`;
          box.dataset.moved = '1';
        };
        const up = () => {
          window.removeEventListener('pointermove', mv, true);
          ['pointerup', 'pointercancel', 'blur'].forEach(ev => window.removeEventListener(ev, up, true));
        };
        window.addEventListener('pointermove', mv, true);
        ['pointerup', 'pointercancel', 'blur'].forEach(ev => window.addEventListener(ev, up, true));
      });
    }
    // Drag the top or bottom edge of a dialog to make it taller or shorter, upwards or downwards.
    function resizeBy(box) {
      ['top', 'bottom'].forEach(edge => {
        const h = document.createElement('div');
        h.className = 'rz rz-' + edge;
        h.title = T('Drag to resize');
        box.appendChild(h);
        h.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.stopPropagation();
          const r = box.getBoundingClientRect(), y0 = e.clientY, vh = window.innerHeight, MIN = 160;
          // From here on the dialog has a fixed top and height (also when it started anchored at the bottom).
          Object.assign(box.style, { top: r.top + 'px', bottom: 'auto', height: r.height + 'px', maxHeight: 'none' });
          box.dataset.moved = '1';
          box.classList.add('sized');
          const mv = ev => {
            if (ev.buttons === 0) return up();
            const dy = ev.clientY - y0;
            if (edge === 'bottom') box.style.height = Math.max(MIN, Math.min(vh - r.top - 4, r.height + dy)) + 'px';
            else {
              const top = Math.max(4, Math.min(r.bottom - MIN, r.top + dy));
              box.style.top = top + 'px';
              box.style.height = (r.bottom - top) + 'px';
            }
          };
          const up = () => {
            window.removeEventListener('pointermove', mv, true);
            ['pointerup', 'pointercancel', 'blur'].forEach(ev => window.removeEventListener(ev, up, true));
          };
          window.addEventListener('pointermove', mv, true);
          ['pointerup', 'pointercancel', 'blur'].forEach(ev => window.addEventListener(ev, up, true));
        });
      });
    }
    function openDialog(title, html, opts = {}) {
      closeDialog();
      // Custom element name: no site CSS selector targets it.
      const d = document.createElement('gcct-dialog');
      d.className = 'gcct-dlg' + (opts.small ? ' sm' : '') + (opts.cls ? ' ' + opts.cls : '');
      d.innerHTML = `<div class="hd" title="${T('Drag to move')}"><h3>${esc(title)}</h3><span class="x" title="${T('Close (Esc)')}">${icon('x', 18)}</span></div><div class="bd">${html}</div>`;
      noSubmit(d);
      L.DomEvent.disableClickPropagation(d);
      L.DomEvent.disableScrollPropagation(d);
      d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeDialog(); });
      d.addEventListener('contextmenu', e => e.stopPropagation());
      d.querySelector('.x').onclick = closeDialog;
      // Drag the dialog by its header – anywhere in the window.
      dragBy(d, d.querySelector('.hd'));
      resizeBy(d);
      // Attach to the page (not the map) so the site's sidebar can't cover it.
      // In fullscreen only the fullscreen element is visible, so attach there instead.
      dialogParent().appendChild(d);
      dlgEl = d;
      placeDialog(d);
      guardDialog(d);
      return d;
    }
    // A yes/no question in the same style as the other dialogs (instead of the browser's confirm box).
    function askConfirm(title, msg, okText, onOk) {
      const d = openDialog(title, `<p>${esc(msg)}</p>
        <div class="btns"><span class="sp"></span><button data-a="cancel">${T('Cancel')}</button><button class="danger" data-a="ok">${esc(okText)}</button></div>`, { small: true });
      d.querySelector('[data-a=cancel]').onclick = closeDialog;
      d.querySelector('[data-a=ok]').onclick = () => { closeDialog(); onOk(); };
      placeDialog(d);
      setTimeout(() => d.querySelector('[data-a=ok]').focus(), 0);
    }
    // Put the dialog just left of the layer panel (or the map's right edge), inside the window.
    // Dialogs open beside the toolbar, never on top of it: to its left when it is on the right, to its
    // right when it is on the left, below it at the top and above it at the bottom – inside the window.
    function placeDialog(d) {
      const p = besideToolbar(d.offsetWidth || 440, d.offsetHeight || 300);
      d.style.left = p.left + 'px';
      d.style.right = 'auto';
      d.style.top = p.top == null ? 'auto' : p.top + 'px';
      d.style.bottom = p.top == null ? p.bottom + 'px' : 'auto';
      d.style.maxHeight = p.maxHeight;
    }
    let lastFill = null;
    window.gcctDialogTest = () => lastFill;
    // Stretch a placed dialog up and down as far as the window and the controls around it allow.
    function fillHeight(d) {
      const r = d.getBoundingClientRect(), vh = window.innerHeight, gap = 8;
      if (!r.height) return;
      let obs = [];
      try { obs = collectObstacles([dock]); } catch (e) { /* none */ }
      try { obs.push(dock.getBoundingClientRect()); } catch (e) { /* none */ }
      const ce = toolsUi && toolsUi.coordEl;
      if (ce && ce.offsetWidth) obs.push(ce.getBoundingClientRect());
      const across = obs.filter(o => o.width && o.height && o.left < r.right + gap && o.right > r.left - gap);
      const mapTop = map.getContainer().getBoundingClientRect().top;
      const hi = Math.max(Math.min(r.top, Math.max(10, mapTop + 10)), ...across.filter(o => o.bottom <= r.top + 1).map(o => o.bottom + gap));
      const lo = Math.min(vh - 10, ...across.filter(o => o.top >= r.bottom - 1).map(o => o.top - gap));
      // For gcctDialogTest(): what limited the height (element kinds and positions only).
      const desc = o => o.__el ? `${o.__el.tagName.toLowerCase()}.${String(o.__el.className || '').split(/\s+/).slice(0, 2).join('.')}` : 'box';
      lastFill = { vh, rect: [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)], hi: Math.round(hi), lo: Math.round(lo),
        above: across.filter(o => o.bottom <= r.top + 1).map(o => [desc(o), Math.round(o.top), Math.round(o.bottom)]),
        below: across.filter(o => o.top >= r.bottom - 1).map(o => [desc(o), Math.round(o.top), Math.round(o.bottom)]) };
      if (lo - hi <= r.height) return;
      Object.assign(d.style, { top: hi + 'px', bottom: 'auto', height: (lo - hi) + 'px', maxHeight: 'none' });
      d.classList.add('sized');
    }
    // Where a box of w × h goes next to the toolbar (also used for the layer panel).
    function besideToolbar(w, h) {
      const mapR = map.getContainer().getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      let tb = null, side = 'right';
      try { tb = dock.getBoundingClientRect(); side = state.tbSide || 'right'; } catch (e) { tb = ctl._box.getBoundingClientRect(); }
      const clampX = x => Math.max(10, Math.min(x, vw - w - 10));
      let left, top = Math.max(10, Math.min(mapR.top + 10, vh - 200));
      if (side === 'left') left = clampX(tb.right + 10);
      else if (side === 'top') { left = clampX(tb.left + tb.width / 2 - w / 2); top = Math.min(tb.bottom + 10, vh - 200); }
      else if (side === 'bottom') { left = clampX(tb.left + tb.width / 2 - w / 2); top = Math.max(10, Math.max(mapR.top + 10, tb.top - 10 - h)); }
      else left = clampX((tb.width ? tb.left : mapR.right) - 10 - w);
      let bottomLimit = side === 'bottom' ? tb.top - 10 : vh - 10;
      // Keep clear of other controls (the site's buttons, the coordinate readout): move down or up to
      // the nearest free spot; if there is none, sideways. The dialog may then get shorter (it scrolls).
      try {
        const gap = 8, obs = collectObstacles([dock]);
        const ce = toolsUi && toolsUi.coordEl;
        if (ce && ce.offsetWidth) obs.push(ce.getBoundingClientRect());
        const hits = (l, t2, hh) => obs.some(o => o.left < l + w + gap && o.right > l - gap && o.top < t2 + hh + gap && o.bottom > t2 - gap);
        const minH = Math.min(h, 220);
        if (hits(left, top, Math.min(h, bottomLimit - top))) {
          const ys = [top, ...obs.flatMap(o => [o.bottom + gap, o.top - gap - h])].filter(y => y >= 10 && y + minH <= bottomLimit)
            .sort((a, b) => Math.abs(a - top) - Math.abs(b - top));
          const y = ys.find(y => !hits(left, y, Math.min(h, bottomLimit - y)));
          if (y != null) top = y;
          else {
            const xs = obs.flatMap(o => [o.left - gap - w, o.right + gap]).map(clampX).sort((a, b) => Math.abs(a - left) - Math.abs(b - left));
            const x = xs.find(x => !hits(x, top, Math.min(h, bottomLimit - top)) && !(x < tb.right && x + w > tb.left && top < tb.bottom && top + h > tb.top));
            if (x != null) left = x;
          }
        }
      } catch (e) { /* place as computed */ }
      // At the bottom the box hangs from just above the toolbar and grows upwards as its content grows
      // (search results), up to the top of the map – so everything in it stays visible.
      if (side === 'bottom') {
        const ceiling = Math.max(10, mapR.top + 10);
        return { left, top: null, bottom: vh - (tb.top - 10), maxHeight: `${Math.max(150, tb.top - 10 - ceiling)}px` };
      }
      return { left, top, maxHeight: `${Math.max(150, bottomLimit - top)}px` };
    }
    window.addEventListener('resize', () => { if (dlgEl && !dlgEl.dataset.moved) placeDialog(dlgEl); });
    const setStatus = (el, msg, cls = '') => { el.textContent = msg; el.className = 'status ' + cls; };

    // --- Layer editor --------------------------------------------------------
    function openEditor(initDef = {}) {
      const editing = initDef.id && isCustom(initDef.id) ? initDef.id : null;
      const extra = { matrixIds: initDef.matrixIds || null };
      const d = openDialog(editing ? T('Edit map layer') : T('Add a map layer'), `
        <form autocomplete="off" onsubmit="return false">
          <h4 class="sec">${T('Map source')}</h4>
          <label class="f"><span class="l">${T('Map address (URL)')}</span>
            <span class="urlrow"><input name="url" placeholder="https://…/{z}/{x}/{y}.png"><button type="button" data-a="detect">${T('Detect')}</button></span></label>
          <p class="hint">${T('Paste almost any map link and press <b>Detect</b>. It understands:')}</p>
          <ul class="hint">
            <li>${T('tile addresses with <code>{z}</code>, <code>{x}</code> and <code>{y}</code>')}</li>
            <li>${T('a single map tile copied from the browser’s developer tools')}</li>
            <li>${T('WMS and WMTS services – the list of layers is fetched for you')}</li>
            <li>${T('ArcGIS addresses ending in <code>/MapServer</code>')}</li>
          </ul>
          <div class="caps"></div>

          <h4 class="sec">${T('How it is shown')}</h4>
          <label class="f"><span class="l">${T('Name in the layer list')}</span><input name="name" placeholder="${T('e.g. Turkart Buskerud')}"></label>
          <div class="row2">
            <label class="f"><span class="l">${T('Show as')}</span>
              <select name="type"><option value="base">${T('Background map')}</option><option value="overlay">${T('Overlay on top')}</option></select></label>
            <label class="f"><span class="l">${T('Service type')}</span>
              <select name="kind"><option value="xyz">${T('Map tiles (XYZ)')}</option><option value="wmts">${T('WMTS tiles')}</option><option value="wms">WMS</option></select></label>
          </div>
          <div class="wms-only">
            <label class="f"><span class="l">${T('WMS layer names')}</span><input name="layers" placeholder="${T('e.g. Ruter')}">
              <span class="h">${T('Separate several names with commas.')}</span></label>
            <label class="chk"><input type="checkbox" name="transparent" checked> ${T('Transparent background')}</label>
          </div>

          <details class="more"><summary>${T('More settings')}</summary>
            <div class="t-only">
              <div class="row2">
                <label class="f"><span class="l">${T('Highest zoom with real tiles')}</span>
                  <input name="maxNativeZoom" type="number" min="0" max="24" placeholder="18">
                  <span class="h">${T('Closer than this, tiles are enlarged.')}</span></label>
                <label class="f"><span class="l">${T('Subdomains for <code>{s}</code>')}</span><input name="subdomains" placeholder="abc"></label>
              </div>
              <label class="chk"><input type="checkbox" name="tms"> ${T('Flip the Y axis (TMS servers)')}</label>
            </div>
            <div class="wms-only">
              <div class="row2">
                <label class="f"><span class="l">${T('Image format')}</span><input name="format" value="image/png"></label>
                <label class="f"><span class="l">${T('WMS version')}</span><select name="version"><option>1.3.0</option><option>1.1.1</option></select></label>
              </div>
              <label class="f"><span class="l">${T('Styles')}</span><input name="styles" placeholder="${T('Leave empty for the default')}"></label>
            </div>
            <div class="row2">
              <label class="f"><span class="l">${T('Show from zoom level')}</span><input name="minZoom" type="number" min="0" max="24" placeholder="0"></label>
              <label class="f"><span class="l">${T('Credit text')}</span><input name="attribution" placeholder="${T('e.g. © Kartverket')}"></label>
            </div>
          </details>
        </form>
        <div class="status"></div>
        <div class="btns">
          <button data-a="preview">${T('Preview on map')}</button><span class="sp"></span>
          <button data-a="cancel">${T('Cancel')}</button><button data-a="save" class="primary">${T('Save layer')}</button>
        </div>`);

      const form = d.querySelector('form'), F = form.elements;
      const capsBox = d.querySelector('.caps'), statusEl = d.querySelector('.status');
      const st = (m, c) => setStatus(statusEl, m, c);
      const pvBtn = d.querySelector('[data-a=preview]');

      function applyFields(o) {
        for (const [k, v] of Object.entries(o)) {
          const el = F[k];
          if (!el || v == null || k === 'id') continue;
          if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
        }
        if ('matrixIds' in o) extra.matrixIds = o.matrixIds || null;
        d.dataset.kind = F.kind.value;
      }
      function read() {
        const f = Object.fromEntries(new FormData(form));
        const def = {
          id: editing || newId(), name: f.name.trim() || T('Untitled layer'), type: f.type, kind: f.kind,
          url: f.url.trim(), attribution: f.attribution.trim(), minZoom: f.minZoom,
        };
        if (f.kind === 'wms') {
          Object.assign(def, { layers: f.layers.trim(), styles: f.styles.trim(), format: f.format.trim() || 'image/png',
            version: f.version, transparent: !!f.transparent });
        } else {
          Object.assign(def, { subdomains: f.subdomains.trim(), maxNativeZoom: f.maxNativeZoom, tms: !!f.tms });
          if (f.kind === 'wmts' && extra.matrixIds) def.matrixIds = extra.matrixIds;
        }
        // keep preset-only extras (e.g. hillshade blending) when copying or editing
        if (initDef.blend) def.blend = initDef.blend;
        if (initDef.opacity != null) def.opacity = initDef.opacity;
        return def;
      }

      // Preview with tile load/error counters
      let pv = null, pvTimer = null;
      function startPreview() {
        stopPreview();
        const def = read(), err = validate(def);
        if (err) return st(err, 'err');
        let ok = 0, bad = 0;
        const upd = () => {
          if (bad && !ok) st(T('Preview: none of the {n} tiles could be loaded. Check the address, layer name and zoom levels.', { n: bad }), 'err');
          else st(T(ok === 1 ? 'Preview: {n} tile loaded' : 'Preview: {n} tiles loaded', { n: ok }) + (bad ? T(', {n} failed (usually just areas without data).', { n: bad }) : '.'), ok ? 'ok' : '');
        };
        pv = makeLayer(def, true).on('tileload', () => { ok++; upd(); }).on('tileerror', () => { bad++; upd(); }).addTo(map);
        arrange();
        st(T('Preview: loading tiles…'));
        pvBtn.textContent = T('Stop preview');
      }
      function stopPreview() {
        if (pv) { map.removeLayer(pv); ours.delete(pv); pv = null; }
        pvBtn.textContent = T('Preview on map');
      }
      d._onClose = stopPreview;
      form.addEventListener('input', () => {
        d.dataset.kind = F.kind.value;
        if (pv) { clearTimeout(pvTimer); pvTimer = setTimeout(startPreview, 600); }
      });
      pvBtn.onclick = () => (pv ? stopPreview() : startPreview());

      // Capabilities browser
      async function loadCaps(type, capsUrl) {
        capsBox.innerHTML = '';
        st(T('Fetching the list of layers…'));
        try {
          const r = await fetch(capsUrl);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          showPicker(type, await r.text(), capsUrl);
        } catch (e) {
          st(T('The server did not let the script read its list of layers directly.'), 'err');
          capsBox.innerHTML = `
            <div class="hint">${T('Open {link} in a new tab, select everything (Ctrl+A), copy it, and paste it here:',
              { link: `<a href="${esc(capsUrl)}" target="_blank" rel="noopener">${T('the layer list')}</a>` })}</div>
            <textarea rows="4" placeholder="${T('Paste the layer list here')}"></textarea><button type="button">${T('Read layer list')}</button>`;
          capsBox.querySelector('button').onclick = () => showPicker(type, capsBox.querySelector('textarea').value, capsUrl);
        }
      }
      function showPicker(type, xml, capsUrl) {
        let items;
        try { items = type === 'wmts' ? parseWMTS(xml) : parseWMS(xml); } catch (e) { return st(T('Could not read the layer list ({e}).', { e: e.message }), 'err'); }
        if (!items.length) {
          return st(type === 'wmts' ? T('This service has no layers in the projection this map uses (Web Mercator).') : T('This service lists no layers that can be shown.'), 'err');
        }
        items.forEach(i => { if (!i.def.url) i.def.url = stripOgc(capsUrl).replace(/\?$/, ''); });
        capsBox.innerHTML = `<input placeholder="${T('Type to filter the {n} layers…', { n: items.length })}"><select size="8" ${type === 'wms' ? 'multiple' : ''}></select>` +
          (type === 'wms' ? `<div class="hint" style="margin:0">${T('Hold Ctrl (⌘ on Mac) to choose several layers.')}</div>` : '');
        const flt = capsBox.querySelector('input'), sel = capsBox.querySelector('select');
        const fill = () => {
          const s = flt.value.toLowerCase();
          sel.innerHTML = items.map((it, i) => it.label.toLowerCase().includes(s) ? `<option value="${i}">${esc(it.label)}</option>` : '').join('');
        };
        fill();
        flt.oninput = fill;
        sel.onchange = () => {
          const chosen = [...sel.selectedOptions].map(o => items[o.value]);
          if (!chosen.length) return;
          const def = Object.assign({}, chosen[0].def);
          if (chosen.length > 1) {
            def.layers = chosen.map(c => c.def.layers).join(',');
            def.name = chosen.map(c => c.def.name).join(' + ');
          }
          applyFields(def);
          st(T('Showing “{name}”. Press Save layer to keep it.', { name: def.name }), 'ok');
          startPreview();
        };
        st(T('Found {n} layers. Choose one in the list.', { n: items.length }), 'ok');
      }

      async function detect() {
        capsBox.innerHTML = '';
        const r = analyzeUrl(F.url.value, map.getCenter());
        if (!r) return st(T("This doesn't look like a map address the script knows. See the list of supported links above."), 'err');
        const { caps, capsUrl, note, name, ...fields } = r;
        if (name && (!F.name.value || F.name.value === 'Untitled layer' || F.name.value === T('Untitled layer'))) F.name.value = name;
        if (fields.kind === 'wms' && !editing) F.type.value = 'overlay';
        applyFields(fields);
        if (caps) return loadCaps(caps, capsUrl);
        startPreview();
        if (note) st(note);
      }
      d.querySelector('[data-a=detect]').onclick = detect;
      F.url.addEventListener('paste', () => setTimeout(detect, 0));
      F.url.addEventListener('keydown', e => { if (e.key === 'Enter') detect(); });

      d.querySelector('[data-a=cancel]').onclick = closeDialog;
      d.querySelector('[data-a=save]').onclick = () => {
        const def = read(), err = validate(def);
        if (err) return st(err, 'err');
        saveDef(def);
        closeDialog();
        render();
      };

      applyFields(Object.assign({ kind: 'xyz', type: 'base' }, initDef));
      if (!initDef.kind && initDef.url) detect();
      else F.url.focus();
    }

    // --- Import / export -----------------------------------------------------
    function openImport() {
      const d = openDialog(T('Import map layers'), `
        <p class="hint">${T('Paste layers exported from this script, or open a saved <code>.json</code> file. You can also paste a single map address.')}</p>
        <textarea rows="9" placeholder="${T('Paste here')}"></textarea>
        <label class="f" style="margin-top:12px"><span class="l">${T('…or open a file')}</span><input type="file" accept=".json,application/json"></label>
        <div class="status"></div>
        <div class="btns"><span class="sp"></span><button data-a="cancel">${T('Cancel')}</button><button class="primary" data-a="ok">${T('Import')}</button></div>`);
      const ta = d.querySelector('textarea'), statusEl = d.querySelector('.status');
      d.querySelector('input[type=file]').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => (ta.value = t)); };
      d.querySelector('[data-a=cancel]').onclick = closeDialog;
      d.querySelector('[data-a=ok]').onclick = () => {
        const text = ta.value.trim();
        if (/^(https?:)?\/\//i.test(text)) return openEditor({ url: text });
        let data;
        try { data = JSON.parse(text); } catch { return setStatus(statusEl, T('This is neither exported layer settings nor a map address.'), 'err'); }
        const list = customs(), ids = new Set(allDefs().map(x => x.id));
        let added = 0, skipped = 0;
        (Array.isArray(data) ? data : [data]).forEach(x => {
          if (!x || typeof x.url !== 'string') { skipped++; return; }
          if (list.some(y => y.url === x.url && (y.layers || '') === (x.layers || ''))) { skipped++; return; }
          const def = Object.assign({}, x);
          if (!def.id || !/^[\w-]+$/.test(def.id) || ids.has(def.id)) def.id = newId();
          if (!['base', 'overlay'].includes(def.type)) def.type = def.kind === 'wms' ? 'overlay' : 'base';
          def.name = def.name || T('Imported layer');
          ids.add(def.id);
          list.push(def);
          added++;
        });
        save(STORE_LAYERS, list);
        render();
        if (!added) return setStatus(statusEl, T(skipped === 1 ? 'Nothing was imported – the layer is already there or not valid.' : 'Nothing was imported – the layers are already there or not valid.'), 'err');
        setStatus(statusEl, T(added === 1 ? 'Imported {n} layer.' : 'Imported {n} layers.', { n: added }).replace(/\.$/, '') + (skipped ? T(' ({k} skipped)', { k: skipped }) : '') + '. ' + T('They are now in the layer panel.'), 'ok');
      };
    }

    function openExport() {
      const list = customs();
      const json = JSON.stringify(list, null, 2);
      const d = openDialog(T('Export map layers'), list.length ? `
        <p class="hint">${T(list.length === 1 ? 'Your layer is below.' : 'Your {n} layers are below.', { n: list.length })}
          ${T('Copy the text or save it as a file, then use <b>Import</b> on another computer or share it with a friend.')}</p>
        <textarea rows="11" readonly></textarea>
        <div class="btns"><button data-a="copy">${T('Copy text')}</button><button data-a="dl">${T('Save as file')}</button>
          <span class="sp"></span><button data-a="cancel">${T('Close')}</button></div>`
        : `<p>${T('You haven’t added any layers of your own yet. Use <b>＋ New layer</b> in the layer panel to add one.')}</p>
           <div class="btns"><span class="sp"></span><button data-a="cancel">${T('Close')}</button></div>`);
      d.querySelector('[data-a=cancel]').onclick = closeDialog;
      if (!list.length) return;
      d.querySelector('textarea').value = json;
      d.querySelector('[data-a=copy]').onclick = e => navigator.clipboard.writeText(json).then(() => (e.target.textContent = T('Copied')));
      d.querySelector('[data-a=dl]').onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = 'geocaching-map-layers.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
    }

    // Settings: toolbar position, the site's own map buttons, language – one dialog from the toolbar.
    // "Buttons in" shows what the toolbar really looks like: two rows when one doesn't fit right now
    // (the saved choice is kept, so it goes back to one row when there is room).
    function syncLinesSelect() {
      const sel = document.querySelector('.gcct-dlg select[data-a=tbcols]');
      if (!sel) return;
      let auto = false;
      try { auto = state.tbCols !== 2 && dock.classList.contains('cols2'); } catch (e) { /* toolbar not made yet */ }
      const o2 = sel.querySelector('option[value="2"]');
      if (o2) o2.textContent = T('Two lines') + (auto ? T(' (automatic)') : '');
      sel.value = String(auto ? 2 : (state.tbCols || 1));
      fitSelects(sel.closest('.gcct-dlg'));
    }
    // Widen a dialog so the chosen text in each of its menus is shown in full (two menus share a row).
    function fitSelects(d) {
      if (!d) return;
      try {
        const ctx = (fitSelects.c ||= document.createElement('canvas').getContext('2d'));
        let extra = 0;
        d.querySelectorAll('select').forEach(sel => {
          const cs = getComputedStyle(sel), o = sel.options[sel.selectedIndex];
          if (!o) return;
          ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const need = ctx.measureText(o.textContent).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 28;   // + the arrow
          const lack = need - sel.clientWidth;
          if (lack > 0) extra = Math.max(extra, lack * (sel.closest('.row2') ? 2 : 1));
        });
        // offsetWidth: the opening animation scales the dialog, so its on-screen size is not the real one yet.
        if (extra > 0) {
          d.style.width = Math.min(innerWidth - 20, Math.ceil(d.offsetWidth + extra)) + 'px';
          if (!d.dataset.moved) placeDialog(d);                  // in one go, before it is drawn
        }
      } catch (e) { /* keep the width */ }
    }
    function openSettings() {
      const side = state.tbSide || 'right', lines = state.tbCols || 1;
      const dflt = T(' (default)');
      const sideOpts = [['right', 'Right'], ['left', 'Left'], ['top', 'Top'], ['bottom', 'Bottom']]
        .map(([v, l]) => `<option value="${v}" ${side === v ? 'selected' : ''}>${T(l)}${v === 'right' ? dflt : ''}</option>`).join('');
      const lineOpts = [[1, 'One line'], [2, 'Two lines']].map(([v, l]) => `<option value="${v}" ${lines === v ? 'selected' : ''}>${T(l)}${v === 1 ? dflt : ''}</option>`).join('');
      const d = openDialog(T('Settings'), `
        <div class="row2"><label class="f"><span class="l">${T('Toolbar')}</span><select data-a="tbside">${sideOpts}</select></label>
        <label class="f"><span class="l">${T('Buttons in')}</span><select data-a="tbcols">${lineOpts}</select></label></div>
        <label class="f"><span class="l">${T('Language')}</span><select data-a="lang"><option value="en" ${LANG === 'en' ? 'selected' : ''}>English</option><option value="no" ${LANG === 'no' ? 'selected' : ''}>Norsk</option></select></label>
        <div class="favset"><b>${T('Favourite points')}</b>
          <label class="chk"><input type="checkbox" data-a="favshow" ${state.favShow !== false ? 'checked' : ''}> ${T('Show ♥ and the number by caches on the map (from zoom 15)').replace('♥', '<span class="gcct-fav">♥</span>')}</label>
          <label class="chk fmin">${T('From')} <input type="number" data-a="favmin" min="0" step="1" value="${state.favMin ?? 10}"> ${T('favourite points')}</label></div>
        <label class="chk"><input type="checkbox" data-a="dtshow" ${state.dtShow !== false ? 'checked' : ''}> ${T('Show difficulty/terrain (D/T) below caches on the map (from zoom 15)')}</label>
        <label class="chk"><input type="checkbox" data-a="ftfshow" ${state.ftfShow !== false ? 'checked' : ''}> ${T('Mark caches nobody has found yet (FTF) on the map (from zoom 15)')}</label>
        <label class="chk"><input type="checkbox" data-a="coords" ${state.showCoords !== false ? 'checked' : ''}> ${T('Show the zoom and coordinates at the bottom')}</label>
        <label class="chk"><input type="checkbox" data-a="sw" ${state.showSiteSwitcher ? 'checked' : ''}> ${T('Show geocaching.com’s own map buttons too')}</label>
        <label class="chk"><input type="checkbox" data-a="sitemenu" ${state.siteRightClick ? 'checked' : ''}> ${T('Right-click on /play/map opens the site’s own menu (log, add to list, GPX) instead of ours')}</label>
        <div class="btns"><span class="sp"></span><button class="primary" data-a="cancel">${T('Close')}</button></div>`, { small: true });
      d.querySelector('[data-a=cancel]').onclick = closeDialog;
      d.querySelector('[data-a=tbside]').onchange = e => { state.tbSide = e.target.value; save(STORE_STATE, state); applyToolbarLayout(); };
      d.querySelector('[data-a=tbcols]').onchange = e => { state.tbCols = +e.target.value; save(STORE_STATE, state); applyToolbarLayout(); syncLinesSelect(); };
      syncLinesSelect();
      d.querySelector('[data-a=coords]').onchange = e => setCoordsVisible(e.target.checked);
      const favSave = () => { save(STORE_STATE, state); if (window.__gcctRefreshFav) window.__gcctRefreshFav(); };
      d.querySelector('[data-a=favshow]').onchange = e => { state.favShow = e.target.checked; favSave(); if (window.__gcctFavBtnSync) window.__gcctFavBtnSync(); };
      d.querySelector('[data-a=dtshow]').onchange = e => { state.dtShow = e.target.checked; favSave(); if (window.__gcctFavBtnSync) window.__gcctFavBtnSync(); };
      d.querySelector('[data-a=ftfshow]').onchange = e => { state.ftfShow = e.target.checked; favSave(); if (window.__gcctFavBtnSync) window.__gcctFavBtnSync(); };
      d.querySelector('[data-a=favmin]').oninput = e => { const v = Number(e.target.value); if (isFinite(v) && v >= 0) { state.favMin = Math.round(v); favSave(); } };
      d.querySelector('[data-a=sitemenu]').onchange = e => { state.siteRightClick = e.target.checked; save(STORE_STATE, state); };
      d.querySelector('[data-a=sw]').onchange = e => {
        state.showSiteSwitcher = e.target.checked;
        save(STORE_STATE, state);
        applySwitcherVisibility();
      };
      d.querySelector('[data-a=lang]').onchange = e => {
        LANG = e.target.value;
        save('gcct.lang', LANG);
        render();
        if (toolsUi && toolsUi.relabel) toolsUi.relabel();
        const lb = ctl._box.querySelector('.gcct-btn');
        lb.title = T('Map layers'); lb.setAttribute('aria-label', lb.title);
        openSettings();                      // reopen in the new language
      };
    }

    // The zoom and coordinate readout: shown by default; hidden with its ✕ or in Settings, remembered.
    function setCoordsVisible(on) {
      state.showCoords = !!on;
      save(STORE_STATE, state);
      applyCoordsVisible();
      const cb = document.querySelector('.gcct-dlg input[data-a=coords]');
      if (cb) cb.checked = !!on;
    }
    function applyCoordsVisible() {
      const ce = toolsUi && toolsUi.coordEl;
      if (ce) ce.style.display = state.showCoords === false ? 'none' : '';
    }

    const toolsUi = addTools(L, { openDialog, closeDialog, fillHeight, openSettings, setCoordsVisible, siteRightClick: () => !!state.siteRightClick,
      favSettings: () => ({ show: state.favShow !== false, min: state.favMin ?? 10 }),
      dtSettings: () => ({ show: state.dtShow !== false }),
      ftfSettings: () => ({ show: state.ftfShow !== false }),
      setFtfShow: on => {
        state.ftfShow = !!on;
        save(STORE_STATE, state);
        const cb = document.querySelector('.gcct-dlg input[data-a=ftfshow]');
        if (cb) cb.checked = !!on;
        if (window.__gcctRefreshFav) window.__gcctRefreshFav();
      },
      setDtShow: on => {
        state.dtShow = !!on;
        save(STORE_STATE, state);
        const cb = document.querySelector('.gcct-dlg input[data-a=dtshow]');
        if (cb) cb.checked = !!on;
        if (window.__gcctRefreshFav) window.__gcctRefreshFav();
      },
      // The toolbar's heart button: the same setting as the checkbox in Settings.
      setFavShow: on => {
        state.favShow = !!on;
        save(STORE_STATE, state);
        const cb = document.querySelector('.gcct-dlg input[data-a=favshow]');
        if (cb) cb.checked = !!on;
        if (window.__gcctRefreshFav) window.__gcctRefreshFav();
      } });
    applyCoordsVisible();
    window.__gcctSiteButtons = () => {
      const mr = map.getContainer().getBoundingClientRect();
      return [...siteButtonCandidates()].map(el => {
        const r = el.getBoundingClientRect(), status = floatingReason(el);
        return { d: Math.abs(mr.right - r.right), status,
          line: `${classifySiteButton(el) || '?'} | ${status} | ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} | `
            + el.outerHTML.replace(/\s+/g, ' ').replace(/ data-dashlane-[a-z]+="[^"]*"/g, '').slice(0, 150) };
      }).filter(x => !/^(too big|not visible|outside the map)/.test(x.status))
        .sort((a, b) => a.d - b.d).slice(0, 15).map(x => x.line);
    };

    // --- One toolbar ------------------------------------------------------------
    // Our layer button, our tools and the site's own small map buttons all live in one "dock" control.
    // Site buttons we duplicate (zoom, locate) are hidden; site buttons we don't (e.g. its map-style
    // button) are moved into the bottom section and keep working – only their container is moved.
    const Dock = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        if (this._el) return this._el;               // the same element when moved to the other side
        const d = this._el = L.DomUtil.create('div', 'gcct-dock leaflet-control');
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.disableScrollPropagation(d);
        return d;
      },
    });
    // Where the toolbar goes: right / left side (vertical), or centred at the top / bottom (horizontal).
    // On the left it is glued to a side panel over the map (e.g. /play/map's search panel); at the top
    // and bottom it is centred in the part of the map that panel leaves free.
    let leftPanelEl = null, lastPanelOff = -1, glueFrame = 0;
    const TB_CORNER = { right: 'topright', left: 'topleft', top: 'topcenter', bottom: 'bottomcenter' };
    const tbCorner = () => TB_CORNER[state.tbSide] || 'topright';
    const tbOnLeft = () => tbCorner() === 'topleft';
    const tbCentred = () => /center$/.test(tbCorner());
    // Leaflet has no centred corners: two of our own, inside its control container.
    function cornerEl(pos) {
      if (map._controlCorners && map._controlCorners[pos]) return map._controlCorners[pos];
      const v = pos.startsWith('top') ? 'top' : 'bottom', h = pos.slice(v.length);
      const root = map.getContainer();
      if (h !== 'center') return root.querySelector(`.leaflet-${v}.leaflet-${h}`);
      let c = root.querySelector(`.gcct-center.leaflet-${v}`);
      if (!c) {
        c = document.createElement('div');
        c.className = `leaflet-${v} gcct-center`;
        (root.querySelector('.leaflet-control-container') || root).appendChild(c);
      }
      return c;
    }
    // Leaflet only knows its four corners: start there, applyToolbarLayout moves it to a centred one.
    const dockCtl = new Dock({ position: tbCentred() ? 'topright' : tbCorner() });
    const dock = dockCtl.addTo(map).getContainer();
    function applyToolbarLayout(initial) {
      const pos = tbCorner(), left = tbOnLeft(), horiz = tbCentred();
      dock.classList.toggle('left', left);
      dock.classList.toggle('horiz', horiz);
      dock.classList.toggle('bottom', state.tbSide === 'bottom');
      dock.classList.toggle('cols2', state.tbCols === 2);
      dock.style.marginLeft = dock.style.marginRight = dock.style.marginTop = '';
      map.getContainer().querySelectorAll('.gcct-center').forEach(c => { c.style.paddingLeft = ''; });
      lastPanelOff = -1;
      // Move the same element into the other corner (keeps everything inside it working).
      const corner = cornerEl(pos);
      if (corner && dock.parentElement !== corner) {
        ctl._box.classList.remove('open');
        corner.insertBefore(dock, corner.firstChild);
        dockCtl.options.position = pos;
      }
      if (!initial) layoutControls();
    }
    applyToolbarLayout(true);
    // Toolbar icons in the site's own green: read from its "Search geocaches" button when there is one.
    function siteGreen() {
      try {
        const el = [...document.querySelectorAll('a, button')].find(b => /^\s*search geocaches\s*$/i.test(b.textContent || ''));
        const c = el && getComputedStyle(el).color, m = c && c.match(/\d+/g);
        if (!m || m.length < 3) return;
        const [r, g, b] = m.map(Number);
        if (!(g > r + 30 && g > b)) return;                         // only a green colour
        dock.style.setProperty('--tb-ink', `rgb(${r},${g},${b})`);
        dock.style.setProperty('--tb-ink-h', `rgb(${Math.round(r * 0.75)},${Math.round(g * 0.75)},${Math.round(b * 0.75)})`);
      } catch (e) { /* keep the default green */ }
    }
    [500, 3000].forEach(ms => setTimeout(siteGreen, ms));
    // Drag the toolbar by its grip to another edge of the map: the nearest edge is shown while dragging.
    const grip = document.createElement('div');
    grip.className = 'gcct-grip';
    grip.innerHTML = icon('grip', 14);
    grip.title = T('Drag to move the toolbar to another edge');
    dock.appendChild(grip);
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, mapEl = map.getContainer();
      const zone = document.createElement('div');
      zone.className = 'gcct-dropzone';
      mapEl.appendChild(zone);
      dock.classList.add('dragging');
      ctl._box.classList.remove('open');
      let target = state.tbSide || 'right';
      // Find the site's side panel now: while the toolbar is on the right nobody has looked for it yet.
      try { leftPanelEl = findLeftPanel(mapEl.getBoundingClientRect()) || leftPanelEl; } catch (err) { /* ignore */ }
      const nearest = (x, y) => {
        const r = mapEl.getBoundingClientRect(), off = panelOffsetOf(leftPanelEl, r);
        const d = { left: x - (r.left + off), right: r.right - x, top: y - r.top, bottom: r.bottom - y };
        // Left and right edges only count in the outer quarter; otherwise top or bottom by height.
        if (d.left < (r.width - off) * 0.25) return 'left';
        if (d.right < (r.width - off) * 0.25) return 'right';
        return d.top < d.bottom ? 'top' : 'bottom';
      };
      const showZone = side => {
        const r = mapEl.getBoundingClientRect(), off = panelOffsetOf(leftPanelEl, r), w = r.width - off, s = zone.style;
        const z = { left: [off + 6, 6, 70, r.height - 12], right: [r.width - 76, 6, 70, r.height - 12],
          top: [off + w * 0.2, 6, w * 0.6, 70], bottom: [off + w * 0.2, r.height - 76, w * 0.6, 70] }[side];
        s.left = z[0] + 'px'; s.top = z[1] + 'px'; s.width = z[2] + 'px'; s.height = z[3] + 'px';
      };
      showZone(target);
      const move = ev => {
        dock.style.transform = `translate(${ev.clientX - sx}px,${ev.clientY - sy}px)`;
        target = nearest(ev.clientX, ev.clientY);
        showZone(target);
      };
      const up = () => {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', up, true);
        zone.remove();
        dock.classList.remove('dragging');
        dock.style.transform = '';
        if (target !== state.tbSide) {
          state.tbSide = target;
          save(STORE_STATE, state);
          applyToolbarLayout();
          const sel = document.querySelector('.gcct-dlg select[data-a=tbside]');
          if (sel) sel.value = target;
        }
      };
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
    });
    const siteSlot = document.createElement('div');
    siteSlot.className = 'gcct-site';
    dock.appendChild(ctl._box);
    if (toolsUi && toolsUi.barEl) dock.appendChild(toolsUi.barEl);
    dock.appendChild(siteSlot);

    function adoptSiteControls() {
      map.getContainer().querySelectorAll('.leaflet-control-container .leaflet-control').forEach(c => {
        if (c === dock || dock.contains(c) || c.closest('.gcct-coord') || c.classList.contains('gcct-coord')) return;
        if (c.matches('.leaflet-control-attribution, .leaflet-control-scale')) return;
        if (c.querySelector('input, select, textarea')) return;            // search boxes etc. stay where they are
        const r = c.getBoundingClientRect();
        if (r.width > 64 || r.height > 260) return;                          // only small button-style controls
        siteSlot.appendChild(c);
      });
      // The site's own zoom and "find my location" controls duplicate ours: hide them outright, by their
      // Leaflet / Groundspeak class names, wherever the toolbar is (unless the site's buttons are wanted).
      dock.classList.toggle('dupes-off', !state.showSiteSwitcher);
      if (!state.showSiteSwitcher) siteSlot.querySelectorAll(':scope > .leaflet-control-zoom, :scope > [class*="findmylocation" i], :scope > .leaflet-control-locate').forEach(markHidden);
      const visible = [...siteSlot.children].some(ch => ch.offsetWidth > 0 && ch.offsetHeight > 0);
      siteSlot.style.display = visible ? '' : 'none';
      dock.classList.toggle('no-site', !visible);
    }

    // Measure what's really on screen and move a group of our controls clear of the site's buttons:
    // down, past things along the top edge (e.g. "Create Route"), otherwise sideways to the left.
    // On the left side: the width of a side panel lying over the map's left edge (e.g. /play/map's
    // "Search for geocaches"), so the toolbar sits right beside it. Found by looking at what is on top
    // at a few points just inside the map's left edge.
    
    function leftPanelOffset() {
      try {
        const mr = map.getContainer().getBoundingClientRect();
        leftPanelEl = findLeftPanel(mr);
        return panelOffsetOf(leftPanelEl, mr);
      } catch (e) { return 0; }
    }
    const ourUi = el => !!(el.closest && el.closest('.gcct-dock, .gcct-dlg, .gcct-coord, .gcct-toast, .gcct-dropzone, .leaflet-popup, .leaflet-control-container'));
    function panelOffsetOf(el, mr) {
      if (!el || !el.isConnected) return 0;
      if (document.fullscreenElement && !document.fullscreenElement.contains(el)) return 0;   // hidden in full screen
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= mr.left + 8) return 0;
      // A closed panel may stay in place, only faded out or made invisible.
      if (!panelShown(el)) return 0;
      // Only while it really lies on top of the map: a collapsed panel may still be there, behind it.
      const y = Math.max(mr.top, r.top) + (Math.min(mr.bottom, r.bottom) - Math.max(mr.top, r.top)) / 2;
      const x = Math.max(mr.left + 4, r.right - Math.min(60, r.width / 2));
      const top = (document.elementsFromPoint(x, y) || []).find(q => !ourUi(q));
      const mapEl = map.getContainer();
      // On top of the map there: the panel itself, something inside it, or a wrapper around it (not the page).
      if (!top || top === mapEl || mapEl.contains(top)) return 0;
      if (!(el === top || el.contains(top) || (top.contains(el) && !top.contains(mapEl)))) return 0;
      return Math.max(0, Math.round(r.right - mr.left));
    }
    function panelShown(el) {
      try {
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        for (let q = el; q && q !== document.body; q = q.parentElement) {
          const cs = getComputedStyle(q);
          if (+cs.opacity < 0.1 || cs.visibility === 'hidden' || cs.display === 'none') return false;
        }
      } catch (e) { /* assume shown */ }
      return true;
    }
    function findLeftPanel(mr) {
      {
        const mapEl = map.getContainer();
        let right = mr.left, best = null;
        [0.3, 0.5, 0.7].forEach(f => {
          const x = mr.left + 4, y = mr.top + mr.height * f;
          let below = false;                         // stop at the map: what lies under it doesn't count
          (document.elementsFromPoint(x, y) || []).forEach(el => {
            if (below || ourUi(el)) return;
            if (el === mapEl || mapEl.contains(el)) { below = true; return; }
            if (el === document.body || el === document.documentElement || el.contains(mapEl)) return;
            if (el.closest('.leaflet-pane, .gcct-dock, .gcct-dlg, .gcct-coord, .gcct-toast, .leaflet-popup')) return;
            const r = el.getBoundingClientRect();
            if (r.height < mr.height * 0.35 || r.width > mr.width * 0.7 || r.left > mr.left + 20 || r.right <= mr.left + 8) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.pointerEvents === 'none') return;
            if (r.right > right) { right = r.right; best = el; }
          });
        });
        return best;
      }
    }
    // Is the map drawn on top of this element (at the middle of the part that lies over the map)?
    function coveredByMap(el, root, mr) {
      try {
        const q = el.getBoundingClientRect();
        const x = (Math.max(q.left, mr.left) + Math.min(q.right, mr.right)) / 2, y = (Math.max(q.top, mr.top) + Math.min(q.bottom, mr.bottom)) / 2;
        const top = (document.elementsFromPoint(x, y) || []).find(t => !ourUi(t));
        return !!top && (top === root || root.contains(top)) && !(el === top || el.contains(top));
      } catch (e) { return false; }
    }
    // The site's (and other scripts') buttons that our controls must not cover, as screen rectangles.
    function collectObstacles(els) {
      const mine = el => !!(el.closest && el.closest('.gcct, .gcct-bar, .gcct-coord, .gcct-dlg, .gcct-toast, .gcct-dock'));
      const root = map.getContainer(), scope = root.parentElement || root;
      // Anything clickable on top of the map counts – also links styled as buttons (e.g. "Search geocaches")
      // and controls the site places outside the map element itself.
      const mr = root.getBoundingClientRect();
      return [...document.querySelectorAll('.leaflet-control, button, a, [role="button"], [class*="zoom" i], [class*="control" i]')]
        .filter(el => { const q = el.getBoundingClientRect(); return q.right > mr.left && q.left < mr.right && q.bottom > mr.top && q.top < mr.bottom; })
        .filter(el => !el.contains(root))
        .filter(el => !mine(el) && !(el.closest && el.closest('.leaflet-pane, .leaflet-control-scale, .leaflet-control-attribution')) && !els.some(o => el.contains(o) || o.contains(el)))
        // In full screen only what is inside the full-screen map is on screen; the rest of the page is not in the way.
        .filter(el => !document.fullscreenElement || document.fullscreenElement.contains(el))
        // Things we've hidden or made invisible (e.g. the site's style button) are not in the way.
        .filter(el => !el.closest('[data-gcct-hidden], [data-gcct-proxied]'))
        .filter(el => {   // a container whose buttons are all hidden/invisible now is empty space
          if (!el.querySelector('[data-gcct-hidden], [data-gcct-proxied]')) return true;
          return [...el.querySelectorAll('button, a, [role="button"]')].some(b => !b.closest('[data-gcct-hidden], [data-gcct-proxied]'));
        })
        .filter(el => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : getComputedStyle(el).visibility !== 'hidden')
        // Only what is really on top of the map: a closed side panel's buttons may still lie there, under it.
        .filter(el => root.contains(el) || !coveredByMap(el, root, mr))
        .map(el => { const q = el.getBoundingClientRect(); q.__el = el; return q; })
        .filter(r => r.width > 0 && r.height > 0 && r.width < 300 && r.height < 500);
    }
    // gcctDockDebug() in the console: what the toolbar placement sees (element names and positions only).
    window.gcctDockDebug = function () {
      const R = r => r && [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
      const name = el => el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) : null;
      const mr = map.getContainer().getBoundingClientRect(), d = dock.getBoundingClientRect();
      const root = map.getContainer();
      const els = [...document.querySelectorAll('.leaflet-control, button, a, [role="button"], [class*="zoom" i], [class*="control" i]')]
        .filter(el => { const q = el.getBoundingClientRect(); return q.width && q.right > mr.left && q.left < mr.right && q.bottom > d.top - 8 && q.top < d.bottom + 8; });
      const out = { side: state.tbSide, window: [innerWidth, innerHeight], map: R(mr), visibleMap: Object.values(visibleMapRect()).map(Math.round),
        dock: R(d), dockParent: name(dock.parentElement), parentPaddingLeft: dock.parentElement && dock.parentElement.style.paddingLeft,
        translate: dock.style.translate, leftPanel: name(leftPanelEl), leftPanelRect: leftPanelEl && R(leftPanelEl.getBoundingClientRect()),
        panelOffset: panelOffsetOf(leftPanelEl, mr), foundPanelNow: name(findLeftPanel(mr)),
        panelStyle: leftPanelEl && (() => { const cs = getComputedStyle(leftPanelEl); return { opacity: cs.opacity, visibility: cs.visibility, transform: cs.transform, pointerEvents: cs.pointerEvents, shown: panelShown(leftPanelEl) }; })(),
        obstacles: collectObstacles([dock]).map(R),
        inDockRow: els.slice(0, 25).map(el => ({ el: name(el), rect: R(el.getBoundingClientRect()), insideMap: root.contains(el), underMap: !root.contains(el) && coveredByMap(el, root, mr) })) };
      console.log('[gcct] dock', out);
      return out;
    };
    // The part of the map that is actually on screen (the map element can reach below the window).
    function visibleMapRect() {
      const r = map.getContainer().getBoundingClientRect();
      return { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, document.documentElement.clientWidth), bottom: Math.min(r.bottom, window.innerHeight) };
    }
    // The toolbar as near the middle of its edge as possible – vertically on the left and right,
    // sideways at the top and bottom (of the visible map, beside a side panel) – without covering
    // any other control. Returns false if there is no free spot along the edge.
    function placeDock() {
      const side = state.tbSide || 'right', vertical = side === 'left' || side === 'right';
      const vr = visibleMapRect(), gap = 8;
      dock.style.translate = '';
      dock.style.marginRight = '';
      dock.style.marginTop = vertical ? '10px' : '';
      // At the top and bottom the toolbar's row starts beside the side panel: set that first, so the
      // position below is measured from where the row really begins.
      if (!vertical && dock.parentElement) {
        const off0 = panelOffsetOf(leftPanelEl, map.getContainer().getBoundingClientRect());
        dock.parentElement.style.paddingLeft = off0 + 'px';
      }
      if (side === 'left') dock.style.marginLeft = 10 + leftPanelOffset() + 'px'; else dock.style.marginLeft = '';
      // One row that doesn't fit (a narrow window, or beside an open side panel): two rows instead, for now.
      if (state.tbCols !== 2) {
        dock.classList.remove('cols2');
        const r1 = dock.getBoundingClientRect();
        const mapLeft = map.getContainer().getBoundingClientRect().left;
        const avail = vertical ? vr.bottom - vr.top - 20
          : vr.right - Math.max(vr.left, mapLeft + panelOffsetOf(leftPanelEl, map.getContainer().getBoundingClientRect())) - 20;
        if (r1.width && (vertical ? r1.height : r1.width) > avail) dock.classList.add('cols2');
      }
      const r = dock.getBoundingClientRect();
      if (!r.width || !r.height) return true;
      const obs = collectObstacles([dock]);
      const best = (c, min, max, size, blocks) => {
        if (max < min) return null;
        const clamp = p => Math.max(min, Math.min(max, p));
        const free = p => blocks.every(([a, b]) => p >= b || p + size <= a);
        const cands = [clamp(c), ...blocks.flatMap(([a, b]) => [clamp(a - size), clamp(b)])].filter(free);
        return cands.length ? cands.reduce((x, y) => (Math.abs(y - c) < Math.abs(x - c) ? y : x)) : null;
      };
      if (vertical) {
        const blocks = obs.filter(o => o.left < r.right + gap && o.right > r.left - gap).map(o => [o.top - gap, o.bottom + gap]);
        const min = vr.top + 10, max = vr.bottom - 10 - r.height;
        const top = best(vr.top + (vr.bottom - vr.top - r.height) / 2, min, max, r.height, blocks);
        if (top == null) return false;
        dock.style.marginTop = Math.round(10 + top - r.top) + 'px';
      } else {
        const off = panelOffsetOf(leftPanelEl, map.getContainer().getBoundingClientRect());
        const blocks = obs.filter(o => o.top < r.bottom + gap && o.bottom > r.top - gap).map(o => [o.left - gap, o.right + gap]);
        const min = Math.max(vr.left, map.getContainer().getBoundingClientRect().left + off) + 10, max = vr.right - 10 - r.width;
        const left = best(min + (max - min) / 2, min, max, r.width, blocks);
        if (left == null) return false;
        if (Math.round(left - r.left)) dock.style.translate = `${Math.round(left - r.left)}px 0`;
      }
      return true;
    }
    function layoutGroup(els, allowDown, left) {
      els = els.filter(Boolean);
      if (!els.length) return;
      const base = left ? leftPanelOffset() : 0;
      els.forEach(el => { el.style.marginRight = ''; el.style.marginLeft = left ? 10 + base + 'px' : ''; el.style.marginTop = ''; });
      const mine = el => !!(el.closest && el.closest('.gcct, .gcct-bar, .gcct-coord, .gcct-dlg, .gcct-toast, .gcct-dock'));
      const box = () => {
        const rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
        return rs.length ? { left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)),
          top: Math.min(...rs.map(r => r.top)), bottom: Math.max(...rs.map(r => r.bottom)) } : null;
      };
      const obstacles = collectObstacles(els);
      let shiftX = 0, shiftY = 0;
      for (let i = 0; i < 6; i++) {                 // each move may reveal the next obstacle
        const ours = box();
        if (!ours) return;
        const hits = obstacles.filter(r => r.left < ours.right && r.right > ours.left && r.top < ours.bottom && r.bottom > ours.top);
        if (!hits.length) break;
        const topHits = allowDown ? hits.filter(r => r.top <= ours.top + 24) : [];
        if (topHits.length) {
          shiftY += Math.max(...topHits.map(r => r.bottom - ours.top)) + 8;
          els[0].style.marginTop = 10 + shiftY + 'px';                 // 10 px = Leaflet's normal margin
        } else {
          shiftX += Math.max(...hits.map(r => left ? r.right - ours.left : ours.right - r.left)) + 8;
          els.forEach(el => { el.style[left ? 'marginLeft' : 'marginRight'] = 10 + (left ? base : 0) + shiftX + 'px'; });
        }
      }
    }
    // The scan is only repeated when the page's controls change (count of buttons and controls, window
    // size, panel open/closed), plus a few times while the page is loading.
    const t0 = Date.now();
    let layoutSig = '';
    function layoutIfChanged() {
      const scope = map.getContainer().parentElement || map.getContainer();
      const sig = [scope.getElementsByTagName('button').length, scope.querySelectorAll('[role="button"], .leaflet-control').length,
        innerWidth, innerHeight, ctl._box.classList.contains('open')].join('|');
      if (sig === layoutSig && Date.now() - t0 > 15000) return;
      layoutSig = sig;
      layoutControls();
    }
    // A toolbar at the bottom that would cover the coordinate readout: the readout moves to the top left
    // (beside a side panel, if any), and back to the bottom right for any other toolbar position.
    let coordHome = null;
    function fixCoordOverlap() {
      const ce = toolsUi && toolsUi.coordEl;
      if (!ce) return;
      if (!coordHome && ce.parentElement) coordHome = ce.parentElement;
      const cr = ce.parentElement === coordHome && coordHome.querySelector(':scope > .leaflet-control-attribution');
      if (cr && (cr.compareDocumentPosition(ce) & Node.DOCUMENT_POSITION_FOLLOWING)) coordHome.insertBefore(ce, cr);
      let up = false;
      if (state.tbSide === 'bottom') {
        const mr = map.getContainer().getBoundingClientRect(), b = dock.getBoundingClientRect();
        const w = ce.getBoundingClientRect().width;
        up = b.width > 0 && b.right > mr.right - 10 - w - 8;      // where the readout sits in its own corner
      }
      const want = up ? cornerEl('topleft') : coordHome;
      if (want && ce.parentElement !== want) {
        // Back in its own corner: above the map credits, which always stay at the very bottom.
        const credits = want === coordHome && want.querySelector(':scope > .leaflet-control-attribution');
        if (credits) want.insertBefore(ce, credits); else want.appendChild(ce);
        ce.style.marginLeft = '';
      }
      ce.style.marginBottom = '';
      if (up) ce.style.marginLeft = 10 + panelOffsetOf(leftPanelEl, map.getContainer().getBoundingClientRect()) + 'px';
    }
    function layoutControls() {
      try {
        adoptSiteControls();
        hideSiteZoom();
        adoptSiteControls();                          // re-check visibility after hiding duplicates
        if (!placeDock()) layoutGroup([dock], state.tbSide !== 'bottom', tbOnLeft());
        syncLinesSelect();
        lastDockSig = dockSig();
        if (!(toolsUi && toolsUi.coordEl && toolsUi.coordEl.parentElement === cornerEl('topleft'))) layoutGroup([toolsUi && toolsUi.coordEl], false);
        fixCoordOverlap();
      } catch (e) { console.error('[gcct] layout failed', e); }
    }
    [0, 700, 2000, 5000, 10000].forEach(t => setTimeout(layoutControls, t));
    setInterval(layoutIfChanged, 3000);             // the site's own panels come and go
    // On the left side the toolbar is glued to the site's side panel: its edge is read every frame
    // (cheap), and the panel itself is looked up again twice a second or when it goes away.
    glueFrame = 0;
    // On the left and right the toolbar is centred vertically (like top/bottom are centred sideways),
    // but never higher than the site's own buttons allow.
    // Placed again whenever the visible map, the toolbar's size or the side panel changes.
    let lastDockSig = '';
    function dockSig() {
      const v = visibleMapRect();
      return [state.tbSide, Math.round(v.left), Math.round(v.top), Math.round(v.right), Math.round(v.bottom), dock.offsetWidth, dock.offsetHeight,
        panelOffsetOf(leftPanelEl, map.getContainer().getBoundingClientRect())].join('|');
    }
    (function glue() {
      requestAnimationFrame(glue);
      try { if (dockSig() !== lastDockSig && !dock.classList.contains('dragging')) layoutControls(); } catch (e) { /* ignore */ }
      if (!tbOnLeft() && !tbCentred()) { lastPanelOff = -1; return; }
      try {
        const mr = map.getContainer().getBoundingClientRect();
        glueFrame++;
        const gone = !leftPanelEl || !leftPanelEl.isConnected || panelOffsetOf(leftPanelEl, mr) === 0;
        if (glueFrame % 30 === 0 || (gone && glueFrame % 6 === 0)) {
          const found = findLeftPanel(mr);
          if (found || !leftPanelEl || !leftPanelEl.isConnected) leftPanelEl = found;
        }
        const off = panelOffsetOf(leftPanelEl, mr);
        if (off === lastPanelOff) return;
        if (tbCentred()) {                                  // centre in the free part of the map
          lastPanelOff = off;
          if (dock.parentElement) dock.parentElement.style.paddingLeft = off + 'px';
          fixCoordOverlap();
          return;
        }
        const delta = off - (lastPanelOff < 0 ? off : lastPanelOff);
        lastPanelOff = off;
        const cur = parseFloat(dock.style.marginLeft) || 10;
        dock.style.marginLeft = Math.max(10, cur + delta) + 'px';
        if (!delta) layoutControls();
      } catch (e) { /* ignore */ }
    })();
    window.addEventListener('resize', layoutControls);
    map.on('resize', layoutControls);
    applySwitcherVisibility();
    setTimeout(applySwitcherVisibility, 1500);   // the site may add its switcher a little later

    // Restore last session
    if (state.base && findDef(state.base)) setBase(state.base);
    else state.base = null;
    state.overlays = state.overlays.filter(id => findDef(id));
    state.overlays.forEach(id => show(id, true));
    arrange();
  }

  // ===========================================================================
  // Geodesy helpers (WGS84 / EUREF89)
  // ===========================================================================
  const RAD = Math.PI / 180;
  const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), EP2 = E2 / (1 - E2), K0 = 0.9996;
  const BANDS = 'CDEFGHJKLMNPQRSTUVWXX';

  // Transverse Mercator with the Krüger series to 6th order (as used by PROJ): accurate to about a
  // millimetre even far outside a zone, so fixed zones (32/33/35) are correct all over Norway.
  const TM = (() => {
    const n = F / (2 - F), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
    const Ahat = A / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
    const alpha = [0,
      n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180 - 127 * n5 / 288 + 7891 * n6 / 37800,
      13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440 + 281 * n5 / 630 - 1983433 * n6 / 1935360,
      61 * n3 / 240 - 103 * n4 / 140 + 15061 * n5 / 26880 + 167603 * n6 / 181440,
      49561 * n4 / 161280 - 179 * n5 / 168 + 6601661 * n6 / 7257600,
      34729 * n5 / 80640 - 3418889 * n6 / 1995840,
      212378941 * n6 / 319334400];
    const beta = [0,
      n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360 - 81 * n5 / 512 + 96199 * n6 / 604800,
      n2 / 48 + n3 / 15 - 437 * n4 / 1440 + 46 * n5 / 105 - 1118711 * n6 / 3870720,
      17 * n3 / 480 - 37 * n4 / 840 - 209 * n5 / 4480 + 5569 * n6 / 90720,
      4397 * n4 / 161280 - 11 * n5 / 504 - 830251 * n6 / 7257600,
      4583 * n5 / 161280 - 108847 * n6 / 3991680,
      20648693 * n6 / 638668800];
    const delta = [0,
      2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45 + 26 * n5 / 45 - 2854 * n6 / 675,
      7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45 + 2704 * n5 / 315 + 2323 * n6 / 945,
      56 * n3 / 15 - 136 * n4 / 35 - 1262 * n5 / 105 + 73814 * n6 / 2835,
      4279 * n4 / 630 - 332 * n5 / 35 - 399572 * n6 / 14175,
      4174 * n5 / 315 - 144838 * n6 / 6237,
      601676 * n6 / 22275];
    return { Ahat, alpha, beta, delta, e: Math.sqrt(E2) };
  })();

  function toUTM(lat, lon, zone) {
    zone = zone || Math.floor((lon + 180) / 6) + 1;
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const phi = lat * RAD, lam = (lon - lon0) * RAD, s = Math.sin(phi);
    const t = Math.sinh(Math.atanh(s) - TM.e * Math.atanh(TM.e * s));
    const xi1 = Math.atan2(t, Math.cos(lam)), eta1 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let xi = xi1, eta = eta1;
    for (let j = 1; j <= 6; j++) {
      xi += TM.alpha[j] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
      eta += TM.alpha[j] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
    }
    const e = 500000 + K0 * TM.Ahat * eta;
    let nn = K0 * TM.Ahat * xi;
    if (lat < 0) nn += 1e7;
    return { zone, band: BANDS[Math.max(0, Math.min(20, Math.floor((lat + 80) / 8)))], e, n: nn };
  }

  function fromUTM(zone, e, n, south) {
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const xi = (south ? n - 1e7 : n) / (K0 * TM.Ahat), eta = (e - 500000) / (K0 * TM.Ahat);
    let xi1 = xi, eta1 = eta;
    for (let j = 1; j <= 6; j++) {
      xi1 -= TM.beta[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      eta1 -= TM.beta[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
    let phi = chi;
    for (let j = 1; j <= 6; j++) phi += TM.delta[j] * Math.sin(2 * j * chi);
    const lam = Math.atan2(Math.sinh(eta1), Math.cos(xi1));
    return [phi / RAD, lon0 + lam / RAD];
  }

  const pad = (v, w) => String(v).padStart(w, '0');
  function fmtDMM(lat, lon) {
    const f = (v, pos, neg, w) => {
      const h = v < 0 ? neg : pos; v = Math.abs(v);
      let d = Math.floor(v), m = (v - d) * 60;
      if (m.toFixed(3) === '60.000') { d++; m = 0; }
      return `${h} ${pad(d, w)}° ${m.toFixed(3).padStart(6, '0')}`;
    };
    return `${f(lat, 'N', 'S', 2)} ${f(lon, 'E', 'W', 3)}`;
  }
  function fmtDMS(lat, lon) {
    const f = (v, pos, neg) => {
      const h = v < 0 ? neg : pos; v = Math.abs(v);
      const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
      return `${h} ${d}° ${pad(m, 2)}′ ${s.toFixed(1).padStart(4, '0')}″`;
    };
    return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
  }
  const fmtDD = (lat, lon) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  function fmtUTM(lat, lon, zone) {
    const u = toUTM(lat, lon, zone);
    return `${u.zone}${u.band} ${Math.round(u.e)}E ${Math.round(u.n)}N`;
  }
  const FORMATS = [
    ['DMM', fmtDMM], ['DD', fmtDD], ['DMS', fmtDMS],
    ['UTM', (a, b) => fmtUTM(a, b)], ['UTM 32', (a, b) => fmtUTM(a, b, 32)], ['UTM 33', (a, b) => fmtUTM(a, b, 33)],
    ['UTM 35', (a, b) => fmtUTM(a, b, 35)],
  ];

  // Accepts DD, DMM, DMS (with or without N/S/E/W) or UTM "32V 576000 6672000".
  function parseCoord(str) {
    const s = str.trim().toUpperCase().replace(/[°'"′″,;]/g, ' ');
    const utm = s.match(/^(\d{1,2})\s*([C-X])?\s+(\d{5,7}(?:\.\d+)?)\s*E?\s+(\d{6,8}(?:\.\d+)?)\s*N?$/);
    if (utm) {
      const [lat, lon] = fromUTM(+utm[1], +utm[3], +utm[4], utm[2] && utm[2] < 'N');
      return [lat, lon];
    }
    const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (![2, 4, 6].includes(nums.length)) return null;
    const k = nums.length / 2;
    const toDeg = arr => arr.reduce((acc, v, i) => acc + Math.abs(v) / 60 ** i, 0) * (arr[0] < 0 ? -1 : 1);
    let lat = toDeg(nums.slice(0, k)), lon = toDeg(nums.slice(k));
    if (/S/.test(s)) lat = -Math.abs(lat);
    if (/\bW|W\s*\d|\d\s*W|V\s*\d/.test(s)) lon = -Math.abs(lon);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  }

  function bearing(a, b) {
    const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  function projectPoint(p, brg, dist) {
    const R = 6371008.8, d = dist / R, th = brg * RAD, p1 = p.lat * RAD, l1 = p.lng * RAD;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
    const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 / RAD, ((l2 / RAD + 540) % 360) - 180];
  }
  const fmtDist = m => m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;

  // ===========================================================================
  // Map tools
  // ===========================================================================
  function addTools(L, api) {
    const tools = L.layerGroup().addTo(map);
    const ACCENT = '#e6007e';

    const css = document.createElement('style');
    css.textContent = UI_TOKENS + `
      .gcct-coord{background:rgba(255,255,255,.96);padding:5px 11px;border-radius:var(--rc);font:12.5px/1.4 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
        box-shadow:var(--shadow-s);cursor:pointer;white-space:nowrap;color:var(--ink);transition:background .12s}
      .gcct-coord:hover{background:#fff}
      .gcct-coord{cursor:default}
      .gcct-coord .ctext{cursor:pointer}
      .gcct-coord .zrow{display:flex;align-items:center;gap:6px;margin:0 0 3px;padding:0 0 3px;border-bottom:1px solid var(--line);
        font:600 11px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--muted);cursor:default}
      .gcct-coord .zin{width:48px;height:auto;margin:0;padding:1px 4px;border:1px solid var(--line2);border-radius:5px;background:#fff;color:var(--ink);
        font:12.5px/1.3 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;box-shadow:none}
      .gcct-coord .zin:focus{outline:0;border-color:var(--acc);box-shadow:var(--ring)}
      .gcct-coord .zlab{display:flex;align-items:center;gap:6px;flex:1;margin:0;cursor:default}
      .gcct-coord .cx{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:-2px -6px 0 4px;border-radius:5px;color:var(--muted);cursor:pointer}
      .gcct-coord .cx:hover{background:var(--hover);color:var(--ink)}
      .gcct-bar{display:flex;flex-direction:column;background:#fff;border:0;border-radius:var(--r);overflow:hidden;
        box-shadow:var(--shadow-s);clear:both}
      .gcct-bar a{display:flex;align-items:center;justify-content:center;width:42px;height:42px;margin:0;padding:0;
        color:var(--ink);background:#fff;border:0;border-bottom:1px solid var(--line);border-radius:0;cursor:pointer;text-decoration:none;
        transition:background .15s,color .15s}
      .gcct-bar a:last-child{border-bottom:0}
      .gcct-bar a:hover{background:var(--soft);color:var(--tb-ink-h,#005e35)}
      /* Toolbar icons in the site's green. !important: Leaflet's and the site's own link colours
         (".leaflet-container a", ".leaflet-bar a") must never turn them blue or black. */
      .leaflet-container .gcct-dock .gcct-bar a:not(.active):not(.disabled),.leaflet-container .gcct-dock .gcct .gcct-btn{color:var(--tb-ink,#007d46)!important}
      .leaflet-container .gcct-dock .gcct-bar a:not(.active):not(.disabled):hover,.leaflet-container .gcct-dock .gcct .gcct-btn:hover{color:var(--tb-ink-h,#005e35)!important}
      .leaflet-container .gcct-dock .gcct-bar a svg,.leaflet-container .gcct-dock .gcct-btn svg{color:inherit!important;stroke:currentColor!important}
      .gcct-bar a:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}
      .gcct-bar a.active{background:color-mix(in srgb,var(--tb-ink,#007d46) 12%,#fff);color:var(--tb-ink,#007d46);box-shadow:inset 3px 0 0 var(--tb-ink,#007d46)}
      .leaflet-container .gcct-dock .gcct-bar a.active:not(.danger){color:var(--tb-ink,#007d46)!important}   /* on: the toolbar's green */
      .gcct-bar a.active.danger{background:var(--danger-bg);color:var(--danger);box-shadow:inset 3px 0 0 var(--danger)}
      .gcct-bar a.sep{border-top:6px solid var(--soft)}
      .gcct-bar a.disabled{color:#b6bcc3;cursor:default;background:#fff}
      .gcct-bar svg{display:block;pointer-events:none}
      .gcct-toast{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:2147483001;max-width:min(520px,90vw);
        background:#1f2328;color:#fff;padding:10px 16px;border-radius:10px;box-shadow:var(--shadow);
        font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;transition:opacity .6s;pointer-events:none}
      .gcct-results{margin:10px -6px 0;max-height:55vh;overflow:auto}
      .gcct-results .gh{font-weight:700;color:var(--muted);margin:14px 6px 4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}
      .gcct-results .gm{color:var(--muted);padding:6px 10px;font-size:13.5px}
      .gcct-results .gr{padding:8px 10px;border-radius:var(--rc);cursor:pointer;display:flex;flex-direction:column;gap:2px}
      .gcct-results .gr b{font-size:14.5px;font-weight:600;color:var(--ink)}
      .gcct-results .gr span{color:var(--muted);font-size:13px}
      .gcct-results .gr.on{background:var(--acc-bg)}
      .gcct-results em.tag{font-style:normal;font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;margin-right:6px;
        background:var(--hover);color:var(--muted)}
      .gcct-results em.tag-place{background:#dafbe1;color:#116329}
      .gcct-results em.tag-addr{background:#ddf4ff;color:#0550ae}
      .gcct-results em.tag-abroad{background:#fbefff;color:#6639ba}
      .gcct-results em.tag-gc{background:#fff1e5;color:#953800}
      .gcct-results .gm.err{color:#a40e26}
      .gcct-crosshair, .gcct-crosshair .leaflet-interactive{cursor:crosshair!important}
      .gcct-stage{display:flex!important;align-items:center;justify-content:center;border-radius:50%;background:#336699;color:#fff;
        border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);box-sizing:border-box;cursor:pointer;transition:transform .12s}
      .gcct-stage.fin{background:#1f7a34}
      .gcct-stage:hover{transform:scale(1.2)}
      .gcct-stage svg{display:block;pointer-events:none}
      .gcct-solved{display:block!important;cursor:pointer;transition:transform .12s}
      .gcct-fav{color:#d1242f;font-weight:700;white-space:nowrap}
      .gcct-favn{color:#1f2328;font-weight:700;white-space:nowrap}
      .gcct-favn .gcct-fav{font-size:1.5em;line-height:1;vertical-align:-0.1em}
      .gcct-favlbl{pointer-events:none!important}
      .gcct-favlbl span{display:inline-flex;align-items:center;gap:2px;color:#1f2328;
        font:600 11px/16px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;white-space:nowrap;
        -webkit-text-stroke:3px #fff;paint-order:stroke fill;   /* a narrow white halo, no box */
        text-shadow:0 0 1px #fff}
      .gcct-favlbl i{font-style:normal;color:#d1242f;font-size:16.5px;line-height:16px}
      .gcct-favlbl span{transform:translateX(-50%)}            /* centred over the cache icon */
      .gcct-nocache .gcct-favlbl,.gcct-nocache .gcct-dtlbl,.gcct-nocache .gcct-ftflbl{visibility:hidden!important}
      .gcct-ftflbl{pointer-events:none!important}
      .gcct-ftflbl span{display:inline-block;transform:translateY(-50%);background:#d1242f;color:#fff;border:1.5px solid #fff;border-radius:6px;
        padding:0 4px;font:800 10px/14px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.02em;box-shadow:0 1px 2px rgba(0,0,0,.35);white-space:nowrap}
      .gcct-dtlbl{pointer-events:none!important}
      .gcct-dtlbl span{display:inline-block;transform:translateX(-50%);color:#1f2328;white-space:nowrap;
        font:600 11px/14px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
        -webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 0 1px #fff}
      .leaflet-pane .gcct-popup,.leaflet-pane .gcct-popup *{pointer-events:auto}
      .gcct-solved.gcct-ghost{background:transparent!important;border:0!important;box-shadow:none!important;opacity:0}
      .gcct-solved:hover{transform:scale(1.15)}
      .gcct-solved .ic{position:absolute;left:1px;top:1px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;
        background:#fff;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.45);box-sizing:border-box;overflow:hidden}
            .gcct-solved .fb{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#336699;color:#fff;
        font:600 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
            .gcct-solved .tick{position:absolute;right:-3px;bottom:-3px;width:12px;height:12px;border-radius:50%;background:#1f7a34;color:#fff;
        border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
      .gcct-solved svg{display:block;pointer-events:none}
      .gcct-solved.sm .ic{width:18px;height:18px;border-width:1.5px;box-shadow:0 1px 3px rgba(0,0,0,.4)}
      .gcct-solved.sm .fb{font-size:11px}
      .gcct-solved.dot .ic{width:11px;height:11px;border-width:1.5px;box-shadow:0 1px 2px rgba(0,0,0,.35)}
      .gcct-label{background:rgba(255,255,255,.96);border:1px solid ${ACCENT};border-radius:6px;box-shadow:0 1px 3px rgba(16,24,40,.15);
        padding:2px 8px;font:600 12.5px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;white-space:nowrap;color:#1f2328;width:auto!important;height:auto!important}

      /* Right-click popup: Leaflet's bubble, restyled to match the panel and dialogs */
      .gcct-popup .leaflet-popup-content-wrapper{border-radius:var(--r);box-shadow:var(--shadow);padding:1px;display:flow-root}
      .gcct-popup .leaflet-popup-content{margin:12px 14px 16px}
      .gcct-popup .leaflet-popup-tip{box-shadow:0 3px 8px rgba(16,24,40,.15)}
      .gcct-popup a.leaflet-popup-close-button,.gcct-popup a.leaflet-popup-close-button:visited{display:flex!important;align-items:center;justify-content:center;top:14px;right:10px;
        width:28px;height:28px;padding:0;border:0!important;border-radius:var(--rc);box-shadow:none!important;background:transparent!important;color:var(--muted)!important;
        text-decoration:none!important;opacity:1!important;font:18px/28px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-align:center;transition:background .12s,color .12s}
      .gcct-popup a.leaflet-popup-close-button:hover,.gcct-popup a.leaflet-popup-close-button:focus-visible{background:var(--hover)!important;color:var(--ink)!important;outline:0}
      .gcct-popup a.leaflet-popup-close-button svg{display:block;flex:none}
      .gcct-pop{font:13.5px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink)}
      .gcct-pop *{box-sizing:border-box}
      .gcct-pop .r{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .gcct-pop .r.one{justify-content:flex-start;gap:10px;padding-right:38px}
      .gcct-pop .fmt{display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 8px;margin-left:-8px;border-radius:var(--rc);white-space:nowrap;user-select:none;transition:background .12s}
      .gcct-pop .fmt:hover{background:var(--soft)}
      .gcct-pop .fmt b{flex:none;min-width:52px;text-align:center;font:700 10.5px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.04em;color:var(--acc);background:var(--acc-bg);padding:0 7px;border-radius:999px}
      .gcct-pop code{display:inline-block;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:13.5px;color:var(--ink);background:none;padding:0}
      .gcct-pop button{height:auto;min-height:32px;margin:0;font:500 13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;cursor:pointer;
        padding:5px 10px;border:1px solid var(--line2);border-radius:var(--rc);background:#fff;color:var(--ink);text-align:left;white-space:nowrap;transition:background .12s,border-color .12s}
      .gcct-pop button:hover{background:var(--soft);border-color:#aab3bd}
      .gcct-pop .r button{min-height:30px;padding:3px 8px;flex:none}
      .gcct-pop button{display:inline-flex;align-items:center;gap:8px}
      .gcct-pop button svg,.gcct-dlg button svg,.gcct .act svg,.gcct .x svg{flex:none;display:block}
      .gcct-pop .r button.ic{justify-content:center;width:32px;padding:0}
      .gcct-label svg{display:inline-block;vertical-align:-2px}
      .gcct-dlg .homeline{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .gcct-pop .snap{display:flex;align-items:center;gap:8px;margin:0 34px 8px 0;padding:6px 8px 6px 10px;border-radius:var(--rc);background:var(--acc-bg);color:var(--ink);font-size:13px}
      .gcct-pop .snap svg{flex:none;color:var(--acc)}
      .gcct-pop .snap .gcct-fav{color:var(--acc)}               /* blue in the popup; red on the map */
      .gcct-pop .snap .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gcct-pop .snap a.gc{font-weight:700;color:var(--acc)!important;text-decoration:none;cursor:pointer!important;pointer-events:auto!important}
      .gcct-pop .snap a.gc:hover{text-decoration:underline}
      .gcct-pinlbl{pointer-events:none!important;width:auto!important;height:auto!important}
      .gcct-pinlbl .gcct-label{display:inline-block;transform:translateY(-100%)}
      /* The route window fits any screen: the list of caches and the route share the height there is,
         each scrolling on its own, and the buttons always stay in view. */
      .gcct-route .bd{display:flex;flex-direction:column;overflow:hidden}
      .gcct-route .bd > *{flex:none}
      .gcct-route .rt-list{flex:1 1 0;min-height:84px;max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:var(--rc);margin-bottom:10px}
      .gcct-route .rt-pv{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
      .gcct-route .rt-pv .rt-tbl{flex:1 1 auto;min-height:90px}
      .gcct-route .bd > .btns{position:static;margin-top:12px}
      @media (max-height:720px){ .gcct-route > .bd > .hint{display:none} .gcct-route .rt-h{margin-top:0} }
      @media (max-width:540px){ .gcct-route th,.gcct-route td{padding:4px!important} .gcct-route th{white-space:normal!important} .gcct-route td.rt-go{overflow-wrap:anywhere} .gcct-route td.mono{font-size:10.5px!important} .gcct-route .rt-desc{font-size:10.5px} }
      .gcct-route .rt-row{display:flex;flex-direction:column;gap:1px;padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--line)}
      .gcct-route .rt-row:last-child{border-bottom:0}
      .gcct-route .rt-row:hover{background:var(--hover)}
      .gcct-route .rt-row.in{opacity:.55;cursor:default}
      .gcct-route .rt-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      .gcct-route .rt-m{font-size:12px;color:var(--muted)}
      .gcct-route em.tag{font-style:normal;font-size:11px;font-weight:600;padding:0 6px;border-radius:999px;margin-left:4px}
      .gcct-route em.tag-place{background:#dafbe1;color:#116329}
      .gcct-route em.tag-addr{background:#ddf4ff;color:#0550ae}
      .gcct-route em.tag-abroad{background:#fbefff;color:#6639ba}
      .gcct-route .rt-full{display:inline-flex;align-items:center;gap:5px;margin-left:10px;font-size:13px;white-space:nowrap;cursor:pointer}
      .gcct-route .rt-full input{margin:0}
      .gcct-route .rt-pv-btns, .gcct-route .rt-edit-btns{flex-wrap:wrap;row-gap:8px}
      .gcct-route .rt-back{color:var(--muted)}
      .gcct-route .rt-back .rt-n{opacity:.6}
      .gcct-route .rt-pv-btns .rt-gpx{margin-left:auto}
      .gcct-route .rt-ic-place{color:#1a7f37;display:inline-flex;align-items:center;justify-content:center}
      .gcct-route .rt-sec{padding:6px 10px 4px;font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);background:var(--soft);border-bottom:1px solid var(--line)}
      .gcct-route em.tag-pin{background:#fde7f1;color:#a3165b}
      .gcct-route em.tag-solved{background:#e8f0fa;color:#336699}
      .gcct-route em.tag-found{background:#dafbe1;color:#116329}
      .gcct-route em.tag-owned{background:#fff8c5;color:#7d4e00}
      .gcct-route .rt-h{margin:4px 0 6px;font-size:14px}
      .gcct-route .rt-sum{font-weight:400;color:var(--muted);font-size:13px;margin-left:6px}
      .gcct-route .rt-route{flex:1 1 0;min-height:64px;max-height:260px;margin:0 0 4px;padding-left:0;list-style:none;overflow:auto}
      .gcct-route .rt-n{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#8250df;color:#fff;font-size:11px;font-weight:700;margin-right:4px}
      .gcct-route .rt-route li{display:flex;align-items:center;gap:4px;padding:2px 0}
      .gcct-route .rt-route li .rt-t{flex:1}
      .gcct-route .rt-route li button{border:1px solid var(--line);background:#fff;border-radius:6px;width:26px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
      .gcct-route .rt-route li button:disabled{opacity:.35;cursor:default}
      .gcct-route .rt-route li.gm{color:var(--muted)}
      .gcct-dlg.gcct-route{width:min(580px,calc(100vw - 20px))}
      .gcct-route .rt-gpx{display:inline-flex;align-items:center;gap:6px}
      .gcct-route .rt-go{cursor:pointer}
      .gcct-route .rt-ic{display:inline-block;width:18px;height:18px;vertical-align:-4px;margin-right:6px;object-fit:contain}
      .gcct-route .rt-ic-pin{color:#c52a7a;display:inline-flex;align-items:center;justify-content:center}
      .gcct-route .rt-ic-dot::before{content:"";display:block;width:10px;height:10px;margin:4px;border-radius:50%;background:#8c959f}
      .gcct-route .rt-go:hover b{text-decoration:underline}
      .gcct-route .rt-leg{color:var(--muted);font-size:11.5px;font-weight:400;white-space:nowrap}
      .gcct-route .rt-tbl{max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:var(--rc)}
      .gcct-route table{border-collapse:collapse;width:100%;font-size:12.5px}
      .gcct-route th{position:sticky;top:0;background:var(--soft);text-align:left;font-weight:600;padding:5px 6px;border-bottom:1px solid var(--line);white-space:nowrap}
      .gcct-route td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top}
      .gcct-route tr:last-child td{border-bottom:0}
      .gcct-route td.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;white-space:nowrap}
      .gcct-route .num{text-align:right;white-space:nowrap}
      .gcct-route .rt-desc{color:var(--muted);font-size:11.5px}
      .gcct-route .rt-note{margin-top:8px}
      .gcct-rtnum{pointer-events:none!important}
      .gcct-rtnum span{display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#8250df;color:#fff;
        font:700 11px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.35);box-sizing:border-box}
      .gcct-pop .snap .pinname-t{cursor:text;border-bottom:1px dashed transparent}
      .gcct-pop .snap .pinname-t:hover{border-bottom-color:var(--acc)}
      .gcct-pop .snap input.pinname{width:100%;min-width:0;box-sizing:border-box;font:600 13px/1.3 inherit;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:6px;padding:2px 6px}
      .gcct-pop .snap i{font-style:normal;color:var(--muted);cursor:help}
      .gcct-pop .snap button.lnk{flex:none;min-height:0;padding:2px 6px;border:0;background:none;color:var(--acc);text-decoration:underline;font-size:12.5px;cursor:pointer}
      .gcct-pop .snap button.lnk:hover{background:rgba(9,105,218,.08)}
      .gcct-pop .acts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}`;
    document.head.appendChild(css);

    // Leaflet sizes popups between minWidth and maxWidth (default 300 px), which is too narrow for the
    // longest coordinate formats. Allow a wider popup; its content sets the actual width.
    // Our popup lives in its own pane above everything the site draws (on /play/map a WebGL layer can
    // lie above Leaflet's normal popup pane and would take the clicks).
    let popPane = 'popupPane';
    try {
      if (map.createPane) {
        const p = (map.getPane && map.getPane('gcctPopup')) || map.createPane('gcctPopup');
        p.style.zIndex = '1500';
        p.style.pointerEvents = 'none';
        popPane = 'gcctPopup';
      }
    } catch (e) { /* the normal popup pane */ }
    const POPUP_OPTS = { className: 'gcct-popup', maxWidth: 560, minWidth: 320, pane: popPane };
    // Same line icon for the popup's close button as everywhere else.
    map.on('popupopen', e => {
      const p = e.popup, b = p && (p._closeButton || (p._container && p._container.querySelector('.leaflet-popup-close-button')));
      if (b && p.options && /gcct-popup/.test(p.options.className || '')) b.innerHTML = icon('x', 16);
    });

    // --- Cursor coordinate readout -----------------------------------------
    let fmtIdx = load('gcct.fmt', 0) % FORMATS.length;
    let lastLL = map.getCenter();
    // Next format, skipping one that would show the same text at this point (e.g. "UTM" and "UTM 32"
    // when the automatic zone is 32), so every click visibly changes the coordinates.
    function nextFormat(ll, idx) {
      const now = FORMATS[idx][1](ll.lat, ll.lng);
      for (let i = 1; i <= FORMATS.length; i++) {
        const j = (idx + i) % FORMATS.length;
        if (FORMATS[j][1](ll.lat, ll.lng) !== now) return j;
      }
      return idx;
    }
    const Coord = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const d = L.DomUtil.create('div', 'gcct-coord leaflet-control');
        // The zoom level above the coordinates – type a number (or use the arrows) to zoom.
        d.innerHTML = `<div class="zrow"><label class="zlab"><span class="zl">${T('Zoom')}</span><input class="zin" type="number" step="1" inputmode="numeric"></label>`
          + `<span class="cx" role="button" title="${esc(T('Hide the zoom and coordinates (show them again in Settings)'))}">${icon('x', 13)}</span></div><div class="ctext"></div>`;
        d.querySelector('.cx').onclick = e => { e.stopPropagation(); if (api.setCoordsVisible) api.setCoordsVisible(false); };
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.disableScrollPropagation(d);
        const c = d.querySelector('.ctext'), zi = d.querySelector('.zin');
        c.title = T('Click to switch coordinate format');
        zi.title = T('Zoom level – type a number to zoom');
        c.onclick = () => { fmtIdx = nextFormat(lastLL, fmtIdx); save('gcct.fmt', fmtIdx); updCoord(); };
        const go = () => {
          const v = Number(String(zi.value).replace(',', '.'));
          if (!isFinite(v)) { updZoom(); return; }
          const min = map.getMinZoom ? map.getMinZoom() : 0, max = map.getMaxZoom ? map.getMaxZoom() : 22;
          map.setZoom(Math.max(min, Math.min(max, Math.round(v))));
        };
        zi.addEventListener('change', go);
        zi.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); zi.blur(); } if (e.key === 'Escape') { updZoom(); zi.blur(); } });
        return d;
      },
    });
    const coordCtl = new Coord().addTo(map);
    function updCoord() {
      const [name, fn] = FORMATS[fmtIdx];
      coordCtl.getContainer().querySelector('.ctext').textContent = `${name}: ${fn(lastLL.lat, lastLL.lng)}`;
    }
    function updZoom() {
      const zi = coordCtl.getContainer().querySelector('.zin');
      if (!zi || document.activeElement === zi) return;          // don't overwrite what you are typing
      const z = map.getZoom();
      zi.value = Number.isInteger(z) ? z : z.toFixed(1);
      if (map.getMinZoom) zi.min = map.getMinZoom();
      if (map.getMaxZoom && isFinite(map.getMaxZoom())) zi.max = map.getMaxZoom();
    }
    map.on('mousemove', e => { lastLL = e.latlng; updCoord(); });
    map.on('zoomend', () => { const zi = coordCtl.getContainer().querySelector('.zin'); if (zi && document.activeElement === zi) zi.blur(); updZoom(); });
    updCoord();
    updZoom();

    // --- Helpers -----------------------------------------------------------
    const pins = [];                 // pins on the map – right-clicking one snaps to it, like to a cache
    // Pins and their name labels are only shown from zoom 12 (further out they would clutter the map).
    const PIN_MIN_ZOOM = 12;
    function showPin(m) {
      const hide = map.getZoom() < PIN_MIN_ZOOM;
      [m, m.__label].forEach(l => { const el = l && (l.getElement ? l.getElement() : l._path || l._icon); if (el) el.style.display = hide ? 'none' : ''; });
      try { if (m.setStyle) m.setStyle({ opacity: hide ? 0 : 1, fillOpacity: hide ? 0 : 1 }); } catch (e) { /* ignore */ }
    }
    map.on('zoomend', () => pins.forEach(showPin));
    function pin(ll, color = ACCENT) {
      const m = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(tools);
      pins.push(m);
      setTimeout(() => showPin(m), 0);
      m.bindPopup(() => coordPopup(m.getLatLng(), m.__pin ? { kind: 'pin', marker: m, clicked: m.getLatLng(), ll: m.getLatLng() } : null), POPUP_OPTS);
      return m;
    }
    // Named pins (set from the popup or the place search): a name label beside them, remembered for this
    // browser session (sessionStorage), and exportable as GPX waypoints – one pin or all of them.
    const PIN_KEY = 'gcct.pins';
    let pinRecs = [];
    try { pinRecs = JSON.parse(sessionStorage.getItem(PIN_KEY) || '[]') || []; } catch (e) { pinRecs = []; }
    const savePins = () => { try { sessionStorage.setItem(PIN_KEY, JSON.stringify(pinRecs)); } catch (e) { /* blocked */ } };
    const pinLabelHtml = name => `${icon('pin', 12)} ${esc(name)}`;
    function namedPin(ll, name, rec) {
      if (!rec) {
        let n = pinRecs.length + 1;
        while (pinRecs.some(r => r.name === T('Pin {n}', { n }))) n++;
        rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), name: name || T('Pin {n}', { n }), t: new Date().toISOString() };
        pinRecs.push(rec); savePins();
      }
      const m = pin(L.latLng(rec.lat, rec.lng));
      m.__pin = rec;
      m.__label = pinLabel(L.latLng(rec.lat, rec.lng), pinLabelHtml(rec.name));
      showPin(m);
      return m;
    }
    function removePin(m) {
      tools.removeLayer(m);
      if (m.__label) tools.removeLayer(m.__label);
      if (m.__pin) { pinRecs = pinRecs.filter(r => r.id !== m.__pin.id); savePins(); }
    }
    function renamePin(m, name) {
      if (!m.__pin) return;
      m.__pin.name = name.trim() || m.__pin.name;
      savePins();
      if (m.__label) { tools.removeLayer(m.__label); m.__label = pinLabel(m.getLatLng(), pinLabelHtml(m.__pin.name)); showPin(m); }
      pinRenamedInRoute(m.__pin.id, m.__pin.name);
    }
    const xmlEsc = t => String(t).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
    function downloadGpx(recs, fileName) {
      const wpts = recs.map(r => `  <wpt lat="${r.lat}" lon="${r.lng}">\n    <time>${r.t || new Date().toISOString()}</time>\n    <name>${xmlEsc(r.name)}</name>\n    <sym>Pin, Blue</sym>\n  </wpt>`).join('\n');
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Geocaching Map – Custom Tile Layers" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts}\n</gpx>\n`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
      a.download = fileName;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    const safeName = t => String(t).replace(/[^\p{L}\p{N}._ -]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'pin';
    function label(ll, html) {
      return L.marker(ll, { interactive: false, clickable: false, icon: L.divIcon({ className: 'gcct-label', html, iconSize: null, iconAnchor: [-10, 10] }) }).addTo(tools);
    }
    // A pin's name: above and to the right of the pin.
    function pinLabel(ll, html) {
      return L.marker(ll, { interactive: false, clickable: false, icon: L.divIcon({ className: 'gcct-pinlbl', html: `<span class="gcct-label">${html}</span>`, iconSize: null, iconAnchor: [-6, 5] }) }).addTo(tools);
    }
    // Circles are drawn as 180-point polygons computed on the sphere (no line simplification). That avoids L.circle,
    // whose signature differs between Leaflet 0.7 and 1.x, and is exact at any latitude.
    const circles = [];
    function geoCircle(ll, r, style) {
      const c = L.latLng(ll), pts = [];
      for (let b = 0; b < 360; b += 2) pts.push(projectPoint(c, b, r));
      return L.polygon(pts, Object.assign({ interactive: false, clickable: false, smoothFactor: 0, lineJoin: 'round' }, style));
    }
    function circle161(ll) {
      const c = L.latLng(ll);
      const poly = geoCircle(c, 161, { color: '#d00', weight: 2, opacity: 0.9, fillColor: '#d00', fillOpacity: 0.1 }).addTo(tools);
      const dot = L.circleMarker(c, { radius: 3, color: '#d00', weight: 1, fillOpacity: 1, interactive: false, clickable: false }).addTo(tools);
      circles.push({ c, poly, dot });
      return poly;
    }
    // Remove the circle whose centre is closest to ll, if ll lies inside it.
    function removeCircleAt(ll) {
      let best = -1, bd = Infinity;
      circles.forEach((o, i) => { const d = o.c.distanceTo(ll); if (d <= 161 && d < bd) { bd = d; best = i; } });
      if (best < 0) return false;
      const [o] = circles.splice(best, 1);
      tools.removeLayer(o.poly);
      tools.removeLayer(o.dot);
      return true;
    }
    function copy(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        const old = btn.innerHTML; btn.innerHTML = icon('check', 16); setTimeout(() => (btn.innerHTML = old), 1000);
      });
    }

    // --- Right-click / pin popup ------------------------------------------
    function coordPopup(ll, snap) {
      const box = document.createElement('div');
      box.className = 'gcct-pop';
      if (snap) {
        // Snapped to a geocache: say which, and offer the point that was actually clicked.
        const nm = String(snap.name || '').replace(snap.code || '\u0000', '').replace(/^[\s·:–-]+/, '').trim();
        const sn = document.createElement('div');
        sn.className = 'snap';
        sn.innerHTML = snap.kind === 'pin' ? `${icon('pin', 15)}<span class="t">${snap.marker && snap.marker.__pin ? `<b class="pinname-t" title="${esc(T('Click to rename'))}">${esc(snap.marker.__pin.name)}</b>` : `<b>${esc(T('Your pin'))}</b>`}</span>` : `${icon('pin', 15)}<span class="t">${snap.code ? `<a class="gc gcct-gc" href="https://www.geocaching.com/geocache/${encodeURIComponent(snap.code)}" target="_blank" rel="noopener" title="${esc(T('Open the cache page'))}">${esc(snap.code)}</a>` : `<b>${esc(T('Geocache'))}</b>`}${nm ? ' · ' + esc(nm) : ''}${(() => { const fv = snap.code && (CACHE_INFO.get(snap.code) || {}).fav; return fv != null ? ` <span class="gcct-favn" title="${esc(T('Favourite points'))}"><span class="gcct-fav">♥</span> ${fv}</span>` : ''; })()}${snap.approx ? ` <i title="${esc(T('Estimated from the cache icon – can be a few metres off.'))}">≈</i>` : ''}</span>`;
        const use = document.createElement('button');
        use.type = 'button'; use.className = 'lnk'; use.textContent = T('Use clicked point');
        use.onclick = e => { e.stopPropagation(); openCoordPopup(snap.clicked, false); };
        sn.appendChild(use);
        box.appendChild(sn);
        // The pin's name: click it to rename (Enter or clicking elsewhere keeps it, Esc cancels).
        const pt = sn.querySelector('.pinname-t');
        if (pt) pt.addEventListener('click', e => {
          e.stopPropagation();
          const inp = document.createElement('input');
          inp.className = 'pinname'; inp.title = T('Pin name'); inp.value = snap.marker.__pin.name;
          ['mousedown', 'click', 'dblclick', 'contextmenu'].forEach(ev => inp.addEventListener(ev, x => x.stopPropagation()));
          let done = false;
          const finish = keep => {
            if (done) return; done = true;
            if (keep) renamePin(snap.marker, inp.value);
            pt.textContent = snap.marker.__pin.name;
            inp.replaceWith(pt);
          };
          inp.addEventListener('keydown', x => { x.stopPropagation(); if (x.key === 'Enter') finish(true); else if (x.key === 'Escape') finish(false); });
          inp.addEventListener('blur', () => finish(true));
          pt.replaceWith(inp);
          inp.focus(); inp.select();
        });
      }
      // One line with the coordinates, always opening in DMM; click it to switch notation / system.
      const r = document.createElement('div');
      r.className = 'r one';
      const line = document.createElement('span');
      line.className = 'fmt';
      line.title = T('Click to switch coordinate format');
      let popIdx = 0;                                  // 0 = DMM
      // Room for the longest format at this point (monospace, so 1ch per character).
      const widest = Math.max(...FORMATS.map(([, fn]) => fn(ll.lat, ll.lng).length));
      const show = () => {
        const [name, fn] = FORMATS[popIdx];
        line.innerHTML = `<b>${name}</b><code style="min-width:${widest}ch">${fn(ll.lat, ll.lng)}</code>`;
      };
      line.onclick = e => {
        e.stopPropagation();
        popIdx = nextFormat(ll, popIdx);
        show();
      };
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = icon('copy', 16); b.title = T('Copy to clipboard'); b.className = 'ic';
      b.onclick = () => copy(FORMATS[popIdx][1](ll.lat, ll.lng), b);
      show();
      r.appendChild(line);
      r.appendChild(b);
      box.appendChild(r);
      const acts = document.createElement('div');
      acts.className = 'acts';
      const btn = (ico, t, fn) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = icon(ico, 16) + `<span>${esc(t)}</span>`; b.onclick = () => { map.closePopup(); fn(); }; acts.appendChild(b); };
      if (snap && snap.kind === 'pin') {
        btn('x', T('Remove pin'), () => removePin(snap.marker));
        if (snap.marker.__pin) btn('download', T('Download GPX'), () => downloadGpx([snap.marker.__pin], safeName(snap.marker.__pin.name) + '.gpx'));
      } else btn('pin', T('Pin'), () => namedPin(ll, snap && snap.code ? snap.code + (snap.name ? ' ' + String(snap.name).replace(snap.code, '').replace(/^[\s·:–-]+/, '').trim() : '') : null));
      if (pinRecs.length) btn('download', T('All pins as GPX ({n})', { n: pinRecs.length }), () => downloadGpx(pinRecs, `pins-${fileStamp()}.gpx`));
      if (route.length || routeOpen()) {
        const st = snap && snap.kind === 'pin' && snap.marker && snap.marker.__pin ? { key: 'p:' + snap.marker.__pin.id, kind: 'pin', name: snap.marker.__pin.name, lat: snap.marker.__pin.lat, lng: snap.marker.__pin.lng }
          : snap && snap.code ? { key: 'c:' + snap.code, kind: 'cache', code: snap.code, name: (CACHE_INFO.get(snap.code) || {}).name || snap.name || '', lat: ll.lat, lng: ll.lng } : null;
        if (st && !route.some(r => r.key === st.key)) btn('route', T('Add to route'), () => addStop(st));
      }
      btn('compass', T('Project…'), () => projectFrom(ll));
      if (circles.some(o => o.c.distanceTo(ll) <= 161)) btn('x', T('Remove circle'), () => removeCircleAt(ll));
      else btn('ring', T('161 m circle'), () => circle161(ll));
      btn('ruler', T('Measure from here'), () => { setMode('measure'); addMeasurePoint(ll); });
      btn('person', 'Google Street View', () => window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}`, '_blank', 'noopener'));
      btn('home', T('Set as home'), () => setHome({ lat: ll.lat, lng: ll.lng, name: fmtDMM(ll.lat, ll.lng) }));
      box.appendChild(acts);
      return box;
    }
    // The pin nearest the clicked point, within snapping reach (pixels), or null.
    function nearestPin(ll) {
      try {
        for (let i = pins.length - 1; i >= 0; i--) if (!tools.hasLayer || !tools.hasLayer(pins[i])) pins.splice(i, 1);
        if (map.getZoom() < PIN_MIN_ZOOM) return null;          // hidden this far out
        const at = map.latLngToContainerPoint(ll);
        let best = null, bd = Infinity;
        pins.forEach(m => { const pt = map.latLngToContainerPoint(m.getLatLng()), d = Math.hypot(pt.x - at.x, pt.y - at.y); if (d <= SNAP_PX && d < bd) { bd = d; best = m; } });
        return best ? { m: best, d: bd } : null;
      } catch (e) { return null; }
    }
    function openCoordPopup(clicked, allowSnap = true) {
      // A pin you have set wins when it is at least as near as any cache.
      const pn = allowSnap ? nearestPin(clicked) : null;
      if (pn) {
        const cc = nearestCache(clicked), at = map.latLngToContainerPoint(clicked);
        const cd = cc ? Math.hypot(map.latLngToContainerPoint(cc.ll).x - at.x, map.latLngToContainerPoint(cc.ll).y - at.y) : Infinity;
        if (pn.d <= cd) {
          const ll = pn.m.getLatLng();
          L.popup(POPUP_OPTS).setLatLng(ll).setContent(coordPopup(ll, { clicked, kind: 'pin', marker: pn.m, ll })).openOn(map);
          return;
        }
      }
      const c = allowSnap ? nearestCache(clicked) : null;
      // Position only estimated from the icon (e.g. your own caches, which the site's search leaves out):
      // read the exact posted / corrected coordinates from the cache page first – waiting briefly, so the
      // popup is drawn once. If the page is slow, the open popup is updated in place.
      if (c && c.code && c.approx && !pageCoordsTried.has(c.code)) {
        let shown = null;
        const timer = setTimeout(() => { shown = show(c); }, 700);
        fetchPageCoords(c.code).then(ok => {
          const n = ok ? nearestCache(clicked) : null, use = n && n.code === c.code ? n : c;
          if (!shown) { clearTimeout(timer); show(use); }
          else if (use !== c && map.hasLayer(shown)) shown.setLatLng(use.ll).setContent(coordPopup(use.ll, Object.assign({ clicked }, use)));
        });
        return;
      }
      show(c);
      function show(s) {
        const p = s ? s.ll : clicked;
        return L.popup(POPUP_OPTS).setLatLng(p).setContent(coordPopup(p, s && Object.assign({ clicked }, s))).openOn(map);
      }
    }
    // Setting: on /play/map the site's own right-click menu instead of ours.
    const siteMenu = () => !!(api.siteRightClick && api.siteRightClick()) && /^\/play\//i.test(location.pathname);
    map.on('contextmenu', e => {
      if (siteMenu()) return;
      L.DomEvent.preventDefault(e.originalEvent);
      openCoordPopup(e.latlng);
    });
    // /play/map opens its own menu (Log, Add to a list, GPX …) on a right-click. Catch the right button
    // on the window, before the site's handlers, and open only our popup – on both maps alike.
    const rightClickOnMap = e => {
      const root = map.getContainer(), tgt = e.target;
      return root.contains(tgt) && !(tgt.closest && tgt.closest('.leaflet-popup, .leaflet-control-container, .gcct-dock, .gcct-coord, .gcct-dlg'));
    };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'auxclick'].forEach(type => window.addEventListener(type, e => {
      if (e.button === 2 && !siteMenu() && rightClickOnMap(e)) e.stopImmediatePropagation();
    }, true));
    window.addEventListener('contextmenu', e => {
      if (siteMenu() || !rightClickOnMap(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try { openCoordPopup(map.mouseEventToLatLng(e)); } catch (err) { console.error('[gcct] right-click failed', err); }
    }, true);

    // Projection: a dialog in the same style as the layer editor, with a live preview on the map.
    const PROJ_UNITS = { m: 1, km: 1000, ft: 0.3048 };
    function projectFrom(ll) {
      const d = api.openDialog(T('Project a waypoint'), `
        <form autocomplete="off" onsubmit="return false">
          <label class="f"><span class="l">${T('From')}</span><input name="from" value="${esc(fmtDMM(ll.lat, ll.lng))}">
            <span class="h">${T('Any coordinate format works. Filled in with the point you clicked.')}</span></label>
          <div class="row3">
            <label class="f"><span class="l">${T('Bearing')}</span><span class="sfx"><input name="brg" inputmode="decimal" placeholder="0–360"><i>°</i></span></label>
            <label class="f"><span class="l">${T('Distance')}</span><input name="dist" inputmode="decimal" placeholder="250"></label>
            <label class="f"><span class="l">${T('Unit')}</span><select name="unit"><option value="m">m</option><option value="km">km</option><option value="ft">ft</option></select></label>
          </div>
        </form>
        <div class="result empty"><span class="k">${T('Waypoint')}</span><code>–</code><button type="button" class="ic" data-a="copy" title="${T('Copy to clipboard')}">${icon('copy', 16)}</button></div>
        <div class="status"></div>
        <div class="btns"><span class="sp"></span><button data-a="cancel">${T('Cancel')}</button><button class="primary" data-a="ok">${T('Project')}</button></div>`, { small: true });
      const F = d.querySelector('form').elements, res = d.querySelector('.result'), out = res.querySelector('code');
      const statusEl = d.querySelector('.status'), okB = d.querySelector('[data-a=ok]'), copyB = d.querySelector('[data-a=copy]');
      F.unit.value = PROJ_UNITS[load('gcct.projUnit', 'm')] ? load('gcct.projUnit', 'm') : 'm';
      const num = v => (String(v).trim() === '' ? NaN : Number(String(v).trim().replace(',', '.')));
      let from = null, dest = null, brg = NaN, dist = NaN, prev = [];
      const clearPrev = () => { prev.forEach(l => map.removeLayer(l)); prev = []; };
      function update() {
        const p = parseCoord(F.from.value);
        from = p ? L.latLng(p[0], p[1]) : null;
        brg = num(F.brg.value);
        dist = num(F.dist.value) * PROJ_UNITS[F.unit.value];
        let err = '';
        if (!from) err = T('The starting point is not a coordinate I understand.');
        else if (F.brg.value.trim() && !(brg >= 0 && brg <= 360)) err = T('The bearing must be a number from 0 to 360.');
        else if (F.dist.value.trim() && !(dist > 0)) err = T('The distance must be a number greater than 0.');
        statusEl.textContent = err;
        statusEl.className = 'status' + (err ? ' err' : '');
        dest = !err && brg >= 0 && brg <= 360 && dist > 0 ? L.latLng(projectPoint(from, brg, dist)) : null;
        out.textContent = dest ? fmtDMM(dest.lat, dest.lng) : '–';
        res.classList.toggle('empty', !dest);
        okB.disabled = copyB.disabled = !dest;
        clearPrev();
        if (dest) prev = [
          L.polyline([from, dest], { color: ACCENT, weight: 2, opacity: 0.7, dashArray: '4 4', interactive: false, clickable: false }),
          L.circleMarker(dest, { radius: 6, color: '#fff', weight: 2, fillColor: ACCENT, fillOpacity: 0.6, interactive: false, clickable: false }),
        ].map(l => l.addTo(map));
      }
      function go() {
        if (!dest) return;
        save('gcct.projUnit', F.unit.value);
        const a = from, b = dest, label_ = `${brg}° / ${fmtDist(dist)}`;
        api.closeDialog();
        L.polyline([a, b], { color: ACCENT, weight: 2, dashArray: '4 4' }).addTo(tools);
        pin(a, '#666');
        pin(b).openPopup();
        label(b, label_);
        if (!map.getBounds().contains(b)) map.panTo(b);
      }
      d._onClose = clearPrev;
      ['from', 'brg', 'dist'].forEach(n => { F[n].oninput = update; F[n].onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } }; });
      F.unit.onchange = update;
      okB.onclick = go;
      copyB.onclick = () => dest && copy(fmtDMM(dest.lat, dest.lng), copyB);
      d.querySelector('[data-a=cancel]').onclick = api.closeDialog;
      update();
      setTimeout(() => F.brg.focus(), 0);
    }

    // --- Modes: measure / 161 m circles -----------------------------------
    let mode = null, mLine = null, mPts = [], mLabel = null;
    const btns = {};

    function setMode(m) {
      if (mode === 'measure') finishMeasure();
      mode = mode === m ? null : m;
      Object.entries(btns).forEach(([k, a]) => a.classList.toggle('active', k === mode));
      map.getContainer().classList.toggle('gcct-crosshair', !!mode);
      mode ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();
    }
    function addMeasurePoint(ll) {
      mPts.push(ll);
      if (!mLine) mLine = L.polyline([], { color: ACCENT, weight: 3, dashArray: '6 4' }).addTo(tools);
      mLine.setLatLngs(mPts);
      L.circleMarker(ll, { radius: 4, color: ACCENT, fillOpacity: 1, interactive: false, clickable: false }).addTo(tools);
      let total = 0;
      for (let i = 1; i < mPts.length; i++) total += L.latLng(mPts[i - 1]).distanceTo(mPts[i]);
      let html = `Σ ${fmtDist(total)}`;
      if (mPts.length > 1) {
        const a = mPts[mPts.length - 2];
        html += ` · ${fmtDist(L.latLng(a).distanceTo(ll))} @ ${bearing(a, ll).toFixed(0)}°`;
      }
      if (mLabel) tools.removeLayer(mLabel);
      mLabel = label(ll, html);
    }
    function finishMeasure() { mLine = null; mPts = []; mLabel = null; }

    // Tool clicks are caught on the map element itself (capture phase), before the site's
    // own click handling (cache popups, UTFGrid) can swallow them. Drags are ignored.
    const mapEl = map.getContainer();
    let down = null;
    const inUi = t => t.closest && t.closest('.leaflet-control, .leaflet-popup, .gcct-dlg');
    mapEl.addEventListener('mousedown', e => { down = mode && !inUi(e.target) ? [e.clientX, e.clientY] : null; }, true);
    mapEl.addEventListener('click', e => {
      if (!mode || !down || inUi(e.target)) return;
      const moved = Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]);
      down = null;
      if (moved > 5) return;
      e.stopPropagation();
      try {
        const ll = map.mouseEventToLatLng(e);
        if (mode === 'measure') addMeasurePoint(ll);
        else if (mode === 'circle' && !removeCircleAt(ll)) circle161(ll);
      } catch (err) { console.error('[gcct] tool click failed', err); }
    }, true);
    mapEl.addEventListener('dblclick', e => {
      if (!mode || inUi(e.target)) return;
      e.stopPropagation();
      if (mode === 'measure') finishMeasure();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && mode) setMode(mode); });

    // --- Automatic 161 m circles around every geocache -----------------------
    // The browse map draws caches as images, but it also loads a hidden "UTFGrid" per tile: a 64×64
    // grid (4 px cells) saying which cache code covers each cell, keyed "(gx, gy)". We take the
    // centre of all cells belonging to a cache as its position (good to a few metres when zoomed in)
    // and draw a 161 m circle there. Tiles from the highest zoom seen give the best positions.
    const AUTO_MIN_ZOOM = 15;
    const MARK_MIN_ZOOM = 10;    // the blue marks at solved caches: earlier than the circles …
    const MARK_FULL_ZOOM = 14;   // … but small (and without the found tick) below zoom 14 …
    const MARK_DOT_ZOOM = 12;    // … and only a blue dot below zoom 12, like the site's own dots there
    const STAGE_MIN_ZOOM = 15;   // cache pages for stages are only read when zoomed in this far (fewer page loads)
    const autoLayer = L.layerGroup().addTo(map);
    // --- Favourite points on the map ------------------------------------------------------------
    // A small red heart with the number right beside every cache with at least N favourites (from zoom 15).
    const favLayer = L.layerGroup().addTo(map);
    favLayer.__gcct = true;                          // our drawings – never taken for caches
    const FAV_MIN_ZOOM = 15;
    let favSig = '';
    // Kept light so the site's own cache drawing is never held up: nothing happens while the map moves,
    // the cache list is asked for once after a move, and labels are only added or removed when they change.
    let favMoving = false, favLive = new Map();
    // Difficulty/terrain ("1.5/2") just below each cache icon, from the same zoom and for the same caches.
    const dtLayer = L.layerGroup().addTo(map);
    dtLayer.__gcct = true;
    let dtLive = new Map(), dtSig = '';
    // "FTF" on the right of caches nobody has found yet.
    const ftfLayer = L.layerGroup().addTo(map);
    ftfLayer.__gcct = true;
    let ftfLive = new Map(), ftfSig = '';
    const EVENT_TYPES = new Set([6, 13, 453, 1304, 3653, 3773, 3774, 4738, 7005]);   // events: attended, not found
    function refreshFav(force, askGrid) {
      try {
        if (favMoving && !force) return;
        const on = api.favSettings ? api.favSettings() : { show: false };
        const dt = api.dtSettings ? api.dtSettings() : { show: false };
        const ftf = api.ftfSettings ? api.ftfSettings() : { show: false };
        const zOk = map.getZoom() >= FAV_MIN_ZOOM;
        if ((!on.show || !zOk) && favLive.size) { favLayer.clearLayers(); favLive = new Map(); favSig = ''; }
        if ((!dt.show || !zOk) && dtLive.size) { dtLayer.clearLayers(); dtLive = new Map(); dtSig = ''; }
        if ((!ftf.show || !zOk) && ftfLive.size) { ftfLayer.clearLayers(); ftfLive = new Map(); ftfSig = ''; }
        if (!zOk || (!on.show && !dt.show && !ftf.show)) return;
        const b = map.getBounds(), view = b.pad ? b.pad(0.1) : b;
        const grid = cacheGrid();
        if (grid && askGrid) requestMissingGrids(grid);   // the old map loads its cache list lazily
        const shown = grid ? [...cachePositions(grid).entries()].map(([code, p]) => ({ code, ll: L.latLng(p.lat, p.lng) })) : markerCaches();
        if (shown.some(c => c.code && !seenThisVisit.has(c.code)) || !shown.length) searchArea(b);
        const iconAt = new Map(shown.filter(c => c.code).map(c => [c.code, c.ll]));
        // Only caches the site actually shows right now: its filters decide which icons are drawn.
        let drawn = null;
        if (grid) drawn = new Set(iconAt.keys());
        else {
          const gl = glDrawnCodes();
          if (gl && gl.size) drawn = gl;
          if (iconAt.size) { drawn = drawn || new Set(); iconAt.forEach((v, k) => drawn.add(k)); }
        }
        const want = new Map(), wantDt = new Map(), wantFtf = new Map();
        const consider = (i, code, atMark) => {
          if (!i) return;
          const q = atMark || ((i.solved && i.corrected && i.found !== true) ? i.corrected : (i.posted || iconAt.get(code)));
          if (!q) return;
          const ll = L.latLng(q.lat, q.lng);
          if (!view.contains(ll)) return;
          const at = `${q.lat.toFixed(6)},${q.lng.toFixed(6)}`;
          if (on.show && i.fav != null && i.fav >= on.min) want.set(`${code}|${i.fav}|${at}`, { ll, fav: i.fav });
          if (dt.show && i.diff != null && i.terr != null) wantDt.set(`${code}|${i.diff}/${i.terr}|${at}`, { ll, txt: `${i.diff}/${i.terr}` });
          // FTF: active caches (not events) that nobody has found yet.
          if (!atMark && ftf.show && i.neverFound === true && (i.status == null || i.status === 0) && !EVENT_TYPES.has(Number(i.type)) && i.found !== true && i.owned !== true)
            wantFtf.set(`${code}|ftf|${at}`, { ll });
        };
        const sf = siteFilter();
        if (drawn) drawn.forEach(code => { if (!filteredOut(code, sf, iconAt.get(code))) consider(CACHE_INFO.get(code), code); });
        else CACHE_INFO.forEach((i, code) => { if (!filteredOut(code, sf)) consider(i, code); });
        // The visible marks at solved caches you have found (the site's icon is back at the posted
        // coordinates): the hearts and D/T there too, while the marks are shown.
        if ((autoOn || marksOn) && map.getZoom() >= AUTO_MIN_ZOOM)
          lastSolved.forEach(m => { if (!m.ghost && !filteredOut(m.code, sf, m.ll)) consider(CACHE_INFO.get(m.code), m.code, m.ll); });
        // Caches on (almost) the same spot: their labels are stacked instead of drawn on top of each other –
        // D/T downwards, hearts upwards.
        const stack = (m, w, h) => {
          const out = new Map(), placed = [];
          [...m.entries()].map(([k, x]) => ({ k, x, p: map.latLngToContainerPoint(x.ll) }))
            .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x || (a.k < b.k ? -1 : 1))
            .forEach(e => {
              let n = 0;
              while (placed.some(q => Math.abs(q.x - e.p.x) < w && Math.abs(q.y - (e.p.y + n * h)) < h)) n++;
              placed.push({ x: e.p.x, y: e.p.y + n * h });
              out.set(`${e.k}|${n}`, Object.assign({}, e.x, { n }));
            });
          return out;
        };
        const dtStacked = stack(wantDt, 34, 14);
        wantDt.clear(); dtStacked.forEach((v, k) => wantDt.set(k, v));
        const favStacked = stack(want, 30, 17);
        want.clear(); favStacked.forEach((v, k) => want.set(k, v));
        // FTF as a red badge on the icon's upper right corner.
        const fsig = [...wantFtf.keys()].sort().join(';');
        if (force || fsig !== ftfSig) {
          ftfSig = fsig;
          ftfLive.forEach((m, k) => { if (!wantFtf.has(k)) { ftfLayer.removeLayer(m); ftfLive.delete(k); } });
          wantFtf.forEach((x, k) => {
            if (ftfLive.has(k)) return;
            const m = L.marker(x.ll, { interactive: false, clickable: false, keyboard: false, title: T('Never found – first to find is still open'),
              icon: L.divIcon({ className: 'gcct-ftflbl', html: '<span>FTF</span>', iconSize: null, iconAnchor: [-5, 7] }) });
            m.__gcct = true;
            ftfLayer.addLayer(m);
            ftfLive.set(k, m);
          });
        }
        // D/T labels below the icons, kept apart from the hearts.
        const dsig = [...wantDt.keys()].sort().join(';');
        if (force || dsig !== dtSig) {
          dtSig = dsig;
          dtLive.forEach((m, k) => { if (!wantDt.has(k)) { dtLayer.removeLayer(m); dtLive.delete(k); } });
          wantDt.forEach((x, k) => {
            if (dtLive.has(k)) return;
            const m = L.marker(x.ll, { interactive: false, clickable: false, keyboard: false,
              icon: L.divIcon({ className: 'gcct-dtlbl', html: `<span>${x.txt}</span>`, iconSize: null, iconAnchor: [0, -9 - x.n * 14] }) });
            m.__gcct = true;
            dtLayer.addLayer(m);
            dtLive.set(k, m);
          });
        }
        const sig = [on.min, [...want.keys()].sort().join(';')].join('|');
        if (!force && sig === favSig) return;
        favSig = sig;
        favLive.forEach((m, k) => { if (!want.has(k)) { favLayer.removeLayer(m); favLive.delete(k); } });
        want.forEach((x, k) => {
          if (favLive.has(k)) return;
          const m = L.marker(x.ll, { interactive: false, clickable: false, keyboard: false,
            icon: L.divIcon({ className: 'gcct-favlbl', html: `<span><i>♥</i>${x.fav}</span>`, iconSize: null, iconAnchor: [0, 27 + x.n * 17] }) });
          m.__gcct = true;
          favLayer.addLayer(m);
          favLive.set(k, m);
        });
      } catch (e) { console.error('[gcct] favourites failed', e); }
    }
    let favTimers = [];
    map.on('movestart zoomstart', () => { favMoving = true; favTimers.forEach(clearTimeout); });
    map.on('moveend zoomend', () => {
      favMoving = false;
      favTimers.forEach(clearTimeout);
      // After the site has drawn its caches: first with what is known, then once more with the cache list.
      // After the site has drawn its caches: ask for the cache list once, then look again a few times as it arrives.
      favTimers = [setTimeout(() => refreshFav(false, true), 500), ...[1100, 1800, 2800, 4200].map(ms => setTimeout(() => refreshFav(), ms))];
    });
    setInterval(() => { if (!document.hidden) refreshFav(); }, 3000);   // filter changes
    [800, 2000].forEach(ms => setTimeout(() => refreshFav(false, ms === 800), ms));   // right after the page loads
    window.__gcctRefreshFav = () => refreshFav(true);
    let favKickT = null;
    window.__gcctFavKick = () => { clearTimeout(favKickT); favKickT = setTimeout(() => refreshFav(), 150); };
    // Marks (solved, stages) live in their own group and are only added or removed when they change, so a
    // mark under the mouse is never rebuilt while you hover or click it.
    const markLayer = L.layerGroup().addTo(map);
    let liveMarks = new Map();
    function syncMarks(wanted) {
      const next = new Map();
      wanted.forEach(([key, make]) => { if (!next.has(key)) next.set(key, liveMarks.get(key) || make()); });
      liveMarks.forEach((l, k) => { if (!next.has(k)) markLayer.removeLayer(l); });
      next.forEach((l, k) => { if (!liveMarks.has(k)) markLayer.addLayer(l); });
      liveMarks = next;
    }
    let fsBtn = null, zoomInBtn = null, zoomOutBtn = null, homeBtn = null;
    let locShown = [], locBtn = null;       // your location on the map, and its button
    const labelled = [];   // [element, () => title] – re-labelled when the language changes
    // Grey out zoom buttons at the map's limits.
    function updZoomBtns() {
      try {
        const z = map.getZoom(), max = map.getMaxZoom ? map.getMaxZoom() : 99, min = map.getMinZoom ? map.getMinZoom() : 0;
        if (zoomInBtn) zoomInBtn.classList.toggle('disabled', z >= max);
        if (zoomOutBtn) zoomOutBtn.classList.toggle('disabled', z <= min);
      } catch (e) { /* ignore */ }
    }
    map.on('zoomend', updZoomBtns);
    let marksOn = !!load('gcct.marks', false), marksBtn = null;   // the marks on their own, without circles
    let autoOn = !!load('gcct.autoCircles', false), autoBtn = null, autoSig = '', autoTimer = null, gridWarned = false;
    const AUTO_STYLE = { color: '#d0021b', weight: 1.5, opacity: 0.85, fillColor: '#d0021b', fillOpacity: 0.07, className: 'gcct-autocircle' };

    function cacheGrid() {
      const ml = window.MapSettings && window.MapSettings.MapLayers;
      if (ml && ml.UTFGrid && ml.UTFGrid._cache) return ml.UTFGrid;
      let g = null;
      map.eachLayer(l => { if (!g && l && l._cache && typeof l._loadTile === 'function') g = l; });
      return g;
    }
    function pixelToLatLng(px, py, z) {
      const n = 256 * 2 ** z;
      return [Math.atan(Math.sinh(Math.PI * (1 - 2 * py / n))) * 180 / Math.PI, px / n * 360 - 180];
    }
    // Ask the site to load grid data for visible cache tiles it hasn't loaded yet.
    // When you change the site's filters (cache types, My Finds, My Hides …) its hidden cache list keeps
    // the old answers. Those are then treated as stale – ignored, and asked for again – so circles,
    // marks and hearts follow the filter at once.
    const staleGrid = new WeakSet();
    const invStats = { count: 0, last: null, reason: null };
    function invalidateGrid(reason) {
      invStats.count++; invStats.last = new Date().toLocaleTimeString(); invStats.reason = typeof reason === 'string' ? reason : 'click';
      const grid = cacheGrid();
      if (!grid || !grid._cache) return;
      // (The site's cache list ignores the sidebar filters, so it is not reloaded or distrusted – the
      // filters are applied by the script itself; this only redraws.)
      if (window.__gcctInfoChanged) window.__gcctInfoChanged();
      setTimeout(() => { if (window.__gcctInfoChanged) window.__gcctInfoChanged(); }, 900);
      setTimeout(() => { if (window.__gcctInfoChanged) window.__gcctInfoChanged(); }, 2200);
    }
    // (Filter changes are seen on the sidebar buttons further down. The site's cache tiles and its
    // clicks are left alone, so nothing here can hold up the site redrawing its icons.)
    let filterChangedAt = 0;
    function requestMissingGrids(grid) {
      // Right after a filter change the site reloads its cache tiles: never ask for anything then.
      if (Date.now() - filterChangedAt < 6000) return;
      document.querySelectorAll('.leaflet-tile-pane img[src*="map.png"]').forEach(img => {
        const q = k => (img.src.match(new RegExp('[?&]' + k + '=(\\d+)')) || [])[1];
        const x = q('x'), y = q('y'), z = q('z');
        if (x == null || y == null || z == null) return;
        const cur = grid._cache[`${z}_${x}_${y}`];
        if (!Object.prototype.hasOwnProperty.call(grid._cache, `${z}_${x}_${y}`)) {
          try { grid._loadTile(z, x, y); } catch (e) { /* the site's loader may differ; ignore */ }
        }
      });
    }
    // code -> { lat, lng, z }
    // The site's hidden cache list can be emptied and slowly reloaded (e.g. after a filter change), but
    // cache positions don't change: remember every position seen this visit and keep using it, so
    // circles, marks and hearts don't vanish while the site reloads. (Filters are applied separately.)
    const knownPos = new Map();
    function cachePositions(grid) {
      const cur = rawCachePositions(grid);
      cur.forEach((p, code) => { const o = knownPos.get(code); if (!o || p.z >= o.z) knownPos.set(code, p); });
      if (!knownPos.size) return cur;
      const b = map.getBounds(), view = b.pad ? b.pad(0.5) : b, out = new Map();
      knownPos.forEach((p, code) => { if (view.contains(L.latLng(p.lat, p.lng))) out.set(code, p); });
      return out;
    }
    function rawCachePositions(grid) {
      const sums = new Map();                         // "code|z" -> [sumPx, sumPy, count, code, z]
      Object.keys(grid._cache).forEach(key => {
        const t = grid._cache[key], ref = key.split('_').map(Number);
        if (!t || !t.data || ref.length !== 3 || ref.some(v => !isFinite(v))) return;
        const [z, tx, ty] = ref;
        Object.keys(t.data).forEach(cell => {
          const m = cell.match(/\((\d+),\s*(\d+)\)/);
          if (!m) return;
          const px = tx * 256 + 4 * +m[1] + 2, py = ty * 256 + 4 * +m[2] + 2;   // cell centre in world pixels
          (t.data[cell] || []).forEach(c => {
            if (!c || !c.i) return;
            const k = c.i + '|' + z, s = sums.get(k) || [0, 0, 0, c.i, z, c.n];
            s[0] += px; s[1] += py; s[2]++;
            sums.set(k, s);
          });
        });
      });
      const best = new Map();
      sums.forEach(([sx, sy, n, code, z, name]) => {
        const prev = best.get(code);
        if (prev && prev.z >= z) return;
        const [lat, lng] = pixelToLatLng(sx / n, sy / n, z);
        best.set(code, { lat, lng, z, name });
      });
      return best;
    }
    // New map (/play/map) and any map without the hidden grid: caches are ordinary Leaflet markers,
    // possibly inside layer or cluster groups. Our own drawings and the site's cluster bubbles are skipped.
    // A GC code from whatever the site put on the marker (title, alt text, icon markup, data).
    function markerCode(l) {
      const o = l.options || {}, ic = o.icon && o.icon.options || {};
      const txt = [o.title, o.alt, o.code, o.cacheCode, o.id, ic.html, ic.className, l.feature && JSON.stringify(l.feature.properties || {}),
        o.data && JSON.stringify(o.data), l._icon && (l._icon.getAttribute('title') || l._icon.getAttribute('aria-label') || l._icon.outerHTML.slice(0, 400))].filter(Boolean).join(' ');
      const m = txt.match(/\bGC[0-9A-HJKMNP-TV-Z]{1,6}\b/i);
      return m ? m[0].toUpperCase() : '';
    }
    // Cache type and "solved" from the marker's icon (file name or class), if the site puts it there.
    function markerHints(l, code) {
      const o = l.options || {}, ic = o.icon && o.icon.options || {};
      const txt = [ic.iconUrl, ic.className, ic.html, l._icon && l._icon.className, l._icon && l._icon.getAttribute && l._icon.getAttribute('src')].filter(Boolean).join(' ');
      if (!txt) return;
      const i = CACHE_INFO.get(code) || { type: null, solved: false, corrected: null };
      let changed = false;
      if (i.type == null) {
        const m = txt.match(/(?:type|cache|gc|icon)[-_/]?(\d{1,4})\b/i);
        const t = /tradi/i.test(txt) ? TRADITIONAL : m ? +m[1] : null;
        if (t != null) { i.type = t; changed = true; }
      }
      if (!i.solved && /correct|solved/i.test(txt)) { i.solved = true; changed = true; }
      if (changed) CACHE_INFO.set(code, i);
    }
    function markerCaches() {
      const out = [], seen = new Set();
      const visit = l => {
        if (!l || seen.has(l) || l === tools || l === autoLayer || l.__gcct || (tools.hasLayer && tools.hasLayer(l)) || (autoLayer.hasLayer && autoLayer.hasLayer(l))) return;   // our own drawings are not caches
        seen.add(l);
        if (l instanceof L.Marker || (L.CircleMarker && l instanceof L.CircleMarker)) {
          if (typeof l.getChildCount === 'function') return;           // a cluster bubble, not a cache
          const ll = l.getLatLng && l.getLatLng();
          if (ll) {
            const code = markerCode(l);
            if (code) markerHints(l, code);
            out.push({ ll: L.latLng(ll.lat, ll.lng), code, name: (l.options && l.options.title) || '' });
          }
          return;
        }
        if (typeof l.getLayers === 'function') l.getLayers().forEach(visit);  // LayerGroup / MarkerClusterGroup
      };
      map.eachLayer(visit);
      const uniq = new Map();
      out.forEach(c => uniq.set(c.ll.lat.toFixed(6) + ',' + c.ll.lng.toFixed(6), c));
      return [...uniq.values()];
    }
    const markerPositions = () => markerCaches().map(c => c.ll);
    // The geocache under (or within a few pixels of) a point – for snapping the right-click popup.
    // On the old browse map the position is estimated from the cache icon; on the new maps it is exact.
    const SNAP_PX = 12;
    let lastSnapList = [];
    // gcctSnapTest('GCxxxx') in the console: what the script knows about one cache, and where it can snap.
    window.gcctSnapTest = function (code) {
      code = String(code || '').toUpperCase();
      const i = CACHE_INFO.get(code) || null, r = v => v ? [+v.lat.toFixed(6), +v.lng.toFixed(6)] : null;
      const grid = cacheGrid(), g = grid ? cachePositions(grid).get(code) : null;
      const mk = grid ? null : markerCaches().filter(c => c.code === code).map(c => r(c.ll));
      const out = { code, page: location.pathname, known: !!i, type: i && i.type, solved: i && i.solved, owned: i && i.owned, found: i && i.found,
        posted: r(i && i.posted), corrected: r(i && i.corrected), gridIcon: r(g), markers: mk,
        markersOnMapTotal: grid ? null : markerCaches().length, seenThisVisit: seenThisVisit.has(code),
        inSearch: inSearch.has(code), fromPage: !!(i && i.fromPage), pageRead: pageCoordsTried.has(code),
        inCompleteSearchArea: !!(g || (i && i.posted)) && searchedComplete.some(a => a.contains(L.latLng((g || i.posted).lat, (g || i.posted).lng))),
        completeAreas: searchedComplete.length, userNameFound: !!myName(), ownerKnown: !!(i && i.ownerName), ownerIsYou: !!(i && i.ownerName && i.ownerName === myName()),
        likelyOwn: window.__gcctLikelyOwn ? window.__gcctLikelyOwn(code) : null,
        filteredOut: window.__gcctFilteredOut ? window.__gcctFilteredOut(code) : null,
        snapTargetsForCode: lastSnapList.filter(c => c.code === code).map(c => r(c.ll)),
        circlesOn: autoOn, zoom: map.getZoom(), fav: i && i.fav, dt: i ? [i.diff, i.terr] : null, neverFound: i ? i.neverFound : null, lastFoundDate: i ? i.lastFound : null, placedDate: i ? i.placed : null, status: i ? i.status : null, favSettings: api.favSettings ? api.favSettings() : null,
        search: Object.assign({}, searchState), searchedAreas: searched.length,
        marks: lastSolved.filter(m => m.code === code).map(m => ({ at: r(m.ll), invisible: !!m.ghost })),
        markElements: [...document.querySelectorAll('.gcct-solved')].filter(el => (el.title || '').startsWith(code)).map(el => ({ title: el.title, ghost: el.classList.contains('gcct-ghost'), size: [el.offsetWidth, el.offsetHeight], pointerEvents: getComputedStyle(el).pointerEvents })) };
      console.log('[gcct] snap test', out);
      return out;
    };
    // GC codes of all caches the WebGL map (/play/map) has drawn in view, or null when there is none.
    function glDrawnCodes() {
      let set = null;
      try {
        map.eachLayer(l => {
          const m = l._glMap;
          if (!m || !m.queryRenderedFeatures) return;
          set = set || new Set();
          (m.queryRenderedFeatures() || []).forEach(f => {
            const mm = JSON.stringify(f.properties || {}).match(/\bGC[0-9A-HJKMNP-TV-Z]{1,6}\b/i);
            if (mm) set.add(mm[0].toUpperCase());
          });
        });
      } catch (e) { return null; }
      return set;
    }
    // /play/map draws its caches with WebGL: ask that map which cache features lie under the point.
    // A point feature's geometry is the cache's exact posted position; its properties hold the GC code.
    function glCachesNear(ll) {
      const out = [];
      try {
        map.eachLayer(l => {
          const m = l._glMap;
          if (!m || !m.project || !m.queryRenderedFeatures) return;
          const p = m.project([ll.lng, ll.lat]), r = SNAP_PX + 4;
          (m.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]]) || []).forEach(f => {
            const props = f.properties || {}, s = JSON.stringify(props);
            const mm = s.match(/\bGC[0-9A-HJKMNP-TV-Z]{1,6}\b/i);
            if (!mm || !f.geometry || f.geometry.type !== 'Point') return;
            const code = mm[0].toUpperCase(), [lng, lat] = f.geometry.coordinates, i = CACHE_INFO.get(code) || {};
            const name = i.name || props.name || props.title || props.cacheName || '';
            // A solved cache is drawn at its corrected position: use the exact known one when it lies there.
            let at = L.latLng(lat, lng);
            [i.corrected, i.posted].filter(Boolean).forEach(q => { if (distM(q, at) < 3) at = L.latLng(q.lat, q.lng); });
            out.push({ ll: at, code, name: String(name), approx: false });
          });
        });
      } catch (e) { /* no WebGL map here */ }
      return out;
    }
    function nearestCache(ll) {
      try {
        const grid = cacheGrid();
        const list = grid
          ? [...cachePositions(grid).entries()].map(([code, p]) => {
              // The icon is at the posted or at the corrected coordinates (unfound and owned solved caches):
              // use whichever exact position lies at the icon, else the icon's estimated position.
              const i = CACHE_INFO.get(code) || {}, icon = L.latLng(p.lat, p.lng);
              const ex = [i.posted, i.corrected].filter(Boolean).map(q => L.latLng(q.lat, q.lng))
                .filter(q => distM(q, icon) <= 40).sort((a, b) => distM(a, icon) - distM(b, icon))[0];
              return { ll: ex || icon, code, name: p.name || i.name || '', approx: !ex };
            })
          : markerCaches();
        // Every cache the site's search has told us about counts too ("invisible icons"): solved caches at
        // their corrected position, the others at their posted position. Works on both maps, for caches you
        // own as well, whether or not the site draws them as markers, and with the circles off.
        try {
          const b = map.getBounds(), vb = b.pad ? b.pad(0.2) : b;
          CACHE_INFO.forEach((i, code) => {
            const q = i && (i.solved && i.corrected ? i.corrected : i.posted);
            if (q && vb.contains(L.latLng(q.lat, q.lng))) list.push({ ll: L.latLng(q.lat, q.lng), code, name: i.name || '', approx: false });
            // A solved cache whose icon still sits on the posted coordinates (e.g. found): snap there too.
            if (i && i.solved && i.corrected && i.posted && vb.contains(L.latLng(i.posted.lat, i.posted.lng)))
              list.push({ ll: L.latLng(i.posted.lat, i.posted.lng), code, name: i.name || '', approx: false });
          });
        } catch (e) { /* bounds not available */ }
        lastSnapList = list;
        // Solved positions shown with a mark count too, so right-clicking there snaps to the cache.
        lastSolved.forEach(sm => { const i = CACHE_INFO.get(sm.code) || {}; list.push({ ll: sm.ll, code: sm.code, name: i.name || '', approx: false }); });
        lastStages.forEach(w => { const i = CACHE_INFO.get(w.code) || {}; list.push({ ll: w.ll, code: w.code, name: (i.name || '') + (w.name ? ' – ' + w.name : ''), approx: false }); });
        glCachesNear(ll).forEach(c => list.push(c));
        const at = map.latLngToContainerPoint(ll);
        // Nearest within reach – a candidate that knows its GC code wins over one that doesn't.
        let best = null, bd = Infinity;
        const sf = siteFilter();
        list.forEach(c => {
          if (c.code && filteredOut(c.code, sf, c.ll)) return;     // hidden by the site's filters: not there
          const pt = map.latLngToContainerPoint(c.ll), d = Math.hypot(pt.x - at.x, pt.y - at.y);
          if (d > SNAP_PX) return;
          const better = !best || (!!c.code && !best.code) || (!!c.code === !!best.code && d < bd);
          if (better) { bd = d; best = c; }
        });
        if (!best) return null;
        // An estimated icon position, but the exact position of the same cache is known: use the exact one.
        if (best.approx && best.code) {
          let ex = null, ed = Infinity;
          list.forEach(c => { if (c.code === best.code && !c.approx) { const d = distM(c.ll, best.ll); if (d < ed) { ed = d; ex = c; } } });
          if (ex && ed <= 60) return Object.assign({}, ex, { name: best.name || ex.name });
        }
        return best;
      } catch (e) { return null; }
    }
    let noCacheTries = 0, noTypeTries = 0, typeWarned = false, autoStats = null, lastSolved = [], lastStages = [];
    // Small clickable mark at a stage or final: opens the cache page; the circle shows its 161 m.
    function stageMark(w) {
      const i = CACHE_INFO.get(w.code) || {};
      const m = L.marker(w.ll, {
        icon: L.divIcon({ className: 'gcct-stage' + (w.kind === 'final' ? ' fin' : ''), html: w.kind === 'final' ? icon('check', 10) : icon('pin', 10), iconSize: [18, 18], iconAnchor: [9, 9] }),
        title: `${w.code}${i.name ? ' · ' + i.name : ''} – ${w.kind === 'final' ? T('Final location') : T('Physical stage')}${w.name ? ': ' + w.name : ''}`,
        keyboard: false, riseOnHover: true,
      });
      m.__gcct = true;
      m.on('click', e => {
        if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
        window.open('https://www.geocaching.com/geocache/' + encodeURIComponent(w.code), '_blank', 'noopener');
      });
      return m;
    }
    // Clickable mark at a solved position: opens the cache page in a new tab (right-click works as anywhere else).
    // The clickable mark is only for solved caches you have logged as found (and don't own): their icon
    // has gone back to the posted coordinates, so nothing else marks the solved spot.
    const wantsMark = i => !!(i && i.solved && i.found === true && i.owned !== true);
    // Your own solved caches (owned, or only known from their cache page because the search leaves them
    // out) get the same mark, right on top of the site's icon, so they show the same hover text.
    const ownMark = i => !!(i && i.solved && i.corrected && (i.owned === true || i.fromPage));
    const distM = (a, b) => {                 // metres between two points (haversine)
      const R = 6371008.8, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
      const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    function solvedMark(ll, code, ghost, small) {
      const i = CACHE_INFO.get(code) || {}, name = i.name || '';
      if (ghost) {
        // Invisible, the size of the site's icon: the site's icon stays visible and keeps its clicks (they
        // pass on to the map), while hovering shows only our text – the site's own hover text is held back.
        const g = L.marker(ll, {
          icon: L.divIcon({ className: 'gcct-solved gcct-ghost', html: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
          title: `${code}${name ? ' · ' + name : ''} – ${T('Final location')}`, keyboard: false, bubblingMouseEvents: true,
        });
        g.__gcct = true;
        g.on('add', () => {
          const el = g.getElement ? g.getElement() : g._icon;
          if (el) ['mousemove', 'mouseover', 'mouseout', 'pointermove', 'pointerover', 'pointerout'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
        });
        // The site finds the cache under the pointer from its last mouse move, which the mark held back:
        // tell it where the pointer is just before the click passes on to the map.
        g.on('mousedown click', e => { try { map.fire('mousemove', { latlng: e.latlng || ll, layerPoint: e.layerPoint, containerPoint: e.containerPoint, originalEvent: e.originalEvent }); } catch (err) { /* ignore */ } });
        return g;
      }
      // A round blue badge with a question mark (solved puzzle), and a small green tick for "found".
      // Zoomed out (12–13): the size of the site's icons there, without the tick; below 12 just a blue dot.
      const html = small === 'dot' ? '<span class="ic"><span class="fb"></span></span>'
        : `<span class="ic"><span class="fb">?</span></span>${i.found === true && !small ? `<span class="tick">${icon('check', 8)}</span>` : ''}`;
      const sz = small === 'dot' ? 13 : small ? 20 : 24;
      const m = L.marker(ll, {
        icon: L.divIcon({ className: 'gcct-solved' + (small === 'dot' ? ' dot' : small ? ' sm' : ''), html, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
        title: `${code}${name ? ' · ' + name : ''} – ${T('Final location')}`, keyboard: false, riseOnHover: true,
      });
      m.__gcct = true;
      m.on('click', e => {
        if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
        window.open('https://www.geocaching.com/geocache/' + encodeURIComponent(code), '_blank', 'noopener');
      });
      return m;
    }
    // Caches in view that the site's search left out (typically your own) once it has answered for the
    // area: read their exact posted / corrected coordinates from the cache page, two at a time, at most
    // 20 per view, from zoom 15 – so snapping, circles and the hover text know them without a right-click.
    const pcQueue = [];
    let pcBusy = 0;
    function pumpPageCoords() {
      while (pcBusy < 2 && pcQueue.length) {
        pcBusy++;
        fetchPageCoords(pcQueue.shift()).finally(() => { pcBusy--; pumpPageCoords(); });
      }
    }
    function queueUnseenCaches() {
      try {
        if (map.getZoom() < 15) return;
        const grid = cacheGrid();
        const codes = grid ? [...cachePositions(grid).keys()] : markerCaches().map(c => c.code).filter(Boolean);
        if (!codes.some(c => inSearch.has(c))) return;          // the search hasn't answered here yet
        // With My Hides off, more pages are read: that is how your own caches are recognised.
        const max = siteFilter().hides ? 60 : 20;
        codes.filter(c => !inSearch.has(c) && !pageCoordsTried.has(c) && !pcQueue.includes(c)).slice(0, max).forEach(c => pcQueue.push(c));
        pumpPageCoords();
      } catch (e) { /* ignore */ }
    }
    let pcTimer = null;
    map.on('moveend zoomend', () => { clearTimeout(pcTimer); pcTimer = setTimeout(queueUnseenCaches, 1500); });
    setTimeout(queueUnseenCaches, 3000);

    window.__gcctAutoStats = () => autoStats;
    let circleWhy = [];
    // gcctCircleDebug() in the console: why each circle in view is drawn, and the state of the site's cache list.
    window.gcctCircleDebug = function () {
      const grid = cacheGrid(), z = map.getZoom();
      const keys = grid ? Object.keys(grid._cache) : [];
      const out = { zoom: z, filterRefreshes: invStats, cacheList: grid ? { tiles: keys.length, atThisZoom: keys.filter(k => k.startsWith(z + '_')).length,
        stale: keys.filter(k => staleGrid.has(grid._cache[k])).length, empty: keys.filter(k => !grid._cache[k]).length } : 'none',
        tileImagesInPage: document.querySelectorAll('.leaflet-tile-pane img[src*="map.png"]').length,
        circles: circleWhy.slice(0, 40) };
      console.log('[gcct] circles', out);
      return out;
    };
    window.__gcctInfoChanged = () => { clearTimeout(window.__gcctInfoT); window.__gcctInfoT = setTimeout(() => refreshAuto(), 300); if (window.__gcctFavKick) window.__gcctFavKick(); };
    // The sidebar filters on /map, read from its buttons: a filter that is off has the class
    // "ct_untoggled" (My Finds = ct_mf, My Hides = ct_mo, My DNFs = ct_mdnf, types = ct_toggle with
    // data-typeid). The site's cache list itself ignores these filters, so we apply them ourselves.
    // A click on a filter button is acted on at once: the site only flips the button's class after
    // asking its server, so until then the click's expected result is used.
    const predicted = new WeakMap();              // button -> { wasOff, off, t }
    const isOff = b => {
      const now = b.classList.contains('ct_untoggled') || !b.classList.contains('ct_displayed');
      const p = predicted.get(b);
      if (p && now === p.wasOff && Date.now() - p.t < 5000) return p.off;   // still waiting for the site
      return now;
    };
    document.addEventListener('click', e => {
      const b = e.target && e.target.closest && e.target.closest('button.ct_toggle[data-typeid], button.ct_mf, button.ct_mo, button.ct_mdnf');
      if (!b) return;
      const raw = b.classList.contains('ct_untoggled') || !b.classList.contains('ct_displayed');
      predicted.set(b, { wasOff: raw, off: !isOff(b), t: Date.now() });   // (clicked twice quickly: back again)
      filterChangedAt = Date.now();
      // After the site's own click handling, not before it.
      setTimeout(() => { try { refreshAuto(true); } catch (err) { /* ignore */ } if (window.__gcctRefreshFav) window.__gcctRefreshFav(); }, 0);
    }, true);
    function siteFilter() {
      const off = sel => { const b = document.querySelector(sel); return !!b && isOff(b); };
      const types = new Set([...document.querySelectorAll('button.ct_toggle[data-typeid]')]
        .filter(isOff).map(b => Number(b.dataset.typeid)));
      return { finds: off('button.ct_mf'), hides: off('button.ct_mo'), dnfs: off('button.ct_mdnf'), types,
        sig: [off('button.ct_mf'), off('button.ct_mo'), off('button.ct_mdnf'), [...types].sort().join(',')].join('|') };
    }
    // Your own caches: the site's search leaves them out. So a cache on the map, inside an area whose
    // search answer was complete, that the answer did not contain, is taken to be yours.
    function likelyOwn(code, ll) {
      const i = CACHE_INFO.get(code) || {};
      if (i.owned === true || i.fromPage) return true;
      if (i.owned === false) return false;
      if (i.ownerName && i.ownerName === myName()) return true;
      if (inSearch.has(code) || !ll) return false;
      const p = L.latLng(ll.lat, ll.lng);
      return searchedComplete.some(a => a.contains(p));
    }
    function filteredOut(code, f, ll) {
      if (!code) return false;
      const i = CACHE_INFO.get(code) || {};
      if (f.finds && i.found === true) return true;
      if (f.hides && likelyOwn(code, ll || i.posted)) return true;
      if (f.types.size && i.type != null && f.types.has(Number(i.type))) return true;
      return false;
    }
    window.__gcctFilteredOut = code => filteredOut(code, siteFilter(), knownPos.get(code));
    window.__gcctLikelyOwn = code => likelyOwn(code, knownPos.get(code) || (CACHE_INFO.get(code) || {}).posted);
    // React the moment a filter button changes state (the site may change it only after asking its server).
    let lastFilterSig = siteFilter().sig;
    new MutationObserver(muts => {
      if (!muts.some(m => m.target.matches && m.target.matches('.ct_toggle, .pt_toggle, .ct_mf, .ct_mo, .ct_mdnf'))) return;
      const s = siteFilter().sig;
      if (s !== lastFilterSig) {
        filterChangedAt = Date.now();
        setTimeout(queueUnseenCaches, 300);
        try { refreshAuto(true); } catch (e) { /* ignore */ }
        if (window.__gcctRefreshFav) window.__gcctRefreshFav();
      }
      lastFilterSig = s;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    // Does the site leave this cache out right now (its sidebar filters)? Only answered where we can
    // tell: on /map, where the site's cache list for that spot is loaded at this zoom but lacks the
    // cache; on /play/map, from the caches its WebGL map has drawn in view. Otherwise "no".
    function siteHides(grid) {
      try {
        if (grid) {
          const z = map.getZoom(), drawn = new Set(rawCachePositions(grid).keys());
          const tileOf = q => { const n = 2 ** z, x = Math.floor((q.lng + 180) / 360 * n), r = q.lat * Math.PI / 180;
            const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); return `${z}_${x}_${y}`; };
          return (code, q) => { const tl = q && grid._cache[tileOf(q)]; return !!tl && !!tl.data && !drawn.has(code); };
        }
        const gl = glDrawnCodes();
        if (gl && gl.size) {
          const b = map.getBounds();
          return (code, q) => !!q && !gl.has(code) && b.contains(L.latLng(q.lat, q.lng));
        }
      } catch (e) { /* no information */ }
      return () => false;
    }
    function refreshAuto(force) {
      try {
        if (!(autoOn || marksOn) || map.getZoom() < MARK_MIN_ZOOM) {
          autoLayer.clearLayers(); syncMarks([]); autoSig = '';
          if (lastSolved.length) { lastSolved = []; if (window.__gcctFavKick) window.__gcctFavKick(); }
          return;
        }
        const grid = cacheGrid();
        let all, extra = '';
        if (grid) {
          requestMissingGrids(grid);
          all = [...cachePositions(grid).entries()].map(([code, p]) => ({ code, ll: L.latLng(p.lat, p.lng) }));
          extra = Object.keys(grid._cache).length;
        } else {
          all = markerCaches();
        }
        const sf = siteFilter();
        all = all.filter(c => !filteredOut(c.code, sf, c.ll));
        // Only traditional caches and caches with solved coordinates get a circle.
        // A circle is drawn when any part of it can be in view: its centre may be up to 161 m outside.
        // Solved caches are judged by their solved position, not by where the site draws their icon.
        const bounds0 = map.getBounds(), view0 = bounds0.pad ? bounds0.pad(0.25) : bounds0;
        const mLat = 200 / 111320, mLng = 200 / (111320 * Math.max(0.05, Math.cos(map.getCenter().lat * Math.PI / 180)));
        const near = ll => ll.lat >= bounds0.getSouth() - mLat && ll.lat <= bounds0.getNorth() + mLat &&
          ll.lng >= bounds0.getWest() - mLng && ll.lng <= bounds0.getEast() + mLng;
        const visible = all.filter(c => view0.contains(c.ll));
        // Search each area once per visit: remembered types are not enough, since solved coordinates
        // are only known from the site's current answer.
        if (visible.some(c => !c.code || !inSearch.has(c.code))) searchArea(map.getBounds());
        const pos = [], solvedMarks = [], done = new Set();
        circleWhy = [];
        let unknown = 0;
        all.forEach(c => {
          const p = circlePosition(c.code, c.ll);
          if (!p) {
            if (view0.contains(c.ll) && (!c.code || !CACHE_INFO.has(c.code) || CACHE_INFO.get(c.code).type == null)) unknown++;
            return;
          }
          if (c.code) done.add(c.code);
          const sp = L.latLng(p.lat, p.lng);
          if (!near(sp)) return;
          pos.push(sp);
          circleWhy.push({ code: c.code, from: 'cache list', at: [+sp.lat.toFixed(5), +sp.lng.toFixed(5)] });
          // A solved cache whose icon is elsewhere (found caches go back to the posted coordinates):
          // put a clickable mark in the middle of its circle.
          const ci = c.code && CACHE_INFO.get(c.code);
          // Your own solved caches keep the site's icon: an invisible mark on top of it only gives the hover text.
          if (ci && wantsMark(ci) && distM(sp, c.ll) > 10) solvedMarks.push({ ll: sp, code: c.code });
          // Every other solved cache (your own, and ones you haven't found) whose icon sits on the corrected spot.
          else if (ci && ci.solved && ci.corrected && !wantsMark(ci) && distM(sp, c.ll) <= 25) solvedMarks.push({ ll: sp, code: c.code, ghost: true });
        });
        // Physical stages and finals from the cache pages (multis, mysteries, Wherigos, letterboxes).
        const wanted = visible.filter(c => c.code && STAGE_TYPES.has((CACHE_INFO.get(c.code) || {}).type) && !stagesOf(c.code)).slice(0, 40).map(c => c.code);
        // Physical stages and finals are only shown with the circles.
        if (autoOn && wanted.length && map.getZoom() >= STAGE_MIN_ZOOM) fetchStages(wanted);
        const stageMarks = [];
        if (autoOn && map.getZoom() >= AUTO_MIN_ZOOM) all.forEach(c => {
          const st = c.code && stagesOf(c.code);
          if (!st) return;
          st.forEach(([la, ln, kind, nm, at]) => {
            const ex = (CACHE_INFO.get(c.code) || {}).posted;
            if (at === 'posted') { la = ex ? ex.lat : c.ll.lat; ln = ex ? ex.lng : c.ll.lng; }
            const sp = L.latLng(la, ln);
            if (!near(sp) || pos.some(q => distM(q, sp) < 5)) return;
            pos.push(sp);
            stageMarks.push({ ll: sp, code: c.code, kind, name: nm });
          });
        });
        lastStages = stageMarks;
        // Solved caches whose icon is not on the map at all right now (zoomed in away from it).
        const hiddenBySite = siteHides(grid);
        CACHE_INFO.forEach((i, code) => {
          if (done.has(code) || !i.solved || !i.corrected || !(seenThisVisit.has(code) || i.fromPage || i.fromStore)) return;
          // Filtered out in the site's sidebar (type, my finds, my hides …): no circle or mark either.
          if (filteredOut(code, sf, i.posted) || hiddenBySite(code, i.found === true ? i.posted : i.corrected)) return;
          const sp = L.latLng(i.corrected.lat, i.corrected.lng);
          if (!near(sp)) return;
          pos.push(sp);
          circleWhy.push({ code, from: 'solved, icon elsewhere', found: i.found, at: [+sp.lat.toFixed(5), +sp.lng.toFixed(5)] });
          if (wantsMark(i) || ownMark(i)) solvedMarks.push({ ll: sp, code });
        });
        autoStats = { caches: all.length, inView: visible.length, circles: autoOn ? pos.length : 0, marks: solvedMarks.length + lastStages.length, unknownType: unknown };
        if (visible.length && unknown === visible.length && !typeWarned && ++noTypeTries === 6) {
          typeWarned = true;
          toast(T('The cache types are not known yet, so no 161 m circles are drawn. (Details: type gcctReport() in the console.)'));
        }
        if (unknown < visible.length) noTypeTries = 0;
        if (!all.length) {
          // Give the site a few seconds to load caches before saying anything.
          if (++noCacheTries === 5 && !gridWarned) {
            gridWarned = true;
            toast(T('No geocache positions found on this map yet, so no circles can be drawn. (Details: type gcctReport() in the console.)'));
            console.warn('[gcct] no cache positions: no UTFGrid and no markers found');
          }
        } else noCacheTries = 0;
        const bounds = map.getBounds();
        const sig = [sf.sig, autoOn, marksOn, map.getZoom(), bounds.toBBoxString ? bounds.toBBoxString() : JSON.stringify(bounds), pos.length, all.length, extra, CACHE_INFO.size].join('|');
        if (!force && sig === autoSig) return;
        autoSig = sig;
        autoLayer.clearLayers();
        const view = bounds.pad ? bounds.pad(0.25) : bounds;
        const circlesNow = autoOn && map.getZoom() >= AUTO_MIN_ZOOM;   // at zoom 12–14 only the marks
        const smallMarks = map.getZoom() < MARK_FULL_ZOOM ? (map.getZoom() < MARK_DOT_ZOOM ? 'dot' : 'small') : false;
        if (circlesNow) pos.forEach(ll => autoLayer.addLayer(geoCircle(ll, 161, AUTO_STYLE)));
        const nameOf = c => (CACHE_INFO.get(c) || {}).name || '', foundOf = c => (CACHE_INFO.get(c) || {}).found === true;
        syncMarks([
          ...solvedMarks.filter(m => !(m.ghost && smallMarks)).map(m => [`s|${m.code}|${m.ll.lat.toFixed(6)},${m.ll.lng.toFixed(6)}|${!!m.ghost}|${foundOf(m.code)}|${nameOf(m.code)}|${smallMarks}`, () => solvedMark(m.ll, m.code, m.ghost, smallMarks)]),
          ...lastStages.map(m => [`w|${m.code}|${m.ll.lat.toFixed(6)},${m.ll.lng.toFixed(6)}|${m.kind}|${m.name}|${nameOf(m.code)}`, () => stageMark(m)]),
        ]);
        lastSolved = solvedMarks;
        if (window.__gcctFavKick) window.__gcctFavKick();          // hearts and D/T at the marks
      } catch (e) { console.error('[gcct] auto circles failed', e); }
    }
    function setAuto(on) {
      autoOn = on;
      save('gcct.autoCircles', on);
      if (autoBtn) autoBtn.classList.toggle('active', on);
      if (on && map.getZoom() < AUTO_MIN_ZOOM) toast(T('161 m circles are shown from zoom level {z}. Zoom in to see them.', { z: AUTO_MIN_ZOOM }));
      restartAuto();
    }
    // Marks at solved caches and stages on their own (they are always shown with the circles).
    function setMarks(on) {
      marksOn = on;
      save('gcct.marks', on);
      if (marksBtn) marksBtn.classList.toggle('active', on);
      if (on && !autoOn && map.getZoom() < MARK_MIN_ZOOM) toast(T('Marks are shown from zoom level {z}. Zoom in to see them.', { z: MARK_MIN_ZOOM }));
      restartAuto();
    }
    function restartAuto() {
      clearInterval(autoTimer);
      if (autoOn || marksOn) autoTimer = setInterval(refreshAuto, 1500);   // picks up grid tiles as the site loads them
      refreshAuto(true);
    }
    map.on('moveend', () => refreshAuto());
    map.on('zoomend', () => refreshAuto());

    // Small message that fades out by itself.
    function toast(msg) {
      const t = document.createElement('div');
      t.className = 'gcct-toast';
      t.textContent = msg;
      (document.fullscreenElement || document.documentElement).appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; }, 3500);
      setTimeout(() => t.remove(), 4200);
    }

    // --- Toolbar -----------------------------------------------------------
    const Bar = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const bar = L.DomUtil.create('div', 'gcct-bar leaflet-control');
        L.DomEvent.disableClickPropagation(bar);
        const add = (key, ico, title, fn) => {
          const raw = title, titleOf = typeof raw === 'function' ? raw : () => T(raw);
          title = titleOf();
          const a = L.DomUtil.create('a', '', bar);
          a.innerHTML = icon(ico); a.title = title; a.href = '#';
          a.setAttribute('role', 'button'); a.setAttribute('aria-label', title);
          labelled.push([a, titleOf]);
          a.onclick = ev => { ev.preventDefault(); fn(); };
          if (key) btns[key] = a;
          return a;
        };
        zoomInBtn = add(null, 'plus', 'Zoom in  ( + )', () => map.zoomIn());
        zoomOutBtn = add(null, 'minus', 'Zoom out  ( − )', () => map.zoomOut());
        add(null, 'search', 'Search place, address or coordinates  ( / )', openSearch).classList.add('sep');
        add('measure', 'ruler', 'Measure distance & bearing (click points, double-click for new line, Esc to stop)', () => setMode('measure'));
        add(null, 'route', 'Route: pick geocaches and pins, and export them as a GPX route', openRoute);
        autoBtn = add(null, 'circles', () => T('161 m circles around traditional caches, physical stages and caches with solved coordinates (from zoom {z}). Right-click the map for a single circle anywhere.', { z: AUTO_MIN_ZOOM }), () => setAuto(!autoOn));
        autoBtn.classList.add('danger');
        marksBtn = add(null, 'solved', () => T('Marks at solved caches (from zoom {z}, on/off). Always shown with the 161 m circles.', { z: MARK_MIN_ZOOM }), () => setMarks(!marksOn));
        marksBtn.classList.toggle('active', marksOn);
        const favOn = () => !!(api.favSettings && api.favSettings().show);
        const favBtn = add(null, 'heart', () => T('Favourite points on the map (from zoom {z}, on/off). The lowest number is set in Settings.', { z: FAV_MIN_ZOOM }), () => {
          const on = !favOn();
          if (api.setFavShow) api.setFavShow(on);
          favBtn.classList.toggle('active', on);
          if (on && map.getZoom() < FAV_MIN_ZOOM) toast(T('Favourite points are shown from zoom level {z}. Zoom in to see them.', { z: FAV_MIN_ZOOM }));
        });
        favBtn.classList.toggle('active', favOn());
        const dtOn = () => !!(api.dtSettings && api.dtSettings().show);
        const dtBtn = add(null, 'dt', () => T('Difficulty/terrain (D/T) below the caches on the map (from zoom {z}, on/off)', { z: FAV_MIN_ZOOM }), () => {
          const on = !dtOn();
          if (api.setDtShow) api.setDtShow(on);
          dtBtn.classList.toggle('active', on);
          if (on && map.getZoom() < FAV_MIN_ZOOM) toast(T('D/T is shown from zoom level {z}. Zoom in to see it.', { z: FAV_MIN_ZOOM }));
        });
        dtBtn.classList.toggle('active', dtOn());
        // (FTF marks are turned on and off in Settings only.)
        window.__gcctFavBtnSync = () => { favBtn.classList.toggle('active', favOn()); dtBtn.classList.toggle('active', dtOn()); };
        const hidOn = () => !!(cacheHider && cacheHider.on());
        const hideBtn = add(null, 'eyeoff', () => T(hidOn() ? 'Show the geocaches again' : 'Hide all geocaches'), () => {
          if (cacheHider) cacheHider.set(!hidOn());
          hideBtn.innerHTML = icon(hidOn() ? 'eye' : 'eyeoff');
          hideBtn.classList.toggle('active', hidOn());
          hideBtn.title = T(hidOn() ? 'Show the geocaches again' : 'Hide all geocaches');
          hideBtn.setAttribute('aria-label', hideBtn.title);
        });
        locBtn = add(null, 'locate', () => T(locShown.length ? 'Hide my location' : 'Show my location'), locate);
        locBtn.classList.add('sep');
        homeBtn = add(null, 'home', () => { const h = load('gcct.home', null); return h ? T('Go home: {name}  (right-click the button to change)', { name: h.name }) : T('Set your home address'); }, goHome);
        homeBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openSearch({ home: true }); });
        fsBtn = add(null, 'expand', () => T(document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'), fullscreen);
        add(null, 'eraser', 'Clear all drawings', () => { tools.clearLayers(); circles.length = 0; finishMeasure(); locShown = []; setLocActive(false); pinRecs = []; savePins(); }).classList.add('sep');
        add(null, 'gear', 'Settings', () => api.openSettings && api.openSettings()).classList.add('sep');
        return bar;
      },
    });
    const barCtl = new Bar().addTo(map);
    updZoomBtns();
    if (autoOn) setTimeout(() => setAuto(true), 0);
    else if (marksOn) setTimeout(() => setMarks(true), 0);


    // --- Place / address / coordinate search --------------------------------
    // One combined list, updated as you type:
    //   coordinates (parsed locally) · place names and addresses in Norway (Kartverket, Geonorge)
    //   · places abroad (Photon by komoot – OpenStreetMap data, made for search-as-you-type).
    const GN = 'https://ws.geonorge.no';
    const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase());
    async function getJSON(url, signal) {
      const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
    const zoomForType = t => /fylke/i.test(t) ? 9 : /kommune/i.test(t) ? 11 : /^by$|tettsted|bygd|grend/i.test(t) ? 13 : 15;
    async function searchNorwayPlaces(q, signal) {
      const j = await getJSON(`${GN}/stedsnavn/v1/sted?sok=${encodeURIComponent(q)}&fuzzy=true&utkoordsys=4258&treffPerSide=7&side=1`, signal);
      return (j.navn || []).map(n => {
        const p = n.representasjonspunkt || {}, type = n.navneobjekttype || '';
        const where = [(n.kommuner || []).map(k => k.kommunenavn).join(', '), (n.fylker || []).map(f => f.fylkesnavn).join(', ')]
          .filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
        return { kind: 'place', name: ((n.stedsnavn || [])[0] || {}).skrivemåte || q, sub: [type, where].filter(Boolean).join(' · '),
          lat: Number(p.nord), lng: Number(p['øst']), zoom: zoomForType(type) };
      }).filter(r => isFinite(r.lat) && isFinite(r.lng));
    }
    async function searchNorwayAddresses(q, signal) {
      const j = await getJSON(`${GN}/adresser/v1/sok?sok=${encodeURIComponent(q)}&fuzzy=true&utkoordsys=4258&treffPerSide=5`, signal);
      return (j.adresser || []).map(a => {
        const p = a.representasjonspunkt || {}, kommune = titleCase(a.kommunenavn), post = titleCase(a.poststed);
        return { kind: 'addr', name: a.adressetekst, sub: [[a.postnummer, post].filter(Boolean).join(' '), kommune !== post ? kommune : ''].filter(Boolean).join(' · '),
          lat: Number(p.lat), lng: Number(p.lon), zoom: 17 };
      }).filter(r => isFinite(r.lat) && isFinite(r.lng));
    }
    // Places abroad. Norway is left out here – Kartverket covers it better.
    const photonZoom = t => ({ country: 5, state: 7, county: 9, city: 12, district: 14, locality: 14, street: 16, house: 17 })[t] || 14;
    async function searchAbroad(q, signal) {
      const c = map.getCenter(), lang = LANG === 'no' ? 'default' : 'en';
      const j = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=${lang}`
        + `&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`, signal);
      return (j.features || []).map(f => {
        const p = f.properties || {}, xy = (f.geometry && f.geometry.coordinates) || [];
        if (String(p.countrycode || '').toUpperCase() === 'NO') return null;
        const street = [p.street, p.housenumber].filter(Boolean).join(' ');
        const name = p.name || street || p.city || p.county || p.state || p.country;
        const sub = [name !== street ? street : '', [p.postcode, p.city !== name ? p.city : ''].filter(Boolean).join(' '),
          p.county !== name ? p.county : '', p.state !== name ? p.state : '', p.country !== name ? p.country : '']
          .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
        const e = Array.isArray(p.extent) && p.extent.length === 4 ? p.extent.map(Number) : null;   // [minLon, maxLat, maxLon, minLat]
        return { kind: 'abroad', name, sub, lat: Number(xy[1]), lng: Number(xy[0]), zoom: photonZoom(p.type),
          bounds: e ? [e[3], e[1], e[0], e[2]] : null };                                           // [south, north, west, east]
      }).filter(r => r && r.name && isFinite(r.lat) && isFinite(r.lng)).slice(0, 6);
    }

    // A geocache by its GC code: from what the script already knows, otherwise from the cache page
    // (read like when you open it yourself). Solved coordinates are offered too when you have them.
    async function searchGC(code, signal) {
      code = code.toUpperCase();
      let i = CACHE_INFO.get(code) || {}, posted = i.posted, corrected = i.solved ? i.corrected : null, name = i.name;
      if (!posted) {
        const r = await fetch('/geocache/' + encodeURIComponent(code), { credentials: 'same-origin', signal });
        if (!r.ok) return [];
        const html = await r.text(), pc = pageCoords(html);
        posted = pc.posted; corrected = pc.corrected || corrected;
        const nm = html.match(/id="ctl00_ContentBody_CacheName"[^>]*>([^<]{1,120})</);
        if (nm && !name) { const el = document.createElement('textarea'); el.innerHTML = nm[1].trim(); name = el.value; }
      }
      const out = [];
      const row = (q, what) => out.push({ kind: 'gc', code, name: code + (name ? ' · ' + name : ''), sub: `${what} · ${fmtDMM(q.lat, q.lng)}`, lat: q.lat, lng: q.lng, zoom: 17 });
      if (corrected) row(corrected, T('Solved coordinates'));
      if (posted) row(posted, T('Posted coordinates'));
      return out;
    }

    let lastSearch = '';
    // --- Home address ----------------------------------------------------------
    function setHome(h) {
      save('gcct.home', h);
      toast(T('Home set: {name}', { name: h.name }));
      if (homeBtn) { homeBtn.title = T('Go home: {name}  (right-click the button to change)', { name: h.name }); homeBtn.setAttribute('aria-label', homeBtn.title); }
    }
    function goHome() {
      const h = load('gcct.home', null);
      if (!h) return openSearch({ home: true });
      const ll = L.latLng(h.lat, h.lng);
      map.setView(ll, Math.max(map.getZoom(), 16));
      pin(ll, '#bf8700');
      label(ll, icon('home', 13) + ' ' + esc(h.name));
    }

    function openSearch(opts = {}) {
      const homeMode = !!opts.home, home = load('gcct.home', null);
      const d = api.openDialog(homeMode ? T('Set home address') : T('Find a place'), `
        <input class="gcct-q" placeholder="${T(homeMode ? 'Place name, address or coordinates' : 'Place name, address, coordinates or GC code')}" value="${homeMode ? '' : esc(lastSearch)}">
        <p class="hint">${homeMode
          ? T('Search for your address and pick it from the list. You can also right-click the map and choose “Set as home”.')
          : T('Places in Norway, addresses and places abroad appear as you type. A GC code finds the geocache. Use <b>↑</b> <b>↓</b> and <b>Enter</b> to pick one. Tip: press <b>/</b> on the map to open this box.')}</p>
        ${homeMode && home ? `<p class="hint homeline">${icon('home', 16)} <b>${esc(home.name)}</b> &nbsp;<button data-a="clearhome">${T('Remove home address')}</button></p>` : ''}
        <div class="gcct-results"></div>`);
      const ch = d.querySelector('[data-a=clearhome]');
      if (ch) ch.onclick = () => {
        try { localStorage.removeItem('gcct.home'); } catch (e) { /* ignore */ }
        if (homeBtn) { homeBtn.title = T('Set your home address'); homeBtn.setAttribute('aria-label', homeBtn.title); }
        api.closeDialog();
      };
      const q = d.querySelector('.gcct-q'), out = d.querySelector('.gcct-results');
      const SOURCES = [['place', searchNorwayPlaces, 2, 'Kartverket'], ['addr', searchNorwayAddresses, 2, 'Kartverket'], ['abroad', searchAbroad, 3, 'Photon']];
      const TAG = { gc: () => T('Geocache'), coord: () => T('Coordinates'), place: () => T('Place'), addr: () => T('Address'), abroad: () => T('Abroad') };
      let res = {}, pending = 0, failed = [], items = [], sel = -1, seq = 0, ctrl = null, timer = null, picked = null;

      // Rank all hits together, best match first, whatever service they came from:
      //   1. how well the name matches what you typed (exact → starts with → a word starts with → contains)
      //   2. addresses first if you typed a house number, otherwise places in Norway, then addresses, then abroad
      //   3. bigger areas before smaller ones (county before village before farm)
      const norm = t => String(t || '').toLocaleLowerCase('nb').normalize('NFC').trim();
      function rank(list, text) {
        const t = norm(text), hasNumber = /\d/.test(text);
        const match = r => {
          const n = norm(r.name);
          if (!t) return 4;
          if (n === t) return 0;
          if (n.startsWith(t)) return 1;
          if (n.split(/[\s,\-/]+/).some(w => w.startsWith(t))) return 2;
          return n.includes(t) ? 3 : 4;
        };
        if (list.length && list.every(r => r.kind === 'gc')) return list;      // solved first, then posted
        const kindOrder = hasNumber ? { gc: 0, coord: 0, addr: 1, place: 2, abroad: 3 } : { gc: 0, coord: 0, place: 1, addr: 2, abroad: 3 };
        return list.map((r, i) => ({ r, k: [match(r), kindOrder[r.kind] ?? 9, r.zoom || 15, i] }))
          .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.k[3] - b.k[3])
          .map(x => x.r);
      }

      function highlight(i) {
        sel = i;
        out.querySelectorAll('.gr').forEach(el => {
          const on = +el.dataset.i === i;
          el.classList.toggle('on', on);
          if (on && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        });
      }
      function draw() {
        // One ranked list mixing coordinates, places in Norway, addresses and places abroad.
        items = rank(['gc', 'coord', 'place', 'addr', 'abroad'].flatMap(k => res[k] || []), q.value);
        let html = items.map((r, i) => `<div class="gr" data-i="${i}"><b>${esc(r.name)}</b>
          <span><em class="tag tag-${r.kind}">${esc(TAG[r.kind]())}</em>${esc(r.sub || '')}</span></div>`).join('');
        const text = q.value.trim();
        if (pending) html += `<div class="gm">${esc(T('Searching…'))}</div>`;
        else if (!items.length && text.length >= 2) html += `<div class="gm">${esc(T('Nothing found.'))}</div>`;
        if (failed.length && !pending) html += `<div class="gm err">${esc(T('Some search services did not answer: {list}', { list: [...new Set(failed)].join(', ') }))}</div>`;
        out.innerHTML = html;
        out.querySelectorAll('.gr').forEach(el => {
          el.onclick = () => choose(items[+el.dataset.i]);
          el.onmouseenter = () => { highlight(+el.dataset.i); picked = items[sel]; };
        });
        // Keep the hit you moved to with ↑/↓ highlighted when more results arrive; otherwise the best hit.
        const keep = picked ? items.indexOf(picked) : -1;
        highlight(items.length ? (keep >= 0 ? keep : 0) : -1);
      }
      function search() {
        clearTimeout(timer);
        timer = null;
        const text = q.value.trim();
        if (!homeMode) lastSearch = text;
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        const my = ++seq, signal = ctrl.signal;
        res = {}; failed = []; pending = 0; sel = 0; picked = null;
        const ll = text && parseCoord(text);
        if (ll) res.coord = [{ kind: 'coord', name: fmtDMM(ll[0], ll[1]), sub: `${fmtDD(ll[0], ll[1])} · UTM ${fmtUTM(ll[0], ll[1])}`, lat: ll[0], lng: ll[1], zoom: 16 }];
        const gc = !homeMode && /^GC[0-9A-Z]{1,7}$/i.test(text.replace(/\s+/g, '')) ? text.replace(/\s+/g, '') : null;
        if (gc) {
          pending++;
          searchGC(gc, signal).then(list => { if (my === seq) res.gc = list; })
            .catch(e => { if (my === seq && e.name !== 'AbortError') failed.push('geocaching.com'); })
            .finally(() => { if (my === seq) { pending--; draw(); } });
        }
        if (!ll && !gc) SOURCES.forEach(([key, fn, minLen, label]) => {
          if (text.length < minLen) return;
          pending++;
          fn(text, signal).then(list => { if (my === seq) res[key] = list; })
            .catch(e => { if (my === seq && e.name !== 'AbortError') failed.push(label); })
            .finally(() => { if (my === seq) { pending--; draw(); } });
        });
        draw();
      }
      function choose(r) {
        if (!r) return;
        api.closeDialog();
        if (homeMode) { setHome({ lat: r.lat, lng: r.lng, name: r.name + (r.sub && r.kind === 'addr' ? ', ' + r.sub.split(' · ')[0] : '') }); goHome(); return; }
        const ll = L.latLng(r.lat, r.lng);
        if (r.bounds && r.bounds.length === 4 && r.bounds.every(isFinite) && r.bounds[0] !== r.bounds[1]) {
          map.fitBounds([[r.bounds[0], r.bounds[2]], [r.bounds[1], r.bounds[3]]], { maxZoom: 17 });
        } else {
          map.setView(ll, r.zoom || 15);
        }
        namedPin(ll, r.name);
      }

      q.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 300); };
      q.onkeydown = e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (items.length) { highlight((sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length); picked = items[sel]; }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (timer) { search(); return; }                 // typed faster than the search: search first
          if (sel >= 0 && items[sel]) choose(items[sel]);
        }
      };
      setTimeout(() => { q.focus(); q.select(); }, 0);
      if (lastSearch && !homeMode) search();
    }

    // "/" opens the search from anywhere on the page (except while typing in a field).
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = document.activeElement;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      openSearch();
    });

    // Your location: one click shows it (blue dot and accuracy circle), the next click removes it again.
    function setLocActive(on) {
      if (!locBtn) return;
      locBtn.classList.toggle('active', on);
      locBtn.title = T(on ? 'Hide my location' : 'Show my location');
      locBtn.setAttribute('aria-label', locBtn.title);
    }
    function locate() {
      locShown = locShown.filter(l => !tools.hasLayer || tools.hasLayer(l));     // "Clear all drawings" may have removed it
      if (locShown.length) {
        locShown.forEach(l => { try { tools.removeLayer(l); } catch (e) { /* already gone */ } });
        locShown = [];
        setLocActive(false);
        return;
      }
      map.once('locationfound', e => {
        locShown.forEach(l => { try { tools.removeLayer(l); } catch (err) { /* ignore */ } });
        const c = geoCircle(e.latlng, e.accuracy, { color: '#1976d2', weight: 1, fillOpacity: 0.1 }).addTo(tools);
        locShown = [c, pin(e.latlng, '#1976d2')];
        setLocActive(true);
      });
      map.once('locationerror', e => toast(T('Location unavailable: {e}', { e: e.message })));
      map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    }

    function fullscreen() {
      const el = map.getContainer();
      if (document.fullscreenElement) document.exitFullscreen();
      else el.requestFullscreen && el.requestFullscreen();
    }
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 200);   // and lay out the toolbar again
      if (fsBtn) {
        const on = !!document.fullscreenElement;
        fsBtn.innerHTML = icon(on ? 'shrink' : 'expand');
        fsBtn.title = T(on ? 'Exit fullscreen' : 'Fullscreen');
        fsBtn.setAttribute('aria-label', fsBtn.title);
      }
    });
    function relabel() {
      labelled.forEach(([a, f]) => { a.title = f(); a.setAttribute('aria-label', a.title); });
      coordCtl.getContainer().querySelector('.ctext').title = T('Click to switch coordinate format');
      coordCtl.getContainer().querySelector('.zin').title = T('Zoom level – type a number to zoom');
      coordCtl.getContainer().querySelector('.zl').textContent = T('Zoom');
    }
    // --- Route ----------------------------------------------------------------------------------------
    // A searchable list of geocaches (solved or not) and pins; pick stops in order, see the route on the map,
    // and download it as a GPX route for a GPS. Kept for this browser tab (sessionStorage).
    const ROUTE_KEY = 'gcct.route';
    let route = [];
    try { route = JSON.parse(sessionStorage.getItem(ROUTE_KEY) || '[]') || []; } catch (e) { route = []; }
    const saveRoute = () => { try { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(route)); } catch (e) { /* blocked */ } };
    // A round trip: back to the first stop at the end (kept for the tab like the route).
    let routeLoop = false;
    try { routeLoop = sessionStorage.getItem('gcct.routeLoop') === '1'; } catch (e) { /* blocked */ }
    const setRouteLoop = on => { routeLoop = !!on; try { sessionStorage.setItem('gcct.routeLoop', routeLoop ? '1' : '0'); } catch (e) { /* blocked */ } };
    // The stops in order, with the start again at the end when the route is a round trip.
    const routeStops = () => routeLoop && route.length > 1 ? route.concat([route[0]]) : route;
    const routeLayer = L.layerGroup().addTo(map);
    routeLayer.__gcct = true;
    function drawRoute() {
      routeLayer.clearLayers();
      if (!route.length) return;
      const lls = routeStops().map(r => L.latLng(r.lat, r.lng));
      if (lls.length > 1) routeLayer.addLayer(L.polyline(lls, { color: '#8250df', weight: 3, opacity: 0.85, dashArray: '6 6', interactive: false }));
      route.forEach((r, i) => {
        const m = L.marker(lls[i], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'gcct-rtnum', html: `<span>${i + 1}</span>`, iconSize: [18, 18], iconAnchor: [9, 26] }) });
        m.__gcct = true;
        routeLayer.addLayer(m);
      });
    }
    const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
    // Distance and bearing from the previous stop, e.g. "1.2 km 045°".
    const legText = (i, pts = routeStops()) => { const a = L.latLng(pts[i - 1].lat, pts[i - 1].lng), b = L.latLng(pts[i].lat, pts[i].lng); return `${fmtDist(distM(a, b))} ${String(Math.round(bearing(a, b)) % 360).padStart(3, '0')}°`; };
    // Zoom to the whole route in the part of the map the dialog leaves free (the widest free side).
    function freeArea(el) {
      const mr = map.getContainer().getBoundingClientRect(), pad = 40;
      const out = { tl: [pad, pad], br: [pad, pad] };
      el = el && el.closest ? (el.closest('.gcct-dlg') || el) : el;
      const r = el && el.getBoundingClientRect && el.getBoundingClientRect();
      if (!r || r.right <= mr.left || r.left >= mr.right || r.bottom <= mr.top || r.top >= mr.bottom) return out;
      const free = { left: r.left - mr.left, right: mr.right - r.right, top: r.top - mr.top, bottom: mr.bottom - r.bottom };
      const horiz = k => k === 'left' || k === 'right', share = k => free[k] / (horiz(k) ? mr.width : mr.height);
      const side = Object.keys(free).sort((a, b) => share(b) - share(a)).find(k => free[k] >= (horiz(k) ? 160 : 120));
      if (!side) return out;
      if (side === 'left') out.br[0] = mr.right - r.left + pad;
      if (side === 'right') out.tl[0] = r.right - mr.left + pad;
      if (side === 'top') out.br[1] = mr.bottom - r.top + pad;
      if (side === 'bottom') out.tl[1] = r.bottom - mr.top + pad;
      return out;
    }
    // Centre a point in the free area at zoom z.
    function showInFree(ll, z, avoid) {
      const fa = freeArea(avoid), sz = map.getSize();
      const px = L.point((fa.tl[0] + sz.x - fa.br[0]) / 2, (fa.tl[1] + sz.y - fa.br[1]) / 2);
      map.setView(map.unproject(map.project(ll, z).subtract(px).add(sz.divideBy(2)), z), z);
    }
    function fitRoute(avoid) {
      if (!route.length) return;
      const fa = freeArea(avoid);
      try {
        if (route.length === 1) { showInFree(L.latLng(route[0].lat, route[0].lng), Math.max(map.getZoom(), 15), avoid); return; }
        map.fitBounds(L.latLngBounds(route.map(r => [r.lat, r.lng])), { paddingTopLeft: fa.tl, paddingBottomRight: fa.br, maxZoom: 17 });
      } catch (e) { /* ignore */ }
    }
    const routeLength = () => routeStops().reduce((sum, r, i, pts) => i ? sum + distM(L.latLng(pts[i - 1].lat, pts[i - 1].lng), L.latLng(r.lat, r.lng)) : 0, 0);
    // Everything you can pick: pins, and every geocache the script knows a position for (solved ones at the solved spot).
    function routeCandidates() {
      const out = [];
      pinRecs.forEach(r => out.push({ key: 'p:' + r.id, kind: 'pin', name: r.name, lat: r.lat, lng: r.lng }));
      const seen = new Set();
      CACHE_INFO.forEach((i, code) => {
        const q = i && (i.solved && i.corrected ? i.corrected : i.posted || knownPos.get(code));
        if (!q || !isFinite(q.lat)) return;
        seen.add(code);
        out.push({ key: 'c:' + code, kind: 'cache', code, name: i.name || '', lat: +q.lat, lng: +q.lng, solved: !!(i.solved && i.corrected), found: i.found === true, type: i.type, dt: i.diff != null && i.terr != null ? `${i.diff}/${i.terr}` : '' });
      });
      knownPos.forEach((q, code) => { if (!seen.has(code)) out.push({ key: 'c:' + code, kind: 'cache', code, name: q.name || '', lat: q.lat, lng: q.lng }); });
      return out;
    }
    // --- Geocaches in the GPX route, in Groundspeak's format ---------------------
    // Each geocache in the route goes in as a full waypoint like the GPX file on the cache page
    // (GPX 1.0 with the groundspeak:cache extension: description, hint, attributes, logs and the
    // cache's additional waypoints), so a Garmin or other GPS shows it as a paperless geocache.
    // With Premium the cache page's own GPX file is used; otherwise the same is read from the cache page.
    const GS_TYPE = { 2: 'Traditional Cache', 3: 'Multi-cache', 4: 'Virtual Cache', 5: 'Letterbox Hybrid', 6: 'Event Cache', 8: 'Unknown Cache',
      9: 'Project APE Cache', 11: 'Webcam Cache', 12: 'Locationless (Reverse) Cache', 13: 'Cache In Trash Out Event', 137: 'Earthcache',
      453: 'Mega-Event Cache', 1304: 'GPS Adventures Exhibit', 1858: 'Wherigo Cache', 3653: 'Community Celebration Event', 3773: 'Geocaching HQ',
      3774: 'Geocaching HQ Celebration', 4738: 'Geocaching HQ Block Party', 7005: 'Giga-Event Cache' };
    const GS_ATTR = { dogs: 1, fee: 2, rappelling: 3, boat: 4, scuba: 5, kids: 6, onehour: 7, scenic: 8, hiking: 9, climbing: 10, wading: 11,
      swimming: 12, available: 13, night: 14, winter: 15, poisonoak: 17, dangerousanimals: 18, ticks: 19, mine: 20, cliff: 21, hunting: 22,
      danger: 23, wheelchair: 24, parking: 25, public: 26, water: 27, restrooms: 28, phone: 29, picnic: 30, camping: 31, bicycles: 32,
      motorcycles: 33, quads: 34, jeeps: 35, snowmobiles: 36, horses: 37, campfires: 38, thorn: 39, stealth: 40, stroller: 41, firstaid: 42,
      cow: 43, flashlight: 44, landf: 45, rv: 46, field_puzzle: 47, uv: 48, snowshoes: 49, skiis: 50, 's-tool': 51, nightcache: 52,
      parkngrab: 53, abandonedbuilding: 54, hike_short: 55, hike_med: 56, hike_long: 57, fuel: 58, food: 59, wirelessbeacon: 60,
      partnership: 61, seasonal: 62, touristok: 63, treeclimbing: 64, frontyard: 65, teamwork: 66, geotour: 67, bonuscache: 69,
      powertrail: 70, challengecache: 71, hqsolutioncheck: 72 };
    const GS_NS = 'http://www.groundspeak.com/cache/1/0/1';
    const isoDate = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toISOString().replace(/\.\d+Z$/, ''); };
    const rot13 = t => t.replace(/[a-z]/gi, c => String.fromCharCode((c <= 'Z' ? 65 : 97) + (c.toLowerCase().charCodeAt(0) - 97 + 13) % 26));
    // Hints on the cache page are ROT13 except text in [brackets].
    const unRot = t => t.split(/(\[[^\]]*\])/).map((p, i) => i % 2 ? p : rot13(p)).join('');
    const textOf = el => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); return c.textContent.replace(/[ \t]+\n/g, '\n').trim(); };
    // A log date as the site shows it (in your own date format) → ISO.
    function logDate(v) {
      const t = String(v || '').trim();
      let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T19:00:00Z`;
      m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (m) {                                       // dd.mm.yyyy, dd-mm-yyyy; with / mm/dd/yyyy unless the first number is above 12
        const us = t.includes('/') && +m[1] <= 12, day = us ? m[2] : m[1], mon = us ? m[1] : m[2];
        return `${m[3]}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}T19:00:00Z`;
      }
      const d = new Date(t); return isNaN(d) ? '' : d.toISOString().replace(/\.\d+Z$/, 'Z');
    }
    const gcPages = new Map();                        // code -> Promise<{ html, url, doc }>
    function gcPage(code) {
      if (!gcPages.has(code)) gcPages.set(code, fetch('/geocache/' + encodeURIComponent(code), { credentials: 'same-origin' })
        .then(async r => { if (!r.ok) throw new Error('HTTP ' + r.status); const html = await r.text(); return { html, url: r.url || location.href, doc: new DOMParser().parseFromString(html, 'text/html') }; })
        .catch(e => { gcPages.delete(code); throw e; }));
      return gcPages.get(code);
    }
    // The cache page's own GPX file (the "GPX file" button, Premium): a postback of the page's form.
    async function officialGpx(pg) {
      const form = pg.doc.querySelector('form#aspnetForm') || pg.doc.forms[0];
      const btn = pg.doc.querySelector('input[type=submit][name$="btnGPXDL"], input[type=submit][id$="btnGPXDL"]');
      if (!form || !btn) return null;
      const body = new URLSearchParams();
      form.querySelectorAll('input[type=hidden][name]').forEach(i => body.append(i.name, i.value || ''));
      body.append(btn.name, btn.value || 'GPX file');
      const r = await fetch(new URL(form.getAttribute('action') || pg.url, pg.url).href, { method: 'POST', body, credentials: 'same-origin' });
      if (!r.ok) return null;
      const x = new DOMParser().parseFromString(await r.text(), 'application/xml');
      if (x.querySelector('parsererror') || !x.documentElement || x.documentElement.localName !== 'gpx') return null;
      const w = [...x.documentElement.children].filter(e => e.localName === 'wpt');
      return w.length && w.some(e => e.getElementsByTagNameNS(GS_NS, 'cache').length) ? w : null;
    }
    // The same waypoints read from the cache page.
    function pageWpts(code, pg, i) {
      const doc = pg.doc, $ = sel => doc.querySelector(sel), html = pg.html;
      const pc = pageCoords(html), q = pc.posted || i.posted || knownPos.get(code) || {};
      const name = textOf($('#ctl00_ContentBody_CacheName')) || i.name || code;
      const ownerEl = $('#ctl00_ContentBody_mcd1 a'), owner = ownerEl ? ownerEl.textContent.trim() : (i.ownerName || '');
      const tl = $('a[href*="cache_types"][title], a[href*="cache_types"] img[alt]');
      const type = GS_TYPE[i.type] || (tl && (tl.getAttribute('title') || tl.getAttribute('alt'))) || 'Geocache';
      const star = id => { const m = html.match(new RegExp(id + '[\\s\\S]{0,400}?stars(\\d)(?:_(5))?\\.')); return m ? Number(m[1]) + (m[2] ? 0.5 : 0) : null; };
      const diff = i.diff ?? star('uxLegendScale'), terr = i.terr ?? star('Localize12');
      const sz = (html.match(/\/images\/icons\/container\/([a-z_]+)\.(?:gif|png|svg)/i) || [])[1] || '';
      const container = ({ micro: 'Micro', small: 'Small', regular: 'Regular', large: 'Large', other: 'Other', virtual: 'Virtual', not_chosen: 'Not chosen', unknown: 'Unknown' })[sz.toLowerCase()] || 'Not chosen';
      const loc = textOf($('#ctl00_ContentBody_Location')).replace(/^\S+\s+/, '').split(',').map(t => t.trim()).filter(Boolean);
      const country = loc.length ? loc[loc.length - 1] : '', state = loc.length > 1 ? loc.slice(0, -1).join(', ') : '';
      const attrs = [...doc.querySelectorAll('img[src*="/images/attributes/"]')].map(im => {
        const m = (im.getAttribute('src') || '').match(/attributes\/([\w-]+?)-(yes|no)\./i);
        return m && GS_ATTR[m[1].toLowerCase()] ? `        <groundspeak:attribute id="${GS_ATTR[m[1].toLowerCase()]}" inc="${m[2].toLowerCase() === 'yes' ? 1 : 0}">${xmlEsc(im.getAttribute('title') || im.getAttribute('alt') || m[1])}</groundspeak:attribute>` : '';
      }).filter(Boolean);
      const hintEl = $('#div_hint'), dh = $('#ctl00_ContentBody_lnkDH');
      let hint = textOf(hintEl);
      if (hint && !(dh && /^\s*(encrypt|krypter)/i.test(dh.textContent))) hint = unRot(hint);
      const sd = $('#ctl00_ContentBody_ShortDescription'), ld = $('#ctl00_ContentBody_LongDescription');
      const id = (html.match(/[?&]ID=(\d+)/i) || html.match(/"cacheId"\s*:\s*(\d+)/i) || [])[1] || '';
      const st = i.status, available = st == null || st === 0, archived = st === 2 || st === 'Archived';
      const logsJ = jsonAfter(html, 'initalLogs', 2000000) || jsonAfter(html, 'initialLogs', 2000000);
      const logs = ((logsJ && logsJ.data) || []).slice(0, 20).map(l => {
        const tmp = doc.createElement('div'); tmp.innerHTML = String(l.LogText || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n\n');
        return `        <groundspeak:log id="${xmlEsc(l.LogID || '')}">
          <groundspeak:date>${xmlEsc(logDate(l.Visited || l.Created))}</groundspeak:date>
          <groundspeak:type>${xmlEsc(l.LogType || '')}</groundspeak:type>
          <groundspeak:finder id="${xmlEsc(l.AccountID || '')}">${xmlEsc(l.UserName || '')}</groundspeak:finder>
          <groundspeak:text encoded="False">${xmlEsc(tmp.textContent.trim())}</groundspeak:text>
        </groundspeak:log>`;
      });
      const dt = `${diff ?? ''}/${terr ?? ''}`, placed = isoDate(i.placed);
      const out = [`  <wpt lat="${(+q.lat).toFixed(6)}" lon="${(+q.lng).toFixed(6)}">${placed ? `\n    <time>${placed}</time>` : ''}
    <name>${code}</name>
    <desc>${xmlEsc(`${name} by ${owner}, ${type} (${dt})`)}</desc>
    <url>https://www.geocaching.com/geocache/${code}</url>
    <urlname>${xmlEsc(name)}</urlname>
    <sym>Geocache</sym>
    <type>Geocache|${xmlEsc(type)}</type>
    <groundspeak:cache id="${xmlEsc(id)}" available="${available ? 'True' : 'False'}" archived="${archived ? 'True' : 'False'}" xmlns:groundspeak="${GS_NS}">
      <groundspeak:name>${xmlEsc(name)}</groundspeak:name>
      <groundspeak:placed_by>${xmlEsc(owner)}</groundspeak:placed_by>
      <groundspeak:owner>${xmlEsc(owner)}</groundspeak:owner>
      <groundspeak:type>${xmlEsc(type)}</groundspeak:type>
      <groundspeak:container>${container}</groundspeak:container>
      <groundspeak:attributes>${attrs.length ? '\n' + attrs.join('\n') + '\n      ' : ''}</groundspeak:attributes>
      <groundspeak:difficulty>${xmlEsc(diff ?? '')}</groundspeak:difficulty>
      <groundspeak:terrain>${xmlEsc(terr ?? '')}</groundspeak:terrain>
      <groundspeak:country>${xmlEsc(country)}</groundspeak:country>
      <groundspeak:state>${xmlEsc(state)}</groundspeak:state>
      <groundspeak:short_description html="True">${xmlEsc(sd ? sd.innerHTML.trim() : '')}</groundspeak:short_description>
      <groundspeak:long_description html="True">${xmlEsc(ld ? ld.innerHTML.trim() : '')}</groundspeak:long_description>
      <groundspeak:encoded_hints>${xmlEsc(hint)}</groundspeak:encoded_hints>
      <groundspeak:logs>${logs.length ? '\n' + logs.join('\n') + '\n      ' : ''}</groundspeak:logs>
      <groundspeak:travelbugs />
    </groundspeak:cache>
  </wpt>`];
      // Additional waypoints with coordinates (parking, stages …), named like the site does: prefix + code without "GC".
      const tbl = $('#ctl00_ContentBody_Waypoints');
      if (tbl) [...tbl.querySelectorAll('tbody tr')].forEach((tr, k, rows) => {
        const cells = [...tr.children], ctext = cells.map(c => c.textContent.replace(/\s+/g, ' ').trim());
        const cc = ctext.find(t => /[NS]\s*\d{1,2}°\s*\d/.test(t)), ll = cc && parseCoord(cc.replace(/,/g, '.'));
        if (!ll) return;
        const prefix = (ctext.find(t => /^[A-Z0-9]{2}$/.test(t)) || '').trim();
        if (!prefix) return;
        const a = tr.querySelector('a'), wname = a ? a.textContent.trim() : prefix;
        const img = tr.querySelector('img[src*="wpttypes"]'), wtype = (img && (img.getAttribute('title') || img.getAttribute('alt'))) || ((tr.textContent.match(/\(([^)]+)\)/) || [])[1]) || 'Reference Point';
        const next = rows[k + 1], note = next && !/[NS]\s*\d{1,2}°/.test(next.textContent) ? textOf(next.children[next.children.length - 1]) : '';
        out.push(`  <wpt lat="${ll[0].toFixed(6)}" lon="${ll[1].toFixed(6)}">
    <name>${xmlEsc(prefix + code.slice(2))}</name>
    <cmt>${xmlEsc(note)}</cmt>
    <desc>${xmlEsc(wname)}</desc>
    <url>https://www.geocaching.com/geocache/${code}</url>
    <urlname>${xmlEsc(wname)}</urlname>
    <sym>${xmlEsc(wtype)}</sym>
    <type>Waypoint|${xmlEsc(wtype)}</type>
  </wpt>`);
      });
      return out;
    }
    // The waypoints for one geocache as GPX 1.0 text. Solved caches get the solved coordinates.
    async function cacheWpts(code) {
      const i = CACHE_INFO.get(code) || {}, solved = i.solved && i.corrected ? i.corrected : null;
      const pg = await gcPage(code);
      let list = null;
      try {
        const w = await officialGpx(pg);
        if (w) list = w.map(e => {
          const nm = [...e.children].find(c => c.localName === 'name');
          if (nm && nm.textContent.trim() === code) {
            if (solved) { e.setAttribute('lat', solved.lat); e.setAttribute('lon', solved.lng); }
            const sym = [...e.children].find(c => c.localName === 'sym');
            if (sym && i.found === true) sym.textContent = 'Geocache Found';
          }
          return '  ' + new XMLSerializer().serializeToString(e).replace(/ xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/0"/, '');
        });
      } catch (e) { list = null; }
      if (!list) {
        list = pageWpts(code, pg, i);
        if (solved) list[0] = list[0].replace(/^ {2}<wpt lat="[^"]*" lon="[^"]*">/, `  <wpt lat="${solved.lat}" lon="${solved.lng}">`);
        if (i.found === true) list[0] = list[0].replace('<sym>Geocache</sym>', '<sym>Geocache Found</sym>');
      }
      return list;
    }
    // The plain route: only the stops (GPX 1.1).
    function plainRouteGpx() {
      const pts = routeStops().map(r => `    <rtept lat="${r.lat}" lon="${r.lng}">\n      <name>${xmlEsc(r.kind === 'cache' ? r.code : r.name)}</name>${r.kind === 'cache' && r.name ? `\n      <desc>${xmlEsc(r.name)}</desc>` : ''}\n      <sym>${r.kind === 'cache' ? ((CACHE_INFO.get(r.code) || {}).found === true ? 'Geocache Found' : 'Geocache') : r.kind === 'place' ? 'Flag, Green' : 'Pin, Blue'}</sym>\n    </rtept>`).join('\n');
      const name = `${T('Route')} ${new Date().toISOString().slice(0, 10)}`;
      return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Geocaching Map – Custom Tile Layers" xmlns="http://www.topografix.com/GPX/1/1">\n  <rte>\n    <name>${xmlEsc(name)}</name>\n${pts}\n  </rte>\n</gpx>\n`;
    }
    async function routeGpx(progress, full) {
      if (!full) return { text: plainRouteGpx(), failed: [] };
      const codes = [...new Set(route.filter(r => r.kind === 'cache').map(r => r.code))];
      const wpts = [], failed = [];
      let done = 0;
      for (let k = 0; k < codes.length; k += 3) {           // three at a time
        const part = await Promise.all(codes.slice(k, k + 3).map(c => cacheWpts(c).catch(() => { failed.push(c); return []; })
          .finally(() => progress && progress(++done, codes.length))));
        part.forEach(l => wpts.push(...l));
      }
      const pts = routeStops().map(r => `    <rtept lat="${r.lat}" lon="${r.lng}">\n      <name>${xmlEsc(r.kind === 'cache' ? r.code : r.name)}</name>${r.kind === 'cache' && r.name ? `\n      <desc>${xmlEsc(r.name)}</desc>` : ''}\n      <sym>${r.kind === 'cache' ? ((CACHE_INFO.get(r.code) || {}).found === true ? 'Geocache Found' : 'Geocache') : r.kind === 'place' ? 'Flag, Green' : 'Pin, Blue'}</sym>\n    </rtept>`).join('\n');
      const name = `${T('Route')} ${new Date().toISOString().slice(0, 10)}`;
      const lats = route.map(r => r.lat), lngs = route.map(r => r.lng);
      const text = `<?xml version="1.0" encoding="utf-8"?>
<gpx xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0" creator="Geocaching Map – Custom Tile Layers" xsi:schemaLocation="http://www.topografix.com/GPX/1/0 http://www.topografix.com/GPX/1/0/gpx.xsd http://www.groundspeak.com/cache/1/0/1 http://www.groundspeak.com/cache/1/0/1/cache.xsd" xmlns="http://www.topografix.com/GPX/1/0">
  <name>${xmlEsc(name)}</name>
  <desc>${xmlEsc(T('Route with {n} stops from geocaching.com', { n: route.length }))}</desc>
  <url>https://www.geocaching.com</url>
  <time>${new Date().toISOString()}</time>
  <keywords>cache, geocache</keywords>
  <bounds minlat="${Math.min(...lats)}" minlon="${Math.min(...lngs)}" maxlat="${Math.max(...lats)}" maxlon="${Math.max(...lngs)}" />
${wpts.join('\n')}${wpts.length ? '\n' : ''}  <rte>
    <name>${xmlEsc(name)}</name>
${pts}
  </rte>
</gpx>
`;
      return { text, failed };
    }
    function saveFile(text, fileName, type) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = fileName;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    let routeDlg = null, routeRefresh = null;
    const routeOpen = () => !!(routeDlg && routeDlg.isConnected);
    // A pin renamed on the map gets the new name in the route too (and in an open route window).
    function pinRenamedInRoute(id, name) {
      let hit = false;
      route.forEach(r => { if (r.key === 'p:' + id && r.name !== name) { r.name = name; hit = true; } });
      if (hit) { saveRoute(); drawRoute(); }
      if (routeOpen() && routeRefresh) routeRefresh();
    }
    function addStop(x) {
      if (!x || route.some(r => r.key === x.key)) return false;
      route.push({ key: x.key, kind: x.kind, code: x.code, name: x.name || '', lat: +(+x.lat).toFixed(6), lng: +(+x.lng).toFixed(6) });
      saveRoute(); drawRoute();
      if (routeOpen() && routeRefresh) routeRefresh();
      return true;
    }
    // What a click or right-click at this point would snap to, as a route stop (a pin or a geocache), or null.
    function stopAt(ll) {
      const pn = nearestPin(ll);
      if (pn && pn.m.__pin) return { key: 'p:' + pn.m.__pin.id, kind: 'pin', name: pn.m.__pin.name, lat: pn.m.__pin.lat, lng: pn.m.__pin.lng };
      const c = nearestCache(ll);
      if (c && c.code) { const i = CACHE_INFO.get(c.code) || {}; return { key: 'c:' + c.code, kind: 'cache', code: c.code, name: i.name || c.name || '', lat: c.ll.lat, lng: c.ll.lng }; }
      return null;
    }
    // While the route window is open, a click on a geocache or pin on the map adds it (instead of the site's popup).
    window.addEventListener('click', e => {
      if (!routeOpen() || e.button !== 0) return;
      const root = map.getContainer(), tgt = e.target;
      if (!root.contains(tgt) || (tgt.closest && tgt.closest('.leaflet-popup, .leaflet-control-container, .gcct-dock, .gcct-coord, .gcct-dlg'))) return;
      let ll;
      try { ll = map.mouseEventToLatLng(e); } catch (err) { return; }
      const x = stopAt(ll);
      if (!x) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (addStop(x)) toast(T('Added to the route: {name}', { name: x.kind === 'cache' ? x.code : x.name }));
    }, true);
    function openRoute() {
      const d = api.openDialog(T('Route'), `
        <input class="gcct-q rt-q" placeholder="${esc(T('Search code or name …'))}">
        <p class="hint">${esc(T('Geocaches and pins nearest the middle of the map. Click one – here or on the map – to add it to the route.'))}</p>
        <div class="rt-list"></div>
        <h4 class="rt-h">${esc(T('Route'))} <span class="rt-sum"></span></h4>
        <ol class="rt-route"></ol>
        <div class="rt-pv" style="display:none"></div>
        <div class="btns rt-edit-btns"><button data-a="sort">${esc(T('Sort by nearest'))}</button><button data-a="clear">${esc(T('Clear route'))}</button><label class="rt-full" title="${esc(T('End the route at the first stop again'))}"><input type="checkbox" data-a="loop"> ${esc(T('Back to the start'))}</label><span class="sp"></span><button class="primary" data-a="preview">${esc(T('Preview'))}</button></div>
        <div class="btns rt-pv-btns" style="display:none"><button data-a="back">${esc(T('Back'))}</button><label class="rt-full" title="${esc(T('Each geocache with description, hint, attributes, logs and additional waypoints, like the GPX file on the cache page. Takes a moment, as every cache page is fetched.'))}"><input type="checkbox" data-a="full"> ${esc(T('Full cache data'))}</label><span class="sp"></span><button class="primary rt-gpx" data-a="gpx">${icon('download', 15)}<span>${esc(T('Download GPX route'))}</span></button></div>`, { cls: 'gcct-route' });
      const q = d.querySelector('.rt-q'), list = d.querySelector('.rt-list'), ol = d.querySelector('.rt-route'), sum = d.querySelector('.rt-sum');
      const tag = c => c.kind === 'place' ? `<em class="tag tag-${c.pkind === 'addr' ? 'addr' : c.pkind === 'abroad' ? 'abroad' : 'place'}">${esc(c.pkind === 'addr' ? T('Address') : c.pkind === 'abroad' ? T('Abroad') : T('Place'))}</em>` : c.kind === 'pin' ? `<em class="tag tag-pin">${esc(LANG === 'no' ? T('Pin (tag)') : 'Pin')}</em>` : [c.solved ? `<em class="tag tag-solved">${esc(T('Solved'))}</em>` : '', c.found ? `<em class="tag tag-found">${esc(T('Found'))}</em>` : '',
        c.kind === 'cache' && c.code && window.__gcctLikelyOwn && window.__gcctLikelyOwn(c.code) ? `<em class="tag tag-owned">${esc(T('Owned'))}</em>` : ''].join('');
      const title = c => c.kind === 'pin' || c.kind === 'place' ? esc(c.name) : `<b>${esc(c.code)}</b>${c.name ? ' · ' + esc(c.name) : ''}`;
      // The cache type's own icon from geocaching.com (or a plain dot when the type isn't known); pins get our pin.
      const typeIcon = c => {
        if (c.kind === 'pin') return `<span class="rt-ic rt-ic-pin">${icon('pin', 14)}</span>`;
        if (c.kind === 'place') return `<span class="rt-ic rt-ic-place">${icon('flag', 14)}</span>`;
        const t = c.type != null ? c.type : (CACHE_INFO.get(c.code) || {}).type;
        return t != null && t !== -1 ? `<img class="rt-ic" src="/images/wpttypes/${encodeURIComponent(t)}.gif" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'rt-ic rt-ic-dot'}))">`
          : '<span class="rt-ic rt-ic-dot"></span>';
      };
      // A full GC code is looked up anywhere in the world (from what the script knows, else the cache page).
      const looked = new Map();                       // code -> 'busy' | [candidates] | 'none'
      function lookUp(code) {
        if (looked.has(code)) return;
        looked.set(code, 'busy');
        searchGC(code).then(rows => {
          const i = CACHE_INFO.get(code) || {};
          looked.set(code, rows.length ? rows.map((r, k) => ({ key: 'c:' + code, kind: 'cache', code, name: (r.name || '').replace(code, '').replace(/^[\s·]+/, ''),
            lat: r.lat, lng: r.lng, solved: rows.length > 1 && k === 0, found: i.found === true, type: i.type })).slice(0, 1) : 'none');
        }).catch(() => looked.set(code, 'none')).finally(() => { if (routeOpen()) drawList(); });
      }
      // Places and addresses (Kartverket, Photon) – the same sources as Find a place, a moment after typing.
      const placeRes = new Map();                     // text -> 'busy' | [places]
      let placeTimer = null;
      function findPlaces(text) {
        if (placeRes.has(text)) return;
        clearTimeout(placeTimer);
        placeTimer = setTimeout(() => {
          placeRes.set(text, 'busy');
          Promise.allSettled([searchNorwayPlaces(text), searchNorwayAddresses(text), searchAbroad(text)]).then(rs => {
            // Like Find a place: with a house number addresses come first, otherwise place names; then places abroad.
            const [pl, ad, ab] = rs.map(r => r.status === 'fulfilled' ? r.value : []);
            const all = (/\d/.test(text) ? [ad.slice(0, 6), pl.slice(0, 4)] : [pl.slice(0, 5), ad.slice(0, 5)]).concat([ab.slice(0, 3)]).flat();
            placeRes.set(text, all.map(p => ({ key: 'g:' + p.lat.toFixed(5) + ',' + p.lng.toFixed(5), kind: 'place', pkind: p.kind, name: p.name + (p.sub && p.kind === 'addr' ? ', ' + p.sub.split(' · ')[0] : ''), sub: p.kind === 'addr' ? (p.sub || '').split(' · ').slice(1).join(' · ') : (p.sub || ''), lat: p.lat, lng: p.lng })));
            if (routeOpen() && q.value.trim().toLowerCase() === text) drawList();
          });
        }, 350);
      }
      function drawList() {
        const text = q.value.trim().toLowerCase(), ctr = map.getCenter();
        const inRoute = new Set(route.map(r => r.key));
        let c = routeCandidates();
        if (text) c = c.filter(x => (x.code || '').toLowerCase().includes(text) || (x.name || '').toLowerCase().includes(text));
        const gc = /^gc[0-9a-z]{1,7}$/.test(text) ? text.toUpperCase() : null;
        let extra = '', pre = [];
        if (gc && !c.some(x => x.code === gc)) {
          const st = looked.get(gc);
          if (Array.isArray(st)) pre = st;
          else if (st === 'none') extra = `<div class="gm">${esc(T('{code} not found.', { code: gc }))}</div>`;
          else { extra = `<div class="gm">${esc(T('Looking up {code} …', { code: gc }))}</div>`; lookUp(gc); }
        }
        c.forEach(x => { x.d = distM(ctr, L.latLng(x.lat, x.lng)); });
        c.sort((a, b) => a.d - b.d);
        pre.forEach(x => { x.d = distM(ctr, L.latLng(x.lat, x.lng)); });
        c = pre.concat(c.slice(0, 100));
        // Places and addresses for a text that is not a GC code.
        let places = [], placeNote = '';
        if (text.length >= 3 && !gc) {
          const pr = placeRes.get(text);
          if (Array.isArray(pr)) places = pr.map(x => Object.assign({}, x, { d: distM(ctr, L.latLng(x.lat, x.lng)) }));
          else { placeNote = `<div class="gm">${esc(T('Searching places …'))}</div>`; findPlaces(text); }
        }
        const rowHtml = (x, i) => `<div class="rt-row${inRoute.has(x.key) ? ' in' : ''}" data-i="${i}">
            <span class="rt-t">${typeIcon(x)}${title(x)} ${tag(x)}</span><span class="rt-m">${x.sub ? esc(x.sub) + ' · ' : ''}${x.dt ? esc(x.dt) + ' · ' : ''}${fmtDist(x.d)}${inRoute.has(x.key) ? ' · ' + esc(T('In the route')) : ''}</span></div>`;
        const n0 = c.length;
        c = c.concat(places);
        list.innerHTML = (n0 ? c.slice(0, n0).map(rowHtml).join('') : '')
          + (places.length || placeNote ? `<div class="rt-sec">${esc(T('Places and addresses'))}</div>` + placeNote + places.map((x, k) => rowHtml(x, n0 + k)).join('') : '')
          || (extra ? '' : `<div class="gm">${esc(T('Nothing found.'))}</div>`);
        if (extra) list.insertAdjacentHTML('afterbegin', extra);
        list.querySelectorAll('.rt-row').forEach(el => el.onclick = () => {
          addStop(c[+el.dataset.i]);
        });
      }
      function drawRouteList() {
        ol.innerHTML = route.length ? route.map((r, i) => `<li data-i="${i}"><span class="rt-n">${i + 1}</span><span class="rt-t rt-go" title="${esc(T('Show on the map'))}">${typeIcon(r)}${title(r)}${i ? ` <small class="rt-leg">+${legText(i)}</small>` : ''}</span>
            <button data-m="up" title="${esc(T('Move up'))}" ${i ? '' : 'disabled'}>${icon('up', 14)}</button><button data-m="down" title="${esc(T('Move down'))}" ${i < route.length - 1 ? '' : 'disabled'}>${icon('down', 14)}</button><button data-m="del" title="${esc(T('Remove'))}">${icon('x', 14)}</button></li>`).join('')
          : `<li class="gm">${esc(T('No stops yet.'))}</li>`;
        if (routeLoop && route.length > 1) ol.insertAdjacentHTML('beforeend', `<li class="rt-back"><span class="rt-n">1</span><span class="rt-t rt-go" data-go="0" title="${esc(T('Show on the map'))}">${icon('undo', 14)} ${esc(T('Back to the start'))} <small class="rt-leg">+${legText(route.length)}</small></span></li>`);
        sum.textContent = route.length ? T('{n} stops · {d}', { n: route.length, d: fmtDist(routeLength()) }) : '';
        ol.querySelectorAll('.rt-go').forEach(el => el.onclick = () => goStop(el.dataset.go != null ? +el.dataset.go : +el.closest('li').dataset.i));
        ol.querySelectorAll('button[data-m]').forEach(b => b.onclick = () => {
          const i = +b.closest('li').dataset.i, m = b.dataset.m;
          if (m === 'del') route.splice(i, 1);
          else { const j = m === 'up' ? i - 1 : i + 1; [route[i], route[j]] = [route[j], route[i]]; }
          changed();
        });
        d.querySelector('[data-a=preview]').disabled = !route.length;
      }
      // Preview: the whole route on the map, and a table of exactly what goes into the GPX file.
      const pv = d.querySelector('.rt-pv'), editEls = [q, d.querySelector('.hint'), list, d.querySelector('.rt-h'), ol, d.querySelector('.rt-edit-btns')];
      function preview(on, refit = true) {
        editEls.forEach(el => { el.style.display = on ? 'none' : ''; });
        pv.style.display = on ? '' : 'none'; d.querySelector('.rt-pv-btns').style.display = on ? '' : 'none';
        if (!on) return;
        let tot = 0;
        const pts = routeStops();
        const rows = pts.map((r, i) => {
          const leg = i ? distM(L.latLng(pts[i - 1].lat, pts[i - 1].lng), L.latLng(r.lat, r.lng)) : 0;
          tot += leg;
          return `<tr data-i="${i % route.length}"><td><span class="rt-n">${i < route.length ? i + 1 : 1}</span></td><td class="rt-go">${typeIcon(r)}<b>${esc(r.kind === 'cache' ? r.code : r.name)}</b>${r.kind === 'cache' && r.name ? `<div class="rt-desc">${esc(r.name)}</div>` : ''}</td>
            <td class="mono">${esc(fmtDMM(r.lat, r.lng)).replace(/[\s\u00a0]+([EW])[\s\u00a0]/, '<br>$1 ')}</td><td class="num">${i ? `${esc(legText(i, pts))}<div class="rt-desc">${esc(T('Total'))} ${esc(fmtDist(tot))}</div>` : '–'}</td></tr>`;
        }).join('');
        pv.innerHTML = `<p class="hint">${esc(T('This is what the GPX file will contain – the map shows the whole route.'))}</p>
          <div class="rt-tbl"><table><thead><tr><th></th><th>${esc(T('Name in GPS'))} / ${esc(T('Description'))}</th><th>${esc(T('Coordinates'))}</th><th class="num">${esc(T('Leg'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
          <p class="hint rt-note">${esc(T('{n} stops · {d}', { n: route.length, d: fmtDist(routeLength()) }))}${routeLoop && route.length > 1 ? ' · ' + esc(T('round trip')) : ''} · ${esc(T('Straight-line distances; the way there is always longer.'))}</p>`;
        pv.querySelectorAll('.rt-go').forEach(el => el.onclick = () => goStop(+el.closest('tr').dataset.i));
        if (refit) fitRoute(d);
      }
      d.querySelector('[data-a=preview]').onclick = () => preview(true);
      d.querySelector('[data-a=back]').onclick = () => preview(false);
      function changed() { saveRoute(); drawRoute(); drawRouteList(); drawList(); }
      routeDlg = d; routeRefresh = () => { drawRouteList(); drawList(); if (pv.style.display !== 'none') preview(true, false); };
      d.querySelector('[data-a=sort]').onclick = () => {          // nearest neighbour from the first stop
        if (route.length < 3) return;
        const rest = route.slice(1), out = [route[0]];
        while (rest.length) {
          const last = out[out.length - 1];
          let bi = 0, bd = Infinity;
          rest.forEach((r, i) => { const dd = distM(L.latLng(last.lat, last.lng), L.latLng(r.lat, r.lng)); if (dd < bd) { bd = dd; bi = i; } });
          out.push(rest.splice(bi, 1)[0]);
        }
        route = out; changed();
      };
      d.querySelector('[data-a=clear]').onclick = () => { route = []; changed(); };
      const loopBox = d.querySelector('[data-a=loop]');
      loopBox.checked = routeLoop;
      loopBox.onchange = () => { setRouteLoop(loopBox.checked); changed(); };
      // Full cache data is a choice, off unless you turn it on (remembered for the session).
      const fullBox = d.querySelector('[data-a=full]');
      try { fullBox.checked = sessionStorage.getItem('gcct.gpxFull') === '1'; } catch (e) { /* ignore */ }
      fullBox.onchange = () => { try { sessionStorage.setItem('gcct.gpxFull', fullBox.checked ? '1' : '0'); } catch (e) { /* ignore */ } };
      d.querySelector('[data-a=gpx]').onclick = async e => {
        const b = e.currentTarget;
        if (!route.length || b.disabled) return;
        b.disabled = true;
        try {
          const full = !!(fullBox && fullBox.checked);
          const { text, failed } = await routeGpx((n, of) => { if (n === 1 && of > 1) toast(T('Fetching {n} geocaches …', { n: of })); }, full);
          saveFile(text, `route-${fileStamp()}.gpx`, 'application/gpx+xml');
          if (failed.length) toast(T('Could not fetch {list} – only in the route, without description.', { list: failed.join(', ') }));
        } finally { b.disabled = false; }
      };
      function goStop(i) { const r = route[i]; if (r) { try { showInFree(L.latLng(r.lat, r.lng), Math.max(map.getZoom(), 16), d); } catch (e) { map.setView(L.latLng(r.lat, r.lng), Math.max(map.getZoom(), 16)); } } }
      q.oninput = drawList;
      q.addEventListener('keydown', e => e.stopPropagation());
      drawList(); drawRouteList();
      // As tall as the window allows (drag the top or bottom edge to make it shorter).
      if (api.fillHeight) api.fillHeight(d);
      setTimeout(() => q.focus(), 0);
    }
    drawRoute();
    // Pins remembered from earlier in this browser session.
    try { pinRecs.slice().forEach(r => { if (isFinite(r.lat) && isFinite(r.lng)) namedPin(null, null, r); }); } catch (e) { /* ignore */ }
    return { barEl: barCtl.getContainer(), coordEl: coordCtl.getContainer(), relabel };
  }
})();
