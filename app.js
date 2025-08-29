// The original version of this application imported sample data and a list of monitored
// countries from data_samples.js. For the live feed-only version we remove this import
// entirely. Instead, we define a list of country coordinates and derive the list of
// monitored countries from it. We also define a CORS proxy prefix and functions to
// parse coordinates and detect country names from RSS titles and descriptions.

// CORS proxy used to fetch RSS feeds. Many RSS endpoints do not support CORS, so we
// route requests through a proxy to avoid browser restrictions.  The previous
// implementation used api.allorigins.win/raw but that service frequently returns
// 403 Forbidden responses.  We now use corsproxy.io, which accepts requests in
// the format: https://corsproxy.io/?<encoded target URL>.  If this service
// becomes unavailable, you can replace this constant with another proxy of
// choice (e.g. https://cors.isomorphic-git.org/ or your own CORS worker).
const FEED_PROXY_PREFIX = 'https://corsproxy.io/?';

// Approximate latitude/longitude for a subset of countries. When RSS items do not
// provide explicit geolocation data, we attempt to assign coordinates based on
// country names appearing in the title or description. Countries not in this list
// will use (0,0) as a fallback and may appear off the west coast of Africa.
const COUNTRY_COORDS = {
  "Algeria": { lat: 28.0339, lon: 1.6596 },
  "Angola": { lat: -11.2027, lon: 17.8739 },
  "Benin": { lat: 9.3077, lon: 2.3158 },
  "Botswana": { lat: -22.3285, lon: 24.6849 },
  "Burkina Faso": { lat: 12.2383, lon: -1.5616 },
  "Burundi": { lat: -3.3731, lon: 29.9189 },
  "Cameroon": { lat: 7.3697, lon: 12.3547 },
  "Central African Republic": { lat: 6.6111, lon: 20.9394 },
  "Chad": { lat: 15.4542, lon: 18.7322 },
  "Democratic Republic of the Congo": { lat: -4.0383, lon: 21.7587 },
  "Republic of the Congo": { lat: -0.2280, lon: 15.8277 },
  "Cote d'Ivoire": { lat: 7.5400, lon: -5.5471 },
  "Djibouti": { lat: 11.8251, lon: 42.5903 },
  "Egypt": { lat: 26.8206, lon: 30.8025 },
  "Eritrea": { lat: 15.1794, lon: 39.7823 },
  "Eswatini": { lat: -26.5225, lon: 31.4659 },
  "Ethiopia": { lat: 9.1450, lon: 40.4897 },
  "Gabon": { lat: -0.8037, lon: 11.6094 },
  "Gambia": { lat: 13.4432, lon: -15.3101 },
  "Ghana": { lat: 7.9465, lon: -1.0232 },
  "Guinea": { lat: 9.9456, lon: -9.6966 },
  "Guinea-Bissau": { lat: 11.8037, lon: -15.1804 },
  "Kenya": { lat: -0.0236, lon: 37.9062 },
  "Lesotho": { lat: -29.6099, lon: 28.2336 },
  "Liberia": { lat: 6.4281, lon: -9.4295 },
  "Libya": { lat: 26.3351, lon: 17.2283 },
  "Madagascar": { lat: -18.7669, lon: 46.8691 },
  "Malawi": { lat: -13.2543, lon: 34.3015 },
  "Mali": { lat: 17.5707, lon: -3.9962 },
  "Mauritania": { lat: 21.0079, lon: -10.9408 },
  "Morocco": { lat: 31.7917, lon: -7.0926 },
  "Mozambique": { lat: -18.6657, lon: 35.5296 },
  "Namibia": { lat: -22.9576, lon: 18.4904 },
  "Niger": { lat: 17.6078, lon: 8.0817 },
  "Nigeria": { lat: 9.0820, lon: 8.6753 },
  "Rwanda": { lat: -1.9403, lon: 29.8739 },
  "Senegal": { lat: 14.4974, lon: -14.4524 },
  "Sierra Leone": { lat: 8.4606, lon: -11.7799 },
  "Somalia": { lat: 5.1521, lon: 46.1996 },
  "South Africa": { lat: -30.5595, lon: 22.9375 },
  "South Sudan": { lat: 7.3090, lon: 30.6550 },
  "Sudan": { lat: 12.8628, lon: 30.2176 },
  "Tanzania": { lat: -6.3690, lon: 34.8888 },
  "Togo": { lat: 8.6195, lon: 0.8248 },
  "Tunisia": { lat: 33.8869, lon: 9.5375 },
  "Uganda": { lat: 1.3733, lon: 32.2903 },
  "Zambia": { lat: -13.1339, lon: 27.8493 },
  "Zimbabwe": { lat: -19.0154, lon: 29.1549 }
};

// Derive the list of monitored countries from the keys of COUNTRY_COORDS. The country
// select will be populated from this list together with countries present in data.
const MONITORED_COUNTRIES = Object.keys(COUNTRY_COORDS);

