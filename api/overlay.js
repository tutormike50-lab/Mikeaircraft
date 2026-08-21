// MikeAircraft Livestream Overlay
// Version 0.1
//
// First genuine transparent broadcast overlay.
// Intended for 1920x1080 output and future YoloBox use.

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

  <title>MikeAircraft Overlay</title>

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

      background: transparent;

      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    body {
      position: relative;
    }

    /* ============================================
       STAGE
       ============================================ */

    .stage {
      position: absolute;

      width: 1920px;
      height: 1080px;

      left: 50%;
      top: 50%;

      transform:
        translate(
          -50%,
          -50%
        )
        scale(
          min(
            calc(100vw / 1920),
            calc(100vh / 1080)
          )
        );

      transform-origin:
        center center;

      pointer-events: none;
    }

    /* ============================================
       CURRENT LOWER THIRD
       ============================================ */

    .lower-third {
      position: absolute;

      left: 70px;
      bottom: 72px;

      width: 1180px;

      opacity: 0;

      transform:
        translateY(35px);

      transition:
        opacity 0.45s ease,
        transform 0.45s ease;
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
        1.45fr 1fr;

      min-height: 150px;

      overflow: hidden;

      border-radius:
        12px 12px 0 0;

      background:
        linear-gradient(
          100deg,
          rgba(4, 34, 63, 0.97),
          rgba(0, 85, 143, 0.96),
          rgba(6, 33, 58, 0.97)
        );

      box-shadow:
        0 14px 38px
        rgba(0, 0, 0, 0.38);

      border:
        1px solid
        rgba(104, 200, 255, 0.45);
    }

    .main-ribbon::before {
      content: "";

      position: absolute;

      left: 0;
      top: 0;
      bottom: 0;

      width: 8px;

      background:
        linear-gradient(
          #58dcff,
          #2e8ec7
        );
    }

    .identity {
      padding:
        20px 28px 17px 30px;

      display: flex;

      flex-direction: column;

      justify-content: center;
    }

    .airline {
      font-size: 20px;
      font-weight: 700;

      color: #c4e3f4;

      margin-bottom: 3px;
    }

    .flight-row {
      display: flex;

      align-items: baseline;

      gap: 18px;
    }

    .flight {
      font-size: 47px;
      line-height: 1;

      font-weight: 800;

      letter-spacing: -1px;

      color: #ffffff;
    }

    .route {
      font-size: 29px;

      font-weight: 800;

      color: #5fdcff;
    }

    .aircraft-line {
      margin-top: 11px;

      font-size: 18px;

      font-weight: 700;

      color: #ffffff;
    }

    .registration {
      color: #bdd0de;

      margin-left: 10px;

      font-weight: 500;
    }

    /* ============================================
       STATUS
       ============================================ */

    .status-panel {
      position: relative;

      display: flex;

      flex-direction: column;

      justify-content: center;

      align-items: flex-end;

      padding:
        20px 28px 18px 18px;

      text-align: right;
    }

    .status {
      display: inline-block;

      padding:
        7px 13px;

      border-radius: 18px;

      background:
        rgba(
          70,
          231,
          158,
          0.14
        );

      border:
        1px solid
        rgba(
          94,
          232,
          167,
          0.55
        );

      color: #67eda9;

      font-size: 16px;

      font-weight: 800;

      letter-spacing: 0.6px;

      margin-bottom: 11px;
    }

    .runway {
      color: #c7e6f7;

      font-size: 16px;
    }

    /* ============================================
       TELEMETRY STRIP
       ============================================ */

    .telemetry-strip {
      min-height: 54px;

      display: grid;

      grid-template-columns:
        repeat(4, 1fr);

      overflow: hidden;

      border-radius:
        0 0 12px 12px;

      background:
        rgba(
          7,
          20,
          35,
          0.96
        );

      border:
        1px solid
        rgba(
          104,
          200,
          255,
          0.26
        );

      border-top: none;

      box-shadow:
        0 12px 26px
        rgba(0, 0, 0, 0.27);
    }

    .telemetry-item {
      display: flex;

      align-items: center;

      justify-content: center;

      gap: 8px;

      border-right:
        1px solid
        rgba(
          255,
          255,
          255,
          0.1
        );

      font-size: 16px;
    }

    .telemetry-item:last-child {
      border-right: none;
    }

    .telemetry-label {
      color: #7fa3bb;

      font-size: 12px;

      text-transform: uppercase;

      letter-spacing: 0.7px;
    }

    .telemetry-value {
      color: white;

      font-weight: 800;
    }

    /* ============================================
       NEXT BOX
       ============================================ */

    .next-box {
      position: absolute;

      right: 70px;
      bottom: 72px;

      width: 430px;

      opacity: 0;

      transform:
        translateY(28px);

      transition:
        opacity 0.45s ease,
        transform 0.45s ease;
    }

    .next-box.visible {
      opacity: 1;

      transform:
        translateY(0);
    }

    .next-header {
      padding:
        9px 14px;

      border-radius:
        10px 10px 0 0;

      background:
        rgba(
          7,
          20,
          35,
          0.95
        );

      color: #98cde8;

      border:
        1px solid
        rgba(
          105,
          189,
          235,
          0.28
        );

      border-bottom: none;

      font-size: 13px;

      font-weight: 800;

      letter-spacing: 1.2px;
    }

    .next-body {
      padding:
        13px 15px 14px;

      border-radius:
        0 0 10px 10px;

      background:
        linear-gradient(
          110deg,
          rgba(14, 31, 48, 0.96),
          rgba(18, 48, 73, 0.96)
        );

      border:
        1px solid
        rgba(
          105,
          189,
          235,
          0.3
        );

      box-shadow:
        0 10px 28px
        rgba(0, 0, 0, 0.3);
    }

    .next-flight {
      font-size: 27px;

      font-weight: 800;

      color: #ffbd59;

      margin-bottom: 2px;
    }

    .next-airline {
      color: #d5e3ec;

      font-size: 14px;

      font-weight: 700;
    }

    .next-route {
      color: #76dfff;

      font-size: 16px;

      font-weight: 800;

      margin-top: 5px;
    }

    .next-aircraft {
      color: #aebfcb;

      font-size: 13px;

      margin-top: 7px;
    }

    /* ============================================
       DEBUG
       ============================================ */

    .debug {
      position: absolute;

      top: 22px;
      left: 28px;

      font-size: 12px;

      color: rgba(
        255,
        255,
        255,
        0.45
      );

      opacity: 0;
    }

  </style>
