// MikeAircraft Livestream Overlay
// Version 0.5
//
// Features:
// - CURRENT lower third
// - NEXT aircraft
// - animated aircraft profile
// - genuine live radar
// - animated route-map card
//
// Uses:
// Broadcast API v0.5
// Engine v0.6
// Aircraft Graphic API

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

<title>MikeAircraft Overlay v0.5</title>

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

/* =====================================================
   DEVELOPMENT BADGE
   ===================================================== */

.dev-badge {
  position: absolute;

  top: 18px;
  left: 50%;

  transform:
    translateX(-50%);

  z-index: 20;

  padding:
    7px 11px;

  border-radius: 7px;

  background:
    rgba(0,0,0,0.55);

  color:
    #9ed8f5;

  font-size: 12px;

  font-weight: bold;
}

/* =====================================================
   ROUTE MAP
   ===================================================== */

.route-map-card {
  position: absolute;

  top: 3.5vh;
  left: 3vw;

  width:
    clamp(
      290px,
      24vw,
      455px
    );

  height:
    clamp(
      175px,
      15vw,
      285px
    );

  overflow: hidden;

  border-radius: 15px;

  border:
    1px solid
    rgba(
      98,
      197,
      255,
      0.45
    );

  background:
    linear-gradient(
      145deg,
      rgba(5,26,46,0.96),
      rgba(8,53,82,0.94)
    );

  box-shadow:
    0 14px 36px
    rgba(0,0,0,0.35);

  opacity: 0;

  transform:
    translateY(-20px)
    scale(0.97);

  transition:
    opacity 0.5s ease,
    transform 0.5s ease;

  pointer-events: none;
}

.route-map-card.visible {
  opacity: 1;

  transform:
    translateY(0)
    scale(1);
}

.route-map-title {
  position: absolute;

  top: 12px;
  left: 16px;

  z-index: 4;

  color:
    #9edcf7;

  font-size:
    clamp(
      9px,
      0.7vw,
      12px
    );

  font-weight: 800;

  letter-spacing: 1.4px;
}

.route-map-route {
  position: absolute;

  top: 30px;
  left: 16px;

  z-index: 4;

  color:
    white;

  font-size:
    clamp(
      20px,
      1.8vw,
      31px
    );

  font-weight: 800;
}

.route-map-cities {
  position: absolute;

  bottom: 11px;
  left: 16px;
  right: 16px;

  z-index: 4;

  color:
    #a9c7d9;

  font-size:
    clamp(
      9px,
      0.75vw,
      12px
    );

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#routeCanvas {
  position: absolute;
  inset: 0;

  width: 100%;
  height: 100%;
}

/* =====================================================
   RADAR
   ===================================================== */

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

  aspect-ratio:
    1 / 1;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      rgba(4,30,37,0.88) 0%,
      rgba(2,18,25,0.94) 72%,
      rgba(1,10,16,0.97) 100%
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
    rgba(49,221,174,0.17),
    inset 0 0 28px
    rgba(49,221,174,0.08);

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
}

/* =====================================================
   AIRCRAFT PROFILE
   ===================================================== */

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

  bottom:
    -175px;

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

/* =====================================================
   LOWER THIRD
   ===================================================== */

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
    minmax(0,1.7fr)
    minmax(220px,0.8fr);

  min-height: 145px;

  overflow: hidden;

  border-radius:
    12px 12px 0 0;

  background:
    linear-gradient(
      105deg,
      rgba(4,28,53,0.98),
      rgba(0,83,138,0.97),
      rgba(5,30,53,0.98)
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
    rgba(0,0,0,0.38);
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
  color: white;

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

  color: white;

  font-weight: 700;
}

.registration {
  color: #bed2df;

  margin-left: 10px;

  font-weight: 500;
}

/* =====================================================
   STATUS
   ===================================================== */

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

/* =====================================================
   TELEMETRY
   ===================================================== */

.telemetry-strip {
  display: grid;

  grid-template-columns:
    repeat(4,1fr);

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

/* =====================================================
   NEXT
   ===================================================== */

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
}

