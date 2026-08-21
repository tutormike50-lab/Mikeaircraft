module.exports = async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>MikeAircraft Overlay Diagnostic</title>

  <style>
    html,
    body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #202020;
      color: white;
      font-family: Arial, Helvetica, sans-serif;
    }

    .box {
      margin: 40px;
      padding: 24px;
      max-width: 900px;
      background: #0e2a43;
      border: 2px solid #4bb7f3;
      border-radius: 12px;
    }

    h1 {
      margin-top: 0;
    }

    .good {
      color: #65e69a;
    }

    .bad {
      color: #ff7777;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #111820;
      padding: 16px;
      border-radius: 8px;
      overflow: auto;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>
      MikeAircraft Overlay Diagnostic
    </h1>

    <p>
      Page render:
      <strong class="good">
        WORKING
      </strong>
    </p>

    <p>
      Airport:
      <strong id="airport">
        ---
      </strong>
    </p>

    <p>
      Broadcast API:
      <strong id="status">
        TESTING...
      </strong>
    </p>

    <p>
      CURRENT aircraft:
      <strong id="current">
        ---
      </strong>
    </p>

    <p>
      Error:
      <strong id="error">
        NONE
      </strong>
    </p>

    <h3>
      Raw Broadcast JSON
    </h3>

    <pre id="raw">
Waiting...
    </pre>

  </div>

<script>

  async function runTest() {

    const params =
      new URLSearchParams(
        window.location.search
      );

    const airport =
      (
        params.get("airport") ||
        "PRG"
      ).toUpperCase();

    document
      .getElementById("airport")
      .textContent =
        airport;

    try {

      const response =
        await fetch(
          "/api/broadcast?airport=" +
          encodeURIComponent(airport) +
          "&t=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      const raw =
        await response.text();

      document
        .getElementById("raw")
        .textContent =
          raw;

      let data;

      try {
        data =
          JSON.parse(raw);
      }
      catch {
        throw new Error(
          "Broadcast returned invalid JSON"
        );
      }

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.error ||
          "Broadcast request failed"
        );
      }

      document
        .getElementById("status")
        .textContent =
          "WORKING";

      document
        .getElementById("status")
        .className =
          "good";

      const current =
        data.aircraft &&
        data.aircraft.current;

      document
        .getElementById("current")
        .textContent =
          current &&
          current.available
            ? (
                current.identity?.flight ||
                current.identity?.callsign ||
                "AVAILABLE"
              )
            : "NONE";

    }
    catch (error) {

      document
        .getElementById("status")
        .textContent =
          "FAILED";

      document
        .getElementById("status")
        .className =
          "bad";

      document
        .getElementById("error")
        .textContent =
          error.message;

      document
        .getElementById("error")
        .className =
          "bad";

    }

  }

  runTest();

</script>

</body>
</html>
`;

  return res
    .status(200)
    .send(html);
};
