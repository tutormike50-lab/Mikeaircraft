module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const calibrationPage = req.query?.page === "calibration";
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
    .page-nav{display:flex;gap:10px;margin-bottom:22px}.page-nav a{padding:11px 14px;border:1px solid #346483;border-radius:10px;color:var(--blue-soft);text-decoration:none;font-weight:800}.page-nav a[aria-current=page]{border-color:var(--green);color:var(--green);background:#0b3b42}
    .normal-page .calibration-only,.calibration-page .operations-only{display:none}
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
    .tracker-card{margin-bottom:22px;border-color:#2e7ca3}
    .tracker-status{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
    .tracker-button{width:100%;min-height:96px;padding:20px;border:2px solid #82eab0;border-radius:15px;background:linear-gradient(135deg,#13804d,#075f3a);color:white;cursor:pointer;font-size:clamp(22px,5vw,34px);font-weight:950;letter-spacing:1px;box-shadow:0 12px 35px rgba(24,160,92,.24)}
    .tracker-button:hover{background:linear-gradient(135deg,#18a562,#087247)}
    .tracker-button.stop{border-color:#ff9a9a;background:linear-gradient(135deg,#a82f39,#751e28);box-shadow:0 12px 35px rgba(196,52,65,.22)}
    .tracker-button.starting{border-color:var(--amber);background:linear-gradient(135deg,#936319,#65410b)}
    .tracker-button:disabled{cursor:wait;opacity:.68}
    .tracker-detail{margin:13px 2px 0;color:#9bb2c2;font-size:12px;line-height:1.45}
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
    .zoom-card{margin-top:22px;border-color:#2e7ca3}.zoom-scale{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;font-weight:900}.zoom-slider{width:100%;height:52px;accent-color:var(--green);cursor:pointer;touch-action:pan-y}.zoom-readouts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px}.zoom-readouts div{padding:13px;border:1px solid #294f69;border-radius:10px;background:#081a29}.zoom-readouts strong{display:block;margin-top:5px;color:var(--blue-soft);font-size:20px;font-variant-numeric:tabular-nums}.zoom-mode{margin-top:16px;padding:11px;border:1px solid #4382a5;border-radius:9px;background:#0a293f;color:white}.zoom-message{min-height:22px;margin-top:12px;color:#9db3c3;font-size:13px}
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
    @media(max-width:600px){.framing-layout{grid-template-columns:1fr}.framing-stop{margin:8px 0 0}.framing-button{min-height:48px}.zoom-readouts{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:700px){
      .statusbar{grid-template-columns:repeat(2,1fr)}
      .tracker-status{grid-template-columns:1fr}
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
<body class="${calibrationPage ? "calibration-page" : "normal-page"}">
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
    <nav class="page-nav" aria-label="Control Panel pages"><a href="/api/control" ${calibrationPage ? "" : "aria-current=\"page\""}>Field Controls</a><a href="/api/camera-calibration" ${calibrationPage ? "aria-current=\"page\"" : ""}>Camera Calibration</a></nav>
    <section class="card" style="margin-bottom:22px">
      <div class="cardbody">
        <div class="pinrow" style="margin-bottom:0">
          <input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Private control PIN — first use only" aria-label="Private control PIN">
          <span id="lockStatus" class="lock-status">CHECKING</span>
        </div>
      </div>
    </section>
    <section class="statusbar operations-only" aria-label="Control status">
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

    <section class="card tracker-card operations-only" aria-labelledby="trackerTitle">
      <div class="cardhead">
        <h2 id="trackerTitle">Production Tracking</h2>
        <p>Start or safely stop the tracker through the outbound Pi Bridge.</p>
      </div>
      <div class="cardbody">
        <div class="tracker-status" aria-label="Tracker status">
          <div class="statusitem"><span class="statuslabel">RASPBERRY PI</span><span id="trackerPiStatus" class="statusvalue warn">CHECKING</span></div>
          <div class="statusitem"><span class="statuslabel">TRACKER</span><span id="trackerProcessStatus" class="statusvalue warn">CHECKING</span></div>
          <div class="statusitem"><span class="statuslabel">CURRENT AIRCRAFT</span><span id="trackerAircraft" class="statusvalue">NONE</span></div>
          <div class="statusitem"><span class="statuslabel">SERVER VERSION</span><span id="serverVersion" class="statusvalue">---</span></div>
          <div class="statusitem"><span class="statuslabel">PI VERSION</span><span id="piVersion" class="statusvalue">---</span></div>
          <div class="statusitem"><span class="statuslabel">VERSION MATCH</span><span id="versionMatch" class="statusvalue warn">UNKNOWN</span></div>
          <div class="statusitem"><span class="statuslabel">BRIDGE HEALTH</span><span id="bridgeHealth" class="statusvalue warn">UNKNOWN</span></div>
          <div class="statusitem"><span class="statuslabel">TRACKER HEALTH</span><span id="trackerHealth" class="statusvalue warn">UNKNOWN</span></div>
        </div>
        <button id="trackerButton" class="tracker-button" type="button" disabled>▶ START TRACKING</button>
        <p id="trackerDetail" class="tracker-detail" role="status" aria-live="polite">Checking Pi Bridge heartbeat…</p>
      </div>
    </section>

    <section class="card operations-only">
      <div class="cardhead">
        <h2>Airport</h2>
        <p>Choose the airport for MikeAircraft. This trusted browser stays signed in after the first PIN entry.</p>
      </div>
      <div class="cardbody">
        <div id="airportGrid" class="airportgrid" aria-label="Available airports"></div>
        <div id="message" role="status" aria-live="polite">Loading the saved setting…</div>
      </div>
    </section>

    <section class="card priority-card operations-only">
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

    <section class="card zoom-card operations-only" aria-labelledby="cameraZoomTitle">
      <div class="cardhead"><h2 id="cameraZoomTitle">Camera Zoom</h2><p>Match this manual estimate to the Canon XA60 optical zoom. It changes framing diagnostics only, never aircraft pointing.</p></div>
      <div class="cardbody">
        <div class="zoom-scale"><span>WIDE · 0 ZOOM</span><span>TELE · ~600 mm</span></div>
        <input id="cameraZoom" class="zoom-slider" type="range" min="0" max="1" step="0.001" value="0" aria-label="Camera optical zoom from wide to telephoto">
        <div class="zoom-readouts">
          <div><span class="statuslabel">ZOOM</span><strong id="zoomPercent">0%</strong></div>
          <div><span class="statuslabel">EQUIVALENT</span><strong id="zoomFocal">30.5 mm</strong></div>
          <div><span class="statuslabel">HFOV</span><strong id="zoomHfov">63.45°</strong></div>
          <div><span class="statuslabel">VFOV</span><strong id="zoomVfov">38.35°</strong></div>
        </div>
        <label for="stabilisationMode" class="statuslabel" style="margin-top:16px">STABILISATION MODE</label>
        <select id="stabilisationMode" class="zoom-mode"><option value="STANDARD_OR_OFF">Standard IS / IS off</option><option value="DYNAMIC">Dynamic IS</option></select>
        <p id="zoomMessage" class="zoom-message" role="status" aria-live="polite">Source MANUAL · confidence ESTIMATED</p>
      </div>
    </section>

    <section class="card location-card calibration-only">
      <div class="cardhead">
        <h2>Camera Calibration</h2>
        <p>Take this phone beside the camera to calibrate its position, true heading and elevation.</p>
      </div>
      <div class="cardbody">
        <div class="location-summary">
          <span class="location-label">POSITION</span>
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

    <section class="card framing-card operations-only" aria-labelledby="framingTitle">
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
          <button type="button" id="framingReset" class="framing-button" disabled>CENTRE TRIM</button>
          <button type="button" id="framingStop" class="framing-button framing-stop" disabled>REQUEST STOP</button>
          <p class="location-note">Corrections are gently rate-limited and bounded to ±5° for this run. Release retains the trim; CENTRE TRIM smoothly returns it to zero. AUTO tracking remains authoritative and Tower HOME is unchanged. Network STOP is not a substitute for the gimbal’s physical stop.</p>
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
    const cameraZoom = document.getElementById("cameraZoom");
    const stabilisationMode = document.getElementById("stabilisationMode");
    const zoomPercent = document.getElementById("zoomPercent");
    const zoomFocal = document.getElementById("zoomFocal");
    const zoomHfov = document.getElementById("zoomHfov");
    const zoomVfov = document.getElementById("zoomVfov");
    const zoomMessage = document.getElementById("zoomMessage");

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
    let persistedCameraReference = null;
    let orientationListener = null;
    let orientationReason = "Orientation has not been requested.";

    let sessionUnlocked = false;

    function setLockStatus(unlocked) {
      lockStatus.textContent = unlocked ? "TRUSTED BROWSER" : "LOCKED";
      lockStatus.className = "lock-status" + (unlocked ? " unlocked" : "");
      pinInput.hidden = unlocked;
    }

    function rememberPin(pin) {
      sessionUnlocked = true;
      pinInput.value = "";
      setLockStatus(true);
    }

    function forgetPin() {
      sessionUnlocked = false;
      pinInput.value = "";
      setLockStatus(false);
    }

    async function ensureAuthentication() {
      if (sessionUnlocked) return true;
      const pin = pinInput.value.trim();
      if (!pin) { pinInput.focus(); return false; }
      const response = await fetch("/api/control-session", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Sign-in failed");
      rememberPin(pin);
      return true;
    }
    window.ensureControlAuthentication = ensureAuthentication;

    async function loadAuthentication() {
      try {
        const response = await fetch("/api/control-session", { cache: "no-store" });
        sessionUnlocked = response.ok;
      } catch { sessionUnlocked = false; }
      setLockStatus(sessionUnlocked);
    }

    setLockStatus(false);

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
      cameraLocationStatus.textContent = configured ? "POSITION READY" : "NOT SET";
      cameraLocationStatus.className = "location-value " + (configured ? "good" : "warn");
      cameraLocationStatus.title = configured && updatedAt
        ? "Saved " + new Date(updatedAt).toLocaleString()
        : "No camera position has been saved";
    }

    function renderCameraOptics(optics) {
      const z = Math.max(0, Math.min(1, Number(optics?.slider_position_0_1) || 0));
      const mode = optics?.stabilisation_mode === "DYNAMIC" ? "DYNAMIC" : "STANDARD_OR_OFF";
      const limits = mode === "DYNAMIC" ? [32, 640] : [30.5, 627];
      const focal = limits[0] * Math.pow(limits[1] / limits[0], z);
      const diagonal = Math.hypot(36, 24);
      const width = diagonal * 16 / Math.hypot(16, 9);
      const height = diagonal * 9 / Math.hypot(16, 9);
      const fov = (dimension) => 2 * Math.atan(dimension / (2 * focal)) * 180 / Math.PI;
      cameraZoom.value = z;
      stabilisationMode.value = mode;
      zoomPercent.textContent = Math.round(z * 100) + "%";
      zoomFocal.textContent = focal.toFixed(1) + " mm";
      zoomHfov.textContent = fov(width).toFixed(2) + "°";
      zoomVfov.textContent = fov(height).toFixed(2) + "°";
    }

    async function saveCameraOptics() {
      try {
        if (!await ensureAuthentication()) { zoomMessage.textContent = "Enter your private control PIN once for this browser."; zoomMessage.className = "zoom-message warn"; return; }
        zoomMessage.textContent = "Saving manual optics estimate…";
        const response = await fetch("/api/settings", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cameraOptics: { slider_position_0_1: Number(cameraZoom.value), stabilisation_mode: stabilisationMode.value, timestamp_ms: Date.now() } }) });
        const data = await response.json();
        if (response.status === 401) forgetPin();
        if (!response.ok || !data.ok) throw new Error(data.error || "Camera zoom save failed");
        renderCameraOptics(data.settings.cameraOptics);
        zoomMessage.textContent = "SAVED · source MANUAL · confidence ESTIMATED";
        zoomMessage.className = "zoom-message good";
      } catch (error) { zoomMessage.textContent = error.message; zoomMessage.className = "zoom-message bad"; }
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
        renderCameraOptics(data.settings?.cameraOptics);
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

    async function loadCameraReference() {
      if (!sessionUnlocked) return;
      try {
        const response = await fetch("/api/camera-reference?t=" + Date.now(), { cache: "no-store" });
        const data = await response.json();
        if (response.status === 401) forgetPin();
        if (!response.ok || !data.ok) throw new Error(data.error || "CameraReference request failed");
        persistedCameraReference = data.cameraReference;
        setLocationStatus(true, persistedCameraReference.updatedAt);
        renderOrientation();
      }
      catch (error) {
        if (error.message !== "Complete CameraReference is not calibrated") {
          headingStatus.title = elevationStatus.title = error.message;
        }
      }
    }

    async function saveAirport(code) {
      if (busy || code === selectedAirport) {
        return;
      }

      const pin = pinInput.value.trim();
      try { if (!await ensureAuthentication()) { setMessage("Enter your private control PIN once for this browser.", "warn"); return; } }
      catch (error) { forgetPin(); setMessage(error.message, "bad"); return; }

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
            "Content-Type": "application/json"
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
      try { if (!await ensureAuthentication()) { priorityMessage.textContent = "Enter your private control PIN once for this browser."; priorityMessage.className = "warn"; return; } }
      catch (error) { forgetPin(); priorityMessage.textContent = error.message; priorityMessage.className = "bad"; return; }

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
            "Content-Type": "application/json"
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
      const saved = persistedCameraReference?.orientation;
      const snapshot = orientationSession
        ? orientationSession.snapshot()
        : saved ? { ...saved, ready: Boolean(persistedCameraReference?.readiness?.complete) }
          : { ready: false, reason: orientationReason };
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
      calibrationProgress.style.width = Math.min(100, snapshot.elapsedSeconds / 180 * 100) + "%";
      calibrationCounts.textContent = snapshot.totalCount + " fresh fixes · " + Math.floor(snapshot.elapsedSeconds) + " seconds";
      calibrationEngineering.textContent = estimate
        ? "State: " + snapshot.state + " · elapsed: " + Math.floor(snapshot.elapsedSeconds) + " / 180 s" +
          "\\nFixes received: " + snapshot.receivedCount + " · accepted: " + estimate.acceptedCount + " / " + snapshot.requiredCount + " required · rejected: " + (snapshot.rejectedInputCount + estimate.rejectedCount) +
          "\\nLast rejection: " + snapshot.lastRejectionReason + " · last fix age: " + (snapshot.lastFixAgeSeconds === null ? "none" : snapshot.lastFixAgeSeconds.toFixed(1) + " s") +
          "\\nPhone reported accuracy: ±" + estimate.reportedAccuracyM.toFixed(1) + " m" +
          "\\nObserved RMS spread: " + estimate.observedSpreadM.toFixed(1) + " m" +
          "\\n95% cluster radius: " + estimate.clusterRadius95M.toFixed(1) + " m" +
          "\\nLast-30-second centre movement: " + (estimate.centreMovement30sM === null ? "calculating" : estimate.centreMovement30sM.toFixed(1) + " m") +
          "\\nConservative uncertainty: ±" + estimate.horizontalUncertaintyM.toFixed(1) + " m · " + estimate.grade +
          "\\nBLOCKING: " + snapshot.blockingConditions.join(" · ")
        : "State: " + snapshot.state + " · elapsed: " + Math.floor(snapshot.elapsedSeconds) + " / 180 s" +
          "\\nFixes received: " + snapshot.receivedCount + " · accepted: 0 / " + snapshot.requiredCount + " required · rejected: " + snapshot.rejectedInputCount +
          "\\nLast rejection: " + snapshot.lastRejectionReason +
          "\\nBLOCKING: " + snapshot.blockingCondition;
    }

    async function saveCameraLocation(snapshot) {
      const pin = pinInput.value.trim();
      const estimate = snapshot.estimate;
      const orientation = renderOrientation();

      try {
        if (!orientation.ready) {
          throw new Error("Heading and elevation must both be ready before CameraReference can be saved");
        }
        const response = await fetch("/api/settings", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
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

        persistedCameraReference = data.cameraReference;
        orientationSession = null;
        renderOrientation();

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
      const orientation = renderOrientation();
      renderCalibration(snapshot);
      if (snapshot.acceptanceMet && !orientation.ready) {
        if (!force) return;
        stopLocationWatch();
        locationBusy = false;
        resetLocationButton.disabled = false;
        resetLocationButton.textContent = "TRY AUTO CALIBRATE AGAIN";
        setLocationMessage("HEADING AND ELEVATION NOT READY. The previous complete CameraReference was preserved.", "bad");
        return;
      }
      if (!snapshot.acceptanceMet || !snapshot.estimate) {
        if (!force) return;
        stopLocationWatch();
        locationBusy = false;
        resetLocationButton.disabled = false;
        resetLocationButton.textContent = "TRY AUTO CALIBRATE AGAIN";
        cameraLocationStatus.textContent = snapshot.blockingCondition;
        cameraLocationStatus.className = "location-value bad";
        setLocationMessage(snapshot.blockingCondition + " — " + snapshot.blockingConditions.join(" · ") + ". The previous saved position was preserved.", "bad");
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

      try { if (!await ensureAuthentication()) { setLocationMessage("Enter your private control PIN once for this browser.", "warn"); return; } }
      catch (error) { forgetPin(); setLocationMessage(error.message, "bad"); return; }

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
        if (snapshot.elapsedSeconds >= 30 && snapshot.receivedCount === 0) completeCalibration(true);
        else if (snapshot.elapsedSeconds >= 180) completeCalibration(true);
        else if (snapshot.acceptanceMet) completeCalibration(false);
      }, 1000);
    }

    resetLocationButton.addEventListener("click", resetCameraLocation);
    pinInput.addEventListener("input", () => {
      if (!sessionUnlocked) setLockStatus(false);
    });
    priorityButtons.forEach((button) => {
      button.addEventListener("click", () => savePriority(button.dataset.priority));
    });
    cameraZoom.addEventListener("input", () => renderCameraOptics({ slider_position_0_1: cameraZoom.value, stabilisation_mode: stabilisationMode.value }));
    cameraZoom.addEventListener("change", saveCameraOptics);
    stabilisationMode.addEventListener("change", () => { renderCameraOptics({ slider_position_0_1: cameraZoom.value, stabilisation_mode: stabilisationMode.value }); saveCameraOptics(); });
    setInterval(renderPriority, 1000);

    async function initialise() {
      await loadAuthentication();
      await Promise.all([loadSettings(), loadCameraReference()]);
    }
    initialise();
  </script>
  <script src="/tracker-control.js" defer></script>
  <script src="/control-joystick.js" defer></script>
</body>
</html>`;

  return res.status(200).send(html);
};
