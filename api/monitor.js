module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>MikeAircraft Engine Monitor</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #0c1119;
      color: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
    }

    .header {
      background:
        linear-gradient(
          90deg,
          #071d34,
          #00558f,
          #071d34
        );

      border-bottom:
        1px solid #298dcc;

      padding: 22px 30px;
    }

    .header h1 {
      margin: 0;
      font-size: 27px;
    }

    .header p {
      margin: 7px 0 0;
      color: #a9cee8;
    }

    .container {
      max-width: 980px;
      margin: auto;
      padding: 28px;
    }

    .card {
      background: #151d29;
      border: 1px solid #29384b;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 22px;
    }

    .cardTitle {
      padding: 14px 18px;
      background: #101722;
      border-bottom: 1px solid #29384b;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 1px;
      color: #a8d9ff;
    }

    .row {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 18px;
      border-bottom: 1px solid #273240;
    }

    .row:last-child {
      border-bottom: none;
    }

    .label {
      color: #b8c4d2;
    }

    .value {
      font-weight: bold;
    }

    .good {
      color: #57dc91;
    }

    .bad {
      color: #ff6e6e;
    }

    .waiting {
      color: #ffd65a;
    }

    .big {
      font-size: 24px;
    }

    .airportBox {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    select {
      background: #0b253a;
      color: white;
      border: 1px solid #387ba6;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
    }

    #errorBox {
      display: none;
      background: #431f26;
      border: 1px solid #843e49;
      border-radius: 10px;
      color: #ffc0c6;
      padding: 15px;
      margin-bottom: 20px;
    }

    .footer {
      color: #74879a;
      font-size: 12px;
      text-align: center;
      margin-top: 18px;
    }

    .pulse {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #57dc91;
      margin-right: 7px;
      box-shadow: 0 0 8px #57dc91;
    }
  </style>
</head>

<body>

  <div class="header">
    <h1>✈ MikeAircraft Engine Monitor</h1>
    <p>
      Engine v2 development dashboard
    </p>
  </div>

  <div class="container">

    <div id="errorBox"></div>

    <div class="card">

      <div class="cardTitle">
        ENGINE STATUS
      </div>

      <div class="row">
        <span class="label">Airport</span>

        <div class="airportBox">
          <select id="airport">
            <option value="PRG">PRG — Prague</option>
            <option value="LHR">LHR — Heathrow</option>
            <option value="FRA">FRA — Frankfurt</option>
            <option value="AMS">AMS — Amsterdam</option>
            <option value="CDG">CDG — Paris CDG</option>
            <option value="MAN">MAN — Manchester</option>
          </select>
        </div>
      </div>

      <div class="row">
        <span class="label">Engine</span>
        <span id="engine" class="value waiting">
          WAITING
        </span>
      </div>

      <div class="row">
        <span class="label">ADS-B Source</span>
        <span id="source" class="value">
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">Redis Memory</span>
        <span id="redis" class="value waiting">
          WAITING
        </span>
      </div>

    </div>

    <div class="card">

      <div class="cardTitle">
        LIVE TRACKING
      </div>

      <div class="row">
        <span class="label">
          Aircraft received
        </span>

        <span
          id="aircraft"
          class="value big"
        >
          0
        </span>
      </div>

      <div class="row">
        <span class="label">
          Aircraft matched to previous snapshot
        </span>

        <span
          id="matched"
          class="value big"
        >
          0
        </span>
      </div>

      <div class="row">
        <span class="label">
          Previous snapshot age
        </span>

        <span
          id="age"
          class="value"
        >
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">
          Last successful update
        </span>

        <span
          id="lastUpdate"
          class="value"
        >
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">
          Update interval
        </span>

        <span class="value good">
          5 seconds
        </span>
      </div>

    </div>

    <div class="card">

      <div class="cardTitle">
        MEMORY HEALTH
      </div>

      <div class="row">
        <span class="label">
          Previous snapshot found
        </span>

        <span
          id="snapshot"
          class="value"
        >
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">
          Previous aircraft count
        </span>

        <span
          id="previousCount"
          class="value"
        >
          0
        </span>
      </div>

      <div class="row">
        <span class="label">
          Redis read
        </span>

        <span
          id="read"
          class="value"
        >
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">
          Redis write
        </span>

        <span
          id="write"
          class="value"
        >
          ---
        </span>
      </div>

    </div>

    <div class="footer">
      MikeAircraft Engine v2 • Development Monitor
    </div>

  </div>

<script>
  const UPDATE_INTERVAL = 5000;

  let busy = false;

  function setStatus(id, text, good) {
    const element =
      document.getElementById(id);

    element.textContent = text;

    element.className =
      "value " +
      (
        good === true
          ? "good"
          : good === false
            ? "bad"
            : "waiting"
      );
  }

  async function updateMonitor() {

    if (busy) {
      return;
    }

    busy = true;

    const airport =
      document.getElementById("airport").value;

    try {

      const response =
        await fetch(
          "/api/engine?airport=" +
          encodeURIComponent(airport) +
          "&t=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      const text =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(text);
      }
      catch {
        throw new Error(
          "Engine returned non-JSON data"
        );
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
          "Engine request failed"
        );
      }

      const traffic =
        data.traffic || {};

      const memory =
        data.memory || {};

      document.getElementById(
        "engine"
      ).innerHTML =
        '<span class="pulse"></span>LIVE';

      document.getElementById(
        "engine"
      ).className =
        "value good";

      document.getElementById(
        "source"
      ).textContent =
        traffic.source || "Unknown";

      document.getElementById(
        "aircraft"
      ).textContent =
        traffic.trackedCount ??
        traffic.rawCount ??
        0;

      document.getElementById(
        "matched"
      ).textContent =
        memory.matchedAircraft ?? 0;

      document.getElementById(
        "previousCount"
      ).textContent =
        memory.previousAircraftCount ?? 0;

      if (
        memory.previousAgeSeconds !== null &&
        memory.previousAgeSeconds !== undefined
      ) {

        document.getElementById(
          "age"
        ).textContent =
          memory.previousAgeSeconds +
          " seconds";

      }
      else {

        document.getElementById(
          "age"
        ).textContent =
          "Waiting for history";
      }

      setStatus(
        "redis",
        memory.redisConnected
          ? "CONNECTED"
          : "NOT CONNECTED",
        memory.redisConnected
      );

      setStatus(
        "read",
        memory.readOK
          ? "OK"
          : "FAILED",
        memory.readOK
      );

      setStatus(
        "write",
        memory.writeOK
          ? "OK"
          : "FAILED",
        memory.writeOK
      );

      setStatus(
        "snapshot",
        memory.previousSnapshotFound
          ? "YES"
          : "NOT YET",
        memory.previousSnapshotFound
          ? true
          : null
      );

      document.getElementById(
        "lastUpdate"
      ).textContent =
        new Date().toLocaleTimeString();

      document.getElementById(
        "errorBox"
      ).style.display =
        "none";

    }
    catch (error) {

      setStatus(
        "engine",
        "ERROR",
        false
      );

      const box =
        document.getElementById(
          "errorBox"
        );

      box.textContent =
        "Engine error: " +
        error.message;

      box.style.display =
        "block";
    }
    finally {
      busy = false;
    }
  }

  document.getElementById(
    "airport"
  ).addEventListener(
    "change",
    updateMonitor
  );

  updateMonitor();

  setInterval(
    updateMonitor,
    UPDATE_INTERVAL
  );
</script>

</body>
</html>
`;

  return res.status(200).send(html);
};
