(function () {
  "use strict";
  const button = document.getElementById("trackerButton");
  const piStatus = document.getElementById("trackerPiStatus");
  const processStatus = document.getElementById("trackerProcessStatus");
  const aircraft = document.getElementById("trackerAircraft");
  const detail = document.getElementById("trackerDetail");
  const serverVersion = document.getElementById("serverVersion");
  const piVersion = document.getElementById("piVersion");
  const versionMatch = document.getElementById("versionMatch");
  const bridgeHealth = document.getElementById("bridgeHealth");
  const trackerHealth = document.getElementById("trackerHealth");
  if (!button || !piStatus || !processStatus || !aircraft || !detail) return;

  let state = null;
  let busy = false;

  function render(next) {
    state = next;
    const online = Boolean(next.piOnline);
    const tracker = String(next.trackerState || "STOPPED");
    const active = next.desired === "TRACKING";
    piStatus.textContent = online ? "PI ONLINE" : "PI OFFLINE";
    piStatus.className = "statusvalue " + (online ? "good" : "bad");
    processStatus.textContent = "TRACKER " + tracker;
    processStatus.className = "statusvalue " + (tracker === "TRACKING" ? "good" : tracker === "FAULT" ? "bad" : tracker === "STARTING" ? "warn" : "");
    aircraft.textContent = next.currentAircraft || "NONE";
    aircraft.className = "statusvalue " + (next.currentAircraft ? "good" : "");
    if (serverVersion) serverVersion.textContent = next.serverVersion ? next.serverVersion.slice(0, 7) : "UNKNOWN";
    if (piVersion) piVersion.textContent = next.piVersion ? next.piVersion.slice(0, 7) : "UNKNOWN";
    if (versionMatch) { versionMatch.textContent = next.match ? "YES" : "NO"; versionMatch.className = "statusvalue " + (next.match ? "good" : "bad"); }
    if (bridgeHealth) { bridgeHealth.textContent = next.bridgeHealth || "FAULT"; bridgeHealth.className = "statusvalue " + (next.bridgeHealth === "HEALTHY" ? "good" : "bad"); }
    if (trackerHealth) { trackerHealth.textContent = next.trackerHealth || "FAULT"; trackerHealth.className = "statusvalue " + (next.trackerHealth === "HEALTHY" || next.trackerHealth === "IDLE" ? "good" : "bad"); }
    button.className = "tracker-button";
    if (active && tracker === "STARTING") {
      button.textContent = "STARTING…";
      button.classList.add("starting");
    } else if (active) {
      button.textContent = "■ STOP TRACKING";
      button.classList.add("stop");
    } else {
      button.textContent = "▶ START TRACKING";
    }
    button.disabled = busy;
    const age = next.heartbeatAgeSeconds === null ? "no heartbeat received" : "last heartbeat " + next.heartbeatAgeSeconds + "s ago";
    const rs4 = next.rs4State ? " · RS4 " + next.rs4State : "";
    const fault = next.fault ? " · " + next.fault : "";
    detail.textContent = age + rs4 + fault;
    detail.className = "tracker-detail" + (next.fault ? " bad" : "");
  }

  async function request(options) {
    const response = await fetch("/api/tracker-control", { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Tracker control unavailable");
    render(data);
  }

  async function poll() {
    if (busy) return;
    try { await request(); }
    catch (error) {
      if (error.message === "Unauthorised") {
        piStatus.textContent = "SIGN IN REQUIRED";
        piStatus.className = "statusvalue warn";
        button.textContent = "▶ START TRACKING";
        button.disabled = false;
      } else {
        piStatus.textContent = "PI OFFLINE";
        piStatus.className = "statusvalue bad";
        detail.textContent = error.message;
      }
    }
  }

  button.addEventListener("click", async function () {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (window.ensureControlAuthentication && !await window.ensureControlAuthentication()) {
        detail.textContent = "Enter the private control PIN once for this browser.";
        return;
      }
      const desired = state?.desired === "TRACKING" ? "STOPPED" : "TRACKING";
      if (desired === "TRACKING") button.textContent = "STARTING…";
      await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desired }) });
    } catch (error) {
      detail.textContent = error.message;
      detail.className = "tracker-detail bad";
    } finally {
      busy = false;
      if (state) render(state); else button.disabled = false;
    }
  });

  poll();
  setInterval(poll, 2500);
})();
