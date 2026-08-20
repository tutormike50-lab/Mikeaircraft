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
      border-bottom: 1px solid #298dcc;
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
      max-width: 1100px;
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
      gap: 20px;
    }

    .row:last-child {
      border-bottom: none;
    }

    .label {
      color: #b8c4d2;
    }

    .value {
      font-weight: bold;
      text-align: right;
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

    .trafficGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 22px;
    }

    .targetBox {
      padding: 18px;
    }

    .targetName {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 7px;
    }

    .targetState {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 15px;
    }

    .targetDetail {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #273240;
      padding: 9px 0;
      font-size: 14px;
      gap: 20px;
    }

    .targetDetail span:first-child {
      color: #9fb0c2;
    }

    .arrival {
      color: #54d7ff;
    }

    .departure {
      color: #ffbd5b;
    }

    .stateList {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 18px;
    }

    .statePill {
      background: #0e2638;
      border: 1px solid #285779;
      border-radius: 20px;
      padding: 7px 12px;
      font-size: 13px;
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

    @media (max-width: 800px) {
      .trafficGrid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>

  <div class="header">
    <h1>✈ MikeAircraft Engine Monitor</h1>
    <p>
      Engine v2 • State Tracking Dashboard
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
        <span class="label">Engine version</span>
        <span id="version" class="value">
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">ADS-B status</span>
        <span id="dataStatus" class="value">
          ---
        </span>
      </div>

      <div class="row">
        <span class="label">ADS-B source</span>
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
          Aircraft currently tracked
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
          Persistent aircraft histories
        </span>

        <span
          id="histories"
          class="value big"
        >
          0
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
        AIRCRAFT STATES
      </div>

      <div
        id="stateList"
        class="stateList"
      >
        <span class="statePill">
          Waiting for state data...
        </span>
      </div>

    </div>

    <div class="trafficGrid">

      <div class="card">

        <div class="cardTitle">
          NEXT ARRIVAL
        </div>

        <div
          id="arrivalBox"
          class="targetBox"
        >

          <div
            class="targetName arrival"
            id="arrivalName"
          >
            NONE
          </div>

          <div
            class="targetState arrival"
            id="arrivalState"
          >
            Waiting...
          </div>

          <div class="targetDetail">
            <span>Registration</span>
            <strong id="arrivalReg">---</strong>
          </div>

          <div class="targetDetail">
            <span>Aircraft type</span>
            <strong id="arrivalType">---</strong>
          </div>

          <div class="targetDetail">
            <span>Runway</span>
            <strong id="arrivalRunway">---</strong>
          </div>

          <div class="targetDetail">
            <span>Airport distance</span>
            <strong id="arrivalDistance">---</strong>
          </div>

          <div class="targetDetail">
            <span>Threshold distance</span>
            <strong id="arrivalThreshold">---</strong>
          </div>

          <div class="targetDetail">
            <span>Altitude</span>
            <strong id="arrivalAltitude">---</strong>
          </div>

          <div class="targetDetail">
            <span>Speed</span>
            <strong id="arrivalSpeed">---</strong>
          </div>

          <div class="targetDetail">
            <span>Confidence</span>
            <strong id="arrivalConfidence">---</strong>
          </div>

      </div>
    </div>

      <div class="card">

        <div class="cardTitle">
          NEXT DEPARTURE
        </div>

        <div
          id="departureBox"
          class="targetBox"
        >

          <div
            class="targetName departure"
            id="departureName"
          >
            NONE
          </div>

          <div
            class="targetState departure"
            id="departureState"
          >
            Waiting...
          </div>

          <div class="targetDetail">
            <span>Registration</span>
            <strong id="departureReg">---</strong>
          </div>

          <div class="targetDetail">
            <span>Aircraft type</span>
            <strong id="departureType">---</strong>
          </div>

          <div class="targetDetail">
            <span>Runway</span>
            <strong id="departureRunway">---</strong>
          </div>

          <div class="targetDetail">
            <span>Airport distance</span>
            <strong id="departureDistance">---</strong>
          </div>

          <div class="targetDetail">
            <span>Altitude</span>
            <strong id="departureAltitude">---</strong>
          </div>

          <div class="targetDetail">
            <span>Speed</span>
            <strong id="departureSpeed">---</strong>
          </div>

          <div class="targetDetail">
            <span>Confidence</span>
            <strong id="departureConfidence">---</strong>
          </div>

        </div>
      </div>

    </div>

    <div class="card">

      <div class="cardTitle">
        MEMORY HEALTH
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

      <div class="row">
        <span class="label">
          Memory error
        </span>

        <span
          id="memoryError"
          class="value"
        >
          NONE
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

  function text(id, value) {
    document.getElementById(id).textContent =
      value;
  }

  function setStatus(id, value, good) {

    const element =
      document.getElementById(id);

    element.textContent =
      value;

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

  function showTarget(prefix, target) {

    if (!target) {

      text(prefix + "Name", "NONE");
      text(prefix + "State", "No candidate");
      text(prefix + "Reg", "---");
      text(prefix + "Type", "---");
      text(prefix + "Runway", "---");
      text(prefix + "Distance", "---");

      if (
        document.getElementById(
          prefix + "Threshold"
        )
      ) {
        text(
          prefix + "Threshold",
          "---"
        );
      }

      text(prefix + "Altitude", "---");
      text(prefix + "Speed", "---");
      text(prefix + "Confidence", "---");

      return;
    }

    text(
      prefix + "Name",
      target.callsign ||
      target.registration ||
      target.id ||
      "UNKNOWN"
    );

    text(
      prefix + "State",
      target.state || "UNKNOWN"
    );

    text(
      prefix + "Reg",
      target.registration || "---"
    );

    text(
      prefix + "Type",
      target.type || "---"
    );

    text(
      prefix + "Runway",
      target.runway || "---"
    );

    text(
      prefix + "Distance",
      target.distanceKm != null
        ? target.distanceKm + " km"
        : "---"
    );

    if (
      document.getElementById(
        prefix + "Threshold"
      )
    ) {

      text(
        prefix + "Threshold",
        target.thresholdKm != null
          ? target.thresholdKm + " km"
          : "---"
      );
    }

    text(
      prefix + "Altitude",
      target.altitude != null
        ? target.altitude + " ft"
        : "---"
    );

    text(
      prefix + "Speed",
      target.speed != null
        ? target.speed + " kt"
        : "---"
    );

    text(
      prefix + "Confidence",
      target.confidence != null
        ? target.confidence + "%"
        : "---"
    );
  }

  function showStates(stateCounts) {

    const container =
      document.getElementById(
        "stateList"
      );

    container.innerHTML = "";

    const entries =
      Object.entries(
        stateCounts || {}
      );

    if (!entries.length) {

      const pill =
        document.createElement(
          "span"
        );

      pill.className =
        "statePill";

      pill.textContent =
        "No state data yet";

      container.appendChild(
        pill
      );

      return;
    }

    entries
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .forEach(
        ([state, count]) => {

          const pill =
            document.createElement(
              "span"
            );

          pill.className =
            "statePill";

          pill.textContent =
            state +
            ": " +
            count;

          container.appendChild(
            pill
          );
        }
      );
  }

  async function updateMonitor() {

    if (busy) {
      return;
    }

    busy = true;

    const airport =
      document
        .getElementById(
          "airport"
        )
        .value;

    try {

      const response =
        await fetch(
          "/api/engine?airport=" +
          encodeURIComponent(
            airport
          )
          +
          "&t=" +
          Date.now(),

          {
            cache:
              "no-store"
          }
        );

      const raw =
        await response.text();

      let data;

      try {

        data =
          JSON.parse(raw);

      }
      catch {

        throw new Error(
          "Engine returned non-JSON data"
        );
      }

      if (
        !response.ok
        ||
        !data.ok
      ) {

        throw new Error(
          data.error ||
          "Engine request failed"
        );
      }

      const traffic =
        data.traffic || {};

      const memory =
        data.memory || {};

      const intelligence =
        data.intelligence || {};

      document.getElementById(
        "engine"
      ).innerHTML =
        '<span class="pulse"></span>LIVE';

      document.getElementById(
        "engine"
      ).className =
        "value good";

      text(
        "version",
        data.version || "---"
      );

      const dataStatus =
        data.dataStatus || "LIVE";

      setStatus(
        "dataStatus",
        dataStatus,
        dataStatus === "LIVE"
          ? true
          : null
      );

      text(
        "source",
        traffic.source ||
        "Unknown"
      );

      setStatus(
        "redis",
        memory.redisConnected
          ? "CONNECTED"
          : "NOT CONNECTED",
        memory.redisConnected
      );

      text(
        "aircraft",
        traffic.trackedCount ??
        traffic.rawCount ??
        0
      );

      text(
        "histories",
        memory.trackedHistories ??
        0
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

      if (memory.error) {

        text(
          "memoryError",
          memory.error
        );

        document
          .getElementById(
            "memoryError"
          )
          .className =
            "value bad";

      }
      else {

        text(
          "memoryError",
          "NONE"
        );

        document
          .getElementById(
            "memoryError"
          )
          .className =
            "value good";
      }

      showStates(
        intelligence.stateCounts
      );

      showTarget(
        "arrival",
        intelligence.nextArrival
      );

      showTarget(
        "departure",
        intelligence.nextDeparture
      );

      text(
        "lastUpdate",
        new Date()
          .toLocaleTimeString()
      );

      document
        .getElementById(
          "errorBox"
        )
        .style.display =
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

  document
    .getElementById(
      "airport"
    )
    .addEventListener(
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

  return res
    .status(200)
    .send(html);
};
