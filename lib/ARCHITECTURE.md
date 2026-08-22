# MikeAircraft modular architecture

This branch preserves current production behavior while separating repeated concerns.

## Shared registries
- `config/airports.js` — airport identity, coordinates, runway geometry, endpoint matching.
- `data/operators.js` — airline/operator ICAO/IATA/name lookup, including HLJ / HelloJets.
- `data/aircraft-types.js` — friendly aircraft type names.
- `aircraft/filters.js` — viewer traffic eligibility, including private/business aircraft exclusions.

## Shared services
- `services/redis.js` — Vercel KV / Upstash environment compatibility and REST command client.
- `services/invoke-handler.js` — reusable internal API-handler invocation without duplicate fake request/response code.
- `aircraft/lookup.js` — ADSBDB aircraft identity lookup by registration.
- `route/coherence.js` — single route-vs-airport movement coherence rule.
- `route/normalize.js` — converts provider route responses into the common MikeAircraft route shape.

## Route service
- `route/providers/adsbdb.js` — ADSBDB route provider only.
- `route/handler.js` — public route-service orchestration.
- `api/route.js` — thin Vercel entrypoint only.

This provider boundary is where AirLabs or another secondary route provider can later be added without changing Broadcast, Overlay or Storyteller.

## Broadcast
- `broadcast/target-builder.js` — combines operator, aircraft identity, route and movement data into one viewer target.
- `broadcast/handler.js` — orchestrates CURRENT/NEXT enrichment and Broadcast response construction.
- `api/broadcast.js` — thin Vercel entrypoint only.

## Editorial engine
- `engine-base.js` — raw ADS-B ingestion, movement history/classification and base selection.
- `editorial-engine-wrapper.js` — sticky CURRENT lifecycle, completion cooldown, dropout grace and takeoff pre-emption.
- `editorial-engine-wrapper-v2.js` — viewer traffic filtering and quiet-airport CURRENT promotion.
- `api/engine.js` — thin Vercel entrypoint with shared Redis compatibility.

## Storyteller
- `storyteller/type-facts.js` — current conservative evergreen fallback fact catalogue.
- `storyteller/handler.js` — confidence gate, safe story assembly and source/fact output.
- Storyteller uses the shared route-coherence rule rather than maintaining its own airport table.
- `api/storyteller.js` — thin Vercel entrypoint only.

Future livery, aircraft-life, recent-journey, airline and destination facts should be supplied by Story Intelligence rather than added directly to this handler.

## Overlay
- `overlay-base.js` — base HTML/canvas renderer.
- `overlay/patch-v11.js` — one-aircraft viewer mode, radar/story presentation foundation.
- `overlay/patch-v12.js` — map lifecycle and auxiliary-call stability behavior.
- `overlay/patch-v13.js` — current ribbon Storyteller crawl, airport pinning and top-priority radar label.
- `overlay-wrapper*.js` — compatibility shells only; they should contain no substantial presentation logic.

## Monitor pages
- `api/monitor.js` and `api/broadcast-monitor.js` remain large because they are self-contained diagnostic HTML pages.
- They are presentation/debug surfaces and do not own core selection, route or Storyteller rules, so they are intentionally not part of the riskier behavior refactor.

## Tests
- `tests/refactor-smoke.js` — verifies airport registry, HelloJets operator lookup, aircraft type lookup, private/business filtering and route coherence.
- Vercel preview builds for the refactor branch are compiling successfully. Runtime parity with production must still be verified before merge.

## Next subsystem
Story Intelligence should live separately under `story-intelligence/` and consume shared registries/services rather than adding logic to overlay or selection code.
