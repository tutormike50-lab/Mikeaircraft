// MikeAircraft Livestream Overlay
// Version 0.4
//
// Adds real live radar to Overlay v0.3.
// Radar uses live aircraft positions from Engine v0.6.
// No additional Vercel function required.

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

  <title>MikeAircraft Overlay v0.4</title>

  <style>

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;

      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    body {
      background: #202020;
    }

    .overlay {
      position: relative;
      width: 100vw;
      height: 100vh;
    }

    /* ==================================================
       LIVE RADAR
       ================================================== */

    .radar-wrap {
      position: absolute;

      top: 3.5vh;
      right: 3vw;

      width:
        clamp(
          230px,
          18vw,
          355px
        );

      aspect-ratio: 1 / 1;

      border-radius: 50%;

      background:
        radial-gradient(
          circle,
          rgba(4, 30, 37, 0.88) 0%,
          rgba(2, 18, 25, 0.94) 72%,
          rgba(1, 10, 16, 0.97) 100%
        );

      border:
        2px solid
        rgba(
          79,
          229,
          188,
          0.62
        );

      box-shadow:
        0 0 28px
        rgba(
          49,
          221,
          174,
          0.17
        ),
        inset 0 0 28px
        rgba(
          49,
          221,
          174,
          0.08
        );

      overflow: hidden;
    }

    #radarCanvas {
      position: absolute;
      inset: 0;

      width: 100%;
      height: 100%;
    }

    .radar-title {
      position: absolute;

      top: 10px;
      left: 50%;

      transform:
        translateX(-50%);

      color:
        rgba(
          169,
          255,
          226,
          0.92
        );

      font-size:
        clamp(
          9px,
          0.65vw,
          12px
        );

      font-weight: 800;

      letter-spacing: 1.4px;

      z-index: 4;

      pointer-events: none;
    }

    .radar-range {
      position: absolute;

      bottom: 10px;
      left: 50%;

      transform:
        translateX(-50%);

      color:
        rgba(
          139,
          220,
          197,
          0.72
        );

      font-size:
        clamp(
          8px,
          0.55vw,
          10px
        );

      letter-spacing: 0.8px;

      z-index: 4;

      pointer-events: none;
    }

    /* ==================================================
       AIRCRAFT PROFILE
       ================================================== */

    .aircraft-profile-wrap {
      position: absolute;

      left: 5.5vw;
      bottom:
        calc(
          5vh + 176px
        );

      width:
        min(
          36vw,
          650px
        );

      height: 220px;

      overflow: hidden;

      pointer-events: none;
    }

    .aircraft-profile {
      position: absolute;

      left: 0;
      bottom: -175px;

      width: 100%;
      height: auto;

      opacity: 0;

      transition:
        bottom 0.65s
        cubic-bezier(
          0.22,
          0.82,
          0.25,
          1
        ),
        opacity 0.35s ease;
    }

    .aircraft-profile.rise {
      bottom: -28px;
      opacity: 1;
    }

    .aircraft-profile.settle {
      bottom: -110px;
      opacity: 0.92;
    }

    /* ==================================================
       LOWER THIRD
       ================================================== */

    .lower-third {
      position: absolute;

      left: 4vw;
      right: 28vw;
      bottom: 5vh;

      opacity: 0;

      transform:
        translateY(28px);

      transition:
        opacity 0.4s ease,
        transform 0.4s ease;
    }

    .lower-third.visible {
      opacity: 1;

      transform:
        translateY(0);
    }

    .main-ribbon {
      position: relative;

      display: grid;

      grid-template-columns:
        minmax(0, 1.7fr)
        minmax(220px, 0.8fr);

      min-height: 145px;

      overflow: hidden;

      border-radius:
        12px 12px 0 0;

      background:
        linear-gradient(
          105deg,
          rgba(4, 28, 53, 0.98),
          rgba(0, 83, 138, 0.97),
          rgba(5, 30, 53, 0.98)
        );

      border:
        1px solid
        rgba(
          100,
          197,
          255,
          0.42
        );

      box-shadow:
        0 15px 35px
        rgba(
          0,
          0,
          0,
          0.38
        );
    }

    .main-ribbon::before {
      content: "";

      position: absolute;

      left: 0;
      top: 0;
      bottom: 0;

      width: 7px;

      background:
        linear-gradient(
          #5ee2ff,
          #2388c3
        );
    }

    .identity {
      position: relative;

      padding:
        20px 26px 18px 30px;
    }

    .airline {
      color: #c4e4f6;

      font-size:
        clamp(
          16px,
          1.25vw,
          22px
        );

      font-weight: 700;

      margin-bottom: 4px;
    }

    .flight-row {
      display: flex;

      align-items: baseline;

      flex-wrap: wrap;

      gap: 14px;
    }

    .flight {
      color: #ffffff;

      font-size:
        clamp(
          34px,
          3vw,
          52px
        );

      font-weight: 800;

      line-height: 1;

      letter-spacing: -1px;
    }

    .route {
      color: #61dcff;

      font-size:
        clamp(
          22px,
          2vw,
          33px
        );

      font-weight: 800;
    }

    .aircraft-line {
      margin-top: 12px;

      font-size:
        clamp(
          15px,
          1.15vw,
          20px
        );

      color: #ffffff;

      font-weight: 700;
    }

    .registration {
      color: #bed2df;

      margin-left: 10px;

      font-weight: 500;
    }

    /* ==================================================
       STATUS PANEL
       ================================================== */

    .status-panel {
      padding:
        20px 24px 18px 18px;

      display: flex;

      flex-direction: column;

      align-items: flex-end;

      justify-content: center;

      text-align: right;
    }

    .status {
      display: inline-block;

      padding:
        7px 13px;

      border-radius: 18px;

      color: #6cf0ad;

      background:
        rgba(
          69,
          227,
          154,
          0.13
        );

      border:
        1px solid
        rgba(
          97,
          236,
          171,
          0.48
        );

      font-size:
        clamp(
          13px,
          1vw,
          17px
        );

      font-weight: 800;

      letter-spacing: 0.5px;

      margin-bottom: 11px;
    }

    .runway-text {
      color: #d3e9f6;

      font-size:
        clamp(
          13px,
          1vw,
          17px
        );
    }

    /* ==================================================
       TELEMETRY
       ================================================== */

    .telemetry-strip {
      display: grid;

      grid-template-columns:
        repeat(4, 1fr);

      min-height: 52px;

      background:
        rgba(
          6,
          18,
          31,
          0.97
        );

      border:
        1px solid
        rgba(
          100,
          197,
          255,
          0.25
        );

      border-top: none;

      border-radius:
        0 0 12px 12px;

      overflow: hidden;

      box-shadow:
        0 10px 24px
        rgba(
          0,
          0,
          0,
          0.25
        );
    }

    .metric {
      display: flex;

      justify-content: center;

      align-items: center;

      gap: 8px;

      border-right:
        1px solid
        rgba(
          255,
          255,
          255,
          0.09
        );

      padding:
        10px 8px;
    }

    .metric:last-child {
      border-right: none;
    }

    .metric-label {
      color: #7f9db2;

      font-size:
        clamp(
          10px,
          0.75vw,
          12px
        );

      text-transform: uppercase;

      letter-spacing: 0.6px;
    }

    .metric-value {
      color: white;

      font-size:
        clamp(
          13px,
          1vw,
          17px
        );

      font-weight: 800;
    }

    /* ==================================================
       NEXT BOX
       ================================================== */

    .next-box {
      position: absolute;

      right: 4vw;
      bottom: 5vh;

      width: 21vw;
      min-width: 290px;
      max-width: 430px;

      opacity: 0;

      transform:
        translateY(24px);

      transition:
        opacity 0.4s ease,
        transform 0.4s ease;
    }

    .next-box.visible {
      opacity: 1;

      transform:
        translateY(0);
    }

    .next-header {
      padding:
        9px 13px;

      border-radius:
        10px 10px 0 0;

      background:
        rgba(
          5,
          18,
          31,
          0.97
        );

      border:
        1px solid
        rgba(
          100,
          197,
          255,
          0.26
        );

      border-bottom: none;

      color: #9dcfe9;

      font-size: 12px;

      font-weight: 800;

      letter-spacing: 1px;
    }

    .next-body {
      padding:
        13px 15px 15px;

      border-radius:
        0 0 10px 10px;

      background:
        linear-gradient(
          110deg,
          rgba(12, 29, 45, 0.97),
          rgba(18, 53, 78, 0.97)
        );

      border:
        1px solid
        rgba(
          100,
          197,
          255,
          0.28
        );

      box-shadow:
        0 10px 25px
        rgba(
          0,
          0,
          0,
          0.28
        );
    }

    .next-flight {
      color: #ffbd59;

      font-size:
        clamp(
          22px,
          1.8vw,
          30px
        );

      font-weight: 800;

      margin-bottom: 2px;
    }

    .next-airline {
      color: #d3e1ea;

      font-size:
        clamp(
          12px,
          0.95vw,
          15px
        );

      font-weight: 700;
    }

    .next-route {
      color: #75dfff;

      font-size:
        clamp(
          14px,
          1.1vw,
          18px
        );

      font-weight: 800;

      margin-top: 5px;
    }

    .next-aircraft {
      color: #aebfcb;

      font-size:
        clamp(
          11px,
          0.85vw,
          14px
        );

      margin-top: 7px;
    }

    /* ==================================================
       DEV BADGE
       ================================================== */

    .dev-badge {
      position: absolute;

      top: 18px;
      left: 20px;

      padding:
        7px 10px;

      border-radius: 7px;

      background:
        rgba(
          0,
          0,
          0,
          0.55
        );

      color: #9ed8f5;

      font-size: 12px;

      font-weight: bold;
    }

    @media (
      max-width: 900px
    ) {

      .radar-wrap {
        width: 210px;
        top: 16px;
        right: 16px;
      }

      .aircraft-profile-wrap {
        left: 5vw;
        width: 70vw;

        bottom:
          calc(
            20vh + 145px
          );
      }

      .lower-third {
        left: 3vw;
        right: 3vw;
        bottom: 20vh;
      }

      .main-ribbon {
        grid-template-columns:
          1fr;
      }

      .status-panel {
        align-items:
          flex-start;

        text-align:
          left;
      }

      .telemetry-strip {
        grid-template-columns:
          repeat(2, 1fr);
      }

      .next-box {
        left: 3vw;
        right: 3vw;
        bottom: 3vh;

        width: auto;
        max-width: none;
      }

    }

  </style>

