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

test("session rejects duplicate and stale timestamps and enforces time/sample gates", () => {
  const start = 100000;
  const session = createSession(start);
  assert.equal(session.add(fix(start, 0, 0, 0), start), true);
  assert.equal(session.add(fix(start, 0, 1, 1), start), false);
  assert.equal(session.add(fix(start, -10, 0, 0), start), false);
  for (let i = 1; i < 30; i += 1) session.add(fix(start, i * 3, 0, 0), start + i * 3000);
  const early = session.snapshot(start + 59000);
  assert.equal(early.minimumMet, false);
  const ready = session.snapshot(start + 90000);
  assert.equal(ready.minimumMet, true);
  assert.equal(ready.preferredMet, true);
  assert.equal(ready.duplicateCount, 1);
  assert.equal(ready.staleCount, 1);
  assert.equal(ready.state, "GOOD");
});

test("grade thresholds are exact and above 20 m rejects", () => {
  const start = 100000;
  for (const [accuracy, grade] of [[5,"EXCELLENT"],[5.1,"SUITABLE"],[10,"SUITABLE"],[10.1,"AMBER"],[20,"AMBER"],[20.1,"REJECT"]]) {
    const result = estimate(Array.from({ length: 4 }, (_, i) => fix(start, i, 0, 0, accuracy)));
    assert.equal(result.grade, grade);
  }
});