.next-body {
  padding:
    13px 15px 15px;

  border-radius:
    0 0 10px 10px;

  background:
    linear-gradient(
      110deg,
      rgba(12,29,45,0.97),
      rgba(18,53,78,0.97)
    );

  border:
    1px solid
    rgba(
      100,
      197,
      255,
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

</style>

</head>

<body>

<div class="overlay">

  <div class="dev-badge">
    MikeAircraft Overlay v0.5
  </div>


  <!-- ROUTE MAP -->

  <div
    id="routeMapCard"
    class="route-map-card"
  >

    <canvas
      id="routeCanvas"
    ></canvas>

    <div
      class="route-map-title"
    >
      FLIGHT ROUTE
    </div>

    <div
      id="routeMapRoute"
      class="route-map-route"
    >
      ---
    </div>

    <div
      id="routeMapCities"
      class="route-map-cities"
    >
      ---
    </div>

  </div>


  <!-- RADAR -->

  <div class="radar-wrap">

    <canvas
      id="radarCanvas"
    ></canvas>

    <div class="radar-title">
      LIVE RADAR
    </div>

    <div class="radar-range">
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

let radarCurrentKey =
  null;

let radarAircraft =
  [];

let radarAirport =
  null;

let radarSweepAngle =
  0;


let profileTimer1 =
  null;

let profileTimer2 =
  null;


let routeTimer =
  null;

let routeAnimationStart =
  0;

let routeAnimationActive =
  false;

let routeData =
  null;


/* =====================================================
   HELPERS
   ===================================================== */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );

  if (element) {
    element.textContent =
      value;
  }

}


function identityKey(
  target
) {

  return (
    target?.identity
      ?.registration
    ||
    target?.identity
      ?.callsign
    ||
    null
  );

}


/* =====================================================
   AIRCRAFT PROFILE
   ===================================================== */

function animateAircraftProfile(
  target
) {

  const type =
    target?.aircraft
      ?.typeCode;

  if (!type) {
    return;
  }


  const direction =
    target.movement?.lineage ===
    "DEPARTURE"
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
      type
    )
    +
    "&direction=" +
    direction
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


/* =====================================================
   ROUTE MAP
   ===================================================== */

function getRouteBounds(
  start,
  end
) {

  const minLat =
    Math.min(
      Number(start.lat),
      Number(end.lat)
    );

  const maxLat =
    Math.max(
      Number(start.lat),
      Number(end.lat)
    );

  const minLon =
    Math.min(
      Number(start.lon),
      Number(end.lon)
    );

  const maxLon =
    Math.max(
      Number(start.lon),
      Number(end.lon)
    );


  let latSpan =
    maxLat - minLat;

  let lonSpan =
    maxLon - minLon;


  // Prevent tiny routes like CDG -> LHR
  // collapsing into a tiny corner.

  latSpan =
    Math.max(
      latSpan,
      3.5
    );

  lonSpan =
    Math.max(
      lonSpan,
      5
    );


  const latPadding =
    latSpan *
    0.55;


  const lonPadding =
    lonSpan *
    0.55;


  return {

    minLat:
      minLat -
      latPadding,

    maxLat:
      maxLat +
      latPadding,

    minLon:
      minLon -
      lonPadding,

    maxLon:
      maxLon +
      lonPadding

  };

}


function mapProjection(
  lat,
  lon,
  width,
  height,
  bounds
) {

  const usableLeft =
    width *
    0.08;

  const usableRight =
    width *
    0.92;

  const usableTop =
    height *
    0.28;

  const usableBottom =
    height *
    0.83;


  const usableWidth =
    usableRight -
    usableLeft;

  const usableHeight =
    usableBottom -
    usableTop;


  const lonSpan =
    bounds.maxLon -
    bounds.minLon;


  const latSpan =
    bounds.maxLat -
    bounds.minLat;


  const x =
    usableLeft
    +
    (
      (
        lon -
        bounds.minLon
      )
      /
      lonSpan
    )
    *
    usableWidth;


  const y =
    usableTop
    +
    (
      (
        bounds.maxLat -
        lat
      )
      /
      latSpan
    )
    *
    usableHeight;


  return {
    x,
    y
  };

}