</head>

<body>

<div class="stage">

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
          >
            ---
          </span>

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
          class="runway"
        >
          ---
        </div>

      </div>

    </div>


    <div class="telemetry-strip">

      <div class="telemetry-item">

        <span class="telemetry-label">
          Distance
        </span>

        <span
          id="distance"
          class="telemetry-value"
        >
          ---
        </span>

      </div>


      <div class="telemetry-item">

        <span class="telemetry-label">
          Altitude
        </span>

        <span
          id="altitude"
          class="telemetry-value"
        >
          ---
        </span>

      </div>


      <div class="telemetry-item">

        <span class="telemetry-label">
          Speed
        </span>

        <span
          id="speed"
          class="telemetry-value"
        >
          ---
        </span>

      </div>


      <div class="telemetry-item">

        <span class="telemetry-label">
          Runway
        </span>

        <span
          id="runway"
          class="telemetry-value"
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


  <div
    id="debug"
    class="debug"
  >
    MikeAircraft Overlay v0.1
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


  function showMain(
    target
  ) {

    const lowerThird =
      document.getElementById(
        "lowerThird"
      );


    if (
      !target ||
      !target.available
    ) {

      lowerThird.classList.remove(
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
        ? "• " +
          target.identity.registration
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
        ? "RUNWAY " +
          target.movement.runway
        : ""
    );


    setText(
      "distance",
      target.telemetry
        ?.airportDistanceKm != null
        ? target.telemetry
            .airportDistanceKm +
          " km"
        : "---"
    );


    setText(
      "altitude",
      target.telemetry
        ?.altitudeFt != null
        ? target.telemetry
            .altitudeFt +
          " ft"
        : "---"
    );


    setText(
      "speed",
      target.telemetry
        ?.speedKt != null
        ? target.telemetry
            .speedKt +
          " kt"
        : "---"
    );


    setText(
      "runway",
      target.movement?.runway ||
      "---"
    );


    lowerThird.classList.add(
      "visible"
    );

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

      const lineage =
        current.movement
          ?.lineage;


      if (
        lineage ===
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
        lineage ===
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

    const nextBox =
      document.getElementById(
        "nextBox"
      );


    if (
      !target ||
      !target.available
    ) {

      nextBox.classList.remove(
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
      (
        target.aircraft?.name ||
        target.aircraft?.typeCode ||
        "---"
      );


    const reg =
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
      aircraft + reg
    );


    nextBox.classList.add(
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
        params.get(
          "airport"
        ) ||
        "PRG"
      )
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


      showMain(
        data.aircraft?.current
      );


      showNext(
        chooseNext(
          data
        )
      );

    }

    catch {

      // Keep last successful graphic visible.
      // Never flash an ugly error onto the stream.

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
