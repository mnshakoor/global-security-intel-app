// NOTE: We no longer import any sample data or monitored country lists. All data comes from live RSS feeds.
// The app now uses a predefined list of RSS feed URLs for ingestion. See FEED_URLS below.

/*
 * List of RSS/Atom/JSON feeds to ingest. Each entry in this array is a URL.
 * These feeds were supplied by the user via the global_security_rss_feeds.txt file. You can
 * modify this list to add or remove feeds as needed. The application will poll
 * enabled feeds on a regular interval and ingest any new events into the system.
 */
const FEED_URLS = [
  "https://www.thenewhumanitarian.org/rss/all.xml",
  "https://theconversation.com/africa/articles.atom",
  "https://reliefweb.int/updates/rss.xml?advanced-search=%28C231_C75_C220_C149_C46_C49_C102_C69_C55_C164_C216_C174_C36_C208_C54_C87_C175%29",
  "https://www.crisisgroup.org/rss/1",
  "https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml",
  "https://www.rand.org/pubs/articles.xml",
  "https://www.msf.org/rss/all",
  "https://www.africom.mil/syndication-feed/rss/press-releases",
  "https://travel.state.gov/_res/rss/TAsTWs.xml",
  "https://www.rusi.org/rss/latest-publications.xml",
  "https://www.nato.int/cps/rss/en/natohq/rssFeed.xsl/rssFeed.xml",
  "https://www.bellingcat.com/feed/",
  "https://www.icij.org/feed/",
  "https://reliefweb.int/updates/rss.xml",
  "https://www.unodc.org/unodc/feed/stories.xml",
  "https://www.gdacs.org/xml/rss.xml",
  "https://www.unodc.org/unodc/feed/press-releases.xml",
  "https://reliefweb.int/updates/rss.xml?view=headlines",
  "https://www.unodc.org/unodc/feed/publications.xml",
  "https://www.chathamhouse.org/path/news-releases.xml",
  "https://www.cisa.gov/cybersecurity-advisories/all.xml",
  "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=2&Site=945&max=10",
  "https://www.google.com/alerts/feeds/09678322071861326813/15478561615984895730",
  "https://www.google.com/alerts/feeds/09678322071861326813/17729077320378208369",
  "https://www.google.com/alerts/feeds/09678322071861326813/10382831314055122160",
  "https://www.google.com/alerts/feeds/09678322071861326813/3724071121715750608",
  "https://www.google.com/alerts/feeds/09678322071861326813/16059299224477972089",
  "https://www.google.com/alerts/feeds/09678322071861326813/1198605801377290022",
  "https://www.google.com/alerts/feeds/09678322071861326813/3174126178415816884",
  "https://www.google.com/alerts/feeds/09678322071861326813/10778257038356429766",
  "https://www.google.com/alerts/feeds/09678322071861326813/13907740799062403631",
  "https://www.google.com/alerts/feeds/09678322071861326813/13583311032613923135",
  "https://www.google.com/alerts/feeds/09678322071861326813/3377241513725216927",
  "https://www.google.com/alerts/feeds/09678322071861326813/15536018237517902097",
  "https://www.google.com/alerts/feeds/09678322071861326813/6761969864493492596",
  "https://www.google.com/alerts/feeds/09678322071861326813/8525308065649173498",
  "https://www.google.com/alerts/feeds/09678322071861326813/9404830783107472102",
  "https://www.google.com/alerts/feeds/09678322071861326813/15223369397218074172",
  "https://www.google.com/alerts/feeds/09678322071861326813/13089685840883809940",
  "https://www.google.com/alerts/feeds/09678322071861326813/6461275839714976954",
  "https://www.google.com/alerts/feeds/09678322071861326813/1777354198294681489"
];

/** -----------------------------------------------------
 * Global State
 * ----------------------------------------------------- */
// Default monitored country list is empty; populate this if you have a fixed list of countries to always include.
const MONITORED_COUNTRIES = [];

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
    basemap: 'osm'
  },
  timers: {
    simulation: null,
    // Interval ID for RSS polling. Set when startPolling() is called and cleared by stopPolling().
    polling: null
  },
  // List of feed objects: { url: string, enabled: boolean }. Populated in initFeedManagement().
  feeds: []
};

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
 * Feed management
 * ----------------------------------------------------- */
// Initialize the feed list from FEED_URLS and render the checkboxes in the UI.  Each feed is
// enabled by default.  Call this after the DOM is ready in boot().
function initFeedManagement(){
  State.feeds = FEED_URLS.map(url => ({ url, enabled: true }));
  renderFeedCheckboxes();
}