function showRouteMap(
  target
) {

  if (
    !target?.route?.found
    ||
    !target.route.map
  ) {
    return;
  }


  const start =
    target.route.map.start;

  const end =
    target.route.map.end;


  if (
    start?.lat == null
    ||
    start?.lon == null
    ||
    end?.lat == null
    ||
    end?.lon == null
  ) {
    return;
  }


  routeData = {

    start,

    end,

    originCode:
      target.route.origin?.iata
      ||
      target.route.origin?.icao
      ||
      "",

    destinationCode:
      target.route.destination?.iata
      ||
      target.route.destination?.icao
      ||
      ""

  };


  setText(
    "routeMapRoute",
    target.route.display
    ||
    ""
  );


  const originCity =
    target.route.origin?.city
    ||
    target.route.origin?.name
    ||
    "";


  const destinationCity =
    target.route.destination?.city
    ||
    target.route.destination?.name
    ||
    "";


  setText(
    "routeMapCities",
    originCity
    +
    "  →  "
    +
    destinationCity
  );


  const card =
    document.getElementById(
      "routeMapCard"
    );


  card.classList.add(
    "visible"
  );


  routeAnimationStart =
    performance.now();


  routeAnimationActive =
    true;


  clearTimeout(
    routeTimer
  );


  routeTimer =
    setTimeout(
      () => {

        card.classList.remove(
          "visible"
        );

        routeAnimationActive =
          false;

      },
      9000
    );

}


