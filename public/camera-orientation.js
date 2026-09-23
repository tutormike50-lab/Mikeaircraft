(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CameraOrientationCalibration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MIN_SAMPLES = 12;
  const MAX_HEADING_SPREAD_DEG = 8;
  const MAX_ELEVATION_SPREAD_DEG = 4;

  function wrap360(value) { return ((value % 360) + 360) % 360; }
  function signedAngle(value) { return ((value + 540) % 360) - 180; }
  function median(values) { const sorted = values.slice().sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
  function circularMean(values) {
    const radians = values.map(value => value * Math.PI / 180);
    return wrap360(Math.atan2(radians.reduce((sum, value) => sum + Math.sin(value), 0), radians.reduce((sum, value) => sum + Math.cos(value), 0)) * 180 / Math.PI);
  }
  function headingFromEvent(event) {
    if (Number.isFinite(event && event.webkitCompassHeading)) return wrap360(event.webkitCompassHeading);
    if (event && event.absolute === true && Number.isFinite(event.alpha)) return wrap360(360 - event.alpha);
    return null;
  }
  function elevationFromEvent(event) {
    if (!event || !Number.isFinite(event.beta)) return null;
    const beta = signedAngle(event.beta);
    return beta > 90 ? 180 - beta : beta < -90 ? -180 - beta : beta;
  }
  function createSession(offsets) {
    const headingOffsetDeg = Number.isFinite(Number(offsets && offsets.headingDeg)) ? Number(offsets.headingDeg) : 0;
    const elevationOffsetDeg = Number.isFinite(Number(offsets && offsets.elevationDeg)) ? Number(offsets.elevationDeg) : 0;
    const samples = [];
    let reason = "Waiting for iPhone orientation readings.";
    return {
      add(event) {
        const heading = headingFromEvent(event), elevation = elevationFromEvent(event);
        if (heading === null || elevation === null) { reason = "Browser did not provide both compass heading and elevation."; return false; }
        samples.push({ heading, elevation });
        if (samples.length > 120) samples.shift();
        return true;
      },
      unavailable(message) { reason = String(message || "Orientation sensors are unavailable."); },
      snapshot() {
        if (!samples.length) return { ready: false, sampleCount: 0, reason };
        const headingMean = circularMean(samples.map(sample => sample.heading));
        const headingSpreadDeg = Math.max(...samples.map(sample => Math.abs(signedAngle(sample.heading - headingMean))));
        const elevationMedian = median(samples.map(sample => sample.elevation));
        const elevationSpreadDeg = Math.max(...samples.map(sample => Math.abs(sample.elevation - elevationMedian)));
        const stable = samples.length >= MIN_SAMPLES && headingSpreadDeg <= MAX_HEADING_SPREAD_DEG && elevationSpreadDeg <= MAX_ELEVATION_SPREAD_DEG;
        return {
          ready: stable,
          sampleCount: samples.length,
          reason: stable ? null : samples.length < MIN_SAMPLES ? "Collecting stationary orientation samples." : "Phone or camera is moving; keep it still.",
          homeTrueAzimuthDeg: wrap360(headingMean + headingOffsetDeg),
          homeElevationDeg: elevationMedian + elevationOffsetDeg,
          rawHeadingDeg: headingMean,
          rawElevationDeg: elevationMedian,
          headingSpreadDeg,
          elevationSpreadDeg,
          headingOffsetDeg,
          elevationOffsetDeg,
          source: "IPHONE_DEVICE_ORIENTATION",
          quality: stable ? "STABLE" : "UNSTABLE"
        };
      }
    };
  }
  async function requestPermission(environment) {
    const source = environment || (typeof globalThis !== "undefined" ? globalThis : {});
    const Orientation = source.DeviceOrientationEvent;
    if (!Orientation) return { granted: false, reason: "This browser does not expose device orientation sensors." };
    if (typeof Orientation.requestPermission === "function") {
      try {
        const result = await Orientation.requestPermission();
        if (result !== "granted") return { granted: false, reason: "iPhone motion and orientation permission was denied." };
      } catch (error) {
        return { granted: false, reason: "iPhone orientation permission could not be requested: " + error.message };
      }
    }
    return { granted: true, reason: null };
  }
  return { createSession, requestPermission, headingFromEvent, elevationFromEvent };
});
