// MikeAircraft Broadcast API
// Version 0.5
//
// Fully enriched broadcast feed.
//
// Combines:
// Engine v0.6         -> movement intelligence
// Enrichment v0.2     -> airline + friendly aircraft fallback
// Route v0.5          -> origin / destination
// ADSBDB aircraft API -> detailed aircraft identity
//
// Aircraft lookup is now built directly into Broadcast
// so we do NOT need a separate aircraftinfo.js endpoint.

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
    // INTERNAL MODULE INVOKER
    // =====================================================

    async function invokeHandler(
      targetHandler,
      query
    ) {
      let statusCode = 200;
      let responseData = null;

      const fakeReq = {
        method: "GET",
        query: query || {},
        headers: req.headers || {}
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
        status: statusCode,
        data: responseData
      };
    }

    // =====================================================
    // DIRECT AIRCRAFT LOOKUP
    // =====================================================

    async function lookupAircraft(
      registration
    ) {
      if (!registration) {
        return null;
      }

      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () => controller.abort(),
          7000
        );

      try {
        const response =
          await fetch(
            "https://api.adsbdb.com/v0/aircraft/" +
            encodeURIComponent(
              registration
            ),
            {
              headers: {
                Accept:
                  "application/json"
              },

              signal:
                controller.signal
            }
          );

        if (
          response.status === 404
        ) {
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const data =
          await response.json();

        const aircraft =
          data &&
          data.response &&
          data.response.aircraft
            ? data.response.aircraft
            : null;

        if (!aircraft) {
          return null;
        }

        return {
          registration:
            aircraft.registration ||
            registration,

          modeS:
            aircraft.mode_s ||
            null,

          manufacturer:
            aircraft.manufacturer ||
            null,

          type:
            aircraft.type ||
            null,

          icaoType:
            aircraft.icao_type ||
            null,

          owner:
            aircraft.registered_owner ||
            null,

          ownerCountry:
            aircraft
              .registered_owner_country_name ||
            null,

          operatorFlag:
            aircraft
              .registered_owner_operator_flag_code ||
            null,

          photo:
            aircraft.url_photo ||
            null,

          thumbnail:
            aircraft
              .url_photo_thumbnail ||
            null
        };
      }

      catch {
        return null;
      }

      finally {
        clearTimeout(timeout);
      }
    }

    // =====================================================
    // STEP 1 — MOVEMENT ENGINE
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
    // TARGET BUILDER
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

      const registration =
        target.registration || null;

      const typeCode =
        target.type || null;

      // =================================================
      // RUN LOOKUPS IN PARALLEL
      // =================================================

      const [
        enrichResult,
        routeResult,
        aircraftInfo
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
              }),

          registration
            ? lookupAircraft(
                registration
              )
            : Promise.resolve(
                null
              )
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
        iata: null,
        country: null
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
            null,

          country:
            routeData.airline.country ||
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
            null,

          country:
            null
        };
      }

      else if (
        aircraftInfo &&
        aircraftInfo.owner
      ) {
        operator = {
          identified: true,

          name:
            aircraftInfo.owner,

          icao:
            aircraftInfo.operatorFlag ||
            null,

          iata:
            null,

          country:
            aircraftInfo.ownerCountry ||
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
      // AIRCRAFT IDENTITY
      // =================================================

      let aircraftName =
        typeCode ||
        null;

      let manufacturer =
        null;

      let owner =
        null;

      let ownerCountry =
        null;

      let photo =
        null;

      let thumbnail =
        null;

      let modeS =
        null;

      if (aircraftInfo) {
        manufacturer =
          aircraftInfo.manufacturer ||
          null;

        owner =
          aircraftInfo.owner ||
          null;

        ownerCountry =
          aircraftInfo.ownerCountry ||
          null;

        photo =
          aircraftInfo.photo ||
          null;

        thumbnail =
          aircraftInfo.thumbnail ||
          null;

        modeS =
          aircraftInfo.modeS ||
          null;

        if (
          aircraftInfo.type
        ) {
          if (
            manufacturer &&
            !aircraftInfo.type
              .toUpperCase()
              .startsWith(
                manufacturer.toUpperCase()
              )
          ) {
            aircraftName =
              manufacturer +
              " " +
              aircraftInfo.type;
          }

          else {
            aircraftName =
              aircraftInfo.type;
          }
        }
      }

      if (
        (
          !aircraftInfo ||
          !aircraftInfo.type
        ) &&
        enrichment &&
        enrichment.aircraft &&
        enrichment.aircraft.name
      ) {
        aircraftName =
          enrichment.aircraft.name;
      }

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

        const originLat =
          Number.isFinite(
            Number(origin.latitude)
          )
            ? Number(origin.latitude)
            : null;

        const originLon =
          Number.isFinite(
            Number(origin.longitude)
          )
            ? Number(origin.longitude)
            : null;

        const destinationLat =
          Number.isFinite(
            Number(destination.latitude)
          )
            ? Number(
                destination.latitude
              )
            : null;

        const destinationLon =
          Number.isFinite(
            Number(destination.longitude)
          )
            ? Number(
                destination.longitude
              )
            : null;

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
              originLat,

            lon:
              originLon
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
              destinationLat,

            lon:
              destinationLon
          },

          map: {
            start: {
              lat:
                originLat,

              lon:
                originLon
            },

            end: {
              lat:
                destinationLat,

              lon:
                destinationLon
            }
          }
        };
      }

      // =================================================
      // VIEWER STATUS
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
      // FINAL TARGET
      // =================================================

      return {
        available: true,

        role,

        identity: {
          callsign,

          flight:
            flightDisplay,

          registration,

          modeS
        },

        operator,

        aircraft: {
          typeCode,

          name:
            aircraftName,

          manufacturer,

          owner,

          ownerCountry,

          photo,

          thumbnail
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
    // BUILD SELECTIONS
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
          "0.5",

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
          "0.5",

        error:
          error.message
      });
  }
};
