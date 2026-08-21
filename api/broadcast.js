// MikeAircraft Broadcast API
// Version 0.3
//
// Fully enriched broadcast feed.
//
// Combines:
// Engine v0.6        -> movement intelligence
// Enrichment v0.2    -> airline + friendly aircraft name
// Route v0.5         -> origin / destination
//
// Intended consumer:
// MikeAircraft livestream graphics system

const engineHandler =
  require("./engine.js");

const enrichHandler =
  require("./enrich.js");

const routeHandler =
  require("./route.js");

module.exports = async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  try {
    const airport =
      String(
        req.query.airport || "PRG"
      )
        .trim()
        .toUpperCase();

    // =====================================================
    // INTERNAL HANDLER INVOKER
    //
    // Lets the Broadcast API call our own API modules
    // directly without going through protected Vercel URLs.
    // =====================================================

    async function invokeHandler(
      targetHandler,
      query
    ) {
      let statusCode = 200;
      let responseData = null;

      const fakeReq = {
        method: "GET",

        query:
          query || {},

        headers:
          req.headers || {}
      };

      const fakeRes = {
        setHeader() {
          return fakeRes;
        },

        status(code) {
          statusCode = code;
          return fakeRes;
        },

        json(data) {
          responseData = data;
          return data;
        },

        send(data) {
          responseData = data;
          return data;
        },

        end() {
          return null;
        }
      };

      await targetHandler(
        fakeReq,
        fakeRes
      );

      return {
        status:
          statusCode,

        data:
          responseData
      };
    }

    // =====================================================
    // STEP 1 — RUN MOVEMENT ENGINE
    // =====================================================

    const engineResult =
      await invokeHandler(
        engineHandler,
        {
          airport
        }
      );

    const engine =
      engineResult.data;

    if (
      !engine ||
      engineResult.status >= 400 ||
      !engine.ok
    ) {
      const detail =
        engine &&
        engine.error
          ? (
              typeof engine.error === "string"
                ? engine.error
                : JSON.stringify(
                    engine.error
                  )
            )
          : "Engine request failed";

      throw new Error(detail);
    }

    const intelligence =
      engine.intelligence || {};

    // =====================================================
    // TARGET ENRICHMENT
    // =====================================================

    async function buildTarget(
      target,
      role
    ) {
      if (!target) {
        return {
          available: false,
          role
        };
      }

      const callsign =
        target.callsign || null;

      const typeCode =
        target.type || null;

      // ---------------------------------------------
      // Run enrichment + route lookup in parallel.
      // Failures here are NOT fatal.
      // ---------------------------------------------

      const [
        enrichResult,
        routeResult
      ] =
        await Promise.all([
          invokeHandler(
            enrichHandler,
            {
              callsign:
                callsign || "",

              type:
                typeCode || ""
            }
          )
          .catch(
            () => ({
              status: 500,
              data: null
            })
          ),

          callsign
            ? invokeHandler(
                routeHandler,
                {
                  callsign
                }
              )
              .catch(
                () => ({
                  status: 500,
                  data: null
                })
              )
            : Promise.resolve({
                status: 404,
                data: null
              })
        ]);

      const enrichment =
        enrichResult &&
        enrichResult.data &&
        enrichResult.data.ok
          ? enrichResult.data
          : null;

      const routeData =
        routeResult &&
        routeResult.data &&
        routeResult.data.ok &&
        routeResult.data.routeFound &&
        routeResult.data.route
          ? routeResult.data.route
          : null;

      // =================================================
      // OPERATOR
      // =================================================

      let operator = {
        identified: false,
        name: null,
        icao: null,
        iata: null
      };

      if (
        routeData &&
        routeData.airline
      ) {
        operator = {
          identified: true,

          name:
            routeData.airline.name ||
            null,

          icao:
            routeData.airline.icao ||
            null,

          iata:
            routeData.airline.iata ||
            null
        };
      }
      else if (
        enrichment &&
        enrichment.operator &&
        enrichment.operator.identified
      ) {
        operator = {
          identified: true,

          name:
            enrichment.operator.name ||
            null,

          icao:
            enrichment.operator.icao ||
            null,

          iata:
            enrichment.operator.iata ||
            null
        };
      }

      // =================================================
      // FLIGHT DISPLAY
      // =================================================

      const flightDisplay =
        (
          routeData &&
          routeData.callsign_iata
        )
        ||
        (
          enrichment &&
          enrichment.flight &&
          enrichment.flight.display
        )
        ||
        callsign
        ||
        null;

      // =================================================
      // FRIENDLY AIRCRAFT NAME
      // =================================================

      const aircraftName =
        (
          enrichment &&
          enrichment.aircraft &&
          enrichment.aircraft.name
        )
        ||
        typeCode
        ||
        null;

      // =================================================
      // ROUTE
      // =================================================

      let route = {
        found: false,

        origin: null,

        destination: null,

        display: null,

        map: null
      };

      if (
        routeData &&
        routeData.origin &&
        routeData.destination
      ) {
        const origin =
          routeData.origin;

        const destination =
          routeData.destination;

        const originCode =
          origin.iata_code ||
          origin.icao_code ||
          null;

        const destinationCode =
          destination.iata_code ||
          destination.icao_code ||
          null;

        route = {
          found: true,

          display:
            originCode &&
            destinationCode
              ? (
                  originCode +
                  " → " +
                  destinationCode
                )
              : null,

          origin: {
            iata:
              origin.iata_code ||
              null,

            icao:
              origin.icao_code ||
              null,

            name:
              origin.name ||
              null,

            city:
              origin.municipality ||
              null,

            country:
              origin.country_name ||
              null,

            lat:
              Number.isFinite(
                Number(
                  origin.latitude
                )
              )
                ? Number(
                    origin.latitude
                  )
                : null,

            lon:
              Number.isFinite(
                Number(
                  origin.longitude
                )
              )
                ? Number(
                    origin.longitude
                  )
                : null
          },

          destination: {
            iata:
              destination.iata_code ||
              null,

            icao:
              destination.icao_code ||
              null,

            name:
              destination.name ||
              null,

            city:
              destination.municipality ||
              null,

            country:
              destination.country_name ||
              null,

            lat:
              Number.isFinite(
                Number(
                  destination.latitude
                )
              )
                ? Number(
                    destination.latitude
                  )
                : null,

            lon:
              Number.isFinite(
                Number(
                  destination.longitude
                )
              )
                ? Number(
                    destination.longitude
                  )
                : null
          },

          // Already prepared for the future route-map graphic.
          map: {
            start: {
              lat:
                Number.isFinite(
                  Number(
                    origin.latitude
                  )
                )
                  ? Number(
                      origin.latitude
                    )
                  : null,

              lon:
                Number.isFinite(
                  Number(
                    origin.longitude
                  )
                )
                  ? Number(
                      origin.longitude
                    )
                  : null
            },

            end: {
              lat:
                Number.isFinite(
                  Number(
                    destination.latitude
                  )
                )
                  ? Number(
                      destination.latitude
                    )
                  : null,

              lon:
                Number.isFinite(
                  Number(
                    destination.longitude
                  )
                )
                  ? Number(
                      destination.longitude
                    )
                  : null
            }
          }
        };
      }

      // =================================================
      // VIEWER-FRIENDLY STATUS
      // =================================================

      const statusLabels = {
        APPROACHING:
          "APPROACHING",

        ON_FINAL:
          "ON FINAL",

        LANDED:
          "LANDED",

        TAXIING_IN:
          "TAXIING IN",

        TAXIING_OUT:
          "TAXIING OUT",

        LINING_UP:
          "LINING UP",

        TAKEOFF_ROLL:
          "TAKEOFF",

        AIRBORNE_DEPARTURE:
          "AIRBORNE",

        DEPARTING:
          "DEPARTING",

        AIRBORNE:
          "AIRBORNE",

        GROUND:
          "ON GROUND"
      };

      const viewerStatus =
        statusLabels[
          target.state
        ]
        ||
        target.state
        ||
        null;

      // =================================================
      // FINAL BROADCAST TARGET
      // =================================================

      return {
        available: true,

        role,

        identity: {
          callsign,

          flight:
            flightDisplay,

          registration:
            target.registration ||
            null
        },

        operator,

        aircraft: {
          typeCode,

          name:
            aircraftName
        },

        route,

        movement: {
          state:
            target.state ||
            null,

          displayState:
            viewerStatus,

          lineage:
            target.lineage ||
            null,

          runway:
            target.runway ||
            null,

          confidence:
            target.confidence ??
            null,

          score:
            target.score ??
            null
        },

        telemetry: {
          airportDistanceKm:
            target.distanceKm ??
            null,

          thresholdDistanceKm:
            target.thresholdKm ??
            null,

          altitudeFt:
            target.altitude ??
            null,

          speedKt:
            target.speed ??
            null
        }
      };
    }

    // =====================================================
    // BUILD CURRENT / NEXT IN / NEXT OUT
    // =====================================================

    const [
      current,
      nextIn,
      nextOut
    ] =
      await Promise.all([
        buildTarget(
          intelligence.current,
          "CURRENT"
        ),

        buildTarget(
          intelligence.nextIn,
          "NEXT_IN"
        ),

        buildTarget(
          intelligence.nextOut,
          "NEXT_OUT"
        )
      ]);

    // =====================================================
    // DISPLAY DIRECTOR
    //
    // First simple broadcast-director logic.
    // We'll make this far cleverer later.
    // =====================================================

    let mode =
      "IDLE";

    let primaryRole =
      null;

    let showRouteMap =
      false;

    if (current.available) {
      mode =
        "PRIMARY";

      primaryRole =
        "CURRENT";

      // Route map may eventually appear during
      // introduction / quieter approach periods.
      showRouteMap =
        Boolean(
          current.route &&
          current.route.found
        );
    }
    else if (nextIn.available) {
      mode =
        "PREVIEW";

      primaryRole =
        "NEXT_IN";

      showRouteMap =
        Boolean(
          nextIn.route &&
          nextIn.route.found
        );
    }
    else if (nextOut.available) {
      mode =
        "PREVIEW";

      primaryRole =
        "NEXT_OUT";

      showRouteMap =
        Boolean(
          nextOut.route &&
          nextOut.route.found
        );
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res
      .status(200)
      .json({
        ok: true,

        service:
          "MikeAircraft Broadcast",

        version:
          "0.3",

        generatedAt:
          new Date()
            .toISOString(),

        airport: {
          code:
            engine.airport?.code ||
            airport,

          icao:
            engine.airport?.icao ||
            null,

          name:
            engine.airport?.name ||
            null
        },

        system: {
          engineVersion:
            engine.version ||
            null,

          engineStage:
            engine.stage ||
            null,

          dataStatus:
            engine.dataStatus ||
            null,

          adsbSource:
            engine.traffic?.source ||
            null,

          redisConnected:
            engine.memory
              ?.redisConnected ??
            null
        },

        director: {
          mode,

          primaryRole,

          showRouteMap
        },

        aircraft: {
          current,

          nextIn,

          nextOut
        }
      });
  }

  catch (error) {
    console.error(
      "MikeAircraft Broadcast error:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,

        service:
          "MikeAircraft Broadcast",

        version:
          "0.3",

        error:
          error.message
      });
  }
};
