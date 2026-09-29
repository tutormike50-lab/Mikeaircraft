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

test("five fresh acceptable fixes can complete without a long hold", () => {
  const start = 100000;
  const session = sessionWith(start, stationaryFixes(start, 5, 4, 12));
  const snapshot = session.snapshot(start + 12000);
  assert.equal(snapshot.acceptanceMet, true);
  assert.equal(snapshot.requiredCount, 5);
  assert.equal(snapshot.estimate.acceptedCount, 5);
});

test("four genuinely fresh acceptable fixes fail", () => {
  const start = 100000;
  assert.equal(sessionWith(start, stationaryFixes(start, 4, 4, 20)).snapshot(start + 20000).acceptanceMet, false);
});

test("ordinary acquisition accuracy is accepted while clearly poor uncertainty rejects", () => {
  const start = 100000;
  assert.equal(sessionWith(start, stationaryFixes(start, 5, 20, 20)).snapshot(start + 20000).acceptanceMet, true);
  const poor = sessionWith(start, stationaryFixes(start, 5, 20.1, 20)).snapshot(start + 20000);
  assert.equal(poor.acceptanceMet, false);
  assert.equal(poor.blockingCondition, "POSITION UNCERTAINTY TOO LARGE");
});

test("spatial outliers do not count toward the five acceptable fixes", () => {
  const start = 100000;
  const good = stationaryFixes(start, 4, 4, 20);
  good.push(fix(start, 19, 250, -180, 4));
  const snapshot = sessionWith(start, good).snapshot(start + 20000);
  assert.equal(snapshot.estimate.acceptedCount, 4);
  assert.equal(snapshot.estimate.rejectedCount, 1);
  assert.equal(snapshot.acceptanceMet, false);
  assert.equal(snapshot.blockingCondition, "INSUFFICIENT ACCEPTED FIXES");
});

test("snapshot reports the exact condition blocking acceptance", () => {
  const start = 100000;
  const tooFew = sessionWith(start, stationaryFixes(start, 4, 4, 20)).snapshot(start + 20000);
  assert.equal(tooFew.blockingCondition, "INSUFFICIENT ACCEPTED FIXES");
  assert.equal(tooFew.receivedCount, 4);
  assert.equal(tooFew.requiredCount, 5);

  const empty = createSession(start).snapshot(start + 30000);
  assert.equal(empty.blockingCondition, "NO GEOLOCATION UPDATES");
  assert.equal(empty.lastFixAgeSeconds, null);
});

test("snapshot distinguishes rejected input fixes from spatial outliers", () => {
  const start = 100000;
  const session = sessionWith(start, stationaryFixes(start, 8));
  session.add(fix(start, 60, 0, 0), start + 60000);
  session.add({ timestamp: start - 10000, lat: 50, lon: 14, accuracyM: 4 }, start + 60000);
  const snapshot = session.snapshot(start + 60000);
  assert.equal(snapshot.receivedCount, 10);
  assert.equal(snapshot.rejectedInputCount, 2);
  assert.equal(snapshot.lastRejectionReason, "STALE GEOLOCATION FIX");
});

test("a discarded spatial outlier does not permanently prevent acceptance", () => {
  const start = 100000;
  const fixes = stationaryFixes(start, 8);
  fixes.push(fix(start, 58, 250, -180));
  const snapshot = sessionWith(start, fixes).snapshot(start + 60000);
  assert.equal(snapshot.estimate.rejectedCount, 1);
  assert.equal(snapshot.acceptanceMet, true);
});

test("grade thresholds are exact and above 20 m rejects", () => {
  const start = 100000;
  for (const [accuracy, grade] of [[5,"EXCELLENT"],[5.1,"SUITABLE"],[10,"SUITABLE"],[10.1,"AMBER"],[20,"AMBER"],[20.1,"REJECT"]]) {
    const result = estimate(Array.from({ length: 4 }, (_, i) => fix(start, i, 0, 0, accuracy)));
    assert.equal(result.grade, grade);
  }
});
