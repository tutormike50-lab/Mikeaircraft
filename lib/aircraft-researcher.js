// MikeAircraft Aircraft Researcher v0.1
// Turns verified registration-specific evidence into Storyteller candidates.
// IMPORTANT: this module defines source policy and scoring; it does not scrape restricted websites.

const SOURCE_POLICY = {
  flightaware: {
    role: "recent_movements",
    trust: 5,
    access: "AeroAPI",
    environmentKey: "FLIGHTAWARE_AEROAPI_KEY",
    notes: "Preferred source for registration/tail-number current and historical movement evidence."
  },
  opensky: {
    role: "movement_corroboration_and_alerts",
    trust: 3,
    access: "official API/datasets",
    notes: "Useful for ICAO24 flight history and emergency squawk corroboration; aircraft metadata may be stale."
  },
  officialRegistry: {
    role: "identity_airframe",
    trust: 5,
    access: "country-specific official registry",
    notes: "Preferred evidence for registration, manufacturer/airframe identity and registry facts where available."
  },
  planespotters: {
    role: "manual_research_only",
    trust: 4,
    access: "NO AUTOMATED COPYING",
    notes: "Proprietary database. Do not scrape or ingest without permission/licence."
  }
};

const WOW_WEIGHTS = {
  previous_operator: 4,
  previous_registration: 4,
  special_livery: 5,
  recent_multi_country_day: 5,
  recent_busy_day: 4,
  rare_airport_visitor: 4,
  notable_verified_history: 5,
  delivery_year: 2,
  age: 2,
  operator: 0,
  registration: 0,
  aircraft_type: 0,
  normal_route: 0
};

function scoreFact(fact) {
  if (!fact || fact.verified !== true) return 0;
  const base = WOW_WEIGHTS[fact.kind] ?? 0;
  const trust = Number(fact.sourceTrust || 0);
  if (trust < 3) return 0;
  return Math.max(0, Math.min(5, base));
}

function selectStoryFacts(facts, max = 4) {
  return (Array.isArray(facts) ? facts : [])
    .map(f => ({ ...f, wow: scoreFact(f) }))
    .filter(f => f.wow >= 3 && f.text)
    .sort((a,b) => b.wow - a.wow)
    .slice(0, max);
}

function buildRecentMovementFact(movements) {
  const m = (Array.isArray(movements) ? movements : []).filter(x => x && x.verified && x.origin && x.destination);
  if (m.length < 3) return null;
  const airports = [];
  for (const x of m) {
    if (!airports.length) airports.push(x.origin);
    if (airports[airports.length-1] !== x.destination) airports.push(x.destination);
  }
  const countries = new Set(m.flatMap(x => [x.originCountry, x.destinationCountry]).filter(Boolean));
  const interesting = countries.size >= 3 || m.length >= 4;
  if (!interesting) return null;
  const routeText = airports.slice(-6).join(" → ");
  return {
    kind: countries.size >= 3 ? "recent_multi_country_day" : "recent_busy_day",
    verified: true,
    sourceTrust: Math.min(...m.map(x => Number(x.sourceTrust || 0))),
    text: `This aircraft has had a busy day, with recent flying taking it through ${routeText}`,
    evidence: m
  };
}

module.exports = { SOURCE_POLICY, WOW_WEIGHTS, scoreFact, selectStoryFacts, buildRecentMovementFact };
