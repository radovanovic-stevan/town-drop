// Builds towns.js for Town Drop. Run from a folder holding these downloads:
//   pp.geojson       Natural Earth populated places  (github.com/nvkelso/natural-earth-vector, geojson/ne_10m_populated_places_simple.geojson)
//   cities500.txt    GeoNames cities500 (download.geonames.org/export/dump/cities500.zip), fallback for countries Natural Earth misses
//   countryInfo.txt  GeoNames country info (area, population, ISO numeric codes)
//   w50.json         world-atlas@2.0.2 countries-50m.json, to check every country is on the map
// Usage: node build-towns.js towns.js
// Playable countries: the 193 UN members plus Vatican City, Palestine and Taiwan (Kosovo is folded into Serbia, so it gets no towns of its own).
const fs = require("fs");
const TARGET = 1500, MAX_PER_COUNTRY = 40;

const PLAYABLE = `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW VA PS TW`.split(/\s+/);

const KEEP_CODES = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLG", "PPLS"]);

// country info: ISO2 -> numeric id, area, population
const info = {};
for (const line of fs.readFileSync("countryInfo.txt", "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const c = line.split("\t");
  info[c[0]] = { num: c[2].padStart(3, "0"), name: c[4], area: +c[6] || 1, pop: +c[7] || 1 };
}

const map = require("./w50.json");
const mapIds = new Set(map.objects.countries.geometries.map(g => g.id));
const missing = PLAYABLE.filter(cc => !info[cc] || !mapIds.has(info[cc].num));
if (missing.length) console.error("not on map:", missing.map(cc => cc + "/" + (info[cc] && info[cc].num)).join(" "));

const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Main source: Natural Earth populated places (curated, English names, ranked by prominence).
// Fallback: GeoNames for any playable country Natural Earth has no places for.
const FIX = { "Shenyeng": "Shenyang", "Washington,  D.C.": "Washington, D.C." };
const playable = new Set(PLAYABLE);
const ne = JSON.parse(fs.readFileSync("pp.geojson", "utf8")).features.map(f => f.properties)
  .filter(p => playable.has(p.iso_a2))
  .map(p => ({ name: (FIX[p.name] || p.name).replace(/\s+/g, " ").trim(), cc: p.iso_a2, lat: p.latitude, lon: p.longitude,
               pop: p.pop_max || 0, rank: p.scalerank }));
const geo = [];
for (const line of fs.readFileSync("cities500.txt", "utf8").split("\n")) {
  const c = line.split("\t");
  if (c.length < 15 || !playable.has(c[8]) || !KEEP_CODES.has(c[7])) continue;
  geo.push({ name: c[1], cc: c[8], lat: +c[4], lon: +c[5], pop: +c[14] || 0, rank: c[7] === "PPLC" ? 9 : 10 });
}

const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// a name is only fair if no bigger place shares it anywhere in the playable world
function buildPools(places, pool = {}) {
  const biggest = new Map();
  for (const p of places) {
    const k = fold(p.name), b = biggest.get(k);
    if (!b || p.pop > b.pop) biggest.set(k, p);
  }
  for (const p of places) if (biggest.get(fold(p.name)) === p) (pool[p.cc] ||= []).push(p);
  for (const cc in pool) {
    pool[cc].sort((a, b) => a.rank - b.rank || b.pop - a.pop);
    // drop places that sit inside a more prominent one (Delhi / New Delhi, suburbs)
    const kept = [];
    for (const p of pool[cc]) if (!kept.some(k => km(k, p) < 15)) kept.push(p);
    pool[cc] = kept;
  }
  return pool;
}
const pools = buildPools(ne);
// GeoNames fills countries Natural Earth left empty, still avoiding names used by bigger places anywhere
const empty = new Set(PLAYABLE.filter(cc => !pools[cc]));
const fallback = buildPools(ne.concat(geo));
for (const cc of empty) if (fallback[cc]) pools[cc] = fallback[cc];
console.log("fallback countries:", [...empty].join(" ") || "none");

// share of towns grows with both size and population, but slowly, so small countries still appear
const weight = cc => Math.pow(info[cc].area, 0.3) * Math.pow(info[cc].pop, 0.2);
const quota = C => Object.fromEntries(PLAYABLE.filter(cc => pools[cc]).map(cc =>
  [cc, Math.min(pools[cc].length, MAX_PER_COUNTRY, Math.max(1, Math.round(C * weight(cc))))]));
const total = q => Object.values(q).reduce((a, b) => a + b, 0);
let lo = 0, hi = 1;
while (total(quota(hi)) < TARGET) hi *= 2;
for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; total(quota(m)) < TARGET ? lo = m : hi = m; }
const q = quota(hi);
// trim any overshoot from the countries with the most towns
let over = total(q) - TARGET;
for (const cc of Object.keys(q).sort((a, b) => q[b] - q[a])) { if (over <= 0) break; q[cc]--; over--; }

const towns = [];
for (const cc of PLAYABLE) {
  if (!q[cc]) { console.error("no towns for", cc); continue; }
  for (const p of pools[cc].slice(0, q[cc]))
    towns.push([p.name, info[cc].num, +p.lon.toFixed(2), +p.lat.toFixed(2)]);
}

fs.writeFileSync(process.argv[2],
  "// Generated from GeoNames (cities500, CC BY 4.0). [town, ISO numeric country id, lon, lat]\n" +
  "// Order matters: seeds pick from this list by position, so regenerating it changes every seed.\n" +
  "window.TOWNS = [\n" + towns.map(t => "  " + JSON.stringify(t)).join(",\n") + "\n];\n");

const counts = Object.entries(q).sort((a, b) => b[1] - a[1]);
console.log("towns:", towns.length, "countries:", counts.length);
console.log("most:", counts.slice(0, 12).map(([c, n]) => c + " " + n).join(", "));
console.log("least:", counts.slice(-25).map(([c, n]) => c + " " + n).join(", "));
const hist = {}; counts.forEach(([, n]) => hist[n] = (hist[n] || 0) + 1); console.log("hist:", JSON.stringify(hist));