// Attempt to parse a latitude/longitude pair from a free-text string. Many news
// articles embed coordinates in parentheses, brackets, or plain text. This function
// returns a tuple [lat, lon] or null if no valid pair is found.
function parseLatLonFromString(str){
  if(!str) return null;
  // Match patterns like "12.34 N, 56.78 E" or "12.34,56.78"
  const regex = /([-+]?\d{1,2}\.\d{1,6})[^\d]*([-+]?\d{1,3}\.\d{1,6})/;
  const m = str.match(regex);
  if(m){
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if(!Number.isNaN(lat) && !Number.isNaN(lon)){
      return [lat, lon];
    }
  }
  return null;
}

// Search a string for a country name in the COUNTRY_COORDS dictionary. Returns the
// matching country name or null if no match is found. Performs a simple case-
// insensitive substring search.
function findCountryInString(str){
  if(!str) return null;
  const lower = str.toLowerCase();
  for(const name of Object.keys(COUNTRY_COORDS)){
    if(lower.includes(name.toLowerCase())){
      return name;
    }
  }
  return null;
}

// Stores feed definitions and polling timer state. Each feed has an id, url and
// enabled flag. A separate timer handles periodic polling. These properties
// will be attached to the State object after its declaration (see below).

// Load the list of feed URLs from a text file packaged with the app. The file
// contains one URL per line. Returns an array of strings.
async function loadFeedUrls(){
  try{
    const res = await fetch('global_security_rss_feeds.txt');
    const text = await res.text();
    return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  }catch(err){
    console.error('Failed to load feed list', err);
    return [];
  }
}

// Render checkboxes for each feed in the "Enabled feeds" UI section. The user can
// toggle which feeds are active. This function clears the container and adds a
// checkbox for each feed defined in State.feeds.
function renderFeedCheckboxes(){
  const container = byId('feedCheckboxes');
  if(!container) return;
  container.innerHTML = '';
  Object.values(State.feeds).forEach(feed => {
    const id = feed.id;
    const label = feed.label || feed.url;
    const div = document.createElement('div');
    div.className = 'feed-row';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = feed.enabled;
    chk.addEventListener('change', () => {
      feed.enabled = chk.checked;
    });
    const span = document.createElement('span');
    span.textContent = label;
    div.appendChild(chk);
    div.appendChild(span);
    container.appendChild(div);
  });
}

// Fetch all feeds that are currently enabled. For each feed we call fetchFeed().
async function fetchAllEnabledFeeds(){
  const feeds = Object.values(State.feeds).filter(f => f.enabled);
  for(const f of feeds){
    await fetchFeed(f.url);
  }
}

// Start the polling timer using the interval specified by the user. If a timer is
// already running it will be cleared before starting a new one.
function startPolling(){
  // Read polling interval from the input defined in index.html.  The element
  // id was updated to "pollIntervalMinutes" in the latest layout.
  const minutes = parseInt(byId('pollIntervalMinutes').value, 10);
  if(isNaN(minutes) || minutes < 1) return;
  // Immediately fetch once to populate the feed.
  fetchAllEnabledFeeds();
  if(State.pollTimer) clearInterval(State.pollTimer);
  State.pollTimer = setInterval(() => {
    fetchAllEnabledFeeds();
  }, minutes * 60 * 1000);
  setStatus(`Polling every ${minutes} minutes`);
}

// Stop the polling timer if it is running.
function stopPolling(){
  if(State.pollTimer){
    clearInterval(State.pollTimer);
    State.pollTimer = null;
    setStatus('Polling stopped');
  }
}

// Initialize feed management: load feed URLs, create feed objects, render the
// checkboxes and attach event handlers for polling controls.
async function initFeedManagement(){
  const urls = await loadFeedUrls();
  // Build feed objects keyed by id
  urls.forEach((url, index) => {
    const id = `feed-${index}`;
    // Derive a short label from the hostname or last path segment
    let label = '';
    try {
      const u = new URL(url);
      label = u.hostname.replace(/^www\./,'');
    } catch {
      label = url;
    }
    State.feeds[id] = { id, url, enabled: true, label };
  });
  renderFeedCheckboxes();
  // Attach event handlers for polling controls
  // Button to fetch feeds immediately.  The id corresponds to the
  // "Fetch Feeds Now" button defined in index.html.
  const fetchFeedsBtn = byId('fetchFeedsBtn');
  if(fetchFeedsBtn) fetchFeedsBtn.addEventListener('click', fetchAllEnabledFeeds);
  const startPollingBtn = byId('startPollingBtn');
  if(startPollingBtn) startPollingBtn.addEventListener('click', startPolling);
  const stopPollingBtn = byId('stopPollingBtn');
  if(stopPollingBtn) stopPollingBtn.addEventListener('click', stopPolling);
}

