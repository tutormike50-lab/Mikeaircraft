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
      grid-template-columns:repeat(3,1fr);
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
    #message{min-height:24px;margin-top:18px;color:#a9bfd0;font-size:14px}
    .footnote{margin:18px 4px 0;color:#6f8799;font-size:12px;line-height:1.5}
    @media(max-width:700px){
      .statusbar{grid-template-columns:1fr}
      .airportgrid{grid-template-columns:repeat(2,1fr)}
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

    <p class="footnote">The YoloBox remains display-only. Changing a setting here will not affect the live overlay until the separate overlay-connection test has been completed.</p>
  </main>

  <script>
    const pinInput = document.getElementById("pin");
    const grid = document.getElementById("airportGrid");
    const message = document.getElementById("message");
    const currentAirport = document.getElementById("currentAirport");
    const memoryStatus = document.getElementById("memoryStatus");
    const panelStatus = document.getElementById("panelStatus");

    let selectedAirport = null;
    let airports = [];
    let busy = false;

    pinInput.value = sessionStorage.getItem("mikeaircraft-control-pin") || "";
    pinInput.addEventListener("input", () => {
      sessionStorage.setItem("mikeaircraft-control-pin", pinInput.value);
    });

    function setMessage(text, tone) {
      message.textContent = text;
      message.className = tone || "";
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
        setMessage(redisConnected ? "Choose an airport when you are ready." : "Redis is unavailable; airport changes cannot be saved.", redisConnected ? "" : "bad");
        renderAirports();
      }
      catch (error) {
        panelStatus.textContent = "ERROR";
        panelStatus.className = "statusvalue bad";
        memoryStatus.textContent = "UNKNOWN";
        memoryStatus.className = "statusvalue bad";
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

    loadSettings();
  </script>
</body>
</html>`;

  return res.status(200).send(html);
};
