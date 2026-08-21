// MikeAircraft Livestream Overlay
// Version 0.3
//
// Adds animated aircraft-profile reveal on CURRENT change.
// Reads Broadcast API v0.5.

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

  <title>MikeAircraft Overlay v0.3</title>

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

    /* ============================================
       AIRCRAFT PROFILE
       ============================================ */

    .aircraft-profile-wrap {
      position: absolute;

      left: 5.5vw;
      bottom: calc(5vh + 176px);

      width: min(36vw, 650px);
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

      transform:
        translateY(0);

      transition:
        bottom 0.65s cubic-bezier(
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

    /* ============================================
       LOWER THIRD
       ============================================ */

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
        rgba(0, 0, 0, 0.38);
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

    /* ============================================
       STATUS PANEL
       ============================================ */

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

    /* ============================================
       TELEMETRY
       ============================================ */

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
        rgba(0, 0, 0, 0.25);
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

    /* ============================================
       NEXT BOX
       ============================================ */

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
        rgba(0, 0, 0, 0.28);
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

    /* ============================================
       DEV BADGE
       ============================================ */

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
    MikeAircraft Overlay v0.3 • PREVIEW
  </div>


  <div
    class="aircraft-profile-wrap"
  >

    <img
      id="aircraftProfile"
      class="aircraft-profile"
      alt=""
    >

  </div>


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

  let busy =
    false;

  let lastCurrentKey =
    null;

  let profileTimer1 =
    null;

  let profileTimer2 =
    null;


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


    // Force reflow so the animation
    // restarts even if the same family appears.
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
      (
        target.identity
          ?.registration
        ||
        target.identity
          ?.callsign
        ||
        ""
      );


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
        params.get("airport") ||
        "PRG"
      )
        .trim()
        .toUpperCase();


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


      const raw =
        await response.text();


      let data;


      try {

        data =
          JSON.parse(
            raw
          );

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