/** -----------------------------------------------------
 * Global State
 * ----------------------------------------------------- */
const State = {
  theme: localStorage.getItem('qa_theme') || 'light',
  role: 'all',
  events: [],
  assets: [],
  people: [],
  filters: {
    minSeverity: 1,
    keyword: '',
    countries: [],
    timeWindowHours: 72
  },
  selections: {
    polygon: null
  },
  incidents: [],
  sops: [],
  charts: {
    severity: null,
    country: null
  },
  map: {
    instance: null,
    layers: {
      base: null,
      events: null,
      assets: null,
      people: null,
      drawings: null
    },
    clusters: {
      events: null
    },
    basemap: 'sat'
  },
  timers: {
    simulation: null
  }
};

// Initialize feed and polling containers on the State object. These properties
// are defined here because the State object must exist before assignment.
State.feeds = {};
State.pollTimer = null;

// Theme init
document.body.classList.toggle('dark', State.theme === 'dark');
document.body.classList.toggle('light', State.theme !== 'dark');

/** -----------------------------------------------------
 * Utilities
 * ----------------------------------------------------- */
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const byId = id => document.getElementById(id);

function setStatus(msg){
  byId('statusText').textContent = msg;
}

function randomId(prefix='id'){
  return `${prefix}-${Math.random().toString(36).slice(2,8)}`;
}

function toCSV(rows){
  const esc = v => typeof v === 'string' && v.includes(',') ? `"${v.replaceAll('"','""')}"` : v;
  const keys = Object.keys(rows[0] || {});
  const head = keys.join(',');
  const body = rows.map(r => keys.map(k => esc(r[k] ?? '')).join(',')).join('\n');
  return head + '\n' + body;
}

function download(filename, content, type='application/json'){
  const blob = new Blob([content], {type});
  saveAs(blob, filename);
}

function withinTimeWindow(tsISO, hours){
  const now = Date.now();
  const ts = new Date(tsISO).getTime();
  return (now - ts) <= hours * 3600 * 1000;
}

function keywordMatch(s, kw){
  if(!kw) return true;
  const tokens = kw.toLowerCase().split(/[\s]+/).filter(Boolean);
  const hay = (s || '').toLowerCase();
  return tokens.some(t => hay.includes(t));
}

function getCountriesFromData(){
  const set = new Set([...State.events.map(e=>e.country), ...State.assets.map(a=>a.country), ...State.people.map(p=>p.country)]);
  return Array.from(set).filter(Boolean).sort();
}

/** -----------------------------------------------------
 * Map setup
 * ----------------------------------------------------- */
function initMap(){
  const map = L.map('map', { zoomControl: true }).setView([5, 15], 4);
  State.map.instance = map;

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri'
  });

  const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap'
  });

  State.map.layers.base = { osm, sat, terrain };

  State.map.layers.events = L.layerGroup().addTo(map);
  State.map.layers.assets = L.layerGroup().addTo(map);
  State.map.layers.people = L.layerGroup().addTo(map);
  State.map.layers.drawings = new L.FeatureGroup().addTo(map);

  // Cluster for events
  State.map.clusters.events = L.markerClusterGroup({ maxClusterRadius: 40 });
  State.map.layers.events.addLayer(State.map.clusters.events);

  // Draw controls
  const drawControl = new L.Control.Draw({
    draw: {
      polygon: true,
      rectangle: true,
      circle: true,
      polyline: false,
      marker: false,
      circlemarker: false
    },
    edit: { featureGroup: State.map.layers.drawings }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    State.map.layers.drawings.addLayer(layer);
    State.selections.polygon = layer;
    evaluateSelection();
  });

  renderBasemap();
}

function renderBasemap(){
  const map = State.map.instance;
  Object.values(State.map.layers.base).forEach(l => map.removeLayer(l));
  const choice = byId('basemapSelect').value || State.map.basemap;
  State.map.basemap = choice;
  if(choice === 'osm') State.map.layers.base.osm.addTo(map);
  if(choice === 'sat') State.map.layers.base.sat.addTo(map);
  if(choice === 'terrain') State.map.layers.base.terrain.addTo(map);
}

/** -----------------------------------------------------
 * Renderers
 * ----------------------------------------------------- */
function severityColor(sev){
  if(sev >= 5) return '#7f1d1d';
  if(sev === 4) return '#ef4444';
  if(sev === 3) return '#f59e0b';
  if(sev === 2) return '#22c55e';
  return '#06b6d4';
}

function makeEventMarker(e){
  const icon = L.divIcon({
    className: 'event-icon',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${severityColor(e.severity)};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
    iconSize: [16,16],
    iconAnchor: [8,8]
  });
  const m = L.marker([e.lat, e.lon], { icon });
  const html = `
    <strong>${e.title}</strong><br/>
    <small>${e.category} - Sev ${e.severity}</small><br/>
    <small>${e.country} - ${new Date(e.timestamp).toLocaleString()}</small><br/>
    <a href="${e.link || '#'}" target="_blank">Open source</a>
  `;
  m.bindPopup(html);
  m.on('click', () => selectFeedItemById(e.id));
  return m;
}