// Render feed enable/disable checkboxes in the panel.  Requires an element with id
// 'feedCheckboxes' in the HTML.
function renderFeedCheckboxes(){
  const container = byId('feedCheckboxes');
  if(!container) return;
  container.innerHTML = '';
  State.feeds.forEach((feed, idx) => {
    const id = `feedCheck-${idx}`;
    const row = document.createElement('div');
    row.className = 'row';
    // shorten long URLs for display
    const display = feed.url.replace(/https?:\/\//, '').slice(0, 40);
    row.innerHTML = `<label><input type="checkbox" id="${id}" ${feed.enabled ? 'checked' : ''}> ${display}</label>`;
    container.appendChild(row);
    const cb = document.getElementById(id);
    if(cb){
      cb.addEventListener('change', (e) => {
        feed.enabled = e.target.checked;
      });
    }
  });
}

// Fetch and ingest all enabled feeds once.  After ingestion, update map, feed list,
// charts, and status.  If no feeds are enabled, nothing happens.
async function fetchAllEnabledFeeds(){
  const enabledFeeds = State.feeds.filter(f => f.enabled);
  if(enabledFeeds.length === 0){
    setStatus('No feeds enabled');
    return;
  }
  setStatus(`Fetching ${enabledFeeds.length} feeds ...`);
  for(const feed of enabledFeeds){
    try{
      await fetchFeed(feed.url);
    }catch(err){
      console.error('Feed fetch error', feed.url, err);
    }
  }
  // Re-render after batch ingestion
  renderMapLayers();
  renderFeed();
  renderCharts();
  setStatus(`Fetched ${enabledFeeds.length} feeds`);
}

// Start periodic polling based on the interval (in minutes) set in the UI.  Clears
// any existing polling timer.  Polls immediately once then on each interval.
function startPolling(){
  const val = byId('pollInterval') ? Number(byId('pollInterval').value) : 5;
  const minutes = isNaN(val) || val <= 0 ? 5 : val;
  stopPolling();
  // Immediately fetch all feeds
  fetchAllEnabledFeeds();
  State.timers.polling = setInterval(fetchAllEnabledFeeds, minutes * 60 * 1000);
  setStatus(`Polling every ${minutes} minutes`);
}

// Stop the current polling interval if any.
function stopPolling(){
  if(State.timers.polling){
    clearInterval(State.timers.polling);
    State.timers.polling = null;
    setStatus('Polling stopped');
  }
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
  setStatus('Fetching feed ...');
  // Attempt raw fetch. Many RSS endpoints will block via CORS.
  const res = await fetch(url);
  const text = await res.text();
  // Try JSON first
  try{
    const obj = JSON.parse(text);
    if(Array.isArray(obj)){
      addEvents(obj);
    } else if(Array.isArray(obj.events)){
      addEvents(obj.events);
    }
    postIngest();
    return;
  }catch{}
  // Try simple RSS parse for a few tags
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const items = Array.from(xml.querySelectorAll('item'));
  const rssEvents = items.map((it, idx) => ({
    id: `rss-${Date.now()}-${idx}`,
    title: it.querySelector('title')?.textContent || 'RSS item',
    category: it.querySelector('category')?.textContent || 'RSS',
    severity: 2,
    lat: 0, lon: 0,
    country: '',
    source: (new URL(url)).hostname,
    link: it.querySelector('link')?.textContent || url,
    timestamp: it.querySelector('pubDate')?.textContent || new Date().toISOString()
  }));
  addEvents(rssEvents);
  postIngest();
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
  // Sample and simulation buttons have been removed from the UI.  Guard against missing elements.
  const loadSamplesBtn = byId('loadSamplesBtn');
  if(loadSamplesBtn){
    loadSamplesBtn.addEventListener('click', () => {
      console.warn('Sample data loading is disabled in this build');
    });
  }
  const simulateBtn = byId('simulateFeedBtn');
  if(simulateBtn){
    simulateBtn.addEventListener('click', () => {
      console.warn('Simulated feed has been removed in this build');
    });
  }

  // Polling controls for RSS feeds
  const fetchFeedsBtn = byId('fetchFeedsNowBtn');
  if(fetchFeedsBtn){
    fetchFeedsBtn.addEventListener('click', fetchAllEnabledFeeds);
  }
  const startPollBtn = byId('startPollingBtn');
  if(startPollBtn){
    startPollBtn.addEventListener('click', startPolling);
  }
  const stopPollBtn = byId('stopPollingBtn');
  if(stopPollBtn){
    stopPollBtn.addEventListener('click', stopPolling);
  }

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
  // Initialize feed management and populate the feed checkbox list
  initFeedManagement();
  // No sample data is preloaded in this build.  Prepare the map and charts with empty data
  postIngest();
  setStatus('Ready');
}

boot();
