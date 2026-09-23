const test = require("node:test");
const assert = require("node:assert/strict");
const { createSession, estimate } = require("../public/camera-position");

const METRES_PER_DEGREE = 111195;
function fix(start, seconds, eastM, northM, accuracyM = 4) {
  return {
    timestamp: start + seconds * 1000,
    lat: 50 + northM / METRES_PER_DEGREE,
    lon: 14 + eastM / (METRES_PER_DEGREE * Math.cos(50 * Math.PI / 180)),
    accuracyM,
    altitudeM: 312,
    altitudeAccuracyM: 8
  };
}

test("robust local metric estimator rejects an obvious spatial outlier", () => {
  const start = 100000;
  const fixes = Array.from({ length: 30 }, (_, i) => fix(start, i * 3, (i % 5 - 2) * .4, (i % 3 - 1) * .5));
  fixes.push(fix(start, 88, 250, -180));
  const result = estimate(fixes);
  assert.equal(result.acceptedCount, 30);
  assert.equal(result.rejectedCount, 1);
  assert.ok(Math.abs(result.lat - 50) < .00002);
  assert.ok(Math.abs(result.lon - 14) < .00002);
  assert.equal(result.grade, "EXCELLENT");
  assert.ok(result.clusterRadius95M < 2);
});

test("uncertainty never shrinks browser accuracy by sqrt sample count", () => {
  const start = 100000;
  const result = estimate(Array.from({ length: 40 }, (_, i) => fix(start, i * 3, 0, 0, 12)));
  assert.equal(result.reportedAccuracyM, 12);
  assert.equal(result.horizontalUncertaintyM, 12);
  assert.equal(result.grade, "AMBER");
});

function sessionWith(start, fixes) {
  const session = createSession(start);
  for (const item of fixes) session.add(item, item.timestamp);
  return session;
}

function stationaryFixes(start, count, accuracyM = 4, endSeconds = 60) {
  return Array.from({ length: count }, (_, i) => fix(start, count === 1 ? endSeconds : i * endSeconds / (count - 1), (i % 3 - 1) * .2, (i % 2) * .2, accuracyM));
}

test("session rejects duplicate and stale timestamps", () => {
  const start = 100000;
  const session = createSession(start);
  assert.equal(session.add(fix(start, 0, 0, 0), start), true);
  assert.equal(session.add(fix(start, 0, 1, 1), start), false);
  assert.equal(session.add(fix(start, -10, 0, 0), start), false);
  const snapshot = session.snapshot(start);
  assert.equal(snapshot.duplicateCount, 1);
  assert.equal(snapshot.staleCount, 1);
});

test("never accepts before 60 seconds and exactly 8 good fixes can pass", () => {
  const start = 100000;
  const session = sessionWith(start, stationaryFixes(start, 8));
  assert.equal(session.snapshot(start + 59999).acceptanceMet, false);
  assert.equal(session.snapshot(start + 60000).acceptanceMet, true);
});

test("7 genuinely fresh fixes fail", () => {
  const start = 100000;
  assert.equal(sessionWith(start, stationaryFixes(start, 7)).snapshot(start + 60000).acceptanceMet, false);
});

test("browser accuracy boundary is 10 m", () => {
  const start = 100000;
  assert.equal(sessionWith(start, stationaryFixes(start, 8, 10)).snapshot(start + 60000).acceptanceMet, true);
  assert.equal(sessionWith(start, stationaryFixes(start, 8, 10.01)).snapshot(start + 60000).acceptanceMet, false);
});

test("cluster radius boundary is 5 m", () => {
  const start = 100000;
  const atBoundary = [0, 9.999, 0, 9.999, 0, 9.999, 0, 9.999].map((eastM, i) => fix(start, i * 60 / 7, eastM, 0));
  const aboveBoundary = [0, 10.002, 0, 10.002, 0, 10.002, 0, 10.002].map((eastM, i) => fix(start, i * 60 / 7, eastM, 0));
  assert.ok(estimate(atBoundary).clusterRadius95M <= 5);
  assert.ok(estimate(aboveBoundary).clusterRadius95M > 5);
  assert.equal(sessionWith(start, atBoundary).snapshot(start + 60000).acceptanceMet, true);
  assert.equal(sessionWith(start, aboveBoundary).snapshot(start + 60000).acceptanceMet, false);
});

test("centre movement at or below 2 m provides stability", () => {
  const start = 100000;
  const fixes = [20, 25, 31, 36, 46, 51, 56, 60].map((seconds, i) => fix(start, seconds, i < 4 ? 0 : 1.999, 0));
  const snapshot = sessionWith(start, fixes).snapshot(start + 60000);
  assert.ok(snapshot.estimate.centreMovement30sM <= 2);
  assert.equal(snapshot.acceptanceMet, true);
});

test("four final-30-second fixes with radius at or below 2 m substitute when movement cannot be calculated", () => {
  const start = 100000;
  const fixes = [0, 5, 10, 15, 45, 50, 55, 60].map((seconds, i) => fix(start, seconds, i < 4 ? 0 : (i % 2) * 3.999, 0));
  const snapshot = sessionWith(start, fixes).snapshot(start + 60000);
  assert.equal(snapshot.estimate.centreMovement30sM, null);
  assert.equal(snapshot.estimate.final30sCount, 4);
  assert.ok(snapshot.estimate.final30sRadius95M <= 2);
  assert.equal(snapshot.acceptanceMet, true);
});

test("180 seconds can accept fewer than 20 but at least 8 good fixes", () => {
  const start = 100000;
  const times = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 151, 156, 166, 171, 180];
  const session = sessionWith(start, times.map((seconds, i) => fix(start, seconds, (i % 3 - 1) * .2, (i % 2) * .2, 6.8)));
  assert.equal(session.snapshot(start + 180000).acceptanceMet, true);
});

test("required-condition failures remain rejected at 180 seconds", () => {
  const start = 100000;
  const tooFew = sessionWith(start, stationaryFixes(start, 7, 4, 180)).snapshot(start + 180000);
  const unstable = [0, 30, 60, 90, 151, 156, 166, 171].map((seconds, i) => fix(start, seconds, i < 6 ? 0 : 6, 0));
  assert.equal(tooFew.acceptanceMet, false);
  assert.equal(sessionWith(start, unstable).snapshot(start + 180000).acceptanceMet, false);
});

test("a rejected spatial outlier prevents acceptance", () => {
  const start = 100000;
  const fixes = stationaryFixes(start, 8);
  fixes.push(fix(start, 58, 250, -180));
  const snapshot = sessionWith(start, fixes).snapshot(start + 60000);
  assert.equal(snapshot.estimate.rejectedCount, 1);
  assert.equal(snapshot.acceptanceMet, false);
});

test("grade thresholds are exact and above 20 m rejects", () => {
  const start = 100000;
  for (const [accuracy, grade] of [[5,"EXCELLENT"],[5.1,"SUITABLE"],[10,"SUITABLE"],[10.1,"AMBER"],[20,"AMBER"],[20.1,"REJECT"]]) {
    const result = estimate(Array.from({ length: 4 }, (_, i) => fix(start, i, 0, 0, accuracy)));
    assert.equal(result.grade, grade);
  }
});
