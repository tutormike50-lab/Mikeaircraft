const MAX_BORESIGHT_DEG = 5;

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }

function normaliseBoresight(value) {
  const yawDeg = finite(value?.yawDeg) && Math.abs(value.yawDeg) <= MAX_BORESIGHT_DEG ? value.yawDeg : 0;
  const pitchDeg = finite(value?.pitchDeg) && Math.abs(value.pitchDeg) <= MAX_BORESIGHT_DEG ? value.pitchDeg : 0;
  return {
    yawDeg: Number(yawDeg.toFixed(4)), pitchDeg: Number(pitchDeg.toFixed(4)),
    savedAt: typeof value?.savedAt === 'string' ? value.savedAt : null,
    method: typeof value?.method === 'string' ? value.method : 'DEFAULT_ZERO',
    quality: typeof value?.quality === 'string' ? value.quality : 'UNCALIBRATED'
  };
}

module.exports = { MAX_BORESIGHT_DEG, normaliseBoresight };