</head>

<body>

<div class="overlay">


  <div class="dev-badge">
    MikeAircraft Overlay v0.4 • LIVE RADAR
  </div>


  <!-- LIVE RADAR -->

  <div
    class="radar-wrap"
  >

    <canvas
      id="radarCanvas"
    ></canvas>

    <div
      class="radar-title"
    >
      LIVE RADAR
    </div>

    <div
      id="radarRange"
      class="radar-range"
    >
      20 KM
    </div>

  </div>


  <!-- AIRCRAFT PROFILE -->

  <div
    class="aircraft-profile-wrap"
  >

    <img
      id="aircraftProfile"
      class="aircraft-profile"
      alt=""
    >

  </div>


  <!-- CURRENT -->

  <div
    id="lowerThird"
    class="lower-third"
  >

    <div class="main-ribbon">


      <div class="identity">

        <div
          id="airline"
          class="airline"
        >
          ---
        </div>


        <div class="flight-row">

          <div
            id="flight"
            class="flight"
          >
            ---
          </div>

          <div
            id="route"
            class="route"
          >
            ---
          </div>

        </div>


        <div class="aircraft-line">

          <span
            id="aircraft"
          >
            ---
          </span>

          <span
            id="registration"
            class="registration"
          ></span>

        </div>

      </div>


      <div class="status-panel">

        <div
          id="status"
          class="status"
        >
          ---
        </div>

        <div
          id="runwayText"
          class="runway-text"
        >
          ---
        </div>

      </div>


    </div>


    <div class="telemetry-strip">


      <div class="metric">

        <span class="metric-label">
          Distance
        </span>

        <span
          id="distance"
          class="metric-value"
        >
          ---
        </span>

      </div>


      <div class="metric">

        <span class="metric-label">
          Altitude
        </span>

        <span
          id="altitude"
          class="metric-value"
        >
          ---
        </span>

      </div>


      <div class="metric">

        <span class="metric-label">
          Speed
        </span>

        <span
          id="speed"
          class="metric-value"
        >
          ---
        </span>

      </div>


      <div class="metric">

        <span class="metric-label">
          Runway
        </span>

        <span
          id="runway"
          class="metric-value"
        >
          ---
        </span>

      </div>


    </div>

  </div>


  <!-- NEXT -->

  <div
    id="nextBox"
    class="next-box"
  >

    <div class="next-header">
      NEXT
    </div>

    <div class="next-body">

      <div
        id="nextFlight"
        class="next-flight"
      >
        ---
      </div>

      <div
        id="nextAirline"
        class="next-airline"
      >
        ---
      </div>

      <div
        id="nextRoute"
        class="next-route"
      >
        ---
      </div>

      <div
        id="nextAircraft"
        class="next-aircraft"
      >
        ---
      </div>

    </div>

  </div>


