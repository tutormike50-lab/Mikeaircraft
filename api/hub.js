module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#06111d">
  <meta name="application-name" content="MikeAircraft">
  <meta name="mobile-web-app-capable" content="yes">
  <title>MikeAircraft Operations Hub</title>
  <link rel="icon" type="image/webp" href="/api/app-icon">
  <link rel="apple-touch-icon" href="/api/app-icon">
  <link rel="manifest" href="/api/manifest">
  <style>
    :root{
      color-scheme:dark;
      --page:#050d16;
      --panel:#091827;
      --panel2:#0d2233;
      --line:#1d4059;
      --line2:#2c6587;
      --blue:#42c5ff;
      --blue2:#1686bf;
      --green:#58e3a0;
      --amber:#ffc968;
      --text:#f5fbff;
      --muted:#94adbe;
      --shadow:0 20px 55px rgba(0,0,0,.32);
    }
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:var(--page);color:var(--text);font-family:Arial,Helvetica,sans-serif}
    button,a{font:inherit}
    button{color:inherit}
    .app{min-height:100vh;display:grid;grid-template-columns:270px minmax(0,1fr)}
    .sidebar{
      position:sticky;
      top:0;
      height:100vh;
      display:flex;
      flex-direction:column;
      padding:24px 18px 18px;
      background:
        radial-gradient(circle at 40% 0,rgba(33,145,202,.2),transparent 33%),
        linear-gradient(180deg,#071624,#050e18);
      border-right:1px solid #17364c;
      box-shadow:12px 0 35px rgba(0,0,0,.18);
      z-index:3;
    }
    .brand{display:flex;align-items:center;gap:13px;padding:0 8px 24px;border-bottom:1px solid rgba(43,92,124,.5)}
    .mark{width:48px;height:48px;border:1px solid #2d749d;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#0e4567,#071c2d);box-shadow:0 0 24px rgba(57,188,240,.16)}
    .mark svg{width:28px;height:28px;fill:none;stroke:#7bdcff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .brandname{font-size:18px;font-weight:900;letter-spacing:.3px}
    .brandtag{margin-top:3px;color:#79a6c0;font-size:10px;font-weight:800;letter-spacing:1.45px}
    .navlabel{margin:24px 10px 9px;color:#5f849b;font-size:10px;font-weight:900;letter-spacing:1.5px}
    .nav{display:grid;gap:7px}
    .nav button{
      width:100%;
      min-height:48px;
      display:flex;
      align-items:center;
      gap:12px;
      padding:10px 12px;
      border:1px solid transparent;
      border-radius:11px;
      background:transparent;
      color:#afc4d2;
      cursor:pointer;
      text-align:left;
      font-weight:800;
      transition:.14s ease;
    }
    .nav button:hover{background:#0b2132;color:#effaff;border-color:#1d4661}
    .nav button.active{background:linear-gradient(135deg,#0e4260,#0b2f47);color:white;border-color:#2b759e;box-shadow:inset 3px 0 0 var(--blue)}
    .navicon{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:rgba(49,150,199,.12);color:#77d7ff;font-size:14px}
    .sidefoot{margin-top:auto;padding:17px 10px 4px;border-top:1px solid rgba(43,92,124,.5)}
    .protected{display:flex;align-items:center;gap:8px;color:#87a5b8;font-size:11px;line-height:1.4}
    .protected::before{content:"";width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:var(--green);box-shadow:0 0 10px rgba(88,227,160,.8)}
    .copyright{margin-top:11px;color:#4f7085;font-size:10px}
    .content{min-width:0;min-height:100vh;display:flex;flex-direction:column;background:radial-gradient(circle at 58% -15%,rgba(17,108,156,.22),transparent 35%),#06101a}
    .topbar{min-height:88px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px clamp(20px,3vw,38px);border-bottom:1px solid #173a53;background:rgba(5,15,25,.88);backdrop-filter:blur(12px)}
    .title h1{margin:0;font-size:clamp(22px,2.7vw,31px);letter-spacing:-.4px}
    .title p{margin:5px 0 0;color:#86a9be;font-size:13px}
    .actions{display:flex;align-items:center;gap:9px}
    .action{
      min-height:40px;
      padding:9px 13px;
      border:1px solid #28536d;
      border-radius:9px;
      background:#0a1d2b;
      color:#b7d3e3;
      cursor:pointer;
      font-size:12px;
      font-weight:900;
    }
    .action:hover{border-color:#4bbce9;color:white;background:#0d2a3d}
    .workspace{flex:1;min-height:0;padding:clamp(18px,3vw,34px)}
    .overview{max-width:1180px;margin:0 auto}
    .hero{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:24px;
      padding:25px 28px;
      border:1px solid #24536f;
      border-radius:18px;
      background:linear-gradient(125deg,rgba(14,58,84,.96),rgba(8,27,42,.96));
      box-shadow:var(--shadow);
    }
    .heroeyebrow{color:#69cef6;font-size:11px;font-weight:900;letter-spacing:1.6px}
    .hero h2{margin:7px 0 7px;font-size:clamp(22px,3vw,33px)}
    .hero p{max-width:680px;margin:0;color:#adc5d4;font-size:14px;line-height:1.55}
    .tower{width:92px;height:92px;flex:0 0 92px;display:grid;place-items:center;border:1px solid #2d6e93;border-radius:20px;background:rgba(3,20,33,.58);box-shadow:0 0 30px rgba(53,188,237,.12)}
    .tower svg{width:55px;height:55px;fill:none;stroke:#73d9ff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    .statusgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin:18px 0}
    .status{padding:16px 18px;border:1px solid #1a425c;border-radius:13px;background:rgba(9,29,44,.82)}
    .status span{display:block;color:#6f96ad;font-size:10px;font-weight:900;letter-spacing:1.25px}
    .status strong{display:block;margin-top:7px;font-size:18px}
    .good{color:var(--green)}
    .warn{color:var(--amber)}
    .sectionhead{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:26px 2px 13px}
    .sectionhead h3{margin:0;font-size:17px}
    .sectionhead p{margin:0;color:#6d8ca0;font-size:12px}
    .cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .card{
      position:relative;
      min-height:176px;
      display:flex;
      flex-direction:column;
      padding:21px;
      overflow:hidden;
      border:1px solid #1e4965;
      border-radius:15px;
      background:linear-gradient(145deg,rgba(13,37,54,.97),rgba(7,23,36,.97));
      box-shadow:0 12px 30px rgba(0,0,0,.18);
    }
    .card::after{content:"";position:absolute;right:-45px;top:-70px;width:150px;height:150px;border-radius:50%;background:rgba(44,169,220,.08)}
    .cardtop{display:flex;align-items:center;gap:12px}
    .cardicon{width:42px;height:42px;display:grid;place-items:center;border:1px solid #2b6282;border-radius:11px;background:#0b2a3e;color:#6bd5ff;font-size:19px;font-weight:900}
    .card h4{margin:0;font-size:17px}
    .card p{margin:12px 0 18px;color:#8faabd;font-size:13px;line-height:1.5}
    .card button{margin-top:auto;align-self:flex-start;min-height:38px;padding:8px 14px;border:1px solid #3396c4;border-radius:9px;background:#0b5176;color:#f2fbff;cursor:pointer;font-size:12px;font-weight:900}
    .card button:hover{background:#0d6b99;border-color:#5ed2ff}
    .notice{margin-top:15px;padding:14px 17px;border:1px solid rgba(65,158,120,.5);border-radius:12px;background:rgba(18,73,56,.2);color:#9dc9b7;font-size:12px;line-height:1.5}
    .notice strong{color:var(--green)}
    .framewrap{height:calc(100vh - 88px - clamp(36px,6vw,68px));min-height:600px;overflow:hidden;border:1px solid #204c68;border-radius:16px;background:#07121d;box-shadow:var(--shadow)}
    iframe{width:100%;height:100%;display:block;border:0;background:#07121d}
    .hidden{display:none!important}
    @media(max-width:850px){
      .app{grid-template-columns:1fr}
      .sidebar{position:relative;height:auto;padding:14px 15px;border-right:0;border-bottom:1px solid #17364c}
      .brand{padding:0 3px 13px}
      .mark{width:40px;height:40px}.mark svg{width:24px;height:24px}
      .navlabel,.sidefoot{display:none}
      .nav{grid-template-columns:repeat(3,1fr);gap:6px}
      .nav button{min-height:42px;padding:8px;justify-content:center;text-align:center;font-size:11px}
      .navicon{display:none}
      .content{min-height:calc(100vh - 140px)}
      .topbar{min-height:78px;padding:14px 17px}
      .title p{display:none}
      .workspace{padding:15px}
      .framewrap{height:calc(100vh - 238px);min-height:520px}
    }
    @media(max-width:620px){
      .nav{grid-template-columns:repeat(2,1fr)}
      .topbar{align-items:flex-start}.actions{flex-direction:column;align-items:stretch}.action{min-height:34px;padding:6px 9px}
      .hero{padding:20px}.tower{display:none}
      .statusgrid,.cards{grid-template-columns:1fr}
      .sectionhead p{display:none}
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark" aria-hidden="true">
          <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/><circle cx="20" cy="20" r="8"/><path d="M20 20 31 12M20 5v4M20 31v4M5 20h4M31 20h4"/></svg>
        </div>
        <div><div class="brandname">MikeAircraft</div><div class="brandtag">OPERATIONS HUB</div></div>
      </div>
      <div class="navlabel">WORKSPACE</div>
      <nav class="nav" aria-label="MikeAircraft sections">
        <button type="button" data-view="overview"><span class="navicon">⌂</span>Overview</button>
        <button type="button" data-view="control"><span class="navicon">◎</span>Airport &amp; Location</button>
        <button type="button" data-view="overlay"><span class="navicon">▰</span>Live Overlay</button>
        <button type="button" data-view="photos"><span class="navicon">▧</span>Photo Librarian</button>
        <button type="button" data-view="monitor"><span class="navicon">⌁</span>Engine Monitor</button>
        <button type="button" data-view="broadcast"><span class="navicon">◉</span>Broadcast Monitor</button>
      </nav>
      <div class="sidefoot">
        <div class="protected">Primary overlay protected</div>
        <div class="copyright">© MikeAircraft 2026</div>
      </div>
    </aside>

    <section class="content">
      <header class="topbar">
        <div class="title"><h1 id="pageTitle">Operations Overview</h1><p id="pageSubtitle">Everything needed to operate MikeAircraft from one place</p></div>
        <div class="actions">
          <button id="installButton" class="action" type="button">INSTALL DESKTOP APP</button>
          <button id="refreshButton" class="action" type="button">REFRESH</button>
          <button id="openButton" class="action hidden" type="button">OPEN FULL PAGE</button>
        </div>
      </header>

      <main class="workspace">
        <div id="overview" class="overview">
          <section class="hero">
            <div>
              <div class="heroeyebrow">MIKEAIRCRAFT CONTROL CENTRE</div>
              <h2>One interface. Every system.</h2>
              <p>Change airports and camera position, review the live overlay, manage the aircraft photo catalogue, and monitor the tracking engine without searching for separate links.</p>
            </div>
            <div class="tower" aria-hidden="true"><svg viewBox="0 0 60 60"><path d="M20 13h20l5 10H15l5-10Z"/><path d="M19 23h22l-4 12H23l-4-12Z"/><path d="M26 35h8l5 20H21l5-20Z"/><path d="M12 55h36M30 5v8M26 5h8"/></svg></div>
          </section>

          <section class="statusgrid" aria-label="System status">
            <div class="status"><span>SELECTED AIRPORT</span><strong id="airportStatus" class="warn">CHECKING</strong></div>
            <div class="status"><span>SETTINGS MEMORY</span><strong id="memoryStatus" class="warn">CHECKING</strong></div>
            <div class="status"><span>CAMERA LOCATION</span><strong id="locationStatus" class="warn">CHECKING</strong></div>
          </section>

          <div class="sectionhead"><h3>MikeAircraft systems</h3><p>Select a system to open it inside the hub</p></div>
          <section class="cards">
            <article class="card"><div class="cardtop"><div class="cardicon">◎</div><h4>Airport &amp; Camera Location</h4></div><p>Choose the active airport and save the camera’s private tracking position.</p><button type="button" data-open-view="control">OPEN CONTROLS</button></article>
            <article class="card"><div class="cardtop"><div class="cardicon">▰</div><h4>Live Broadcast Overlay</h4></div><p>Preview the finished primary layer exactly as the YoloBox receives it.</p><button type="button" data-open-view="overlay">OPEN OVERLAY</button></article>
            <article class="card"><div class="cardtop"><div class="cardicon">▧</div><h4>Photo Librarian</h4></div><p>Review, identify and organise the protected MikeAircraft aircraft-photo catalogue.</p><button type="button" data-open-view="photos">OPEN LIBRARIAN</button></article>
            <article class="card"><div class="cardtop"><div class="cardicon">⌁</div><h4>Tracking Engine Monitor</h4></div><p>See live aircraft selection, current targets, movement states and memory health.</p><button type="button" data-open-view="monitor">OPEN MONITOR</button></article>
            <article class="card"><div class="cardtop"><div class="cardicon">◉</div><h4>Broadcast Monitor</h4></div><p>Inspect the broadcast presentation and supporting editorial systems.</p><button type="button" data-open-view="broadcast">OPEN BROADCAST</button></article>
          </section>
          <div class="notice"><strong>Safe by design:</strong> this hub only brings the existing systems together. The completed primary overlay has not been redesigned or replaced.</div>
        </div>

        <div id="frameWrap" class="framewrap hidden">
          <iframe id="systemFrame" title="MikeAircraft system" allow="geolocation; clipboard-read; clipboard-write"></iframe>
        </div>
      </main>
    </section>
  </div>

  <script>
    const views = {
      overview: { title: "Operations Overview", subtitle: "Everything needed to operate MikeAircraft from one place", url: "" },
      control: { title: "Airport & Camera Location", subtitle: "Control the airport and the camera’s private tracking position", url: "/api/control" },
      overlay: { title: "Live Broadcast Overlay", subtitle: "Primary YoloBox layer preview", url: "/api/overlay" },
      photos: { title: "Photo Librarian", subtitle: "Aircraft photograph catalogue and identification", url: "/api/photo-librarian" },
      monitor: { title: "Tracking Engine Monitor", subtitle: "Live aircraft selection and memory health", url: "/api/monitor" },
      broadcast: { title: "Broadcast Monitor", subtitle: "Broadcast and editorial system view", url: "/api/broadcast-monitor" }
    };

    const overview = document.getElementById("overview");
    const frameWrap = document.getElementById("frameWrap");
    const frame = document.getElementById("systemFrame");
    const title = document.getElementById("pageTitle");
    const subtitle = document.getElementById("pageSubtitle");
    const installButton = document.getElementById("installButton");
    const refreshButton = document.getElementById("refreshButton");
    const openButton = document.getElementById("openButton");
    let activeView = "overview";
    let installPrompt = null;

    window.addEventListener("beforeinstallprompt", function(event) {
      event.preventDefault();
      installPrompt = event;
      installButton.textContent = "INSTALL DESKTOP APP";
    });
    installButton.addEventListener("click", async function() {
      if (!installPrompt) {
        window.alert("Chrome unlocks app installation after this page has been open for about 30 seconds. Keep the hub open, then click INSTALL DESKTOP APP again.");
        return;
      }
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.textContent = "APP INSTALLED";
      installButton.disabled = true;
    });
    window.addEventListener("appinstalled", function() {
      installPrompt = null;
      installButton.textContent = "APP INSTALLED";
      installButton.disabled = true;
    });
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function() {
        navigator.serviceWorker.register("/api/app-sw", { scope: "/api/" }).catch(function() {});
      });
    }

    function validView(name) { return Object.prototype.hasOwnProperty.call(views, name) ? name : "overview"; }

    function showView(name, updateHash) {
      name = validView(name);
      activeView = name;
      const view = views[name];
      title.textContent = view.title;
      subtitle.textContent = view.subtitle;

      document.querySelectorAll("[data-view]").forEach(function(button) {
        button.classList.toggle("active", button.dataset.view === name);
      });

      if (name === "overview") {
        overview.classList.remove("hidden");
        frameWrap.classList.add("hidden");
        openButton.classList.add("hidden");
        frame.removeAttribute("src");
        loadStatus();
      } else {
        overview.classList.add("hidden");
        frameWrap.classList.remove("hidden");
        openButton.classList.remove("hidden");
        if (frame.getAttribute("src") !== view.url) frame.src = view.url;
      }

      if (updateHash && location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    }

    async function loadStatus() {
      const airport = document.getElementById("airportStatus");
      const memory = document.getElementById("memoryStatus");
      const camera = document.getElementById("locationStatus");
      airport.textContent = "CHECKING"; airport.className = "warn";
      memory.textContent = "CHECKING"; memory.className = "warn";
      camera.textContent = "CHECKING"; camera.className = "warn";
      try {
        const response = await fetch("/api/settings?t=" + Date.now(), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error("Settings unavailable");
        airport.textContent = data.settings && data.settings.airport ? data.settings.airport : "PRG";
        airport.className = "good";
        const redis = Boolean(data.persistence && data.persistence.redisConnected);
        memory.textContent = redis ? "CONNECTED" : "NOT CONNECTED";
        memory.className = redis ? "good" : "warn";
        const located = Boolean(data.settings && data.settings.cameraLocationConfigured);
        camera.textContent = located ? "SAVED" : "NOT SET";
        camera.className = located ? "good" : "warn";
      } catch (error) {
        airport.textContent = "UNAVAILABLE"; airport.className = "warn";
        memory.textContent = "UNAVAILABLE"; memory.className = "warn";
        camera.textContent = "UNAVAILABLE"; camera.className = "warn";
      }
    }

    document.querySelectorAll("[data-view]").forEach(function(button) {
      button.addEventListener("click", function() { showView(button.dataset.view, true); });
    });
    document.querySelectorAll("[data-open-view]").forEach(function(button) {
      button.addEventListener("click", function() { showView(button.dataset.openView, true); });
    });
    refreshButton.addEventListener("click", function() {
      if (activeView === "overview") loadStatus();
      else frame.src = views[activeView].url + (views[activeView].url.indexOf("?") >= 0 ? "&" : "?") + "hubrefresh=" + Date.now();
    });
    openButton.addEventListener("click", function() {
      if (activeView !== "overview") window.open(views[activeView].url, "_blank", "noopener");
    });
    window.addEventListener("hashchange", function() { showView(location.hash.slice(1), false); });
    showView(location.hash.slice(1) || "overview", false);
  </script>
</body>
</html>`;

  return res.status(200).send(html);
};
