const SOURCE = "MANUAL";
const SOURCE_CONFIDENCE = "ESTIMATED";
const RECORDING_WIDTH_PX = 1920;
const RECORDING_HEIGHT_PX = 1080;
const RECORDING_MODE = "FULL_HD_1080_50P";
const FOV_MODEL = "CANON_EQUIVALENT";
const STABILISATION_RANGES = Object.freeze({
  STANDARD_OR_OFF: Object.freeze({ min: 30.5, max: 627 }),
  DYNAMIC: Object.freeze({ min: 32.0, max: 640 }),
});

const D35_MM = Math.sqrt(36 ** 2 + 24 ** 2);
const W16_9_MM = D35_MM * 16 / Math.sqrt(16 ** 2 + 9 ** 2);
const H16_9_MM = D35_MM * 9 / Math.sqrt(16 ** 2 + 9 ** 2);

function clampSlider(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function equivalentFocalLength(sliderPosition, stabilisationMode = "STANDARD_OR_OFF") {
  const range = STABILISATION_RANGES[stabilisationMode] || STABILISATION_RANGES.STANDARD_OR_OFF;
  const z = clampSlider(sliderPosition);
  return range.min * ((range.max / range.min) ** z);
}

function fovDegrees(referenceSizeMm, equivalentFocalLengthMm) {
  return 2 * Math.atan(referenceSizeMm / (2 * equivalentFocalLengthMm)) * 180 / Math.PI;
}

function buildCameraOptics(value = {}, timestampMs = Date.now()) {
  const stabilisationMode = Object.hasOwn(STABILISATION_RANGES, value.stabilisation_mode)
    ? value.stabilisation_mode : "STANDARD_OR_OFF";
  const slider = clampSlider(value.slider_position_0_1);
  const equivalent = equivalentFocalLength(slider, stabilisationMode);
  const range = STABILISATION_RANGES[stabilisationMode];
  return {
    timestamp_ms: Number.isFinite(Number(value.timestamp_ms)) ? Number(value.timestamp_ms) : timestampMs,
    source: SOURCE,
    source_confidence: SOURCE_CONFIDENCE,
    recording_width_px: RECORDING_WIDTH_PX,
    recording_height_px: RECORDING_HEIGHT_PX,
    aspect_ratio: "16:9",
    recording_mode: RECORDING_MODE,
    stabilisation_mode: stabilisationMode,
    slider_position_0_1: slider,
    optical_zoom_ratio_estimate: equivalent / range.min,
    physical_focal_length_mm: null,
    equivalent_focal_length_mm: equivalent,
    horizontal_fov_deg: fovDegrees(W16_9_MM, equivalent),
    vertical_fov_deg: fovDegrees(H16_9_MM, equivalent),
    fov_model: FOV_MODEL,
    optics_valid: true,
  };
}

module.exports = {
  D35_MM, H16_9_MM, STABILISATION_RANGES, W16_9_MM,
  buildCameraOptics, equivalentFocalLength, fovDegrees,
};
