"""Pure XA60 CameraOptics V1 image-geometry helpers; never control geometry."""

from dataclasses import asdict, dataclass
import math

D35_MM = math.hypot(36.0, 24.0)
W16_9_MM = D35_MM * 16.0 / math.hypot(16.0, 9.0)
H16_9_MM = D35_MM * 9.0 / math.hypot(16.0, 9.0)
RANGES = {"STANDARD_OR_OFF": (30.5, 627.0), "DYNAMIC": (32.0, 640.0)}


def equivalent_focal_length_mm(slider_position, stabilisation_mode="STANDARD_OR_OFF"):
    minimum, maximum = RANGES.get(stabilisation_mode, RANGES["STANDARD_OR_OFF"])
    z = max(0.0, min(1.0, float(slider_position)))
    return minimum * (maximum / minimum) ** z


def fov_deg(reference_size_mm, equivalent_focal_length):
    return math.degrees(2.0 * math.atan(reference_size_mm / (2.0 * equivalent_focal_length)))


def normalized_frame_offset(angular_error_deg, fov_deg_value):
    """Positive yaw/pitch error maps right/up; +/-0.5 is the corresponding edge."""
    try:
        angular_error = float(angular_error_deg)
        field_of_view = float(fov_deg_value)
    except (TypeError, ValueError, OverflowError):
        return None
    if (not math.isfinite(angular_error) or not math.isfinite(field_of_view)
            or field_of_view <= 0.0 or field_of_view >= 180.0):
        return None
    return 0.5 * math.tan(math.radians(angular_error)) / math.tan(math.radians(field_of_view / 2.0))


def angular_tolerance_deg(normalized_limit, fov_deg_value):
    try:
        limit = float(normalized_limit)
        field_of_view = float(fov_deg_value)
    except (TypeError, ValueError, OverflowError):
        return None
    if (not math.isfinite(limit) or not math.isfinite(field_of_view)
            or field_of_view <= 0.0 or field_of_view >= 180.0):
        return None
    return math.degrees(math.atan(2.0 * abs(limit) * math.tan(math.radians(field_of_view / 2.0))))


@dataclass(frozen=True)
class CameraOptics:
    timestamp_ms: int
    source: str
    source_confidence: str
    recording_width_px: int
    recording_height_px: int
    aspect_ratio: str
    recording_mode: str
    stabilisation_mode: str
    slider_position_0_1: float
    optical_zoom_ratio_estimate: float
    physical_focal_length_mm: object
    equivalent_focal_length_mm: float
    horizontal_fov_deg: float
    vertical_fov_deg: float
    fov_model: str
    optics_valid: bool

    def as_dict(self):
        return asdict(self)


def camera_optics(slider_position=0.0, stabilisation_mode="STANDARD_OR_OFF", timestamp_ms=0):
    mode = stabilisation_mode if stabilisation_mode in RANGES else "STANDARD_OR_OFF"
    minimum, _ = RANGES[mode]
    focal = equivalent_focal_length_mm(slider_position, mode)
    return CameraOptics(int(timestamp_ms), "MANUAL", "ESTIMATED", 1920, 1080, "16:9",
                        "FULL_HD_1080_50P", mode, max(0.0, min(1.0, float(slider_position))),
                        focal / minimum, None, focal, fov_deg(W16_9_MM, focal),
                        fov_deg(H16_9_MM, focal), "CANON_EQUIVALENT", True)
