// ============================================================
// Interactive Leaflet map: migrant deaths on routes to Europe.
// ----
// Loads route metadata + incident GeoJSON in parallel, plots death
// points sized by toll and coloured by sea corridor, overlays the
// migration-route polylines and hubs from data/built/routes.json,
// and wires up the year-range slider, four filter dropdowns and the
// reset button.
//
// Depends on (loaded as plain <script>s before this file):
//   - Leaflet     (window.L)
//   - noUiSlider  (window.noUiSlider)
//   - Choices.js  (window.Choices)
//
// Data sources (both fetched at load time, served as static files):
//   - data/built/routes.json          (built by R/03_build_routes.R)
//   - data/built/incidents_iom.geojson (built by R/02_build_geojson.R)
//
// Sections, in order:
//   1.  Time helpers
//   2.  Map setup (Leaflet, fullscreen control, basemap)
//   3.  Size encoding (radius + bucket)
//   4.  Tooltip + layer builder
//   5.  State + DOM refs
//   6.  Counts + source caption
//   7.  Histogram + axis ticks
//   8.  render()
//   9.  Period slider + dropdowns
//  10.  Reset all
//  11.  Choices.js multi-select setup
//  12.  Data fetch (routes.json + incidents.geojson) → render overlays
// ============================================================

