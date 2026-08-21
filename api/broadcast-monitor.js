// MikeAircraft Broadcast Monitor
// Version 0.1
//
// Development preview for the future livestream graphics.
// Reads MikeAircraft Broadcast API v0.4.

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

  <title>MikeAircraft Broadcast Preview</title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        radial-gradient(
          circle at top,
          #103354 0%,
          #08131f 42%,
          #050a10 100%
        );

      color: white;

      font-family:
        Arial,
        Helvetica,
        sans-serif;

      min-height: 100vh;
    }

    .page {
      max-width: 1280px;
      margin: auto;
      padding: 28px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;

      margin-bottom: 24px;
    }

    .brand h1 {
      margin: 0;
      font-size: 28px;
    }

    .brand p {
      margin: 5px 0 0;
      color: #89b9d8;
      font-size: 14px;
    }

    select {
      background: #08243b;
      color: white;

      border:
        1px solid #2e769f;

      border-radius: 7px;

      padding:
        9px 13px;

      font-size: 14px;
    }

    .live {
      color: #5de59b;
      font-weight: bold;
    }

    .error {
      display: none;

      background: #481f27;

      border:
        1px solid #8b4652;

      color: #ffc9cf;

      padding: 13px 16px;

      border-radius: 9px;

      margin-bottom: 18px;
    }

    /* ============================================
       CURRENT
       ============================================ */

    .current-card {
      position: relative;

      overflow: hidden;

      border:
        1px solid #246993;

      border-radius: 16px;

      background:
        linear-gradient(
          135deg,
          rgba(8, 39, 65, 0.98),
          rgba(12, 26, 42, 0.98)
        );

      box-shadow:
        0 18px 50px
        rgba(0, 0, 0, 0.38);

      margin-bottom: 22px;
    }

    .current-card::before {
      content: "";

      position: absolute;

      left: 0;
      top: 0;
      bottom: 0;

      width: 7px;

      background:
        linear-gradient(
          #53e5a0,
          #2a9ac5
        );
    }

    .current-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      padding:
        15px 24px 13px 30px;

      border-bottom:
        1px solid rgba(
          255,
          255,
          255,
          0.12
        );
    }

    .role {
      color: #7bcaef;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 1.4px;
    }

    .status {
      padding:
        7px 12px;

      border-radius: 20px;

      background:
        rgba(
          59,
          217,
          143,
          0.12
        );

      border:
        1px solid
        rgba(
          82,
          231,
          160,
          0.45
        );

      color: #64e8a4;

      font-size: 13px;
      font-weight: bold;
    }

    .current-main {
      display: grid;

      grid-template-columns:
        1.4fr 1fr;

      gap: 30px;

      padding:
        30px 30px 26px;
    }

    .airline {
      color: #a8cbe2;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 7px;
    }

    .flight {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -1px;
      margin-bottom: 4px;
    }

    .route {
      color: #58cfff;
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 22px;
    }

    .aircraft-name {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .registration {
      color: #a8b7c5;
      font-size: 15px;
    }

    .telemetry {
      display: grid;

      grid-template-columns:
        1fr 1fr;

      gap: 12px;
    }

    .metric {
      background:
        rgba(
          255,
          255,
          255,
          0.045
        );

      border:
        1px solid
        rgba(
          255,
          255,
          255,
          0.09
        );

      border-radius: 10px;

      padding: 15px;
    }

    .metric-label {
      color: #8299ab;
      font-size: 12px;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
    }

    .metric-value {
      font-size: 21px;
      font-weight: bold;
    }

    /* ============================================
       NEXT
       ============================================ */

    .next-grid {
      display: grid;

      grid-template-columns:
        1fr 1fr;

      gap: 22px;
    }

    .next-card {
      border:
        1px solid #263e53;

      border-radius: 14px;

      background: #101b27;

      overflow: hidden;
    }

    .next-title {
      padding:
        13px 18px;

      background: #0c151f;

      border-bottom:
        1px solid #263e53;

      color: #9ccbe8;

      font-size: 13px;
      font-weight: bold;
      letter-spacing: 1.2px;
    }

    .next-body {
      padding: 20px;
    }

    .next-flight {
      font-size: 27px;
      font-weight: bold;
      margin-bottom: 3px;
    }

    .next-in {
      color: #57d7ff;
    }

    .next-out {
      color: #ffbd59;
    }

    .next-airline {
      color: #bbc8d2;
      font-size: 15px;
      margin-bottom: 7px;
    }

    .next-route {
      font-size: 19px;
      font-weight: bold;
      margin-bottom: 12px;
    }

    .next-aircraft {
      color: #dce6ed;
      font-size: 14px;
      margin-bottom: 15px;
    }

    .next-info {
      display: flex;
      justify-content: space-between;
      gap: 10px;

      padding: 8px 0;

      border-top:
        1px solid #243443;

      font-size: 13px;
    }

    .next-info span:first-child {
      color: #8498a9;
    }

    .footer {
      text-align: center;
      color: #60778a;
      font-size: 12px;
      margin-top: 22px;
    }

    .none {
      color: #778794;
    }

    @media (
      max-width: 850px
    ) {

      .current-main {
        grid-template-columns:
          1fr;
      }

      .next-grid {
        grid-template-columns:
          1fr;
      }

      .topbar {
        align-items:
          flex-start;

        flex-direction:
          column;
      }
    }

  </style>
</head>

<body>

<div class="page">

  <div class="topbar">

    <div class="brand">

      <h1>
        ✈ MikeAircraft Broadcast Preview
      </h1>

      <p>
        Development graphics monitor •
        <span id="liveStatus">
          Connecting...
        </span>
      </p>

    </div>

    <select id="airport">

      <option value="PRG">
        PRG — Prague
      </option>

      <option value="LHR">
        LHR — Heathrow
      </option>

      <option value="FRA">
        FRA — Frankfurt
      </option>

      <option value="AMS">
        AMS — Amsterdam
      </option>

      <option value="CDG">
        CDG — Paris CDG
      </option>

      <option value="MAN">
        MAN — Manchester
      </option>

    </select>

  </div>

  <div
    id="errorBox"
    class="error"
  ></div>


  <!-- CURRENT -->

  <div class="current-card">

    <div class="current-header">

      <div class="role">
        CURRENT
      </div>

      <div
        id="currentStatus"
        class="status"
      >
        WAITING
      </div>

    </div>


    <div class="current-main">

      <div>

        <div
          id="currentAirline"
          class="airline"
        >
          Waiting for aircraft...
        </div>

        <div
          id="currentFlight"
          class="flight"
        >
          ---
        </div>

        <div
          id="currentRoute"
          class="route"
        >
          ---
        </div>

        <div
          id="currentAircraft"
          class="aircraft-name"
        >
          ---
        </div>

        <div
          id="currentRegistration"
          class="registration"
        >
          ---
        </div>

      </div>


      <div class="telemetry">

        <div class="metric">
          <div class="metric-label">
            Distance
          </div>

          <div
            id="currentDistance"
            class="metric-value"
          >
            ---
          </div>
        </div>


        <div class="metric">
          <div class="metric-label">
            Altitude
          </div>

          <div
            id="currentAltitude"
            class="metric-value"
          >
            ---
          </div>
        </div>


        <div class="metric">
          <div class="metric-label">
            Speed
          </div>

          <div
            id="currentSpeed"
            class="metric-value"
          >
            ---
          </div>
        </div>


        <div class="metric">
          <div class="metric-label">
            Runway
          </div>

          <div
            id="currentRunway"
            class="metric-value"
          >
            ---
          </div>
        </div>

      </div>

    </div>

  </div>


  <!-- NEXT -->

  <div class="next-grid">


    <div class="next-card">

      <div class="next-title">
        NEXT IN
      </div>

      <div class="next-body">

        <div
          id="inFlight"
          class="next-flight next-in"
        >
          NONE
        </div>

        <div
          id="inAirline"
          class="next-airline"
        >
          ---
        </div>

        <div
          id="inRoute"
          class="next-route"
        >
          ---
        </div>

        <div
          id="inAircraft"
          class="next-aircraft"
        >
          ---
        </div>

        <div class="next-info">

          <span>Status</span>

          <strong
            id="inStatus"
          >
            ---
          </strong>

        </div>

        <div class="next-info">

          <span>Distance</span>

          <strong
            id="inDistance"
          >
            ---
          </strong>

        </div>

      </div>

    </div>


    <div class="next-card">

      <div class="next-title">
        NEXT OUT
      </div>

      <div class="next-body">

        <div
          id="outFlight"
          class="next-flight next-out"
        >
          NONE
        </div>

        <div
          id="outAirline"
          class="next-airline"
        >
          ---
        </div>

        <div
          id="outRoute"
          class="next-route"
        >
          ---
        </div>

        <div
          id="outAircraft"
          class="next-aircraft"
        >
          ---
        </div>

        <div class="next-info">

          <span>Status</span>

          <strong
            id="outStatus"
          >
            ---
          </strong>

        </div>

        <div class="next-info">

          <span>Distance</span>

          <strong
            id="outDistance"
          >
            ---
          </strong>

        </div>

      </div>

    </div>

  </div>


  <div class="footer">
    MikeAircraft Broadcast Graphics Development • v0.1
  </div>

</div>


<script>

  const UPDATE_INTERVAL =
    5000;

  let busy =
    false;


  function setText(
    id,
    value
  ) {

    const el =
      document.getElementById(
        id
      );

    if (el) {
      el.textContent =
        value;
    }

  }


  function valueOrDash(
    value
  ) {

    return (
      value === null ||
      value === undefined ||
      value === ""
    )
      ? "---"
      : value;

  }


  function displayCurrent(
    target
  ) {

    if (
      !target ||
      !target.available
    ) {

      setText(
        "currentAirline",
        "No current aircraft"
      );

      setText(
        "currentFlight",
        "---"
      );

      setText(
        "currentRoute",
        "---"
      );

      setText(
        "currentAircraft",
        "---"
      );

      setText(
        "currentRegistration",
        "---"
      );

      setText(
        "currentStatus",
        "IDLE"
      );

      setText(
        "currentDistance",
        "---"
      );

      setText(
        "currentAltitude",
        "---"
      );

      setText(
        "currentSpeed",
        "---"
      );

      setText(
        "currentRunway",
        "---"
      );

      return;
    }


    setText(
      "currentAirline",
      target.operator?.name ||
      "Operator not identified"
    );


    setText(
      "currentFlight",
      target.identity?.flight ||
      target.identity?.callsign ||
      "---"
    );


    setText(
      "currentRoute",
      target.route?.display ||
      "Route not available"
    );


    setText(
      "currentAircraft",
      target.aircraft?.name ||
      target.aircraft?.typeCode ||
      "---"
    );


    setText(
      "currentRegistration",
      target.identity?.registration ||
      "---"
    );


    setText(
      "currentStatus",
      target.movement?.displayState ||
      target.movement?.state ||
      "---"
    );


    setText(
      "currentDistance",
      target.telemetry
        ?.airportDistanceKm != null
        ? (
            target.telemetry
              .airportDistanceKm +
            " km"
          )
        : "---"
    );


    setText(
      "currentAltitude",
      target.telemetry
        ?.altitudeFt != null
        ? (
            target.telemetry
              .altitudeFt +
            " ft"
          )
        : "---"
    );


    setText(
      "currentSpeed",
      target.telemetry
        ?.speedKt != null
        ? (
            target.telemetry
              .speedKt +
            " kt"
          )
        : "---"
    );


    setText(
      "currentRunway",
      valueOrDash(
        target.movement?.runway
      )
    );

  }


  function displayNext(
    prefix,
    target
  ) {

    if (
      !target ||
      !target.available
    ) {

      setText(
        prefix + "Flight",
        "NONE"
      );

      setText(
        prefix + "Airline",
        "---"
      );

      setText(
        prefix + "Route",
        "---"
      );

      setText(
        prefix + "Aircraft",
        "---"
      );

      setText(
        prefix + "Status",
        "---"
      );

      setText(
        prefix + "Distance",
        "---"
      );

      return;
    }


    setText(
      prefix + "Flight",
      target.identity?.flight ||
      target.identity?.callsign ||
      "---"
    );


    setText(
      prefix + "Airline",
      target.operator?.name ||
      "Operator not identified"
    );


    setText(
      prefix + "Route",
      target.route?.display ||
      "Route not available"
    );


    setText(
      prefix + "Aircraft",
      (
        target.aircraft?.name ||
        target.aircraft?.typeCode ||
        "---"
      )
      +
      (
        target.identity
          ?.registration
          ? (
              " • " +
              target.identity
                .registration
            )
          : ""
      )
    );


    setText(
      prefix + "Status",
      target.movement
        ?.displayState ||
      target.movement
        ?.state ||
      "---"
    );


    setText(
      prefix + "Distance",
      target.telemetry
        ?.airportDistanceKm != null
        ? (
            target.telemetry
              .airportDistanceKm +
            " km"
          )
        : "---"
    );

  }


  async function update() {

    if (busy) {
      return;
    }

    busy =
      true;


    const airport =
      document
        .getElementById(
          "airport"
        )
        .value;


    try {

      const response =
        await fetch(
          "/api/broadcast?airport=" +
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


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.ok
      ) {

        throw new Error(
          data.error ||
          "Broadcast API failed"
        );

      }


      displayCurrent(
        data.aircraft?.current
      );


      displayNext(
        "in",
        data.aircraft?.nextIn
      );


      displayNext(
        "out",
        data.aircraft?.nextOut
      );


      const live =
        document.getElementById(
          "liveStatus"
        );

      live.textContent =
        "LIVE • " +
        (
          data.airport?.code ||
          airport
        );

      live.className =
        "live";


      document
        .getElementById(
          "errorBox"
        )
        .style.display =
          "none";

    }

    catch (error) {

      const box =
        document.getElementById(
          "errorBox"
        );

      box.textContent =
        "Broadcast error: " +
        error.message +
        " — retrying automatically.";

      box.style.display =
        "block";


      setText(
        "liveStatus",
        "RETRYING"
      );

    }

    finally {

      busy =
        false;

    }

  }


  document
    .getElementById(
      "airport"
    )
    .addEventListener(
      "change",
      update
    );


  update();


  setInterval(
    update,
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
