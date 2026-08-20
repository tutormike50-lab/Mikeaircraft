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
      max-width: 1250px;
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
      gap: 20px;
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

    .selectionGrid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 22px;
    }

    .targetBox {
      padding: 18px;
    }

    .targetName {
      font-size: 27px;
      font-weight: bold;
      margin-bottom: 3px;
    }

    .operatorName {
      color: #d2deea;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 8px;
      min-height: 19px;
    }

    .targetState {
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 15px;
    }

    .targetDetail {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      border-top: 1px solid #273240;
      padding: 9px 0;
      font-size: 14px;
    }

    .targetDetail span:first-child {
      color: #9fb0c2;
    }

    .current {
      color: #65e69a;
    }

    .arrival {
      color: #54d7ff;
    }

    .departure {
      color: #ffbd5b;
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

    .footer {
      color: #74879a;
      font-size: 12px;
      text-align: center;
      margin-top: 18px;
    }

    @media (max-width: 950px) {
      .selectionGrid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>

  <div class="header">
    <h1>✈ MikeAircraft Engine Monitor</h1>
    <p>
      Engine v2 • Selection + Airline Enrichment
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

        <select id="airport">
          <option value="PRG">PRG — Prague</option>
          <option value="LHR">LHR — Heathrow</option>
          <option value="FRA">FRA — Frankfurt</option>
          <option value="AMS">AMS — Amsterdam</option>
          <option value="CDG">CDG — Paris CDG</option>
          <option value="MAN">MAN — Manchester</option>
        </select>
      </div>

      <div class="row">
        <span class="label">Engine</span>
        <span id="engine" class="value waiting">
          WAITING
        </span>
      </div>

      <div class="row">
        <span class="label">Engine version</span>
        <span id="version" class="value">---</span>
      </div>

      <div class="row">
        <span class="label">ADS-B status</span>
        <span id="dataStatus" class="value">---</span>
      </div>

      <div class="row">
        <span class="label">ADS-B source</span>
        <span id="source" class="value">---</span>
      </div>

      <div class="row">
        <span class="label">Redis memory</span>
        <span id="redis" class="value waiting">
          WAITING
        </span>
      </div>

    </div>

    <div class="card">

      <div class="cardTitle">
        HEARTBEAT
      </div>

      <div class="row">
        <span class="label">Successful polls</span>
        <span id="pollCount" class="value big">0</span>
      </div>

      <div class="row">
        <span class="label">Consecutive errors</span>
        <span id="errorCount" class="value">0</span>
      </div>

      <div class="row">
        <span class="label">Last successful poll</span>
        <span id="lastUpdate" class="value">---</span>
      </div>

      <div class="row">
        <span class="label">Last success age</span>
        <span id="lastAge" class="value waiting">---</span>
      </div>

      <div class="row">
        <span class="label">Current request</span>
        <span id="requestState" class="value">
          IDLE
        </span>
      </div>

      <div class="row">
        <span class="label">Automatic retry</span>
        <span class="value good">
          Every 5 seconds
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

        <span id="aircraft" class="value big">
          0
        </span>
      </div>

      <div class="row">
        <span class="label">
          Persistent aircraft histories
        </span>

        <span id="histories" class="value big">
          0
        </span>
      </div>

      <div class="row">
        <span class="label">
          Filtered non-aircraft / junk targets
        </span>

        <span id="filteredOut" class="value">
          0
        </span>
      </div>

    </div>

    <div class="card">

      <div class="cardTitle">
        AIRCRAFT STATES
      </div>

      <div id="stateList" class="stateList">
        <span class="statePill">
          Waiting for state data...
        </span>
      </div>

    </div>

    <div class="selectionGrid">

      <div class="card">

        <div class="cardTitle">
          CURRENT
        </div>

        <div class="targetBox">

          <div
            id="currentName"
            class="targetName current"
          >
            NONE
          </div>

          <div
            id="currentOperator"
            class="operatorName"
          >
            ---
          </div>

          <div
            id="currentState"
            class="targetState current"
          >
            Waiting...
          </div>

          <div class="targetDetail">
            <span>Published display</span>
            <strong id="currentFlight">---</strong>
          </div>

          <div class="targetDetail">
            <span>Registration</span>
            <strong id="currentReg">---</strong>
          </div>

          <div class="targetDetail">
            <span>Aircraft type</span>
            <strong id="currentType">---</strong>
          </div>

          <div class="targetDetail">
            <span>Runway</span>
            <strong id="currentRunway">---</strong>
          </div>

          <div class="targetDetail">
            <span>Airport distance</span>
            <strong id="currentDistance">---</strong>
          </div>

          <div class="targetDetail">
            <span>Threshold distance</span>
            <strong id="currentThreshold">---</strong>
          </div>

          <div class="targetDetail">
            <span>Altitude</span>
            <strong id="currentAltitude">---</strong>
          </div>

          <div class="targetDetail">
            <span>Speed</span>
            <strong id="currentSpeed">---</strong>
          </div>

          <div class="targetDetail">
            <span>Confidence</span>
            <strong id="currentConfidence">---</strong>
          </div>

          <div class="targetDetail">
            <span>Relevance score</span>
            <strong id="currentScore">---</strong>
          </div>

        </div>
      </div>

      <div class="card">

        <div class="cardTitle">
          NEXT IN
        </div>

        <div class="targetBox">

          <div
            id="inName"
            class="targetName arrival"
          >
            NONE
          </div>

          <div
            id="inOperator"
            class="operatorName"
          >
            ---
          </div>

          <div
            id="inState"
            class="targetState arrival"
          >
            Waiting...
          </div>

          <div class="targetDetail">
            <span>Published display</span>
            <strong id="inFlight">---</strong>
          </div>

          <div class="targetDetail">
            <span>Registration</span>
            <strong id="inReg">---</strong>
          </div>

          <div class="targetDetail">
            <span>Aircraft type</span>
            <strong id="inType">---</strong>
          </div>

          <div class="targetDetail">
            <span>Runway</span>
            <strong id="inRunway">---</strong>
          </div>

          <div class="targetDetail">
            <span>Airport distance</span>
            <strong id="inDistance">---</strong>
          </div>

          <div class="targetDetail">
            <span>Threshold distance</span>
            <strong id="inThreshold">---</strong>
          </div>

          <div class="targetDetail">
            <span>Altitude</span>
            <strong id="inAltitude">---</strong>
          </div>

          <div class="targetDetail">
            <span>Speed</span>
            <strong id="inSpeed">---</strong>
          </div>

          <div class="targetDetail">
            <span>Confidence</span>
            <strong id="inConfidence">---</strong>
          </div>

        </div>
      </div>

      <div class="card">

        <div class="cardTitle">
          NEXT OUT
        </div>

        <div class="targetBox">

          <div
            id="outName"
            class="targetName departure"
          >
            NONE
          </div>

          <div
            id="outOperator"
            class="operatorName"
          >
            ---
          </div>

          <div
            id="outState"
            class="targetState departure"
          >
            Waiting...
          </div>

          <div class="targetDetail">
            <span>Published display</span>
            <strong id="outFlight">---</strong>
          </div>

          <div class="targetDetail">
            <span>Registration</span>
            <strong id="outReg">---</strong>
          </div>

          <div class="targetDetail">
            <span>Aircraft type</span>
            <strong id="outType">---</strong>
          </div>

          <div class="targetDetail">
            <span>Runway</span>
            <strong id="outRunway">---</strong>
          </div>

          <div class="targetDetail">
            <span>Airport distance</span>
            <strong id="outDistance">---</strong>
          </div>

          <div class="targetDetail">
            <span>Threshold distance</span>
            <strong id="outThreshold">---</strong>
          </div>

          <div class="targetDetail">
            <span>Altitude</span>
            <strong id="outAltitude">---</strong>
          </div>

          <div class="targetDetail">
            <span>Speed</span>
            <strong id="outSpeed">---</strong>
          </div>

          <div class="targetDetail">
            <span>Confidence</span>
            <strong id="outConfidence">---</strong>
          </div>

        </div>
      </div>

    </div>

    <div class="card">

      <div class="cardTitle">
        MEMORY HEALTH
      </div>

      <div class="row">
        <span class="label">Redis read</span>
        <span id="read" class="value">---</span>
      </div>

      <div class="row">
        <span class="label">Redis write</span>
        <span id="write" class="value">---</span>
      </div>

      <div class="row">
        <span class="label">Memory error</span>
        <span id="memoryError" class="value">
          NONE
        </span>
      </div>

    </div>

    <div class="footer">
      MikeAircraft Engine v2 • Selection + Enrichment Monitor
    </div>

  </div>

<script>

  const UPDATE_INTERVAL = 5000;
  const REQUEST_TIMEOUT = 12000;

  let busy = false;
  let successfulPolls = 0;
  let consecutiveErrors = 0;
  let lastSuccessTime = null;

  const enrichmentCache =
    new Map();

  function text(id, value) {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function setStatus(id, value, good) {
    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

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

  async function enrichCallsign(callsign) {
    const key =
      String(callsign || "")
        .trim()
        .toUpperCase();

    if (!key) {
      return null;
    }

    if (
      enrichmentCache.has(key)
    ) {
      return enrichmentCache.get(key);
    }

    try {
      const response =
        await fetch(
          "/api/enrich?callsign=" +
          encodeURIComponent(key),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        return null;
      }

      const data =
        await response.json();

      if (!data.ok) {
        return null;
      }

      enrichmentCache.set(
        key,
        data
      );

      return data;
    }
    catch {
      return null;
    }
  }

  function clearTarget(
    prefix,
    showScore = false
  ) {
    text(prefix + "Name", "NONE");
    text(prefix + "Operator", "---");
    text(prefix + "Flight", "---");
    text(prefix + "State", "No candidate");
    text(prefix + "Reg", "---");
    text(prefix + "Type", "---");
    text(prefix + "Runway", "---");
    text(prefix + "Distance", "---");
    text(prefix + "Threshold", "---");
    text(prefix + "Altitude", "---");
    text(prefix + "Speed", "---");
    text(prefix + "Confidence", "---");

    if (showScore) {
      text(
        prefix + "Score",
        "---"
      );
    }
  }

  async function showTarget(
    prefix,
    target,
    showScore = false
  ) {
    if (!target) {
      clearTarget(
        prefix,
        showScore
      );

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
      prefix + "Operator",
      "Identifying operator..."
    );

    text(
      prefix + "Flight",
      "---"
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

    text(
      prefix + "Threshold",
      target.thresholdKm != null
        ? target.thresholdKm + " km"
        : "---"
    );

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

    if (showScore) {
      text(
        prefix + "Score",
        target.score != null
          ? target.score
          : "---"
      );
    }

    const originalCallsign =
      target.callsign;

    const enrichment =
      await enrichCallsign(
        originalCallsign
      );

    // Make sure the card hasn't switched aircraft while
    // the enrichment request was in flight.
    const currentCardCallsign =
      document
        .getElementById(
          prefix + "Name"
        )
        ?.textContent;

    if (
      currentCardCallsign !==
      (
        originalCallsign ||
        target.registration ||
        target.id ||
        "UNKNOWN"
      )
    ) {
      return;
    }

    if (
      enrichment &&
      enrichment.operator &&
      enrichment.operator.identified
    ) {
      text(
        prefix + "Operator",
        enrichment.operator.name
      );

      text(
        prefix + "Flight",
        enrichment.flight?.display ||
        originalCallsign ||
        "---"
      );
    }
    else {
      text(
        prefix + "Operator",
        "Operator not identified"
      );

      text(
        prefix + "Flight",
        originalCallsign ||
        "---"
      );
    }
  }

  function showStates(
    stateCounts
  ) {
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

  function updateAgeDisplay() {
    if (!lastSuccessTime) {
      setStatus(
        "lastAge",
        "No successful poll yet",
        null
      );

      return;
    }

    const seconds =
      Math.floor(
        (
          Date.now() -
          lastSuccessTime
        ) / 1000
      );

    if (seconds <= 10) {
      setStatus(
        "lastAge",
        seconds + " sec ago",
        true
      );
    }
    else if (seconds <= 30) {
      setStatus(
        "lastAge",
        seconds + " sec ago",
        null
      );
    }
    else {
      setStatus(
        "lastAge",
        seconds + " sec ago",
        false
      );
    }
  }

  async function updateMonitor() {
    if (busy) {
      return;
    }

    busy = true;

    setStatus(
      "requestState",
      "REQUESTING",
      null
    );

    const airport =
      document
        .getElementById(
          "airport"
        )
        .value;

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
      );

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
            cache: "no-store",
            signal: controller.signal
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
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.error ||
          "Engine request failed"
        );
      }

      successfulPolls++;
      consecutiveErrors = 0;
      lastSuccessTime = Date.now();

      text(
        "pollCount",
        successfulPolls
      );

      text(
        "errorCount",
        consecutiveErrors
      );

      document
        .getElementById(
          "engine"
        )
        .innerHTML =
          '<span class="pulse"></span>LIVE';

      document
        .getElementById(
          "engine"
        )
        .className =
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

      const traffic =
        data.traffic || {};

      const memory =
        data.memory || {};

      const intelligence =
        data.intelligence || {};

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

      text(
        "filteredOut",
        traffic.filteredOut ?? 0
      );

      showStates(
        intelligence.stateCounts
      );

      await Promise.all([
        showTarget(
          "current",
          intelligence.current,
          true
        ),

        showTarget(
          "in",
          intelligence.nextIn
        ),

        showTarget(
          "out",
          intelligence.nextOut
        )
      ]);

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

      text(
        "lastUpdate",
        new Date()
          .toLocaleTimeString()
      );

      setStatus(
        "requestState",
        "IDLE",
        true
      );

      document
        .getElementById(
          "errorBox"
        )
        .style.display =
          "none";
    }
    catch (error) {
      consecutiveErrors++;

      text(
        "errorCount",
        consecutiveErrors
      );

      setStatus(
        "requestState",
        "RETRYING",
        null
      );

      if (!lastSuccessTime) {
        setStatus(
          "engine",
          "ERROR",
          false
        );
      }
      else {
        setStatus(
          "engine",
          "RECOVERING",
          null
        );
      }

      const box =
        document.getElementById(
          "errorBox"
        );

      box.textContent =
        error.name === "AbortError"
          ? "Engine request timed out. Retrying automatically..."
          : "Engine error: " +
            error.message +
            " — retrying automatically.";

      box.style.display =
        "block";
    }
    finally {
      clearTimeout(timeout);
      busy = false;
    }
  }

  document
    .getElementById(
      "airport"
    )
    .addEventListener(
      "change",
      () => {
        successfulPolls = 0;
        consecutiveErrors = 0;
        lastSuccessTime = null;

        text(
          "pollCount",
          0
        );

        text(
          "errorCount",
          0
        );

        updateMonitor();
      }
    );

  updateMonitor();

  setInterval(
    updateMonitor,
    UPDATE_INTERVAL
  );

  setInterval(
    updateAgeDisplay,
    1000
  );

</script>

</body>
</html>
`;

  return res
    .status(200)
    .send(html);
};