window.addEventListener('load', function () {
  if (typeof L === 'undefined') return;  // Leaflet failed to load

  // ---- 1. Time helpers ------------------------------------------------
  var YEAR_MIN = 2014;       // IOM coverage starts here
  var YEAR_MAX = 2026;
  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];
  var N_MONTHS = (YEAR_MAX - YEAR_MIN + 1) * 12;   // 156

  // Slider value = months-since-Jan-YEAR_MIN (0 .. N_MONTHS-1).
  function idxToYM(idx)         { return { year: YEAR_MIN + Math.floor(idx / 12), month: (idx % 12) + 1 }; }
  function ymToIdx(year, month) { return (year - YEAR_MIN) * 12 + (month - 1); }
  function fmtMY(idx) {
    var ym = idxToYM(idx);
    return MONTH_NAMES[ym.month - 1] + ' ' + ym.year;
  }


  // ---- 2. Map setup ---------------------------------------------------
  var map = L.map('incident-map', {
    // Tripoli sits at lon 13.19; offsetting the centre ~7° east pulls Tripoli
    // toward the left of the viewport so the framing emphasises the
    // Mediterranean / East Africa flow rather than empty Atlantic Ocean.
    center: [32.8872, 20.0],
    zoom: 4,
    zoomSnap: 0.5,
    scrollWheelZoom: false,   // avoid hijacking page scroll
    zoomControl: false        // we add this manually below so the
                              // fullscreen button can sit on top of it
  });

  // Fullscreen control + zoom (topleft, fullscreen on top). Leaflet stacks
  // same-corner controls in insertion order, so we add the fullscreen
  // button first, then the zoom control below it. Uses the browser's
  // native Fullscreen API on the .leaflet-figure element so the title,
  // map and selectors all stay visible in the fullscreen layout (styled
  // by the :fullscreen rules in style.css).
  var fig = document.querySelector('.leaflet-figure');

  var fullscreenControl = L.control({ position: 'topleft' });
  fullscreenControl.onAdd = function () {
    var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    var btn = L.DomUtil.create('a', 'leaflet-control-fullscreen-btn', container);
    btn.href = '#';
    btn.title = 'View map in fullscreen';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Toggle fullscreen view');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
      '<path fill="currentColor" d="M5 5h5V3H3v7h2V5zm14 0v5h2V3h-7v2h5z' +
      'M5 19h5v2H3v-7h2v5zm14 0v-5h2v7h-7v-2h5z"/></svg>';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(btn, 'click', function (e) {
      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
      var elem = fig || map.getContainer();
      var doc = document;
      var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement ||
                 doc.mozFullScreenElement || doc.msFullscreenElement;
      if (!fsEl) {
        var req = elem.requestFullscreen      || elem.webkitRequestFullscreen ||
                  elem.mozRequestFullScreen   || elem.msRequestFullscreen;
        if (req) req.call(elem);
      } else {
        var exit = doc.exitFullscreen         || doc.webkitExitFullscreen ||
                   doc.mozCancelFullScreen    || doc.msExitFullscreen;
        if (exit) exit.call(doc);
      }
    });
    return container;
  };
  fullscreenControl.addTo(map);
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // After entering/exiting fullscreen the map element changes size; tell
  // Leaflet to recompute its viewport and redraw the histogram so the
  // slider bars align with the new rail. Catches ESC, F11 and programmatic
  // exits as well as the button click.
  ['fullscreenchange', 'webkitfullscreenchange',
   'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      setTimeout(function () {
        map.invalidateSize();
        if (typeof drawHistogram === 'function') drawHistogram();
      }, 100);
    });
  });

  // CartoDB Positron — light grey basemap with country, sea/ocean and
  // major-city labels.
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 18
    }
  ).addTo(map);

  // Re-enable scroll-zoom only when the user clicks/focuses the map.
  map.on('focus', function () { map.scrollWheelZoom.enable(); });
  map.on('blur',  function () { map.scrollWheelZoom.disable(); });


  // ---- 3. Size encoding ----------------------------------------------
  function radiusFor(n) {
    return Math.max(2, Math.sqrt(Math.max(1, n)) * 1.4);
  }
  function sizeBucket(n) {
    var v = +n;
    if (!isFinite(v) || v <= 1) return '1';
    if (v <= 10)  return '2-10';
    if (v <= 50)  return '11-50';
    if (v <= 300) return '51-300';
    return '301+';
  }


  // ---- 4. Tooltip + layer builder ------------------------------------
  // These read the *live* values of ROUTE_COLORS / CAUSE_LABELS / etc.
  // declared in section 5. They stay empty until routes.json is fetched
  // (section 12), but tip() / buildLayer() are only ever called from
  // render(), which itself is gated on that fetch.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tip(p) {
    var loc        = [p.location, p.country].filter(Boolean).join(', ');
    var macroLabel = CAUSE_LABELS[p.cause_macro] || 'Unknown';
    var origin     = ORIGIN_LABELS[p.origin_macro] || 'Unknown';
    var html =
      '<div class="meta">' + escapeHtml(p.date)
        + (loc ? ' &middot; ' + escapeHtml(loc) : '') + '</div>'
      + '<span class="deaths">' + p.n_dead + '</span> dead or missing'
      + ' &middot; <em>' + escapeHtml(macroLabel) + '</em>';
    if (p.cause) html += '<br>' + escapeHtml(p.cause);
    if (p.route) {
      html += '<div class="row"><span class="lab">Route</span>' + escapeHtml(p.route) + '</div>';
    }
    html += '<div class="row"><span class="lab">Origin</span>' + escapeHtml(origin) + '</div>';
    if (p.n_rows && p.n_rows > 1) {
      html += '<div class="row"><span class="lab">Aggregation</span>'
           + p.n_rows + ' individual records collapsed into this event</div>';
    }
    var flag = PRECISION_FLAGS[p.date_precision];
    if (flag) html += '<div class="precision-flag">' + escapeHtml(flag) + '</div>';
    // Coord-status banner — flagged rows have IOM-side coords that
    // disagree with the location text or route; corrected rows had a
    // sign-flip / lat-lon swap reconciled. Both cases get a visible note
    // so readers see exactly which dots we touched and why.
    if (p.coord_status === 'flagged') {
      html += '<div class="coord-flag flagged">'
           +   '<strong>⚠ Flagged location.</strong> IOM placed this incident at '
           +   (p.orig_lat != null ? p.orig_lat.toFixed(4) : '?') + ', '
           +   (p.orig_lon != null ? p.orig_lon.toFixed(4) : '?')
           +   ', but those coordinates don’t match the location described or the route. '
           +   'Shown here at IOM’s coordinates — treat the dot’s position as suspect.'
           + '</div>';
    } else if (p.coord_status === 'corrected') {
      html += '<div class="coord-flag corrected">'
           +   '<strong>Corrected location.</strong> IOM’s recorded coordinates ('
           +   (p.orig_lat != null ? p.orig_lat.toFixed(4) : '?') + ', '
           +   (p.orig_lon != null ? p.orig_lon.toFixed(4) : '?')
           +   ') appeared to have a sign or lat/lon swap; we’ve plotted the reconciled position.'
           + '</div>';
    }
    return html;
  }

  // Sea-corridor filter is "soft": non-matching dots stay on the map but
  // dim to grey + low opacity. Returns true if a feature is currently
  // selected (vivid) under the active route filter.
  function isRouteSelected(props) {
    return routeFilter.size === 0 || routeFilter.has(props.route);
  }

  function buildLayer(features) {
    // Sort so non-selected features render first (bottom of the SVG
    // stack), then selected on top. Within each group, largest first so
    // small dots stay hoverable.
    var sorted = features.slice().sort(function (a, b) {
      var aSel = isRouteSelected(a.properties);
      var bSel = isRouteSelected(b.properties);
      if (aSel !== bSel) return aSel ? 1 : -1;
      return (b.properties.n_dead || 0) - (a.properties.n_dead || 0);
    });
    return L.geoJSON({ type: 'FeatureCollection', features: sorted }, {
      pointToLayer: function (feat, latlng) {
        var p   = feat.properties;
        var sel = isRouteSelected(p);
        var col = sel ? (ROUTE_COLORS[p.route] || '#8A8784') : '#bcbcbc';
        // Flagged rows draw with a dashed stroke and a slightly heavier
        // outline so readers can see at a glance which dots are at IOM-
        // recorded coordinates that disagree with the location text.
        var flagged = p.coord_status === 'flagged';
        return L.circleMarker(latlng, {
          radius:      radiusFor(p.n_dead),
          fillColor:   col,
          color:       flagged ? '#b32b1f' : col,
          weight:      flagged ? 1 : 1,
          dashArray:   flagged ? '2,2' : null,
          fillOpacity: sel ? (flagged ? 0.30 : 0.55) : 0.10,
          opacity:     sel ? 0.90 : 0.25
        });
      },
      onEachFeature: function (feat, layer) {
        layer.bindTooltip(tip(feat.properties), {
          className: 'incident-tip', sticky: true, direction: 'top',
          offset: [0, -4]
        });
      }
    });
  }

  // Re-style the corridor polylines + hubs so non-selected ones dim with
  // the same logic as the dots. Called whenever the route filter changes
  // (and on every render() so it stays in sync).
  var routePolylineRefs = [];   // populated in section 12 once routes.json loads
  function updateRouteStyles() {
    var any = routeFilter.size > 0;
    routePolylineRefs.forEach(function (it) {
      var sel = !any || routeFilter.has(it.route);
      it.layer.setStyle({
        color:   sel ? (ROUTE_COLORS[it.route] || '#888') : '#bcbcbc',
        opacity: sel ? (it.major ? 0.55 : 0.45) : 0.18
      });
    });
  }


  // ---- 5. State + DOM refs -------------------------------------------
  // Filter sets follow an "empty = no filter" convention: a feature
  // passes when the filter set is empty OR the feature's value is in
  // the set. Matches Choices.js's natural empty state.
  //
  // The six data objects below are populated by the routes.json fetch
  // in section 12. They start empty so the tooltip / pointToLayer code
  // can reference them without crashing if a render fires early.
  var ROUTE_COLORS       = {};
  var ROUTE_SHORT_LABELS = {};
  var CAUSE_LABELS       = {};
  var ORIGIN_LABELS      = {};
  var PRECISION_FLAGS    = {};
  var HUBS               = [];
  var CITIES             = [];
  var ROUTE_LINES        = [];

  var allFeatures = { iom: [] };
  var activeLayer = null;
  var monthFromIdx = 0, monthToIdx = N_MONTHS - 1;
  var originFilter = new Set();
  var routeFilter  = new Set();
  var causeFilter  = new Set();
  var sizeFilter   = new Set();

  var countsRoot   = document.querySelector('.map-counts');
  var sliderEl     = document.querySelector('.year-slider');
  var histSvg      = document.querySelector('.year-hist');
  var resetBtn     = document.querySelector('.reset-years');
  var originSelect = document.querySelector('#origin-select');
  var routeSelect  = document.querySelector('#route-select');
  var causeSelect  = document.querySelector('#cause-select');
  var sizeSelect   = document.querySelector('#size-select');
  var captionEl    = document.querySelector('.source-caption');
  var captionCount = captionEl && captionEl.querySelector('.src-count');
  var captionFrom  = captionEl && captionEl.querySelector('.src-from');
  var captionTo    = captionEl && captionEl.querySelector('.src-to');
  var axisEl       = document.querySelector('.year-axis');


  // ---- 6. Counts + source caption ------------------------------------
  function updateCounts(features) {
    var n = features.length;
    var sum = features.reduce(function (s, f) {
      var v = f.properties.n_dead;
      return s + (typeof v === 'number' ? v : (parseFloat(v) || 0));
    }, 0);
    if (countsRoot) {
      countsRoot.querySelector('.records-val').textContent = n.toLocaleString();
      countsRoot.querySelector('.deaths-val').textContent  = Math.round(sum).toLocaleString();
    }
    if (captionCount) captionCount.textContent = n.toLocaleString();
  }

  function updateSourceCaption() {
    if (captionFrom) captionFrom.textContent = fmtMY(monthFromIdx);
    if (captionTo)   captionTo.textContent   = fmtMY(monthToIdx);
  }


  // ---- 7. Histogram + axis ticks -------------------------------------
  // Monthly-bin histogram of deaths (IOM, 2014–2026 = 156 bins). Bars in
  // the [from, to] window are accent red; bars outside are pale.
  var histCache = { iom: null };
  var SVG_NS    = 'http://www.w3.org/2000/svg';

  function buildHistData() {
    var counts = new Array(N_MONTHS).fill(0);
    allFeatures.iom.forEach(function (f) {
      var p = f.properties;
      if (!p.date || p.year < YEAR_MIN || p.year > YEAR_MAX) return;
      var month = parseInt(p.date.substring(5, 7), 10) || 1;
      var idx   = ymToIdx(p.year, month);
      if (idx >= 0 && idx < N_MONTHS) counts[idx] += (+p.n_dead || 0);
    });
    histCache.iom = { nMonths: N_MONTHS, counts: counts };
  }

  function drawHistogram() {
    if (!histCache.iom) return;
    var data    = histCache.iom;
    var counts  = data.counts;
    var nMonths = data.nMonths;
    var maxN    = 0;
    for (var i = 0; i < nMonths; i++) {
      if (counts[i] > maxN) maxN = counts[i];
    }
    if (maxN === 0) maxN = 1;

    histSvg.setAttribute('viewBox', '0 0 100 100');
    histSvg.setAttribute('preserveAspectRatio', 'none');

    var slotW = 100 / nMonths;             // width of one month slot (%)
    var bw    = slotW * 0.85;              // visible bar width (%)

    while (histSvg.firstChild) histSvg.removeChild(histSvg.firstChild);

    for (var k = 0; k < nMonths; k++) {
      var c = counts[k];
      if (c === 0) continue;
      var bh    = (c / maxN) * 99;
      var bx    = k * slotW + slotW * 0.075;
      var by    = 100 - bh;
      var inRng = (k >= monthFromIdx && k <= monthToIdx);
      var fill  = inRng ? '#7A1B1B' : '#c8c2c2';

      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class',  'bar');
      rect.setAttribute('x',      bx.toFixed(4));
      rect.setAttribute('y',      by.toFixed(2));
      rect.setAttribute('width',  bw.toFixed(4));
      rect.setAttribute('height', bh.toFixed(2));
      rect.setAttribute('fill',   fill);
      histSvg.appendChild(rect);
    }
  }

  // One <span> per even year, positioned at the percentage corresponding
  // to its year.
  function drawAxis() {
    axisEl.innerHTML = '';
    [2014, 2016, 2018, 2020, 2022, 2024, 2026].forEach(function (yr) {
      var pct  = ((yr - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
      var span = document.createElement('span');
      span.textContent = yr;
      span.style.left  = pct.toFixed(2) + '%';
      axisEl.appendChild(span);
    });
  }
  drawAxis();


  // ---- 8. render() ---------------------------------------------------
  // Period, origin, cause and size are HARD filters (non-matching is hidden).
  // Sea corridor (routeFilter) is a SOFT filter: non-matching features stay
  // on the map but dim to grey via buildLayer(). Counts reflect only the
  // matching (vivid) features so the toolbar number changes when the user
  // narrows by corridor.
  function render() {
    var feats = allFeatures.iom.filter(function (f) {
      var p = f.properties;
      if (!p.date) return false;
      var month = parseInt(p.date.substring(5, 7), 10) || 1;
      var idx   = ymToIdx(p.year, month);
      if (idx < monthFromIdx || idx > monthToIdx) return false;
      if (originFilter.size > 0 && !originFilter.has(p.origin_macro || 'unknown')) return false;
      var cm = p.cause_macro || 'other';
      if (causeFilter.size > 0 && !causeFilter.has(cm)) return false;
      if (sizeFilter.size  > 0 && !sizeFilter.has(sizeBucket(p.n_dead))) return false;
      return true;
    });
    if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null; }
    if (feats.length) {
      activeLayer = buildLayer(feats).addTo(map);
    }
    updateRouteStyles();
    var selected = routeFilter.size === 0
      ? feats
      : feats.filter(function (f) { return routeFilter.has(f.properties.route); });
    updateCounts(selected);
    drawHistogram();
  }


  // ---- 9. Period slider + dropdowns ---------------------------------
  noUiSlider.create(sliderEl, {
    start: [0, N_MONTHS - 1],
    connect: true,
    step: 1,
    range: { min: 0, max: N_MONTHS - 1 },
    format: {
      to:   function (value) { return Math.round(value); },
      from: function (value) { return Number(value); }
    }
  });

  var psMonthFrom = document.querySelector('.ps-month-from');
  var psMonthTo   = document.querySelector('.ps-month-to');
  var psYearFrom  = document.querySelector('.ps-year-from');
  var psYearTo    = document.querySelector('.ps-year-to');

  MONTH_NAMES.forEach(function (name, i) {
    [psMonthFrom, psMonthTo].forEach(function (sel) {
      var o = document.createElement('option');
      o.value = i + 1;
      o.textContent = name;
      sel.appendChild(o);
    });
  });
  for (var y = YEAR_MIN; y <= YEAR_MAX; y++) {
    [psYearFrom, psYearTo].forEach(function (sel) {
      var o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      sel.appendChild(o);
    });
  }

  function syncDropdowns() {
    var f = idxToYM(monthFromIdx);
    var t = idxToYM(monthToIdx);
    psMonthFrom.value = f.month;
    psYearFrom.value  = f.year;
    psMonthTo.value   = t.month;
    psYearTo.value    = t.year;
  }

  function onPeriodSelectChange() {
    var fIdx = ymToIdx(parseInt(psYearFrom.value, 10),
                       parseInt(psMonthFrom.value, 10));
    var tIdx = ymToIdx(parseInt(psYearTo.value, 10),
                       parseInt(psMonthTo.value, 10));
    if (tIdx < fIdx) tIdx = fIdx;
    sliderEl.noUiSlider.set([fIdx, tIdx]);
  }
  [psMonthFrom, psMonthTo, psYearFrom, psYearTo].forEach(function (s) {
    s.addEventListener('change', onPeriodSelectChange);
  });

  sliderEl.noUiSlider.on('update', function (values) {
    monthFromIdx = parseInt(values[0], 10);
    monthToIdx   = parseInt(values[1], 10);
    syncDropdowns();
    updateSourceCaption();
    render();
  });


  // ---- 10. Reset all -------------------------------------------------
  resetBtn.addEventListener('click', function () {
    sliderEl.noUiSlider.set([0, N_MONTHS - 1]);
    if (originChoices) originChoices.removeActiveItems();
    if (routeChoices)  routeChoices.removeActiveItems();
    if (causeChoices)  causeChoices.removeActiveItems();
    if (sizeChoices)   sizeChoices.removeActiveItems();
    originFilter = new Set();
    routeFilter  = new Set();
    causeFilter  = new Set();
    sizeFilter   = new Set();
    render();
  });


  // ---- 11. Choices.js multi-select setup -----------------------------
  var originChoices = null, routeChoices = null, causeChoices = null,
      sizeChoices   = null;

  function initChoices() {
    if (typeof Choices === 'undefined') return;
    var common = {
      removeItemButton:       true,
      shouldSort:             false,
      placeholder:            true,
      placeholderValue:       'All',
      searchPlaceholderValue: 'Search…',
      allowHTML:              false
    };
    originChoices = new Choices(originSelect, Object.assign({}, common,
      { searchEnabled: false }));
    causeChoices  = new Choices(causeSelect,  Object.assign({}, common,
      { searchEnabled: false }));
    causeChoices.containerOuter.element.classList.add('cause-choices');
    routeChoices = new Choices(routeSelect, Object.assign({}, common,
      { searchEnabled: true }));
    sizeChoices  = new Choices(sizeSelect,  Object.assign({}, common,
      { searchEnabled: false }));

    originSelect.addEventListener('change', function () {
      originFilter = new Set(originChoices.getValue(true));
      render();
    });
    causeSelect.addEventListener('change', function () {
      causeFilter = new Set(causeChoices.getValue(true));
      render();
    });
    routeSelect.addEventListener('change', function () {
      routeFilter = new Set(routeChoices.getValue(true));
      render();
    });
    sizeSelect.addEventListener('change', function () {
      sizeFilter = new Set(sizeChoices.getValue(true));
      render();
    });
  }

  // Build the route dropdown options from IOM's loaded features. Sorted
  // by frequency desc so the most common routes float to the top.
  function populateRouteChoices() {
    if (!routeChoices) return;
    var counts = {};
    allFeatures.iom.forEach(function (f) {
      var v = f.properties.route;
      if (v == null || v === '') return;
      counts[v] = (counts[v] || 0) + 1;
    });
    var sorted = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a];
    });
    var opts = sorted.map(function (v) { return { value: v, label: v }; });
    routeChoices.clearStore();
    routeChoices.setChoices(opts, 'value', 'label', true);
  }


  // ---- 12. Data fetch -----------------------------------------------
  // Fetch route metadata and the incident GeoJSON in parallel. After
  // both resolve, populate the data objects, draw the route polylines /
  // hubs / legend, and render the death points. Re-draw the histogram
  // on resize so the bar widths stay aligned with the slider rail.
  var DATA_VERSION = '2026-05-05-iomonly';

  Promise.all([
    fetch('data/built/routes.json').then(function (r) { return r.json(); }),
    fetch('data/built/incidents_iom.geojson?v=' + DATA_VERSION).then(function (r) { return r.json(); })
  ]).then(function (results) {
    var routes = results[0];
    var gj     = results[1];

    // 12a. Hydrate the data objects (declared in section 5).
    ROUTE_COLORS       = routes.ROUTE_COLORS;
    ROUTE_SHORT_LABELS = routes.ROUTE_SHORT_LABELS;
    CAUSE_LABELS       = routes.CAUSE_LABELS;
    ORIGIN_LABELS      = routes.ORIGIN_LABELS;
    PRECISION_FLAGS    = routes.PRECISION_FLAGS;
    HUBS               = routes.HUBS;
    CITIES             = routes.CITIES || [];
    ROUTE_LINES        = routes.ROUTE_LINES;

    // 12b. Draw route polylines + hubs (added once, stay below the live
    //      death-points layer that gets rebuilt on every filter change).
    //      Each polyline is also pushed into routePolylineRefs so
    //      updateRouteStyles() (called from render()) can dim non-matching
    //      corridors when the sea-corridor filter is active.
    ROUTE_LINES.forEach(function (line) {
      var pl = L.polyline(line.coords, {
        color:        ROUTE_COLORS[line.route] || '#888',
        weight:       line.major ? 4 : 1.8,
        opacity:      line.major ? 0.55 : 0.45,
        smoothFactor: 1.5,
        lineCap:      'round',
        lineJoin:     'round',
        interactive:  false
      }).addTo(map);
      routePolylineRefs.push({ layer: pl, route: line.route, major: line.major });
    });
    HUBS.forEach(function (hub) {
      var dir = hub.dir || 'right';
      var off = (
        dir === 'left'  ? [-8,  0] :
        dir === 'top'   ? [ 0, -8] :
        dir === 'bottom'? [ 0,  8] :
                          [ 8,  0]
      );
      L.circleMarker(hub.latlng, {
        radius:      5,
        color:       '#222',
        weight:      2,
        fillColor:   '#fff',
        fillOpacity: 1,
        interactive: false
      }).addTo(map)
        .bindTooltip(hub.name, {
          permanent: true,
          direction: dir,
          offset:    off,
          className: 'hub-label'
        });
    });

    // Sea-route arrival points: small filled black squares with italic
    // labels. Visually subordinate to the open-circle hubs so the
    // hierarchy reads "main migration hub > sea-route arrival point".
    CITIES.forEach(function (c) {
      var dir = c.dir || 'right';
      var off = (
        dir === 'left'  ? [-7,  0] :
        dir === 'top'   ? [ 0, -7] :
        dir === 'bottom'? [ 0,  7] :
                          [ 7,  0]
      );
      L.circleMarker(c.latlng, {
        radius:      3,
        color:       '#222',
        weight:      1,
        fillColor:   '#222',
        fillOpacity: 1,
        interactive: false
      }).addTo(map)
        .bindTooltip(c.name, {
          permanent: true,
          direction: dir,
          offset:    off,
          className: 'city-label'
        });
    });

    // 12c. Mount the on-map legend. Built here (not earlier) so it can
    //      read the freshly hydrated palette + labels. The legend is a
    //      click-toggleable dropdown — useful on mobile where the panel
    //      otherwise covers a chunk of the map. Defaults to collapsed
    //      below 700 px viewport width.
    var legend = L.control({ position: 'topright' });
    legend.onAdd = function () {
      var div = L.DomUtil.create('div', 'map-legend');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      var routeOrder = [
        'Western Africa / Atlantic route to the Canary Islands',
        'Western Mediterranean',
        'Central Mediterranean',
        'Eastern Mediterranean',
        'Mainland Europe to the UK',
        'Other'
      ];
      var hasDots = {
        'Western Africa / Atlantic route to the Canary Islands': true,
        'Western Mediterranean': true,
        'Central Mediterranean': true,
        'Eastern Mediterranean': true,
        'Mainland Europe to the UK': true
      };

      var startCollapsed = window.matchMedia &&
        window.matchMedia('(max-width: 700px)').matches;
      if (startCollapsed) div.classList.add('is-collapsed');

      var html = '';
      html += '<button class="legend-toggle" type="button"'
        + ' aria-expanded="' + (startCollapsed ? 'false' : 'true') + '">'
        + '<span class="legend-toggle-label">Legend</span>'
        + '<span class="legend-toggle-chevron" aria-hidden="true">▾</span>'
        + '</button>';
      html += '<div class="legend-body">';
      html += '<div class="legend-title">Migration corridor</div>';
      routeOrder.forEach(function (r) {
        var c = ROUTE_COLORS[r];
        var dot = hasDots[r]
          ? '<span class="swatch" style="background:' + c + '"></span>'
          : '<span class="swatch swatch-empty"></span>';
        html += '<div class="legend-row">'
          + dot
          + '<span class="swatch-line" style="background:' + c + '"></span>'
          + '<span>' + ROUTE_SHORT_LABELS[r] + '</span></div>';
      });
      html += '<div class="legend-row">'
        +   '<span class="swatch swatch-flagged"></span>'
        +   '<span>Flagged location</span></div>'
        + '<div class="legend-divider"></div>'
        + '<div class="legend-row">'
        +   '<span class="swatch-line" style="background:#666;"></span>'
        +   '<span>Major route</span></div>'
        + '<div class="legend-row">'
        +   '<span class="swatch-line minor" style="background:#666;"></span>'
        +   '<span>Minor route</span></div>'
        + '<div class="legend-row">'
        +   '<span class="swatch-hub"></span>'
        +   '<span>Main migration hub</span></div>'
        + '<div class="legend-row">'
        +   '<span class="swatch-city"></span>'
        +   '<span>Sea-route arrival</span></div>'
        + '<div class="legend-foot">'
        + 'Dot size = number of dead or missing'
        + '<div class="size-row">'
        +   '<span class="size-dot" style="width:4px;height:4px;"></span>'
        +   '<span class="size-dot" style="width:14px;height:14px;"></span>'
        +   '<span class="size-dot" style="width:24px;height:24px;"></span>'
        +   '<span style="margin-left:4px;">1 &middot; 50 &middot; 300+</span>'
        + '</div>'
        + '</div>';
      html += '</div>';  // .legend-body
      div.innerHTML = html;

      var toggleBtn = div.querySelector('.legend-toggle');
      L.DomEvent.on(toggleBtn, 'click', function (e) {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        var nowCollapsed = div.classList.toggle('is-collapsed');
        toggleBtn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      });
      return div;
    };
    legend.addTo(map);

    // 12d. Render incidents.
    allFeatures.iom = gj.features;
    initChoices();
    populateRouteChoices();
    buildHistData();
    render();
  });

  window.addEventListener('resize', function () { drawHistogram(); });
});
