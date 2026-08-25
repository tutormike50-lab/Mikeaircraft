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
    .pinrow{display:flex;gap:10px;margin-bottom:20px}
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
    .footnote{margin:18px 4px 0;color:#6f8799;font-size:12px;line-height:1.5}
    @media(max-width:700px){
      .statusbar{grid-template-columns:repeat(2,1fr)}
      .airportgrid{grid-template-columns:repeat(2,1fr)}
      .priority-grid{grid-template-columns:1fr}
    }
    @media(max-width:430px){
      .airportgrid{grid-template-columns:1fr}
      .pinrow input{width:100%}
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
        <button id="resetLocationButton" class="location-button" type="button">RESET CAMERA LOCATION</button>
        <div id="locationMessage" role="status" aria-live="polite">The exact coordinates are stored privately and are not shown on the public overlay.</div>
        <p class="location-note">For the best result, allow precise location and keep the device beside the camera while the position is captured.</p>
      </div>
    </section>

    <p class="footnote">The YoloBox remains display-only. Airport and camera settings are controlled here.</p>
  </main>

  <script>
    const pinInput = document.getElementById("pin");
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

    let selectedAirport = null;
    let airports = [];
    let busy = false;
    let locationBusy = false;
    let priorityBusy = false;
    let priorityMode = "AUTO";
    let priorityUntil = null;

    sessionStorage.removeItem("mikeaircraft-control-pin");
    pinInput.value = "";

    function clearPin() {
      pinInput.value = "";
      sessionStorage.removeItem("mikeaircraft-control-pin");
    }

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

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Airport change failed");
        }

        selectedAirport = data.settings.airport;
        currentAirport.textContent = selectedAirport;
        currentAirport.className = "statusvalue good";
        panelStatus.textContent = "SAVED";
        panelStatus.className = "statusvalue good";
        setMessage(selectedAirport + " is now the saved airport.", "good");
        clearPin();
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
        if (!response.ok || !data.ok) throw new Error(data.error || "Priority change failed");

        priorityMode = data.settings?.priorityMode || "AUTO";
        priorityUntil = data.settings?.priorityUntil || null;
        panelStatus.textContent = "SAVED";
        panelStatus.className = "statusvalue good";
        clearPin();
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

    async function saveCameraLocation(position) {
      const pin = pinInput.value.trim();

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
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracyM: position.coords.accuracy,
              altitudeM: Number.isFinite(position.coords.altitude) ? position.coords.altitude : null
            }
          })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Camera location save failed");
        }

        const accuracy = Number(data.cameraLocation?.accuracyM);
        const accuracyText = Number.isFinite(accuracy) ? " ±" + Math.round(accuracy) + "m" : "";
        cameraLocationStatus.textContent = "SAVED" + accuracyText;
        cameraLocationStatus.className = "location-value good";
        cameraLocationStatus.title = data.cameraLocation?.updatedAt
          ? "Saved " + new Date(data.cameraLocation.updatedAt).toLocaleString()
          : "Camera position saved";

        if (Number.isFinite(accuracy) && accuracy > 25) {
          setLocationMessage("Saved, but accuracy is" + accuracyText + ". A phone beside the camera with precise location enabled will improve tracking.", "warn");
        }
        else {
          setLocationMessage("Camera position saved" + accuracyText + ".", "good");
        }
        clearPin();
      }
      catch (error) {
        cameraLocationStatus.textContent = "NOT SAVED";
        cameraLocationStatus.className = "location-value bad";
        setLocationMessage(error.message, "bad");
      }
      finally {
        locationBusy = false;
        resetLocationButton.disabled = false;
        resetLocationButton.textContent = "RESET CAMERA LOCATION";
      }
    }

    function resetCameraLocation() {
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

      locationBusy = true;
      resetLocationButton.disabled = true;
      resetLocationButton.textContent = "FINDING CAMERA POSITION…";
      cameraLocationStatus.textContent = "LOCATING";
      cameraLocationStatus.className = "location-value warn";
      setLocationMessage("Keep this device beside the camera while its precise position is captured…", "warn");

      navigator.geolocation.getCurrentPosition(
        saveCameraLocation,
        (error) => {
          locationBusy = false;
          resetLocationButton.disabled = false;
          resetLocationButton.textContent = "RESET CAMERA LOCATION";
          cameraLocationStatus.textContent = "NOT SAVED";
          cameraLocationStatus.className = "location-value bad";
          setLocationMessage(locationErrorMessage(error), "bad");
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        }
      );
    }

    resetLocationButton.addEventListener("click", resetCameraLocation);
    priorityButtons.forEach((button) => {
      button.addEventListener("click", () => savePriority(button.dataset.priority));
    });
    setInterval(renderPriority, 1000);

    loadSettings();
  </script>
</body>
</html>`;

  return res.status(200).send(html);
};
