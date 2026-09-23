module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>MikeAircraft Control Panel</title>
  <style>
    :root{
      color-scheme:dark;
      --page:#07111d;
      --card:#0d1c2b;
      --line:#20415c;
      --blue:#35aee8;
      --blue-soft:#9bdcff;
      --green:#5ce59a;
      --amber:#ffcb68;
      --red:#ff7b7b;
      --muted:#93a8b9;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      min-height:100vh;
      background:
        radial-gradient(circle at 50% -20%,rgba(21,115,165,.3),transparent 43%),
        var(--page);
      color:#f4f9fc;
      font-family:Arial,Helvetica,sans-serif;
    }
    button,input{font:inherit}
    .topbar{
      display:flex;
      align-items:center;
      gap:16px;
      min-height:82px;
      padding:16px clamp(18px,4vw,44px);
      background:linear-gradient(90deg,#07182a,#064b76,#07182a);
      border-bottom:1px solid #2b80ae;
      box-shadow:0 8px 28px rgba(0,0,0,.25);
    }
    .tower{
      width:48px;
      height:48px;
      padding:8px;
      border:1px solid rgba(146,220,255,.55);
      border-radius:13px;
      background:rgba(2,22,37,.65);
      color:var(--blue-soft);
    }
    .tower svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
    h1{margin:0;font-size:clamp(22px,4vw,31px)}
    .subtitle{margin:5px 0 0;color:#b6d7e9;font-size:14px}
    main{width:min(980px,100%);margin:0 auto;padding:28px clamp(16px,4vw,34px) 44px}
    .statusbar{
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:12px;
      margin-bottom:22px;
    }
    .statusitem{
      padding:14px 16px;
      border:1px solid var(--line);
      border-radius:12px;
      background:rgba(11,29,44,.82);
    }
    .statuslabel{display:block;margin-bottom:5px;color:var(--muted);font-size:11px;font-weight:800;letter-spacing:1px}
    .statusvalue{font-size:18px;font-weight:800}
    .good{color:var(--green)}
    .warn{color:var(--amber)}
    .bad{color:var(--red)}
    .card{
      overflow:hidden;
      border:1px solid var(--line);
      border-radius:16px;
      background:linear-gradient(145deg,rgba(17,41,60,.96),rgba(8,23,36,.96));
      box-shadow:0 18px 50px rgba(0,0,0,.22);
    }
    .cardhead{padding:20px 22px 16px;border-bottom:1px solid rgba(58,101,131,.55)}
    .cardhead h2{margin:0;font-size:20px}
    .cardhead p{margin:7px 0 0;color:#a7bdcc;font-size:14px;line-height:1.45}
    .cardbody{padding:22px}
    .pinrow{display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .pinrow input{
      width:220px;
      max-width:100%;
      padding:12px 14px;
      border:1px solid #346483;
      border-radius:10px;
      outline:none;
      background:#061522;
      color:white;
    }
    .pinrow input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(53,174,232,.14)}
    .lock-status{
      flex:0 0 auto;
      padding:9px 11px;
      border:1px solid #3b6078;
      border-radius:999px;
      color:var(--muted);
      font-size:11px;
      font-weight:900;
      letter-spacing:.7px;
    }
    .lock-status.unlocked{border-color:rgba(92,229,154,.62);background:rgba(24,110,72,.2);color:var(--green)}
    .airportgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .airport{
      position:relative;
      min-height:88px;
      padding:15px;
      border:1px solid #2a536e;
      border-radius:12px;
      background:#0a2234;
      color:white;
      cursor:pointer;
      text-align:left;
      transition:transform .12s ease,border-color .12s ease,background .12s ease;
    }
    .airport:hover{transform:translateY(-1px);border-color:#54bce9;background:#0c2b41}
    .airport:focus-visible{outline:3px solid rgba(53,174,232,.4);outline-offset:2px}
    .airport.active{border-color:var(--green);background:linear-gradient(145deg,#0b3b42,#0a2938);box-shadow:inset 0 0 0 1px rgba(92,229,154,.2)}
    .airport:disabled{cursor:wait;opacity:.65;transform:none}
    .code{display:block;color:var(--blue-soft);font-size:25px;font-weight:900;letter-spacing:1px}
    .airport.active .code{color:var(--green)}
    .name{display:block;margin-top:4px;color:#bed0dc;font-size:13px}
    .icao{position:absolute;top:15px;right:14px;color:#69869a;font-size:11px;font-weight:800}
    #message,#locationMessage{min-height:24px;margin-top:18px;color:#a9bfd0;font-size:14px}
    #priorityMessage{min-height:24px;margin-top:15px;color:#a9bfd0;font-size:14px}
    .priority-card{margin-top:22px}
    .priority-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .priority-button{
      min-height:66px;
      padding:14px 12px;
      border:1px solid #2f5c79;
      border-radius:12px;
      background:#0a2234;
      color:#d8e7f0;
      cursor:pointer;
      font-weight:900;
      letter-spacing:.45px;
      transition:transform .12s ease,border-color .12s ease,background .12s ease;
    }
    .priority-button:hover{transform:translateY(-1px);border-color:#54bce9;background:#0c2b41}
    .priority-button.active{border-color:var(--green);background:linear-gradient(145deg,#0b3b42,#0a2938);color:var(--green);box-shadow:inset 0 0 0 1px rgba(92,229,154,.2)}
    .priority-button:focus-visible{outline:3px solid rgba(53,174,232,.4);outline-offset:2px}
    .priority-button:disabled{cursor:wait;opacity:.62;transform:none}
    .location-card{margin-top:22px}
    .location-summary{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:18px;
      margin-bottom:18px;
      padding:14px 16px;
      border:1px solid #294f69;
      border-radius:11px;
      background:#081a29;
    }
    .location-label{color:var(--muted);font-size:11px;font-weight:800;letter-spacing:1px}
    .location-value{font-size:17px;font-weight:900;text-align:right}
    .location-button{
      width:100%;
      min-height:58px;
      padding:15px 20px;
      border:1px solid #55c9f7;
      border-radius:12px;
      background:linear-gradient(135deg,#0f72a3,#07547c);
      color:white;
      cursor:pointer;
      font-weight:900;
      letter-spacing:.7px;
      box-shadow:0 8px 24px rgba(21,139,190,.2);
    }
    .location-button:hover{background:linear-gradient(135deg,#1388be,#08618e)}
    .location-button:focus-visible{outline:3px solid rgba(92,229,154,.42);outline-offset:3px}
    .location-button:disabled{cursor:wait;opacity:.62}
    .location-note{margin:12px 0 0;color:#7893a6;font-size:12px;line-height:1.5}
    .calibration-target{display:none;margin:0 0 18px;padding:18px;border:1px solid #39779c;border-radius:14px;background:#061725;text-align:center}
    .calibration-target.active{display:block}
    .crosshair{position:relative;width:min(58vw,230px);height:min(58vw,230px);margin:0 auto 16px;border:2px solid var(--blue);border-radius:50%;background:radial-gradient(circle,transparent 0 11px,var(--green) 12px 15px,transparent 16px)}
    .crosshair::before,.crosshair::after{content:'';position:absolute;background:var(--green);box-shadow:0 0 10px rgba(92,229,154,.55)}
    .crosshair::before{width:2px;height:100%;left:calc(50% - 1px);top:0}.crosshair::after{height:2px;width:100%;top:calc(50% - 1px);left:0}
    .calibration-state{font-size:22px;font-weight:900;color:var(--amber);letter-spacing:.5px}
    .calibration-instruction{margin:8px auto;color:#d7e8f2;line-height:1.45;max-width:560px}
    .calibration-progress{height:8px;margin:14px 0 10px;overflow:hidden;border-radius:8px;background:#163247}
    .calibration-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--blue),var(--green));transition:width .3s}
    .calibration-counts{color:var(--blue-soft);font-weight:800}
    .engineering{margin-top:14px;text-align:left;color:#9db3c3;font-size:12px;line-height:1.55}.engineering summary{cursor:pointer;color:#bcd5e4;font-weight:800}.engineering pre{white-space:pre-wrap;font:inherit}
    .footnote{margin:18px 4px 0;color:#6f8799;font-size:12px;line-height:1.5}
    .framing-card{margin-top:22px}
    .framing-layout{display:grid;grid-template-columns:260px 1fr;gap:28px;align-items:center}
    .framing-pad{position:relative;width:240px;height:240px;margin:auto;border:2px solid #4283a8;border-radius:50%;background:radial-gradient(circle,#164569,#071827);touch-action:none;user-select:none;cursor:grab;outline-offset:5px}
    .framing-pad::before,.framing-pad::after{content:'';position:absolute;background:#38657d;pointer-events:none}
    .framing-pad::before{width:1px;height:90%;top:5%;left:50%}
    .framing-pad::after{height:1px;width:90%;left:5%;top:50%}
    .framing-pad[aria-disabled=true]{opacity:.4;cursor:not-allowed}
    .framing-knob{position:absolute;left:calc(50% - 30px);top:calc(50% - 30px);width:60px;height:60px;border:2px solid #a7e3ff;border-radius:50%;background:linear-gradient(#3287ba,#104362);box-shadow:0 5px 18px #0008;pointer-events:none;z-index:1}
    .framing-directions{display:flex;justify-content:center;gap:6px;margin-top:14px}
    .framing-directions button{min-width:50px;min-height:48px;touch-action:none}
    .framing-button,.framing-speed{border:1px solid #4382a5;border-radius:9px;background:#0a293f;color:white;padding:12px;cursor:pointer}
    .framing-button:disabled{opacity:.4;cursor:not-allowed}
    .framing-stop{border-color:#d77777;color:#ffd1d1;margin-left:8px}
    .framing-readouts{display:flex;gap:25px;margin:20px 0;font-variant-numeric:tabular-nums}
    .framing-readouts strong{display:block;margin-top:6px;font-size:24px;color:var(--blue-soft)}
    #framingStatus{min-height:48px;line-height:1.5;margin:16px 0}
    @media(max-width:600px){.framing-layout{grid-template-columns:1fr}.framing-stop{margin:8px 0 0}.framing-button{min-height:48px}}
    @media(max-width:700px){
      .statusbar{grid-template-columns:repeat(2,1fr)}
      .airportgrid{grid-template-columns:repeat(2,1fr)}
      .priority-grid{grid-template-columns:1fr}
    }
    @media(max-width:430px){
      .airportgrid{grid-template-columns:1fr}
      .pinrow{align-items:stretch;flex-direction:column}
      .pinrow input{width:100%}
      .lock-status{text-align:center}
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="tower" aria-hidden="true">
      <svg viewBox="0 0 40 40"><path d="M13 10h14l3 6H10l3-6Z"/><path d="M14 16h12l-2 7h-8l-2-7Z"/><path d="M17 23h6l3 14H14l3-14Z"/><path d="M8 37h24"/><path d="M20 5v5"/><path d="M17 5h6"/></svg>
    </div>
    <div>
      <h1>MikeAircraft Control Panel</h1>
      <p class="subtitle">Broadcast settings from your laptop</p>
    </div>
  </header>

  <main>
    <section class="statusbar" aria-label="Control status">
      <div class="statusitem">
        <span class="statuslabel">SELECTED AIRPORT</span>
        <span id="currentAirport" class="statusvalue">---</span>
      </div>
      <div class="statusitem">
        <span class="statuslabel">SETTINGS MEMORY</span>
        <span id="memoryStatus" class="statusvalue warn">CHECKING</span>
      </div>
      <div class="statusitem">
        <span class="statuslabel">CONTROL PANEL</span>
        <span id="panelStatus" class="statusvalue good">READY</span>
      </div>
      <div class="statusitem">
        <span class="statuslabel">LIVE PRIORITY</span>
        <span id="priorityStatus" class="statusvalue good">AUTO</span>
      </div>
    </section>

    <section class="card">
      <div class="cardhead">
        <h2>Airport</h2>
        <p>Enter your private PIN, then choose the airport for MikeAircraft.</p>
      </div>
      <div class="cardbody">
        <div class="pinrow">
          <input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Private control PIN" aria-label="Private control PIN">
          <span id="lockStatus" class="lock-status">LOCKED</span>
        </div>
        <div id="airportGrid" class="airportgrid" aria-label="Available airports"></div>
        <div id="message" role="status" aria-live="polite">Loading the saved setting…</div>
      </div>
    </section>

    <section class="card priority-card">
      <div class="cardhead">
        <h2>Live Aircraft Priority</h2>
        <p>Use the PIN above to change which live movement gets the ribbon. A manual choice returns to AUTO after two minutes.</p>
      </div>
      <div class="cardbody">
        <div class="priority-grid" aria-label="Live aircraft priority">
          <button class="priority-button" type="button" data-priority="AUTO">AUTO</button>
          <button class="priority-button" type="button" data-priority="ARRIVAL">ARRIVAL PRIORITY</button>
          <button class="priority-button" type="button" data-priority="TAKEOFF">TAKEOFF PRIORITY</button>
          <button class="priority-button" type="button" data-priority="RUNWAY">RUNWAY NOW</button>
        </div>
        <div id="priorityMessage" role="status" aria-live="polite">Automatic selection is active.</div>
      </div>
    </section>

    <section class="card location-card">
      <div class="cardhead">
        <h2>Camera Location</h2>
        <p>Take this laptop or phone beside the camera, then reset its position for aircraft tracking.</p>
      </div>
      <div class="cardbody">
        <div class="location-summary">
          <span class="location-label">CAMERA POSITION</span>
          <span id="cameraLocationStatus" class="location-value warn">CHECKING</span>
        </div>
        <div class="location-summary"><span class="location-label">HEADING</span><span id="headingStatus" class="location-value warn">NOT READY</span></div>
        <div class="location-summary"><span class="location-label">ELEVATION</span><span id="elevationStatus" class="location-value warn">NOT READY</span></div>
        <div id="calibrationTarget" class="calibration-target" aria-hidden="true">
          <div class="crosshair" aria-hidden="true"></div>
          <div id="calibrationState" class="calibration-state">ACQUIRING</div>
          <p class="calibration-instruction">Hold this crosshair against the defined camera lens reference point and keep the phone stationary.</p>
          <div class="calibration-progress"><span id="calibrationProgress"></span></div>
          <div id="calibrationCounts" class="calibration-counts">0 fresh fixes · 0 seconds</div>
          <details class="engineering"><summary>Engineering details</summary><pre id="calibrationEngineering">Waiting for fresh fixes.</pre></details>
        </div>
        <button id="resetLocationButton" class="location-button" type="button">AUTO CALIBRATE CAMERA POSITION</button>
        <div id="locationMessage" role="status" aria-live="polite">The exact coordinates are stored privately and are not shown on the public overlay.</div>
        <p class="location-note">For the best result, allow precise location and keep the device beside the camera while the position is captured.</p>
      </div>
    </section>

    <section class="card framing-card" aria-labelledby="framingTitle">
      <div class="cardhead">
        <h2 id="framingTitle">Camera Framing Joystick</h2>
        <p>Adjust the aircraft’s framing while automatic tracking continues. Release to keep the correction. Tower HOME is unchanged.</p>
      </div>
      <div class="cardbody framing-layout">
        <div>
          <div id="framingPad" class="framing-pad" tabindex="0" role="group" aria-label="Camera framing joystick. Drag or use arrow keys: right pans right, up tilts up." aria-disabled="true" aria-describedby="framingStatus">
            <span id="framingKnob" class="framing-knob"></span>
          </div>
          <div class="framing-directions" aria-label="Camera direction buttons">
            <button type="button" class="framing-button" data-frame-direction="ArrowLeft" aria-label="Pan camera left" disabled>←</button>
            <button type="button" class="framing-button" data-frame-direction="ArrowUp" aria-label="Tilt camera up" disabled>↑</button>
            <button type="button" class="framing-button" data-frame-direction="ArrowDown" aria-label="Tilt camera down" disabled>↓</button>
            <button type="button" class="framing-button" data-frame-direction="ArrowRight" aria-label="Pan camera right" disabled>→</button>
          </div>
        </div>
        <div>
          <span class="statuslabel">TRACKED AIRCRAFT</span><strong id="framingTarget">No aircraft</strong>
          <div class="framing-readouts">
            <div><span class="statuslabel">PAN CORRECTION</span><strong id="framingPan">+0.00°</strong></div>
            <div><span class="statuslabel">TILT CORRECTION</span><strong id="framingTilt">+0.00°</strong></div>
          </div>
          <label for="framingSpeed">Adjustment speed </label>
          <select id="framingSpeed" class="framing-speed"><option value="fine">Fine</option><option value="normal">Normal</option></select>
          <p id="framingStatus" role="status" aria-live="polite">Not connected. The Pi joystick-enabled tracker must be running first.</p>
          <button type="button" id="framingConnect" class="framing-button">CONNECT JOYSTICK</button>
          <button type="button" id="framingStop" class="framing-button framing-stop" disabled>REQUEST STOP</button>
          <p class="location-note">Uses your private PIN above. Corrections are limited to ±5° for this run and start at zero on every new run. Readouts show corrections accepted by the controller, not visually verified framing. One small in-flight adjustment may settle after release. Network STOP is not a substitute for the gimbal’s physical stop.</p>
        </div>
      </div>
    </section>
    <p class="footnote">The YoloBox remains display-only. Airport and camera settings are controlled here.</p>
  </main>

  <script src="/camera-position.js"></script>
  <script src="/camera-orientation.js"></script>
  <script>
    const pinInput = document.getElementById("pin");
    const lockStatus = document.getElementById("lockStatus");
    const grid = document.getElementById("airportGrid");
    const message = document.getElementById("message");
    const currentAirport = document.getElementById("currentAirport");
    const memoryStatus = document.getElementById("memoryStatus");
    const panelStatus = document.getElementById("panelStatus");
    const priorityStatus = document.getElementById("priorityStatus");
    const priorityMessage = document.getElementById("priorityMessage");
    const priorityButtons = Array.from(document.querySelectorAll("[data-priority]"));
    const cameraLocationStatus = document.getElementById("cameraLocationStatus");
    const resetLocationButton = document.getElementById("resetLocationButton");
    const locationMessage = document.getElementById("locationMessage");
    const calibrationTarget = document.getElementById("calibrationTarget");
    const calibrationState = document.getElementById("calibrationState");
    const calibrationProgress = document.getElementById("calibrationProgress");
    const calibrationCounts = document.getElementById("calibrationCounts");
    const calibrationEngineering = document.getElementById("calibrationEngineering");
    const headingStatus = document.getElementById("headingStatus");
    const elevationStatus = document.getElementById("elevationStatus");

    let selectedAirport = null;
    let airports = [];
    let busy = false;
    let locationBusy = false;
    let priorityBusy = false;
    let priorityMode = "AUTO";
    let priorityUntil = null;
    let locationWatchId = null;
    let locationTimer = null;
    let calibrationSession = null;
    let orientationSession = null;
    let orientationListener = null;
    let orientationReason = "Orientation has not been requested.";

    const pinStorageKey = "mikeaircraft-control-pin";
    pinInput.value = sessionStorage.getItem(pinStorageKey) || "";

    function setLockStatus(unlocked) {
      lockStatus.textContent = unlocked ? "UNLOCKED" : "LOCKED";
      lockStatus.className = "lock-status" + (unlocked ? " unlocked" : "");
    }

    function rememberPin(pin) {
      sessionStorage.setItem(pinStorageKey, pin);
      pinInput.value = pin;
      setLockStatus(true);
    }

    function forgetPin() {
      sessionStorage.removeItem(pinStorageKey);
      pinInput.value = "";
      setLockStatus(false);
    }

    setLockStatus(Boolean(pinInput.value));

    function setMessage(text, tone) {
      message.textContent = text;
      message.className = tone || "";
    }

    function setLocationMessage(text, tone) {
      locationMessage.textContent = text;
      locationMessage.className = tone || "";
    }

    function renderPriority() {
      const untilMs = Date.parse(priorityUntil || "");
      const remaining = Number.isFinite(untilMs) ? Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)) : 0;
      if (priorityMode !== "AUTO" && remaining <= 0) {
        priorityMode = "AUTO";
        priorityUntil = null;
      }

      priorityButtons.forEach((button) => {
        const active = button.dataset.priority === priorityMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.disabled = priorityBusy;
      });

      priorityStatus.textContent = priorityMode === "AUTO" ? "AUTO" : priorityMode + " " + remaining + "s";
      priorityStatus.className = "statusvalue " + (priorityMode === "AUTO" ? "good" : "warn");
      if (!priorityBusy) {
        priorityMessage.textContent = priorityMode === "AUTO"
          ? "Automatic selection is active."
          : (priorityMode === "ARRIVAL" ? "Arrival" : priorityMode === "RUNWAY" ? "Runway" : "Takeoff") + " priority is active for " + remaining + " seconds.";
        priorityMessage.className = priorityMode === "AUTO" ? "" : "warn";
      }
    }

    function setLocationStatus(configured, updatedAt) {
      cameraLocationStatus.textContent = configured ? "SAVED" : "NOT SET";
      cameraLocationStatus.className = "location-value " + (configured ? "good" : "warn");
      cameraLocationStatus.title = configured && updatedAt
        ? "Saved " + new Date(updatedAt).toLocaleString()
        : "No camera position has been saved";
    }

    function renderAirports() {
      grid.innerHTML = "";

      airports.forEach((airport) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "airport" + (airport.code === selectedAirport ? " active" : "");
        button.disabled = busy;
        button.setAttribute("aria-pressed", airport.code === selectedAirport ? "true" : "false");
        button.innerHTML =
          '<span class="code">' + airport.code + '</span>' +
          '<span class="name">' + airport.name + '</span>' +
          '<span class="icao">' + airport.icao + '</span>';
        button.addEventListener("click", () => saveAirport(airport.code));
        grid.appendChild(button);
      });
    }

    async function loadSettings() {
      panelStatus.textContent = "LOADING";
      panelStatus.className = "statusvalue warn";

      try {
        const response = await fetch("/api/settings?t=" + Date.now(), { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Settings request failed");
        }

        airports = Array.isArray(data.supportedAirports) ? data.supportedAirports : [];
        selectedAirport = data.settings?.airport || "PRG";
        currentAirport.textContent = selectedAirport;
        currentAirport.className = "statusvalue good";

        const redisConnected = Boolean(data.persistence?.redisConnected);
        memoryStatus.textContent = redisConnected ? "CONNECTED" : "NOT CONNECTED";
        memoryStatus.className = "statusvalue " + (redisConnected ? "good" : "bad");
        panelStatus.textContent = "READY";
        panelStatus.className = "statusvalue good";
        setLocationStatus(
          Boolean(data.settings?.cameraLocationConfigured),
          data.settings?.cameraLocationUpdatedAt || null
        );
        priorityMode = data.settings?.priorityMode || "AUTO";
        priorityUntil = data.settings?.priorityUntil || null;
        renderPriority();
        setMessage(redisConnected ? "Choose an airport when you are ready." : "Redis is unavailable; airport changes cannot be saved.", redisConnected ? "" : "bad");
        renderAirports();
      }
      catch (error) {
        panelStatus.textContent = "ERROR";
        panelStatus.className = "statusvalue bad";
        memoryStatus.textContent = "UNKNOWN";
        memoryStatus.className = "statusvalue bad";
        cameraLocationStatus.textContent = "UNKNOWN";
        cameraLocationStatus.className = "location-value bad";
        setMessage(error.message, "bad");
      }
    }

    async function saveAirport(code) {
      if (busy || code === selectedAirport) {
        return;
      }

      const pin = pinInput.value.trim();

      if (!pin) {
        pinInput.focus();
        setMessage("Enter your private control PIN first.", "warn");
        return;
      }

      busy = true;
      panelStatus.textContent = "SAVING";
      panelStatus.className = "statusvalue warn";
      setMessage("Changing airport to " + code + "…", "warn");
      renderAirports();

      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-MikeAircraft-Control-Pin": pin
          },
          body: JSON.stringify({ airport: code })
        });

        const data = await response.json();

        if (response.status === 401) forgetPin();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Airport change failed");
        }

        selectedAirport = data.settings.airport;
        currentAirport.textContent = selectedAirport;
        currentAirport.className = "statusvalue good";
        panelStatus.textContent = "SAVED";
        panelStatus.className = "statusvalue good";
        setMessage(selectedAirport + " is now the saved airport.", "good");
        rememberPin(pin);
      }
      catch (error) {
        panelStatus.textContent = "ERROR";
        panelStatus.className = "statusvalue bad";
        setMessage(error.message, "bad");
      }
      finally {
        busy = false;
        renderAirports();
      }
    }

    async function savePriority(mode) {
      if (priorityBusy || mode === priorityMode) return;

      let priorityError = null;

      const pin = pinInput.value.trim();
      if (!pin) {
        pinInput.focus();
        priorityMessage.textContent = "Enter your private control PIN above first.";
        priorityMessage.className = "warn";
        return;
      }

      priorityBusy = true;
      panelStatus.textContent = "SAVING";
      panelStatus.className = "statusvalue warn";
      priorityMessage.textContent = "Changing live priority…";
      priorityMessage.className = "warn";
      renderPriority();

      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-MikeAircraft-Control-Pin": pin
          },
          body: JSON.stringify({ priorityMode: mode })
        });
        const data = await response.json();
        if (response.status === 401) forgetPin();
        if (!response.ok || !data.ok) throw new Error(data.error || "Priority change failed");

        priorityMode = data.settings?.priorityMode || "AUTO";
        priorityUntil = data.settings?.priorityUntil || null;
        panelStatus.textContent = "SAVED";
        panelStatus.className = "statusvalue good";
        rememberPin(pin);
      }
      catch (error) {
        priorityError = error.message;
        panelStatus.textContent = "ERROR";
        panelStatus.className = "statusvalue bad";
      }
      finally {
        priorityBusy = false;
        renderPriority();
        if (priorityError) {
          priorityMessage.textContent = priorityError;
          priorityMessage.className = "bad";
        }
      }
    }

    function locationErrorMessage(error) {
      if (error && error.code === 1) {
        return "Location permission was denied. Allow precise location for this site, then try again.";
      }
      if (error && error.code === 2) {
        return "Your device could not determine its location. Move beside a window or use a phone, then try again.";
      }
      if (error && error.code === 3) {
        return "Location capture timed out. Keep the device beside the camera and try again.";
      }
      return "The camera location could not be captured.";
    }

    function stopLocationWatch() {
      if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
      if (locationTimer !== null) clearInterval(locationTimer);
      locationWatchId = null;
      locationTimer = null;
      if (orientationListener) window.removeEventListener("deviceorientation", orientationListener, true);
      orientationListener = null;
    }

    function renderOrientation() {
      const snapshot = orientationSession ? orientationSession.snapshot() : { ready: false, reason: orientationReason };
      headingStatus.textContent = snapshot.ready ? snapshot.homeTrueAzimuthDeg.toFixed(1) + "° TRUE" : "NOT READY";
      elevationStatus.textContent = snapshot.ready ? (snapshot.homeElevationDeg >= 0 ? "+" : "") + snapshot.homeElevationDeg.toFixed(1) + "°" : "NOT READY";
      headingStatus.className = "location-value " + (snapshot.ready ? "good" : "warn");
      elevationStatus.className = "location-value " + (snapshot.ready ? "good" : "warn");
      headingStatus.title = elevationStatus.title = snapshot.reason || (snapshot.sampleCount + " stable samples");
      return snapshot;
    }

    function renderCalibration(snapshot) {
      const estimate = snapshot.estimate;
      calibrationState.textContent = snapshot.state;
      calibrationState.className = "calibration-state " + (snapshot.state === "GOOD" ? "good" : snapshot.state.indexOf("POOR") === 0 ? "bad" : "warn");
      calibrationProgress.style.width = Math.min(100, snapshot.elapsedSeconds / 90 * 100) + "%";
      calibrationCounts.textContent = snapshot.totalCount + " fresh fixes · " + Math.floor(snapshot.elapsedSeconds) + " seconds";
      calibrationEngineering.textContent = estimate
        ? "Accepted: " + estimate.acceptedCount + " / " + snapshot.totalCount +
          "\\nDuplicate timestamps: " + snapshot.duplicateCount + " · stale: " + snapshot.staleCount +
          "\\nPhone reported accuracy: ±" + estimate.reportedAccuracyM.toFixed(1) + " m" +
          "\\nObserved RMS spread: " + estimate.observedSpreadM.toFixed(1) + " m" +
          "\\n95% cluster radius: " + estimate.clusterRadius95M.toFixed(1) + " m" +
          "\\nLast-30-second centre movement: " + (estimate.centreMovement30sM === null ? "calculating" : estimate.centreMovement30sM.toFixed(1) + " m") +
          "\\nConservative uncertainty: ±" + estimate.horizontalUncertaintyM.toFixed(1) + " m · " + estimate.grade
        : "Waiting for enough fresh fixes to estimate the position cluster.";
    }

    async function saveCameraLocation(snapshot) {
      const pin = pinInput.value.trim();
      const estimate = snapshot.estimate;
      const orientation = renderOrientation();

      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-MikeAircraft-Control-Pin": pin
          },
          body: JSON.stringify({
            cameraLocation: {
              lat: estimate.lat,
              lon: estimate.lon,
              horizontalUncertaintyM: estimate.horizontalUncertaintyM,
              phoneReportedAccuracyM: estimate.reportedAccuracyM,
              observedSpreadM: estimate.observedSpreadM,
              clusterRadius95M: estimate.clusterRadius95M,
              centreMovement30sM: estimate.centreMovement30sM,
              altitudeM: estimate.altitudeM,
              altitudeAccuracyM: estimate.altitudeAccuracyM,
              sampleCountTotal: snapshot.totalCount,
              sampleCountAccepted: estimate.acceptedCount,
              sampleCountRejected: estimate.rejectedCount,
              duplicateTimestampCount: snapshot.duplicateCount,
              staleTimestampCount: snapshot.staleCount,
              calibrationStartedAt: snapshot.startedAt,
              calibrationCompletedAt: new Date().toISOString(),
              calibrationReferencePoint: "PHONE_CROSSHAIR_AT_CAMERA_LENS_REFERENCE",
              grade: estimate.grade
              ,orientation: orientation.ready ? {
                homeTrueAzimuthDeg: orientation.homeTrueAzimuthDeg,
                homeElevationDeg: orientation.homeElevationDeg,
                headingOffsetDeg: orientation.headingOffsetDeg,
                elevationOffsetDeg: orientation.elevationOffsetDeg,
                headingSpreadDeg: orientation.headingSpreadDeg,
                elevationSpreadDeg: orientation.elevationSpreadDeg,
                sampleCount: orientation.sampleCount,
                calibratedAt: new Date().toISOString()
              } : null
            }
          })
        });

        const data = await response.json();

        if (response.status === 401) forgetPin();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Camera location save failed");
        }

        const accuracy = Number(data.cameraLocation?.accuracyM);
        const accuracyText = Number.isFinite(accuracy) ? " ±" + Math.round(accuracy) + "m" : "";
        cameraLocationStatus.textContent = "POSITION CALIBRATED" + accuracyText;
        cameraLocationStatus.className = "location-value " + (estimate.grade === "AMBER" ? "warn" : "good");
        cameraLocationStatus.title = data.cameraLocation?.updatedAt
          ? "Saved " + new Date(data.cameraLocation.updatedAt).toLocaleString()
          : "Camera position saved";

        setLocationMessage("POSITION CALIBRATED" + accuracyText + " · " + estimate.grade + ".", estimate.grade === "AMBER" ? "warn" : "good");
        rememberPin(pin);
      }
      catch (error) {
        cameraLocationStatus.textContent = "NOT SAVED";
        cameraLocationStatus.className = "location-value bad";
        setLocationMessage(error.message, "bad");
      }
      finally {
        locationBusy = false;
        resetLocationButton.disabled = false;
        resetLocationButton.textContent = "AUTO CALIBRATE CAMERA POSITION";
      }
    }

    function completeCalibration(force) {
      if (!locationBusy || !calibrationSession) return;
      const snapshot = calibrationSession.snapshot();
      renderCalibration(snapshot);
      if (!snapshot.acceptanceMet || !snapshot.estimate) {
        if (!force) return;
        stopLocationWatch();
        locationBusy = false;
        resetLocationButton.disabled = false;
        resetLocationButton.textContent = "TRY AUTO CALIBRATE AGAIN";
        cameraLocationStatus.textContent = "CALIBRATION CONFLICT";
        cameraLocationStatus.className = "location-value bad";
        setLocationMessage("CALIBRATION CONFLICT — the required fix count, accuracy, cluster, outlier, or stability conditions were not met in 180 seconds, so the previous saved position was preserved.", "bad");
        return;
      }
      if (snapshot.estimate.grade === "REJECT") {
        if (!force) return;
        stopLocationWatch();
        locationBusy = false;
        resetLocationButton.disabled = false;
        resetLocationButton.textContent = "TRY AUTO CALIBRATE AGAIN";
        cameraLocationStatus.textContent = "CALIBRATION CONFLICT";
        cameraLocationStatus.className = "location-value bad";
        setLocationMessage("CALIBRATION CONFLICT — uncertainty remained above 20 m, so the previous saved position was preserved.", "bad");
        return;
      }
      if (!force && !snapshot.acceptanceMet) return;
      stopLocationWatch();
      calibrationState.textContent = "POSITION CALIBRATED";
      calibrationState.className = "calibration-state good";
      saveCameraLocation(snapshot);
    }

    async function resetCameraLocation() {
      if (locationBusy) {
        return;
      }

      if (!pinInput.value.trim()) {
        pinInput.focus();
        setLocationMessage("Enter your private control PIN first.", "warn");
        return;
      }

      if (!navigator.geolocation) {
        setLocationMessage("This browser does not support location capture. Open the Control Panel on a phone or modern browser.", "bad");
        return;
      }

      orientationSession = CameraOrientationCalibration.createSession({ headingDeg: 0, elevationDeg: 0 });
      const orientationPermission = await CameraOrientationCalibration.requestPermission(window);
      if (orientationPermission.granted) {
        orientationListener = (event) => { orientationSession.add(event); renderOrientation(); };
        window.addEventListener("deviceorientation", orientationListener, true);
        orientationReason = "Waiting for iPhone orientation readings.";
      } else {
        orientationReason = orientationPermission.reason;
        orientationSession.unavailable(orientationReason);
      }
      renderOrientation();

      locationBusy = true;
      resetLocationButton.disabled = true;
      resetLocationButton.textContent = "CALIBRATING — KEEP PHONE STILL";
      cameraLocationStatus.textContent = "ACQUIRING";
      cameraLocationStatus.className = "location-value warn";
      calibrationTarget.classList.add("active");
      calibrationTarget.setAttribute("aria-hidden", "false");
      calibrationSession = CameraPositionCalibration.createSession(Date.now());
      setLocationMessage("Keep the crosshair against the camera reference point. Collection takes at least 60 seconds and continues up to 180 seconds if needed.", "warn");

      locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          calibrationSession.add(position, Date.now());
          const snapshot = calibrationSession.snapshot();
          renderCalibration(snapshot);
          cameraLocationStatus.textContent = snapshot.state;
          if (snapshot.acceptanceMet) completeCalibration(false);
        },
        (error) => {
          stopLocationWatch();
          locationBusy = false;
          resetLocationButton.disabled = false;
          resetLocationButton.textContent = "TRY AUTO CALIBRATE AGAIN";
          cameraLocationStatus.textContent = "NOT SAVED";
          cameraLocationStatus.className = "location-value bad";
          setLocationMessage(locationErrorMessage(error), "bad");
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
      locationTimer = setInterval(() => {
        const snapshot = calibrationSession.snapshot();
        renderCalibration(snapshot);
        cameraLocationStatus.textContent = snapshot.state;
        if (snapshot.elapsedSeconds >= 180) completeCalibration(true);
        else if (snapshot.acceptanceMet) completeCalibration(false);
      }, 1000);
    }

    resetLocationButton.addEventListener("click", resetCameraLocation);
    pinInput.addEventListener("input", () => {
      setLockStatus(Boolean(pinInput.value) && pinInput.value === sessionStorage.getItem(pinStorageKey));
    });
    priorityButtons.forEach((button) => {
      button.addEventListener("click", () => savePriority(button.dataset.priority));
    });
    setInterval(renderPriority, 1000);

    loadSettings();
  </script>
  <script src="/control-joystick.js" defer></script>
</body>
</html>`;

  return res.status(200).send(html);
};
