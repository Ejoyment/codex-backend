/**
 * Phase 3.5 — Edge node routing for high-growth global developer hubs.
 * Maps a user (country / currency / coordinates) to the nearest edge PoP
 * used for regional payment processing and cloud-runtime fallback.
 * Override/extend the PoP list via EDGE_NODES_JSON.
 */

const DEFAULT_POPS = [
  { code: 'ng-lagos', region: 'west-africa', countries: ['NG'], currencies: ['NGN'], lat: 6.45, lng: 3.39, endpoint: 'https://edge-lagos.buildrshq.dev' },
  { code: 'gh-accra', region: 'west-africa', countries: ['GH'], currencies: ['GHS'], lat: 5.6, lng: -0.19, endpoint: 'https://edge-accra.buildrshq.dev' },
  { code: 'ke-nairobi', region: 'east-africa', countries: ['KE', 'UG', 'TZ', 'RW'], currencies: ['KES', 'UGX', 'TZS', 'RWF'], lat: -1.29, lng: 36.82, endpoint: 'https://edge-nairobi.buildrshq.dev' },
  { code: 'za-joburg', region: 'southern-africa', countries: ['ZA', 'ZM'], currencies: ['ZAR', 'ZMW'], lat: -26.2, lng: 28.04, endpoint: 'https://edge-joburg.buildrshq.dev' },
  { code: 'eu-frankfurt', region: 'europe', countries: [], currencies: ['EUR', 'GBP'], lat: 50.11, lng: 8.68, endpoint: 'https://edge-frankfurt.buildrshq.dev' },
  { code: 'us-east', region: 'americas', countries: ['US'], currencies: ['USD'], lat: 39.04, lng: -77.49, endpoint: 'https://edge-useast.buildrshq.dev' },
];

function getPops() {
  try {
    if (process.env.EDGE_NODES_JSON) {
      const parsed = JSON.parse(process.env.EDGE_NODES_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fall through to defaults on malformed env.
  }
  return DEFAULT_POPS;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const rad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Pick the nearest edge PoP.
 * Priority: exact country match → currency match → nearest by coordinates →
 * global default (first PoP in list).
 */
function nearestEdge({ country, currency, lat, lng } = {}, pops = getPops()) {
  const cty = String(country || '').toUpperCase();
  const cur = String(currency || '').toUpperCase();
  if (cty) {
    const byCountry = pops.find((p) => (p.countries || []).includes(cty));
    if (byCountry) return byCountry;
  }
  if (cur) {
    const byCurrency = pops.find((p) => (p.currencies || []).includes(cur));
    if (byCurrency) return byCurrency;
  }
  if (typeof lat === 'number' && typeof lng === 'number') {
    let best = null;
    let bestKm = Infinity;
    for (const p of pops) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      const km = haversineKm(lat, lng, p.lat, p.lng);
      if (km < bestKm) {
        bestKm = km;
        best = p;
      }
    }
    if (best) return best;
  }
  return pops[0] || null;
}

module.exports = { DEFAULT_POPS, getPops, nearestEdge, haversineKm };