function drawRouteMap() {

  const canvas =
    document.getElementById(
      "routeCanvas"
    );


  const card =
    canvas.parentElement;


  const dpr =
    window.devicePixelRatio
    ||
    1;


  const width =
    card.clientWidth;


  const height =
    card.clientHeight;


  const pixelWidth =
    Math.round(
      width *
      dpr
    );


  const pixelHeight =
    Math.round(
      height *
      dpr
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


  if (!routeData) {

    requestAnimationFrame(
      drawRouteMap
    );

    return;

  }


  const bounds =
    getRouteBounds(
      routeData.start,
      routeData.end
    );


  /* ==========================================
     BACKGROUND GRID
     ========================================== */


  ctx.strokeStyle =
    "rgba(90,180,215,0.10)";


  ctx.lineWidth =
    1;


  const gridColumns =
    6;


  const gridRows =
    4;


  for (
    let i = 1;
    i < gridColumns;
    i++
  ) {

    const x =
      width *
      (
        i /
        gridColumns
      );


    ctx.beginPath();

    ctx.moveTo(
      x,
      0
    );

    ctx.lineTo(
      x,
      height
    );

    ctx.stroke();

  }


  for (
    let i = 1;
    i < gridRows;
    i++
  ) {

    const y =
      height *
      (
        i /
        gridRows
      );


    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      width,
      y
    );

    ctx.stroke();

  }


  /* ==========================================
     START / END
     ========================================== */


  const start =
    mapProjection(
      Number(
        routeData.start.lat
      ),
      Number(
        routeData.start.lon
      ),
      width,
      height,
      bounds
    );


  const end =
    mapProjection(
      Number(
        routeData.end.lat
      ),
      Number(
        routeData.end.lon
      ),
      width,
      height,
      bounds
    );


  const dx =
    end.x -
    start.x;


  const dy =
    end.y -
    start.y;


  const routeLength =
    Math.sqrt(
      dx * dx
      +
      dy * dy
    );


  const midX =
    (
      start.x +
      end.x
    )
    /
    2;


  const midY =
    (
      start.y +
      end.y
    )
    /
    2;


  const normalX =
    routeLength > 0
      ? (
          -dy /
          routeLength
        )
      : 0;


  const normalY =
    routeLength > 0
      ? (
          dx /
          routeLength
        )
      : -1;


  const bend =
    Math.min(
      85,
      Math.max(
        35,
        routeLength *
        0.28
      )
    );


  const controlX =
    midX
    +
    normalX *
    bend;


  const controlY =
    midY
    +
    normalY *
    bend;


  /* ==========================================
     BASE ROUTE
     ========================================== */


  ctx.strokeStyle =
    "rgba(94,205,245,0.24)";


  ctx.lineWidth =
    2;


  ctx.beginPath();

  ctx.moveTo(
    start.x,
    start.y
  );


  ctx.quadraticCurveTo(
    controlX,
    controlY,
    end.x,
    end.y
  );


  ctx.stroke();


  /* ==========================================
     ANIMATED ROUTE
     ========================================== */


  let progress =
    1;


  if (
    routeAnimationActive
  ) {

    progress =
      Math.min(
        1,
        (
          performance.now()
          -
          routeAnimationStart
        )
        /
        2200
      );

  }


  const steps =
    90;


  const visibleSteps =
    Math.floor(
      steps *
      progress
    );


  ctx.strokeStyle =
    "rgba(100,225,255,0.96)";


  ctx.lineWidth =
    3;


  ctx.beginPath();


  let markerX =
    start.x;


  let markerY =
    start.y;


  for (
    let i = 0;
    i <= visibleSteps;
    i++
  ) {

    const t =
      i /
      steps;


    const oneMinus =
      1 -
      t;


    const x =
      oneMinus *
      oneMinus *
      start.x
      +
      2 *
      oneMinus *
      t *
      controlX
      +
      t *
      t *
      end.x;


    const y =
      oneMinus *
      oneMinus *
      start.y
      +
      2 *
      oneMinus *
      t *
      controlY
      +
      t *
      t *
      end.y;


    markerX =
      x;

    markerY =
      y;


    if (
      i === 0
    ) {

      ctx.moveTo(
        x,
        y
      );

    }

    else {

      ctx.lineTo(
        x,
        y
      );

    }

  }


  ctx.stroke();


  /* ==========================================
     ORIGIN MARKER
     ========================================== */


  ctx.fillStyle =
    "#5ee2ff";


  ctx.beginPath();

  ctx.arc(
    start.x,
    start.y,
    5,
    0,
    Math.PI *
    2
  );

  ctx.fill();


  ctx.fillStyle =
    "rgba(200,240,255,0.96)";


  ctx.font =
    "bold "
    +
    Math.max(
      10,
      width *
      0.03
    )
    +
    "px Arial";


  ctx.textAlign =
    "left";


  ctx.fillText(
    routeData.originCode,
    start.x +
    9,
    start.y -
    7
  );


  /* ==========================================
     DESTINATION MARKER
     ========================================== */


  ctx.fillStyle =
    "#ffffff";


  ctx.beginPath();

  ctx.arc(
    end.x,
    end.y,
    6,
    0,
    Math.PI *
    2
  );

  ctx.fill();


  ctx.fillStyle =
    "#ffffff";


  ctx.textAlign =
    "right";


  ctx.fillText(
    routeData.destinationCode,
    end.x -
    9,
    end.y -
    7
  );


  /* ==========================================
     MOVING AIRCRAFT DOT
     ========================================== */


  if (
    progress <
    1
  ) {

    ctx.fillStyle =
      "#ffca57";


    ctx.beginPath();

    ctx.arc(
      markerX,
      markerY,
      5,
      0,
      Math.PI *
      2
    );

    ctx.fill();


    ctx.strokeStyle =
      "rgba(255,202,87,0.45)";


    ctx.lineWidth =
      2;


    ctx.beginPath();

    ctx.arc(
      markerX,
      markerY,
      9,
      0,
      Math.PI *
      2
    );

    ctx.stroke();

  }


  requestAnimationFrame(
    drawRouteMap
  );

}


/* =====================================================
   CURRENT
   ===================================================== */

