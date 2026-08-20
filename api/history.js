module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const allowedAirports = [
      "PRG",
      "LHR",
      "FRA",
      "AMS",
      "CDG",
      "MAN"
    ];

    const requestedAirport =
      String(req.query.airport || "PRG")
        .toUpperCase();

    const airport =
      allowedAirports.includes(requestedAirport)
        ? requestedAirport
        : "PRG";

    const redisURL =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;

    if (!redisURL || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis environment variables unavailable"
      });
    }

    async function redisCommand(command) {
      const response = await fetch(
        redisURL,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${redisToken}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(command)
        }
      );

      if (!response.ok) {
        throw new Error(
          `Redis HTTP ${response.status}`
        );
      }

      const result =
        await response.json();

      if (result.error) {
        throw new Error(
          `Redis error: ${result.error}`
        );
      }

      return result.result;
    }

    const stateKey =
      `mikeaircraft:v2:${airport}:state`;

    const stored =
      await redisCommand([
        "GET",
        stateKey
      ]);

    if (!stored) {
      return res.status(200).json({
        ok: true,
        airport,
        historyFound: false,
        trackedAircraft: 0,
        tracks: []
      });
    }

    const savedState =
      JSON.parse(stored);

    const storedTracks =
      savedState.tracks &&
      typeof savedState.tracks === "object"
        ? savedState.tracks
        : {};

    const tracks =
      Object.entries(storedTracks)
        .map(([id, track]) => {
          const samples =
            Array.isArray(track.samples)
              ? track.samples
              : [];

          const latest =
            samples.length
              ? samples[samples.length - 1]
              : null;

          const oldest =
            samples.length
              ? samples[0]
              : null;

          return {
            id,

            state:
              track.state || "UNKNOWN",

            confidence:
              track.confidence ?? null,

            reason:
              track.reason || null,

            stateSince:
              track.stateSince || null,

            lastSeen:
              track.lastSeen || null,

            sampleCount:
              samples.length,

            historySeconds:
              oldest && latest
                ? Math.round(
                    (
                      latest.time -
                      oldest.time
                    ) / 1000
                  )
                : 0,

            latest,

            samples
          };
        })

        .sort((a, b) => {
          return (
            (b.lastSeen || 0) -
            (a.lastSeen || 0)
          );
        });

    return res.status(200).json({
      ok: true,

      engine:
        "MikeAircraft Engine v2",

      diagnostic:
        "Movement History",

      airport,

      historyFound: true,

      updatedAt:
        savedState.updatedAt || null,

      trackedAircraft:
        tracks.length,

      tracks
    });

  }
  catch (error) {
    console.error(
      "MikeAircraft history error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