</div>


<script>

  const UPDATE_INTERVAL =
    5000;

  const RADAR_RANGE_KM =
    20;


  let busy =
    false;

  let lastCurrentKey =
    null;

  let profileTimer1 =
    null;

  let profileTimer2 =
    null;


  let radarAircraft =
    [];

  let radarAirport =
    null;

  let radarCurrentKey =
    null;

  let radarSweepAngle =
    0;


  /* ==================================================
     BASIC HELPERS
     ================================================== */


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


  function currentIdentityKey(
    target
  ) {

    if (!target) {
      return null;
    }

    return (
      target.identity
        ?.registration
      ||
      target.identity
        ?.callsign
      ||
      null
    );

  }


  /* ==================================================
     AIRCRAFT PROFILE ANIMATION
     ================================================== */


  function animateAircraftProfile(
    target
  ) {

    if (
      !target ||
      !target.available
    ) {
      return;
    }


    const typeCode =
      target.aircraft?.typeCode ||
      "";


    if (!typeCode) {
      return;
    }


    const lineage =
      target.movement?.lineage;


    const direction =
      lineage === "ARRIVAL"
        ? "RIGHT"
        : lineage === "DEPARTURE"
          ? "LEFT"
          : "RIGHT";


    const profile =
      document.getElementById(
        "aircraftProfile"
      );


    clearTimeout(
      profileTimer1
    );

    clearTimeout(
      profileTimer2
    );


    profile.classList.remove(
      "rise",
      "settle"
    );


    profile.src =
      "/api/aircraft-graphic?type=" +
      encodeURIComponent(
        typeCode
      )
      +
      "&direction=" +
      encodeURIComponent(
        direction
      )
      +
      "&t=" +
      Date.now();


    void profile.offsetWidth;


    profile.classList.add(
      "rise"
    );


    profileTimer1 =
      setTimeout(
        () => {

          profile.classList.remove(
            "rise"
          );

          profile.classList.add(
            "settle"
          );

        },
        3600
      );


    profileTimer2 =
      setTimeout(
        () => {

          profile.classList.remove(
            "settle"
          );

        },
        7200
      );

  }


  /* ==================================================
     CURRENT LOWER THIRD
     ================================================== */


  function showMain(
    target
  ) {

    const box =
      document.getElementById(
        "lowerThird"
      );


    if (
      !target ||
      !target.available
    ) {

      box.classList.remove(
        "visible"
      );

      radarCurrentKey =
        null;

      return;
    }


    setText(
      "airline",
      target.operator?.name ||
      "Operator not identified"
    );


    setText(
      "flight",
      target.identity?.flight ||
      target.identity?.callsign ||
      "---"
    );


    setText(
      "route",
      target.route?.display ||
      ""
    );


    setText(
      "aircraft",
      target.aircraft?.name ||
      target.aircraft?.typeCode ||
      "---"
    );


    setText(
      "registration",
      target.identity?.registration
        ? (
            "• " +
            target.identity
              .registration
          )
        : ""
    );


    setText(
      "status",
      target.movement?.displayState ||
      target.movement?.state ||
      "---"
    );


    setText(
      "runwayText",
      target.movement?.runway
        ? (
            "RUNWAY " +
            target.movement.runway
          )
        : ""
    );


    setText(
      "distance",
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
      "altitude",
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
      "speed",
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
      "runway",
      target.movement?.runway ||
      "---"
    );


    box.classList.add(
      "visible"
    );


    const currentKey =
      currentIdentityKey(
        target
      );


    radarCurrentKey =
      currentKey;


    if (
      currentKey &&
      currentKey !==
      lastCurrentKey
    ) {

      lastCurrentKey =
        currentKey;

      animateAircraftProfile(
        target
      );

    }

  }


  /* ==================================================
     NEXT
     ================================================== */


  function chooseNext(
    data
  ) {

    const current =
      data.aircraft?.current;

    const nextIn =
      data.aircraft?.nextIn;

    const nextOut =
      data.aircraft?.nextOut;


    if (
      current &&
      current.available
    ) {

      if (
        current.movement?.lineage ===
        "ARRIVAL"
      ) {

        if (
          nextIn &&
          nextIn.available
        ) {
          return nextIn;
        }

        if (
          nextOut &&
          nextOut.available
        ) {
          return nextOut;
        }

      }


      if (
        current.movement?.lineage ===
        "DEPARTURE"
      ) {

        if (
          nextOut &&
          nextOut.available
        ) {
          return nextOut;
        }

        if (
          nextIn &&
          nextIn.available
        ) {
          return nextIn;
        }

      }

    }


    if (
      nextIn &&
      nextIn.available
    ) {
      return nextIn;
    }


    if (
      nextOut &&
      nextOut.available
    ) {
      return nextOut;
    }


    return null;

  }


  function showNext(
    target
  ) {

    const box =
      document.getElementById(
        "nextBox"
      );


    if (
      !target ||
      !target.available
    ) {

      box.classList.remove(
        "visible"
      );

      return;
    }


    setText(
      "nextFlight",
      target.identity?.flight ||
      target.identity?.callsign ||
      "---"
    );


    setText(
      "nextAirline",
      target.operator?.name ||
      "Operator not identified"
    );


    setText(
      "nextRoute",
      target.route?.display ||
      ""
    );


    const aircraft =
      target.aircraft?.name ||
      target.aircraft?.typeCode ||
      "---";


    const registration =
      target.identity
        ?.registration
        ? (
            " • " +
            target.identity
              .registration
          )
        : "";


    setText(
      "nextAircraft",
      aircraft +
      registration
    );


    box.classList.add(
      "visible"
    );

  }


  /* ==================================================
     RADAR MATH
     ================================================== */


  function radarRelativeKm(
    lat,
    lon,
    centerLat,
    centerLon
  ) {

    const northKm =
      (
        lat -
        centerLat
      )
      *
      111.32;


    const eastKm =
      (
        lon -
        centerLon
      )
      *
      111.32
      *
      Math.cos(
        centerLat *
        Math.PI /
        180
      );


    return {
      eastKm,
      northKm
    };

  }


  function radarAircraftKey(
    aircraft
  ) {

    return (
      aircraft.registration
      ||
      aircraft.callsign
      ||
      aircraft.id
      ||
      aircraft.hex
      ||
      null
    );

  }


  /* ==================================================
     RADAR DRAW
     ================================================== */


  function drawRadar() {

    const canvas =
      document.getElementById(
        "radarCanvas"
      );


    const wrap =
      canvas.parentElement;


    const dpr =
      window.devicePixelRatio ||
      1;


    const width =
      wrap.clientWidth;

    const height =
      wrap.clientHeight;


    const pixelWidth =
      Math.round(
        width * dpr
      );


    const pixelHeight =
      Math.round(
        height * dpr
      );


    if (
      canvas.width !==
      pixelWidth
      ||
      canvas.height !==
      pixelHeight
    ) {

      canvas.width =
        pixelWidth;

      canvas.height =
        pixelHeight;

    }


    const ctx =
      canvas.getContext(
        "2d"
      );


    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );


    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    const cx =
      width / 2;

    const cy =
      height / 2;

    const radius =
      Math.min(
        width,
        height
      )
      *
      0.46;


    /* RANGE RINGS */

    ctx.strokeStyle =
      "rgba(83, 226, 185, 0.23)";

    ctx.lineWidth =
      1;


    [
      0.25,
      0.5,
      0.75,
      1
    ]
      .forEach(
        ratio => {

          ctx.beginPath();

          ctx.arc(
            cx,
            cy,
            radius * ratio,
            0,
            Math.PI * 2
          );

          ctx.stroke();

        }
      );


    /* CROSSHAIRS */

    ctx.strokeStyle =
      "rgba(83, 226, 185, 0.16)";


    ctx.beginPath();

    ctx.moveTo(
      cx - radius,
      cy
    );

    ctx.lineTo(
      cx + radius,
      cy
    );

    ctx.moveTo(
      cx,
      cy - radius
    );

    ctx.lineTo(
      cx,
      cy + radius
    );

    ctx.stroke();


    /* CARDINALS */

    ctx.fillStyle =
      "rgba(141, 235, 208, 0.55)";

    ctx.font =
      Math.max(
        9,
        width * 0.035
      )
      +
      "px Arial";


    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";


    ctx.fillText(
      "N",
      cx,
      cy - radius + 12
    );

    ctx.fillText(
      "S",
      cx,
      cy + radius - 12
    );

    ctx.fillText(
      "W",
      cx - radius + 12,
      cy
    );

    ctx.fillText(
      "E",
      cx + radius - 12,
      cy
    );


    /* SWEEP */

    const sweepRad =
      radarSweepAngle *
      Math.PI /
      180;


    const gradient =
      ctx.createConicGradient(
        sweepRad,
        cx,
        cy
      );


    gradient.addColorStop(
      0,
      "rgba(73, 255, 190, 0.30)"
    );

    gradient.addColorStop(
      0.055,
      "rgba(73, 255, 190, 0.10)"
    );

    gradient.addColorStop(
      0.16,
      "rgba(73, 255, 190, 0)"
    );

    gradient.addColorStop(
      1,
      "rgba(73, 255, 190, 0)"
    );


    ctx.fillStyle =
      gradient;


    ctx.beginPath();

    ctx.arc(
      cx,
      cy,
      radius,
      0,
      Math.PI * 2
    );

    ctx.fill();


    ctx.strokeStyle =
      "rgba(104, 255, 205, 0.65)";

    ctx.lineWidth =
      1.3;


    ctx.beginPath();

    ctx.moveTo(
      cx,
      cy
    );

    ctx.lineTo(
      cx +
      Math.sin(
        sweepRad
      )
      *
      radius,

      cy -
      Math.cos(
        sweepRad
      )
      *
      radius
    );

    ctx.stroke();


    /* AIRPORT CENTER */

    ctx.fillStyle =
      "rgba(255,255,255,0.92)";


    ctx.beginPath();

    ctx.arc(
      cx,
      cy,
      3.2,
      0,
      Math.PI * 2
    );

    ctx.fill();


    /* AIRCRAFT TARGETS */

    if (
      radarAirport &&
      Array.isArray(
        radarAircraft
      )
    ) {

      for (
        const aircraft
        of radarAircraft
      ) {

        const lat =
          Number(
            aircraft.lat
          );

        const lon =
          Number(
            aircraft.lon
          );


        if (
          !Number.isFinite(lat)
          ||
          !Number.isFinite(lon)
        ) {
          continue;
        }


        const relative =
          radarRelativeKm(
            lat,
            lon,
            radarAirport.lat,
            radarAirport.lon
          );


        const distance =
          Math.sqrt(
            relative.eastKm ** 2
            +
            relative.northKm ** 2
          );


        if (
          distance >
          RADAR_RANGE_KM
        ) {
          continue;
        }


        const x =
          cx
          +
          (
            relative.eastKm /
            RADAR_RANGE_KM
          )
          *
          radius;


        const y =
          cy
          -
          (
            relative.northKm /
            RADAR_RANGE_KM
          )
          *
          radius;


        const key =
          radarAircraftKey(
            aircraft
          );


        const isCurrent =
          key &&
          radarCurrentKey &&
          key ===
          radarCurrentKey;


        /* target */

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          isCurrent
            ? 5
            : 2.6,
          0,
          Math.PI * 2
        );


        ctx.fillStyle =
          isCurrent
            ? "rgba(255, 199, 74, 0.98)"
            : aircraft.onGround
              ? "rgba(105, 193, 255, 0.78)"
              : "rgba(103, 255, 190, 0.88)";


        ctx.fill();


        if (isCurrent) {

          ctx.beginPath();

          ctx.arc(
            x,
            y,
            9,
            0,
            Math.PI * 2
          );

          ctx.strokeStyle =
            "rgba(255, 199, 74, 0.72)";

          ctx.lineWidth =
            1.5;

          ctx.stroke();


          const label =
            aircraft.callsign
            ||
            aircraft.registration
            ||
            "";


          if (label) {

            ctx.font =
              Math.max(
                9,
                width *
                0.032
              )
              +
              "px Arial";


            ctx.textAlign =
              "left";

            ctx.textBaseline =
              "middle";


            ctx.fillStyle =
              "rgba(255, 221, 145, 0.96)";


            ctx.fillText(
              label,
              x + 11,
              y - 1
            );

          }

        }

      }

    }


    radarSweepAngle =
      (
        radarSweepAngle +
        0.75
      )
      %
      360;


    requestAnimationFrame(
      drawRadar
    );

  }


  /* ==================================================
     DATA UPDATE
     ================================================== */


  async function update() {

    if (busy) {
      return;
    }


    busy =
      true;


    const params =
      new URLSearchParams(
        window.location.search
      );


    const airport =
      (
        params.get(
          "airport"
        )
        ||
        "PRG"
      )
        .trim()
        .toUpperCase();


    try {

      const [
        broadcastResponse,
        engineResponse
      ] =
        await Promise.all([
          fetch(
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
          ),

          fetch(
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
          )
        ]);


      const [
        broadcastRaw,
        engineRaw
      ] =
        await Promise.all([
          broadcastResponse.text(),
          engineResponse.text()
        ]);


      let data;
      let engine;


      try {

        data =
          JSON.parse(
            broadcastRaw
          );

        engine =
          JSON.parse(
            engineRaw
          );

      }
      catch {

        throw new Error(
          "Live data returned invalid JSON"
        );

      }


      if (
        !broadcastResponse.ok
        ||
        !data.ok
      ) {

        throw new Error(
          data.error
          ||
          "Broadcast API failed"
        );

      }


      showMain(
        data.aircraft?.current
      );


      showNext(
        chooseNext(
          data
        )
      );


      if (
        engineResponse.ok &&
        engine.ok
      ) {

        radarAircraft =
          Array.isArray(
            engine.aircraft
          )
            ? engine.aircraft
            : [];


        radarAirport = {
          lat:
            Number(
              engine.airport?.lat
            ),

          lon:
            Number(
              engine.airport?.lon
            )
        };


        if (
          !Number.isFinite(
            radarAirport.lat
          )
          ||
          !Number.isFinite(
            radarAirport.lon
          )
        ) {

          radarAirport =
            null;

        }

      }

    }


    catch (error) {

      console.error(
        "Overlay update failed:",
        error
      );

    }


    finally {

      busy =
        false;

    }

  }


  /* ==================================================
     START
     ================================================== */


  drawRadar();


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