function showMain(
  target
) {

  const box =
    document.getElementById(
      "lowerThird"
    );


  if (
    !target
    ||
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
    target.operator?.name
    ||
    "Operator not identified"
  );


  setText(
    "flight",
    target.identity?.flight
    ||
    target.identity?.callsign
    ||
    "---"
  );


  setText(
    "route",
    target.route?.display
    ||
    ""
  );


  setText(
    "aircraft",
    target.aircraft?.name
    ||
    target.aircraft?.typeCode
    ||
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
    target.movement?.displayState
    ||
    target.movement?.state
    ||
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
          .airportDistanceKm
        + " km"
      : "---"
  );


  setText(
    "altitude",
    target.telemetry
      ?.altitudeFt != null
      ? target.telemetry
          .altitudeFt
        + " ft"
      : "---"
  );


  setText(
    "speed",
    target.telemetry
      ?.speedKt != null
      ? target.telemetry
          .speedKt
        + " kt"
      : "---"
  );


  setText(
    "runway",
    target.movement?.runway
    ||
    "---"
  );


  box.classList.add(
    "visible"
  );


  const key =
    identityKey(
      target
    );


  radarCurrentKey =
    key;


  if (
    key
    &&
    key !==
    lastCurrentKey
  ) {

    lastCurrentKey =
      key;


    animateAircraftProfile(
      target
    );


    if (
      target.route?.found
    ) {

      showRouteMap(
        target
      );

    }

  }

}


/* =====================================================
   NEXT
   ===================================================== */

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
    current?.available
  ) {

    if (
      current.movement?.lineage ===
      "ARRIVAL"
    ) {

      if (
        nextIn?.available
      ) {
        return nextIn;
      }

      if (
        nextOut?.available
      ) {
        return nextOut;
      }

    }


    if (
      current.movement?.lineage ===
      "DEPARTURE"
    ) {

      if (
        nextOut?.available
      ) {
        return nextOut;
      }

      if (
        nextIn?.available
      ) {
        return nextIn;
      }

    }

  }


  return (
    nextIn?.available
      ? nextIn
      : nextOut?.available
        ? nextOut
        : null
  );

}


function showNext(
  target
) {

  const box =
    document.getElementById(
      "nextBox"
    );


  if (
    !target
    ||
    !target.available
  ) {

    box.classList.remove(
      "visible"
    );

    return;

  }


  setText(
    "nextFlight",
    target.identity?.flight
    ||
    target.identity?.callsign
    ||
    "---"
  );


  setText(
    "nextAirline",
    target.operator?.name
    ||
    "Operator not identified"
  );


  setText(
    "nextRoute",
    target.route?.display
    ||
    ""
  );


  setText(
    "nextAircraft",
    (
      target.aircraft?.name
      ||
      target.aircraft?.typeCode
      ||
      "---"
    )
    +
    (
      target.identity?.registration
        ? " • " +
          target.identity.registration
        : ""
    )
  );


  box.classList.add(
    "visible"
  );

}


/* =====================================================
   RADAR
   ===================================================== */

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
    northKm,
    eastKm
  };

}