function makeAssetMarker(a){
  const icon = L.divIcon({
    className: 'asset-icon',
    html: `<div style="width:14px;height:14px;border-radius:4px;background:#2563eb;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
    iconSize: [18,18],
    iconAnchor: [9,9]
  });
  const m = L.marker([a.lat, a.lon], { icon });
  const html = `
    <strong>${a.name}</strong><br/>
    <small>${a.type} - ${a.country}</small><br/>
    <small>Owner: ${a.owner}</small>
  `;
  m.bindPopup(html);
  return m;
}

function makePersonMarker(p){
  const icon = L.divIcon({
    className: 'person-icon',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:#10b981;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
    iconSize: [14,14],
    iconAnchor: [7,7]
  });
  const m = L.marker([p.lat, p.lon], { icon });
  const html = `
    <strong>${p.name}</strong><br/>
    <small>${p.role} - ${p.country}</small><br/>
    <small>Status: ${p.status}</small>
  `;
  m.bindPopup(html);
  return m;
}

function renderMapLayers(){
  const map = State.map.instance;
  const showEvents = byId('toggleEvents').checked;
  const showAssets = byId('toggleAssets').checked;
  const showPeople = byId('togglePeople').checked;

  // Clear
  State.map.clusters.events.clearLayers();
  State.map.layers.assets.clearLayers();
  State.map.layers.people.clearLayers();

  if(showEvents){
    const filtered = getFilteredEvents();
    filtered.forEach(e => State.map.clusters.events.addLayer(makeEventMarker(e)));
  }

  if(showAssets){
    State.assets.forEach(a => State.map.layers.assets.addLayer(makeAssetMarker(a)));
  }

  if(showPeople){
    State.people.forEach(p => State.map.layers.people.addLayer(makePersonMarker(p)));
  }
}

function renderCountrySelect(){
  const select = byId('countrySelect');
  select.innerHTML = '<option value="">All</option>';
  const countries = Array.from(new Set([
    ...MONITORED_COUNTRIES,
    ...getCountriesFromData()
  ])).sort();
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
}

function renderFeed(){
  const ul = byId('feedList');
  const term = (byId('feedSearch').value || '').toLowerCase();
  const items = getFilteredEvents().filter(e =>
    e.title.toLowerCase().includes(term) || (e.category||'').toLowerCase().includes(term)
  );
  ul.innerHTML = '';
  items.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  for(const e of items){
    const li = document.createElement('li');
    li.className = 'feed-item selectable';
    li.dataset.id = e.id;
    li.innerHTML = `
      <div class="item-header">
        <p class="item-title">${e.title}</p>
        <div class="item-meta">
          <span class="badge sev-${e.severity}">S${e.severity}</span>
          <span>${e.category || 'Unknown'}</span>
          <span>${e.country || 'N/A'}</span>
          <span>${new Date(e.timestamp).toLocaleString()}</span>
          <a href="${e.link || '#'}" target="_blank">Source</a>
          <button class="btn btn-small" data-action="incident" data-id="${e.id}">Create incident</button>
        </div>
      </div>
    `;
    ul.appendChild(li);
  }
}

function selectFeedItemById(id){
  const el = qsa('.feed-item').find(li => li.dataset.id === id);
  if(el){
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '2px solid var(--accent)';
    setTimeout(() => el.style.outline = 'none', 1500);
  }
}

function renderIncidents(){
  const ul = byId('incidentList');
  ul.innerHTML = '';
  for(const inc of State.incidents.slice().reverse()){
    const li = document.createElement('li');
    li.className = 'incident-card';
    li.innerHTML = `
      <div><strong>${inc.title}</strong> - S${inc.severity} - <em>${inc.status}</em></div>
      <div class="item-meta">
        <span>${new Date(inc.createdAt).toLocaleString()}</span>
        <span>Linked event: ${inc.linkedEventId || 'none'}</span>
      </div>
      <div>${inc.notes || ''}</div>
    `;
    ul.appendChild(li);
  }
}

function renderCharts(){
  // Severity chart
  const sevCounts = [1,2,3,4,5].map(s => getFilteredEvents().filter(e => e.severity === s).length);
  const ctx1 = byId('severityChart').getContext('2d');
  if(State.charts.severity) State.charts.severity.destroy();
  State.charts.severity = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: ['S1','S2','S3','S4','S5'],
      datasets: [{
        label: 'Events by severity',
        data: sevCounts
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // Country chart
  const countries = {};
  getFilteredEvents().forEach(e => {
    countries[e.country] = (countries[e.country] || 0) + 1;
  });
  const ctx2 = byId('countryChart').getContext('2d');
  if(State.charts.country) State.charts.country.destroy();
  State.charts.country = new Chart(ctx2, {
    type: 'pie',
    data: {
      labels: Object.keys(countries),
      datasets: [{
        label: 'Events by country',
        data: Object.values(countries)
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/** -----------------------------------------------------
 * Filtering and selection
 * ----------------------------------------------------- */
function getFilteredEvents(){
  const f = State.filters;
  return State.events.filter(e => {
    if(e.severity < f.minSeverity) return false;
    if(f.keyword && !keywordMatch(e.title + ' ' + (e.category||'') + ' ' + (e.source||''), f.keyword)) return false;
    if(f.countries.length > 0){
      if(!f.countries.includes(e.country)) return false;
    }
    if(f.timeWindowHours && !withinTimeWindow(e.timestamp, f.timeWindowHours)) return false;
    return true;
  });
}

function evaluateSelection(){
  if(!State.selections.polygon) return;
  const layer = State.selections.polygon;
  let inside = 0;
  getFilteredEvents().forEach(e => {
    const point = L.latLng(e.lat, e.lon);
    if(layer.getBounds && layer.getBounds().contains(point)){
      inside += 1;
    } else if(layer.getLatLng && layer.getLatLng().distanceTo(point) <= layer.getRadius()){
      inside += 1;
    }
  });
  setStatus(`Selection contains ${inside} filtered events`);
}

/** -----------------------------------------------------
 * Data ingestion
 * ----------------------------------------------------- */
function addEvents(list){
  const seen = new Set(State.events.map(e=>e.id));
  const clean = list
    .filter(e => e && e.id && !seen.has(e.id) && typeof e.lat === 'number' && typeof e.lon === 'number')
    .map(e => ({
      id: e.id,
      title: e.title || 'Untitled',
      category: e.category || 'Unknown',
      severity: Number(e.severity) || 1,
      lat: Number(e.lat),
      lon: Number(e.lon),
      country: e.country || '',
      source: e.source || '',
      link: e.link || '',
      timestamp: e.timestamp || new Date().toISOString()
    }));
  State.events.push(...clean);
}

function addAssets(list){
  const seen = new Set(State.assets.map(a=>a.id));
  const clean = list.filter(a => a && a.id && !seen.has(a.id));
  State.assets.push(...clean);
}

function addPeople(list){
  const seen = new Set(State.people.map(p=>p.id));
  const clean = list.filter(p => p && p.id && !seen.has(p.id));
  State.people.push(...clean);
}

function ingestJsonObject(obj){
  if(Array.isArray(obj)){
    addEvents(obj);
  } else if(typeof obj === 'object'){
    if(Array.isArray(obj.events)) addEvents(obj.events);
    if(Array.isArray(obj.assets)) addAssets(obj.assets);
    if(Array.isArray(obj.people)) addPeople(obj.people);
  }
  postIngest();
}

function postIngest(){
  renderCountrySelect();
  renderMapLayers();
  renderFeed();
  renderCharts();
  setStatus('Ingestion complete');
}

async function fetchFeed(url){
  // Fetch a feed at the given URL, passing through the CORS proxy to avoid cross-
  // origin errors in the browser. After downloading the feed we attempt to parse
  // JSON or RSS. For RSS we extract geolocation tags or derive coordinates from
  // the item content using heuristic functions. Feed items with no meaningful
  // location data will be dropped.
  if(!url) return;
  setStatus(`Fetching feed: ${url}`);
  // Use the proxy prefix to bypass CORS. If the URL already appears proxied,
  // avoid double-prepending.
  let fetchUrl = url;
  if(!url.startsWith(FEED_PROXY_PREFIX)){
    fetchUrl = FEED_PROXY_PREFIX + encodeURIComponent(url);
  }
  let text = '';
  try{
    const res = await fetch(fetchUrl);
    text = await res.text();
  }catch(err){
    console.error('Fetch failed', err);
    setStatus(`Fetch failed for ${url}`);
    return;
  }
  // Try JSON first: some endpoints may return arrays of events.
  try{
    const obj = JSON.parse(text);
    if(Array.isArray(obj)){
      addEvents(obj);
      postIngest();
      return;
    } else if(Array.isArray(obj.events)){
      addEvents(obj.events);
      postIngest();
      return;
    }
  }catch{}
  // Parse as RSS/Atom. Use DOMParser to extract <item> or <entry> tags.
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const items = Array.from(xml.querySelectorAll('item, entry'));
  const events = [];
  items.forEach((it, idx) => {
    const title = it.querySelector('title')?.textContent?.trim() || 'Untitled';
    const desc  = it.querySelector('description')?.textContent?.trim() ||
                  it.querySelector('content')?.textContent?.trim() || '';
    let lat = 0;
    let lon = 0;
    // 1) georss:point
    const pointEl = it.querySelector('georss\\:point') || it.querySelector('point');
    if(pointEl && pointEl.textContent){
      const parts = pointEl.textContent.trim().split(/\s+/);
      if(parts.length >= 2){
        const la = parseFloat(parts[0]);
        const lo = parseFloat(parts[1]);
        if(!Number.isNaN(la) && !Number.isNaN(lo)){
          lat = la;
          lon = lo;
        }
      }
    }
    // 2) geo:lat + geo:long
    if(lat === 0 && lon === 0){
      const latEl = it.querySelector('geo\\:lat') || it.querySelector('lat');
      const lonEl = it.querySelector('geo\\:long') || it.querySelector('long');
      if(latEl && lonEl){
        const la = parseFloat(latEl.textContent);
        const lo = parseFloat(lonEl.textContent);
        if(!Number.isNaN(la) && !Number.isNaN(lo)){
          lat = la;
          lon = lo;
        }
      }
    }
    // 3) parse coordinates from free text
    if(lat === 0 && lon === 0){
      const coords = parseLatLonFromString(title + ' ' + desc);
      if(coords){
        lat = coords[0];
        lon = coords[1];
      }
    }
    // 4) infer country
    let country = '';
    if(lat === 0 && lon === 0){
      const match = findCountryInString(title + ' ' + desc);
      if(match){
        country = match;
        const cc = COUNTRY_COORDS[match];
        lat = cc.lat;
        lon = cc.lon;
      }
    }
    // Skip if still at origin
    if(lat === 0 && lon === 0){
      return;
    }
    // Category
    let category = '';
    const catEl = it.querySelector('category, dc\\:subject');
    if(catEl && catEl.textContent){
      category = catEl.textContent.trim();
    }
    if(!country){
      const match = findCountryInString(title + ' ' + desc);
      if(match) country = match;
    }
    events.push({
      id: `rss-${Date.now()}-${Math.floor(Math.random()*100000)}-${idx}`,
      title,
      category: category || 'RSS',
      severity: 2,
      lat,
      lon,
      country: country || '',
      source: (() => {
        try {
          const u = new URL(url);
          return u.hostname.replace(/^www\\./,'');
        } catch {
          return url;
        }
      })(),
      link: it.querySelector('link')?.textContent || url,
      timestamp: it.querySelector('pubDate')?.textContent ||
                 it.querySelector('updated')?.textContent ||
                 new Date().toISOString()
    });
  });
  if(events.length > 0){
    addEvents(events);
    postIngest();
  } else {
    setStatus(`No events parsed for ${url}`);
  }
}

function startSimulation(){
  if(State.timers.simulation) return;
  let n = 0;
  State.timers.simulation = setInterval(() => {
    const sample = [
      {title:'Roadblock near Niamey', category:'Security', country:'Niger', lat:13.512, lon:2.112, severity:2},
      {title:'Flooding reported in Accra', category:'Natural Hazard', country:'Ghana', lat:5.6037, lon:-0.187, severity:3},
      {title:'Protest in Bamako city center', category:'Civil Unrest', country:'Mali', lat:12.6392, lon:-7.9996, severity:3},
      {title:'Clash reported in North Kivu', category:'Armed Conflict', country:'DRC', lat:-1.667, lon:29.222, severity:4},
      {title:'Power outage in Abidjan', category:'Infrastructure', country:'Cote d\'Ivoire', lat:5.35995, lon:-4.00826, severity:2}
    ];
    const e = sample[n % sample.length];
    const ev = {
      id: randomId('sim'),
      title: e.title,
      category: e.category,
      severity: e.severity,
      lat: e.lat, lon: e.lon,
      country: e.country,
      source: 'Simulated',
      link: '',
      timestamp: new Date().toISOString()
    };
    addEvents([ev]);
    renderMapLayers();
    renderFeed();
    renderCharts();
    byId('simStatus').textContent = `Simulation live - events: ${State.events.length}`;
    n++;
  }, 3500);
}

function stopSimulation(){
  if(State.timers.simulation){
    clearInterval(State.timers.simulation);
    State.timers.simulation = null;
    byId('simStatus').textContent = '';
  }
}

/** -----------------------------------------------------
 * Incidents and comms
 * ----------------------------------------------------- */
function createIncidentFromForm(e){
  e.preventDefault();
  const title = byId('incTitle').value.trim();
  const severity = Number(byId('incSeverity').value);
  const status = byId('incStatus').value;
  const notes = byId('incNotes').value;
  const inc = {
    id: randomId('inc'),
    title, severity, status, notes,
    createdAt: new Date().toISOString(),
    linkedEventId: null
  };
  State.incidents.push(inc);
  renderIncidents();
  e.target.reset();
}

function createIncidentFromEventId(id){
  const ev = State.events.find(x => x.id === id);
  if(!ev) return;
  const inc = {
    id: randomId('inc'),
    title: ev.title,
    severity: ev.severity,
    status: 'open',
    notes: `Auto-created from event ${id}`,
    createdAt: new Date().toISOString(),
    linkedEventId: id
  };
  State.incidents.push(inc);
  renderIncidents();
}

function sendComms(){
  const channel = byId('commsChannel').value;
  const recips = byId('commsRecipients').value.trim();
  const text = byId('commsMessage').value.trim();
  const entry = `[${new Date().toLocaleTimeString()}] Sent via ${channel} to ${recips}: ${text}`;
  const log = byId('commsLog');
  log.textContent += (log.textContent ? '\n' : '') + entry;
  byId('commsMessage').value = '';
}

/** -----------------------------------------------------
 * SOPs
 * ----------------------------------------------------- */
function saveSop(){
  const txt = byId('sopText').value.trim();
  if(!txt) return;
  const item = { id: randomId('sop'), text: txt, createdAt: new Date().toISOString() };
  State.sops.push(item);
  renderSops();
  byId('sopText').value='';
}
function renderSops(){
  const ul = byId('sopList');
  ul.innerHTML='';
  for(const s of State.sops.slice().reverse()){
    const li = document.createElement('li');
    li.className = 'sop-item';
    li.innerHTML = `<div><strong>SOP</strong> <small>${new Date(s.createdAt).toLocaleString()}</small></div><pre style="white-space:pre-wrap">${s.text}</pre>`;
    ul.appendChild(li);
  }
}

/** -----------------------------------------------------
 * Persistence
 * ----------------------------------------------------- */
function saveState(){
  const snapshot = {
    theme: State.theme,
    role: State.role,
    filters: State.filters,
    events: State.events,
    assets: State.assets,
    people: State.people,
    incidents: State.incidents,
    sops: State.sops
  };
  localStorage.setItem('qa_gsip_state', JSON.stringify(snapshot));
  setStatus('State saved to localStorage');
}
function loadState(){
  const s = localStorage.getItem('qa_gsip_state');
  if(!s){ setStatus('No saved state found'); return; }
  try{
    const snap = JSON.parse(s);
    State.theme = snap.theme || State.theme;
    State.role = snap.role || State.role;
    State.filters = snap.filters || State.filters;
    State.events = snap.events || [];
    State.assets = snap.assets || [];
    State.people = snap.people || [];
    State.incidents = snap.incidents || [];
    State.sops = snap.sops || [];

    document.body.classList.toggle('dark', State.theme === 'dark');
    document.body.classList.toggle('light', State.theme !== 'dark');

    byId('severityMin').value = State.filters.minSeverity;
    byId('keywordInput').value = State.filters.keyword;
    byId('timeWindow').value = State.filters.timeWindowHours;

    renderCountrySelect();
    renderMapLayers();
    renderFeed();
    renderIncidents();
    renderSops();
    renderCharts();
    setStatus('State loaded');
  }catch(err){
    console.error(err);
    setStatus('Failed to load state');
  }
}

/** -----------------------------------------------------
 * Exports
 * ----------------------------------------------------- */
function exportConfig(){
  const cfg = {
    role: State.role,
    filters: State.filters,
    basemap: State.map.basemap,
    layers: {
      events: byId('toggleEvents').checked,
      assets: byId('toggleAssets').checked,
      people: byId('togglePeople').checked
    }
  };
  download('qa-config.json', JSON.stringify(cfg, null, 2));
}
function exportFeedCsv(){
  const rows = getFilteredEvents();
  if(rows.length === 0){ setStatus('No events to export'); return; }
  const csv = toCSV(rows);
  download('qa-events.csv', csv, 'text/csv');
}
function exportFeedJson(){
  const rows = getFilteredEvents();
  download('qa-events.json', JSON.stringify(rows, null, 2));
}
function exportIncidents(){
  download('qa-incidents.json', JSON.stringify(State.incidents, null, 2));
}
function exportSop(){
  download('qa-sops.json', JSON.stringify(State.sops, null, 2));
}

/** -----------------------------------------------------
 * Role-based UI
 * ----------------------------------------------------- */
function applyRoleVisibility(){
  const role = byId('roleSelect').value;
  State.role = role;
  // Simple example: exec hides ingestion and SOPs
  qs('.sidebar .panel:nth-child(1)').style.display = (role === 'exec') ? 'none' : '';
  byId('panel-sop').style.display = (role === 'exec') ? 'none' : '';
}

/** -----------------------------------------------------
 * Event listeners
 * ----------------------------------------------------- */
function wireUI(){
  byId('themeToggle').addEventListener('click', () => {
    State.theme = (State.theme === 'dark' ? 'light' : 'dark');
    document.body.classList.toggle('dark');
    document.body.classList.toggle('light');
    localStorage.setItem('qa_theme', State.theme);
  });

  byId('basemapSelect').addEventListener('change', renderBasemap);
  byId('toggleEvents').addEventListener('change', renderMapLayers);
  byId('toggleAssets').addEventListener('change', renderMapLayers);
  byId('togglePeople').addEventListener('change', renderMapLayers);
  byId('clearDrawingsBtn').addEventListener('click', () => {
    State.map.layers.drawings.clearLayers();
    State.selections.polygon = null;
    setStatus('Annotations cleared');
  });

  // Filters
  byId('applyFiltersBtn').addEventListener('click', () => {
    State.filters.minSeverity = Number(byId('severityMin').value);
    State.filters.keyword = byId('keywordInput').value.trim();
    State.filters.timeWindowHours = Number(byId('timeWindow').value);
    const selected = Array.from(byId('countrySelect').selectedOptions).map(o => o.value).filter(Boolean);
    State.filters.countries = selected;
    renderMapLayers();
    renderFeed();
    renderCharts();
  });
  byId('resetFiltersBtn').addEventListener('click', () => {
    State.filters = { minSeverity:1, keyword:'', countries:[], timeWindowHours:72 };
    byId('severityMin').value = 1;
    byId('keywordInput').value = '';
    byId('timeWindow').value = 72;
    Array.from(byId('countrySelect').options).forEach(o => o.selected = false);
    renderMapLayers();
    renderFeed();
    renderCharts();
  });

  // Data ingest
  byId('jsonFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const text = await file.text();
    try{
      const obj = JSON.parse(text);
      ingestJsonObject(obj);
    }catch(err){
      console.error(err);
      setStatus('Invalid JSON file');
    }
  });
  byId('csvFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    Papa.parse(file, {
      header: true, dynamicTyping: true, complete: (res) => {
        const rows = res.data || [];
        const mapped = rows.map(r => ({
          id: r.id || randomId('csv'),
          title: r.title,
          category: r.category,
          severity: Number(r.severity) || 1,
          lat: Number(r.lat),
          lon: Number(r.lon),
          country: r.country || '',
          source: r.source || 'CSV',
          link: r.link || '',
          timestamp: r.timestamp || new Date().toISOString()
        }));
        addEvents(mapped);
        postIngest();
      }
    });
  });
  byId('fetchFeedBtn').addEventListener('click', () => {
    const url = byId('feedUrl').value.trim();
    if(!url){ setStatus('Enter a feed URL'); return; }
    fetchFeed(url).catch(err => {
      console.error(err);
      setStatus('Feed fetch failed - use a CORS friendly endpoint or paste JSON');
    });
  });
  byId('ingestRawJsonBtn').addEventListener('click', () => {
    const txt = byId('rawJsonInput').value.trim();
    if(!txt) return;
    try{
      const obj = JSON.parse(txt);
      ingestJsonObject(obj);
      byId('rawJsonInput').value = '';
    }catch(err){
      console.error(err);
      setStatus('Raw JSON parse error');
    }
  });
  // Note: sample and simulation buttons have been removed in the live-feed version.

  // Feed search
  byId('feedSearch').addEventListener('input', renderFeed);
  byId('exportFeedCsv').addEventListener('click', exportFeedCsv);
  byId('exportFeedJson').addEventListener('click', exportFeedJson);

  // Incident actions
  byId('incidentForm').addEventListener('submit', createIncidentFromForm);
  byId('exportIncidents').addEventListener('click', exportIncidents);
  byId('feedList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="incident"]');
    if(btn){
      createIncidentFromEventId(btn.dataset.id);
    }
  });

  // Comms
  byId('sendComms').addEventListener('click', sendComms);

  // SOP
  byId('saveSopBtn').addEventListener('click', saveSop);
  byId('exportSopBtn').addEventListener('click', exportSop);

  // Tabs
  qsa('.tab').forEach(t => t.addEventListener('click', () => {
    qsa('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const id = t.dataset.tab;
    qsa('.panel-body').forEach(p => p.classList.remove('active'));
    byId(`panel-${id}`).classList.add('active');
  }));

  // Role
  byId('roleSelect').addEventListener('change', applyRoleVisibility);

  // Save and load
  byId('saveStateBtn').addEventListener('click', saveState);
  byId('loadStateBtn').addEventListener('click', loadState);

  // Export config
  byId('exportConfigBtn').addEventListener('click', exportConfig);
}

/** -----------------------------------------------------
 * Init
 * ----------------------------------------------------- */
function boot(){
  // Fill country select
  renderCountrySelect();
  // Map
  initMap();
  // Wire UI
  wireUI();
  // Initialize feed management (load feed list and attach polling controls)
  initFeedManagement().catch(err => console.error(err));
  // Initial rendering with no events. Post-ingest will update charts, map and feed.
  postIngest();
  setStatus('Ready');
}

boot();
