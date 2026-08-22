# MikeAircraft modular architecture

This branch preserves current production behavior while separating repeated concerns.

## Shared registries
- `config/airports.js` — airport identity, coordinates, runway geometry, endpoint matching.
- `data/operators.js` — airline/operator ICAO/IATA/name lookup.
- `data/aircraft-types.js` — friendly aircraft type names.
- `aircraft/filters.js` — viewer traffic eligibility, including private/business aircraft exclusions.

## Shared services
- `services/redis.js` — Vercel KV / Upstash environment compatibility and REST command client.
- `route/coherence.js` — single route-vs-airport movement coherence rule.

## Editorial engine
- `engine-base.js` — raw ADS-B ingestion, movement history/classification and base selection.
- `editorial-engine-wrapper.js` — sticky CURRENT lifecycle, completion cooldown, dropout grace and takeoff pre-emption.
- `editorial-engine-wrapper-v2.js` — viewer traffic filtering and quiet-airport CURRENT promotion.

## Overlay
- `overlay-base.js` — base HTML/canvas renderer.
- `overlay/patch-v11.js` — one-aircraft viewer mode, radar/story presentation foundation.
- `overlay/patch-v12.js` — map lifecycle and auxiliary-call stability behavior.
- `overlay/patch-v13.js` — current ribbon Storyteller crawl, airport pinning and top-priority radar label.
- `overlay-wrapper*.js` — compatibility shells only; they should contain no substantial presentation logic.

## Tests
- `tests/refactor-smoke.js` — verifies airport registry, HelloJets operator lookup, aircraft type lookup, private/business filtering and route coherence.

## Next subsystem
Story Intelligence should live separately under `story-intelligence/` and consume shared registries/services rather than adding logic to overlay or selection code.