function radarKey(
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


function drawRadar() {

  const canvas =
    document.getElementById(
      "radarCanvas"
    );


  const wrap =
    canvas.parentElement;


  const dpr =
    window.devicePixelRatio
    ||
    1;


  const width =
    wrap.clientWidth;


  const height =
    wrap.clientHeight;


  canvas.width =
    Math.round(
      width *
      dpr
    );


  canvas.height =
    Math.round(
      height *
      dpr
    );


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
    width /
    2;


  const cy =
    height /
    2;


  const radius =
    Math.min(
      width,
      height
    )
    *
    0.46;


  ctx.strokeStyle =
    "rgba(83,226,185,0.23)";


  ctx.lineWidth =
    1;


  [
    0.25,
    0.5,
    0.75,
    1
  ]
  .forEach(
    ring => {

      ctx.beginPath();

      ctx.arc(
        cx,
        cy,
        radius *
        ring,
        0,
        Math.PI *
        2
      );

      ctx.stroke();

    }
  );


  ctx.strokeStyle =
    "rgba(83,226,185,0.16)";


  ctx.beginPath();

  ctx.moveTo(
    cx -
    radius,
    cy
  );

  ctx.lineTo(
    cx +
    radius,
    cy
  );

  ctx.moveTo(
    cx,
    cy -
    radius
  );

  ctx.lineTo(
    cx,
    cy +
    radius
  );

  ctx.stroke();


  ctx.fillStyle =
    "rgba(141,235,208,0.55)";


  ctx.font =
    Math.max(
      9,
      width *
      0.035
    )
    +
    "px Arial";


  ctx.textAlign =
    "center";


  ctx.fillText(
    "N",
    cx,
    cy -
    radius +
    13
  );


  ctx.fillText(
    "S",
    cx,
    cy +
    radius -
    8
  );


  ctx.fillText(
    "W",
    cx -
    radius +
    12,
    cy +
    4
  );


  ctx.fillText(
    "E",
    cx +
    radius -
    12,
    cy +
    4
  );


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
    "rgba(73,255,190,0.30)"
  );


  gradient.addColorStop(
    0.07,
    "rgba(73,255,190,0.10)"
  );


  gradient.addColorStop(
    0.18,
    "rgba(73,255,190,0)"
  );


  gradient.addColorStop(
    1,
    "rgba(73,255,190,0)"
  );


  ctx.fillStyle =
    gradient;


  ctx.beginPath();

  ctx.arc(
    cx,
    cy,
    radius,
    0,
    Math.PI *
    2
  );

  ctx.fill();


  ctx.strokeStyle =
    "rgba(104,255,205,0.7)";


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


  ctx.fillStyle =
    "white";


  ctx.beginPath();

  ctx.arc(
    cx,
    cy,
    3,
    0,
    Math.PI *
    2
  );

  ctx.fill();


  if (
    radarAirport
    &&
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
        !Number.isFinite(
          lat
        )
        ||
        !Number.isFinite(
          lon
        )
      ) {
        continue;
      }


      const rel =
        radarRelativeKm(
          lat,
          lon,
          radarAirport.lat,
          radarAirport.lon
        );


      const distance =
        Math.sqrt(
          rel.eastKm **
          2
          +
          rel.northKm **
          2
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
          rel.eastKm
          /
          RADAR_RANGE_KM
        )
        *
        radius;


      const y =
        cy
        -
        (
          rel.northKm
          /
          RADAR_RANGE_KM
        )
        *
        radius;


      const isCurrent =
        radarKey(
          aircraft
        )
        ===
        radarCurrentKey;


      ctx.fillStyle =
        isCurrent
          ? "#ffca57"
          : aircraft.onGround
            ? "#6dc6ff"
            : "#68ffc2";


      ctx.beginPath();

      ctx.arc(
        x,
        y,
        isCurrent
          ? 5
          : 2.6,
        0,
        Math.PI *
        2
      );

      ctx.fill();


      if (
        isCurrent
      ) {

        ctx.strokeStyle =
          "rgba(255,202,87,0.75)";


        ctx.beginPath();

        ctx.arc(
          x,
          y,
          9,
          0,
          Math.PI *
          2
        );

        ctx.stroke();


        ctx.fillStyle =
          "#ffe29a";


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


        ctx.fillText(
          aircraft.callsign
          ||
          aircraft.registration
          ||
          "",
          x + 11,
          y + 3
        );

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


/* =====================================================
   DATA UPDATE
   ===================================================== */

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
    ]
    =
    await Promise.all([

      fetch(
        "/api/broadcast?airport="
        +
        encodeURIComponent(
          airport
        )
        +
        "&t="
        +
        Date.now(),
        {
          cache:
            "no-store"
        }
      ),

      fetch(
        "/api/engine?airport="
        +
        encodeURIComponent(
          airport
        )
        +
        "&t="
        +
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
    ]
    =
    await Promise.all([

      broadcastResponse.text(),

      engineResponse.text()

    ]);


    const data =
      JSON.parse(
        broadcastRaw
      );


    const engine =
      JSON.parse(
        engineRaw
      );


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
      engineResponse.ok
      &&
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

  catch (
    error
  ) {

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


/* =====================================================
   START
   ===================================================== */

drawRadar();

drawRouteMap();

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
