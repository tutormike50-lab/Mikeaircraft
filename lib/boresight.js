const MAX_BORESIGHT_DEG = 5;

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }

function normaliseBoresight(value) {
  // 99fb5d0 stored offsets without an activation marker. Treat those values as
  // untrusted legacy state so deployment alone cannot change live pointing.
  const enabled = value?.enabled === true && value?.schemaVersion === 1;
  const yawDeg = enabled && finite(value?.yawDeg) && Math.abs(value.yawDeg) <= MAX_BORESIGHT_DEG ? value.yawDeg : 0;
  const pitchDeg = enabled && finite(value?.pitchDeg) && Math.abs(value.pitchDeg) <= MAX_BORESIGHT_DEG ? value.pitchDeg : 0;
  return {
    yawDeg: Number(yawDeg.toFixed(4)), pitchDeg: Number(pitchDeg.toFixed(4)),
    enabled, schemaVersion: 1,
    savedAt: typeof value?.savedAt === 'string' ? value.savedAt : null,
    method: typeof value?.method === 'string' ? value.method : 'DEFAULT_ZERO',
    quality: typeof value?.quality === 'string' ? value.quality : 'UNCALIBRATED'
  };
}

module.exports = { MAX_BORESIGHT_DEG, normaliseBoresight };
