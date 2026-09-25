"""Pure production tracking geometry and Controller V1 policy.

No Bluetooth, network, filesystem, or hardware access lives in this module.  The
runtime adapter is production_tracker.py; keeping this core pure makes the
continuous target and fail-safe behaviour deterministic offline.
"""

from dataclasses import asdict, dataclass
import math
from typing import Optional


EARTH_RADIUS_M = 6_371_008.8
WGS84_A_M = 6_378_137.0
WGS84_F = 1.0 / 298.257223563
KNOT_TO_M_S = 0.514444
FEET_TO_M = 0.3048


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def wrap180(value):
    return (value + 180.0) % 360.0 - 180.0


@dataclass(frozen=True)
class CameraReference:
    latitude_deg: float
    longitude_deg: float
    altitude_ellipsoid_m: Optional[float]
    home_true_azimuth_deg: float
    home_elevation_deg: float
    calibration_timestamp_ms: int
    source: str = "CAMERA_REFERENCE"

    @classmethod
    def from_api(cls, value):
        orientation = value.get("orientation") or {}
        altitude = value.get("altitudeM")
        datum = value.get("altitudeDatum")
        if altitude is not None and datum != "WGS84_ELLIPSOID":
            altitude = None
        completed = value.get("calibrationCompletedAt") or value.get("updatedAt")
        try:
            from datetime import datetime
            timestamp_ms = int(datetime.fromisoformat(str(completed).replace("Z", "+00:00")).timestamp() * 1000)
        except (TypeError, ValueError):
            timestamp_ms = 0
        required = (value.get("lat"), value.get("lon"),
                    orientation.get("homeTrueAzimuthDeg"), orientation.get("homeElevationDeg"))
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in required):
            raise ValueError("CameraReference is missing calibrated position or HOME orientation")
        return cls(float(required[0]), float(required[1]),
                   None if altitude is None else float(altitude),
                   float(required[2]), float(required[3]), timestamp_ms,
                   str(value.get("source") or "CAMERA_REFERENCE"))


@dataclass(frozen=True)
class AircraftObservation:
    aircraft_id: str
    timestamp_ms: int
    latitude_deg: float
    longitude_deg: float
    altitude_ellipsoid_m: Optional[float]
    ground_speed_kt: Optional[float]
    track_deg: Optional[float]
    vertical_rate_ft_min: Optional[float]
    position_source: str = "ADS_B"
    altitude_source: str = "ADS_B_GEOMETRIC"
    velocity_source: str = "ADS_B_GROUND_VECTOR"


@dataclass(frozen=True)
class GeometryTarget:
    timestamp_ms: int
    aircraft_id: Optional[str]
    target_true_azimuth_deg: Optional[float]
    target_elevation_deg: Optional[float]
    target_yaw_relative_deg: Optional[float]
    target_pitch_relative_deg: Optional[float]
    target_yaw_rate_deg_s: float
    target_pitch_rate_deg_s: float
    aircraft_state_timestamp_ms: Optional[int]
    aim_timestamp_ms: int
    source_age_ms: Optional[int]
    prediction_age_ms: Optional[int]
    horizontal_range_m: Optional[float]
    slant_range_m: Optional[float]
    position_source: Optional[str]
    altitude_source: Optional[str]
    velocity_source: Optional[str]
    horizontal_valid: bool
    vertical_valid: bool
    status: str
    correction_event: bool = False

    def as_dict(self):
        return asdict(self)


@dataclass
class _State:
    aircraft_id: str
    timestamp_ms: int
    east_m: float
    north_m: float
    up_m: Optional[float]
    velocity_east_m_s: float
    velocity_north_m_s: float
    velocity_up_m_s: float
    position_source: str
    altitude_source: str
    velocity_source: str


class AircraftStateEstimator:
    """Timestamp-aware constant-velocity filter in the camera ENU frame."""

    def __init__(self, camera, position_gain=0.20, velocity_gain=0.20,
                 innovation_limit_m=2500.0, max_velocity_correction_m_s=35.0):
        self.camera = camera
        self.position_gain = position_gain
        self.velocity_gain = velocity_gain
        self.innovation_limit_m = innovation_limit_m
        self.max_velocity_correction_m_s = max_velocity_correction_m_s
        self.state = None
        self.latest_position_timestamp_ms = None
        self.correction_event = False

    def clear(self):
        self.state = None
        self.latest_position_timestamp_ms = None
        self.correction_event = False

    def _enu(self, observation):
        if self.camera.altitude_ellipsoid_m is None:
            # A zero height still gives authoritative horizontal geometry. The
            # vertical channel remains explicitly invalid below.
            camera_height = 0.0
        else:
            camera_height = self.camera.altitude_ellipsoid_m
        aircraft_height = (observation.altitude_ellipsoid_m
                           if observation.altitude_ellipsoid_m is not None
                           else camera_height)

        def ecef(latitude_deg, longitude_deg, height_m):
            latitude = math.radians(latitude_deg)
            longitude = math.radians(longitude_deg)
            eccentricity_sq = WGS84_F * (2.0 - WGS84_F)
            prime_vertical = WGS84_A_M / math.sqrt(1.0 - eccentricity_sq * math.sin(latitude) ** 2)
            return ((prime_vertical + height_m) * math.cos(latitude) * math.cos(longitude),
                    (prime_vertical + height_m) * math.cos(latitude) * math.sin(longitude),
                    (prime_vertical * (1.0 - eccentricity_sq) + height_m) * math.sin(latitude))

        camera_xyz = ecef(self.camera.latitude_deg, self.camera.longitude_deg, camera_height)
        aircraft_xyz = ecef(observation.latitude_deg, observation.longitude_deg, aircraft_height)
        dx, dy, dz = (aircraft_xyz[index] - camera_xyz[index] for index in range(3))
        latitude = math.radians(self.camera.latitude_deg)
        longitude = math.radians(self.camera.longitude_deg)
        east = -math.sin(longitude) * dx + math.cos(longitude) * dy
        north = (-math.sin(latitude) * math.cos(longitude) * dx
                 - math.sin(latitude) * math.sin(longitude) * dy
                 + math.cos(latitude) * dz)
        up_value = (math.cos(latitude) * math.cos(longitude) * dx
                    + math.cos(latitude) * math.sin(longitude) * dy
                    + math.sin(latitude) * dz)
        vertical_compatible = (observation.altitude_ellipsoid_m is not None
                               and self.camera.altitude_ellipsoid_m is not None)
        return east, north, up_value if vertical_compatible else None

    @staticmethod
    def _velocity(observation):
        if observation.ground_speed_kt is None or observation.track_deg is None:
            return None
        speed = observation.ground_speed_kt * KNOT_TO_M_S
        track = math.radians(observation.track_deg)
        vertical = 0.0 if observation.vertical_rate_ft_min is None else observation.vertical_rate_ft_min * FEET_TO_M / 60.0
        return speed * math.sin(track), speed * math.cos(track), vertical

    def update(self, observation):
        if not observation.aircraft_id or observation.timestamp_ms <= 0:
            return False
        values = (observation.latitude_deg, observation.longitude_deg)
        if not all(math.isfinite(v) for v in values):
            return False
        if not (-90 <= observation.latitude_deg <= 90 and -180 <= observation.longitude_deg <= 180):
            return False
        if self.state and observation.aircraft_id != self.state.aircraft_id:
            self.clear()
        if self.latest_position_timestamp_ms is not None and observation.timestamp_ms <= self.latest_position_timestamp_ms:
            return False

        east, north, up = self._enu(observation)
        measured_velocity = self._velocity(observation)
        if self.state is None:
            velocity = measured_velocity or (0.0, 0.0, 0.0)
            self.state = _State(observation.aircraft_id, observation.timestamp_ms, east, north, up,
                                *velocity, observation.position_source, observation.altitude_source,
                                observation.velocity_source if measured_velocity else "UNAVAILABLE")
            self.latest_position_timestamp_ms = observation.timestamp_ms
            return True

        prior = self.predict(observation.timestamp_ms)
        innovation_e = east - prior.east_m
        innovation_n = north - prior.north_m
        innovation_u = 0.0 if up is None or prior.up_m is None else up - prior.up_m
        innovation = math.sqrt(innovation_e ** 2 + innovation_n ** 2 + innovation_u ** 2)
        if innovation > self.innovation_limit_m:
            return False
        dt = max(0.05, (observation.timestamp_ms - self.state.timestamp_ms) / 1000.0)
        corrected_e = prior.east_m + self.position_gain * innovation_e
        corrected_n = prior.north_m + self.position_gain * innovation_n
        corrected_u = None if up is None else (up if prior.up_m is None else prior.up_m + self.position_gain * innovation_u)
        # ADS-B position fixes are quantised and can arrive in batches. Feeding a
        # large innovation/dt straight into velocity made each new report look
        # like a motor pulse (and could briefly reverse the requested rate).
        velocity_correction_e = clamp(self.velocity_gain * innovation_e / dt,
                                      -self.max_velocity_correction_m_s,
                                      self.max_velocity_correction_m_s)
        velocity_correction_n = clamp(self.velocity_gain * innovation_n / dt,
                                      -self.max_velocity_correction_m_s,
                                      self.max_velocity_correction_m_s)
        velocity_correction_u = clamp(self.velocity_gain * innovation_u / dt,
                                      -self.max_velocity_correction_m_s,
                                      self.max_velocity_correction_m_s)
        inferred = (prior.velocity_east_m_s + velocity_correction_e,
                    prior.velocity_north_m_s + velocity_correction_n,
                    prior.velocity_up_m_s + velocity_correction_u)
        if measured_velocity:
            inferred = tuple((1.0 - self.velocity_gain) * a + self.velocity_gain * b
                             for a, b in zip(inferred, measured_velocity))
        self.correction_event = innovation > 250.0
        self.state = _State(observation.aircraft_id, observation.timestamp_ms,
                            corrected_e, corrected_n, corrected_u, *inferred,
                            observation.position_source, observation.altitude_source,
                            observation.velocity_source if measured_velocity else "CARTESIAN_REGRESSION")
        self.latest_position_timestamp_ms = observation.timestamp_ms
        return True

    def predict(self, timestamp_ms):
        if self.state is None:
            return None
        dt = (timestamp_ms - self.state.timestamp_ms) / 1000.0
        return _State(self.state.aircraft_id, timestamp_ms,
                      self.state.east_m + self.state.velocity_east_m_s * dt,
                      self.state.north_m + self.state.velocity_north_m_s * dt,
                      None if self.state.up_m is None else self.state.up_m + self.state.velocity_up_m_s * dt,
                      self.state.velocity_east_m_s, self.state.velocity_north_m_s,
                      self.state.velocity_up_m_s, self.state.position_source,
                      self.state.altitude_source, self.state.velocity_source)


class GeometryTargetSource:
    def __init__(self, camera, effective_latency_s=0.25, valid_age_s=0.35,
                 stale_age_s=5.0):
        self.camera = camera
        self.effective_latency_s = effective_latency_s
        self.valid_age_ms = int(valid_age_s * 1000)
        self.stale_age_ms = int(stale_age_s * 1000)
        self.estimator = AircraftStateEstimator(camera)
        self.active_aircraft_id = None

    def select_aircraft(self, aircraft_id):
        if aircraft_id != self.active_aircraft_id:
            self.estimator.clear()
            self.active_aircraft_id = aircraft_id

    def update(self, observation):
        if observation.aircraft_id != self.active_aircraft_id:
            self.select_aircraft(observation.aircraft_id)
        return self.estimator.update(observation)

    def latest(self, now_ms):
        aim_ms = now_ms + round(self.effective_latency_s * 1000)
        state = self.estimator.state
        if self.active_aircraft_id is None:
            return GeometryTarget(now_ms, None, self.camera.home_true_azimuth_deg,
                                  self.camera.home_elevation_deg, 0.0, 0.0, 0.0, 0.0,
                                  None, aim_ms, None, None, None, None,
                                  "CAMERA_REFERENCE", "CAMERA_REFERENCE", None,
                                  True, True, "HOME")
        if state is None:
            return GeometryTarget(now_ms, None, None, None, None, None, 0.0, 0.0,
                                  None, aim_ms, None, None, None, None, None, None,
                                  None, False, False, "INVALID")
        source_age = max(0, now_ms - self.estimator.latest_position_timestamp_ms)
        prediction_age = aim_ms - state.timestamp_ms
        predicted = self.estimator.predict(aim_ms)
        horizontal_sq = predicted.east_m ** 2 + predicted.north_m ** 2
        horizontal = math.sqrt(horizontal_sq)
        horizontal_valid = horizontal >= 1.0 and all(math.isfinite(v) for v in (predicted.east_m, predicted.north_m))
        vertical_valid = horizontal_valid and predicted.up_m is not None and math.isfinite(predicted.up_m)
        if not horizontal_valid:
            status = "INVALID"
        elif source_age > self.stale_age_ms:
            status = "STALE"
        elif source_age <= self.valid_age_ms:
            status = "VALID"
        else:
            status = "PREDICTED"
        azimuth = (math.degrees(math.atan2(predicted.east_m, predicted.north_m)) + 360.0) % 360.0 if horizontal_valid else None
        yaw_relative = wrap180(azimuth - self.camera.home_true_azimuth_deg) if horizontal_valid else None
        yaw_rate = math.degrees((predicted.north_m * predicted.velocity_east_m_s - predicted.east_m * predicted.velocity_north_m_s) / horizontal_sq) if horizontal_valid else 0.0
        elevation = pitch_relative = None
        pitch_rate = 0.0
        slant = horizontal
        if vertical_valid:
            slant_sq = horizontal_sq + predicted.up_m ** 2
            slant = math.sqrt(slant_sq)
            elevation = math.degrees(math.atan2(predicted.up_m, horizontal))
            pitch_relative = elevation - self.camera.home_elevation_deg
            horizontal_rate = (predicted.east_m * predicted.velocity_east_m_s + predicted.north_m * predicted.velocity_north_m_s) / horizontal
            pitch_rate = math.degrees((horizontal * predicted.velocity_up_m_s - predicted.up_m * horizontal_rate) / slant_sq)
        return GeometryTarget(now_ms, state.aircraft_id, azimuth, elevation, yaw_relative,
                              pitch_relative, yaw_rate, pitch_rate, state.timestamp_ms,
                              aim_ms, source_age, prediction_age, horizontal, slant,
                              state.position_source, state.altitude_source, state.velocity_source,
                              horizontal_valid, vertical_valid, status,
                              self.estimator.correction_event)


@dataclass(frozen=True)
class ControllerOutput:
    state: str
    yaw_error_deg: Optional[float]
    pitch_error_deg: Optional[float]
    requested_yaw_rate_deg_s: float
    requested_pitch_rate_deg_s: float
    pan_command: int
    tilt_command: int


class LegacyPitchActuator:
    """Preserve the proven stepped pitch behaviour pending characterisation."""

    @staticmethod
    def command(physical_pitch_error_deg):
        magnitude = abs(physical_pitch_error_deg)
        if magnitude <= 0.35:
            return 0
        speed = 90 if magnitude > 8 else 70 if magnitude > 4 else 50 if magnitude > 2 else 35 if magnitude > 0.8 else 25
        return speed if physical_pitch_error_deg > 0 else -speed


class ControllerV1:
    RS4_YAW_SIGN = 1
    RS4_PITCH_SIGN = 1
    YAW_DEG_S_PER_COMMAND = 0.063

    def __init__(self, pitch_actuator=None, acquire_kp=1.0, acquire_kd=0.5,
                 track_kp=0.45,
                 max_yaw_command=300, capture_cycles=4, stale_ramp_dps2=12.0,
                 max_yaw_accel_dps2=24.0, home_kp=0.65):
        self.pitch_actuator = pitch_actuator or LegacyPitchActuator()
        self.acquire_kp = acquire_kp
        self.acquire_kd = acquire_kd
        self.track_kp = track_kp
        self.max_yaw_command = max_yaw_command
        self.capture_cycles = capture_cycles
        self.stale_ramp_dps2 = stale_ramp_dps2
        self.max_yaw_accel_dps2 = max_yaw_accel_dps2
        self.home_kp = home_kp
        self.aircraft_id = None
        self.mode = "WAITING"
        self.estimated_yaw_deg = 0.0
        self.estimated_pitch_deg = 0.0
        self.last_yaw_rate = 0.0
        self.inside_cycles = 0

    def reset_target(self, aircraft_id):
        self.aircraft_id = aircraft_id
        self.mode = "ACQUIRE"
        self.last_yaw_rate = 0.0
        self.inside_cycles = 0

    def correct_telemetry(self, measured_yaw_relative_deg, measured_pitch_relative_deg,
                          blend=0.35):
        self.estimated_yaw_deg = wrap180(self.estimated_yaw_deg + blend * wrap180(measured_yaw_relative_deg - self.estimated_yaw_deg))
        self.estimated_pitch_deg += blend * (measured_pitch_relative_deg - self.estimated_pitch_deg)

    def step(self, target, dt_s):
        dt_s = clamp(dt_s, 0.001, 0.25)
        if target.status == "HOME":
            self.aircraft_id = None
            yaw_error = wrap180(-self.estimated_yaw_deg)
            pitch_error = -self.estimated_pitch_deg
            desired_rate = clamp(self.home_kp * yaw_error,
                                 -self.max_yaw_command * self.YAW_DEG_S_PER_COMMAND,
                                 self.max_yaw_command * self.YAW_DEG_S_PER_COMMAND)
            yaw_rate = self._slew_yaw_rate(desired_rate, dt_s)
            pan = int(clamp(round(yaw_rate / self.YAW_DEG_S_PER_COMMAND),
                            -self.max_yaw_command, self.max_yaw_command))
            tilt = self.pitch_actuator.command(pitch_error)
            self.mode = "HOLD_HOME" if abs(yaw_error) <= 0.35 and abs(pitch_error) <= 0.35 else "RETURN_HOME"
            if self.mode == "HOLD_HOME":
                yaw_rate = 0.0
                pan = 0
                tilt = 0
                self.last_yaw_rate = 0.0
            self.estimated_yaw_deg = wrap180(self.estimated_yaw_deg + yaw_rate * dt_s)
            return ControllerOutput(self.mode, yaw_error, pitch_error, yaw_rate, 0.0,
                                    pan * self.RS4_YAW_SIGN,
                                    tilt * self.RS4_PITCH_SIGN)
        if target.aircraft_id and target.aircraft_id != self.aircraft_id:
            self.reset_target(target.aircraft_id)
        if target.status == "INVALID" or not target.horizontal_valid:
            self.mode = "FAULT"
            self.last_yaw_rate = 0.0
            return ControllerOutput(self.mode, None, None, 0.0, 0.0, 0, 0)
        if target.status == "STALE":
            self.mode = "HOLD"
            change = self.stale_ramp_dps2 * dt_s
            self.last_yaw_rate = max(0.0, self.last_yaw_rate - change) if self.last_yaw_rate > 0 else min(0.0, self.last_yaw_rate + change)
            command = round(self.last_yaw_rate / self.YAW_DEG_S_PER_COMMAND) * self.RS4_YAW_SIGN
            command = int(clamp(command, -self.max_yaw_command, self.max_yaw_command))
            self.estimated_yaw_deg = wrap180(self.estimated_yaw_deg + self.last_yaw_rate * dt_s)
            return ControllerOutput(self.mode, None, None, self.last_yaw_rate, 0.0, command, 0)

        yaw_error = wrap180(target.target_yaw_relative_deg - self.estimated_yaw_deg)
        pitch_error = None if not target.vertical_valid else target.target_pitch_relative_deg - self.estimated_pitch_deg
        if self.mode not in ("ACQUIRE", "TRACK"):
            self.mode = "ACQUIRE"
        if self.mode == "TRACK" and abs(yaw_error) >= 5.0:
            self.mode = "ACQUIRE"
            self.inside_cycles = 0
        elif self.mode == "ACQUIRE":
            self.inside_cycles = self.inside_cycles + 1 if abs(yaw_error) <= 2.0 else 0
            if self.inside_cycles >= self.capture_cycles:
                self.mode = "TRACK"
        kp = self.track_kp if self.mode == "TRACK" else self.acquire_kp
        position_correction = kp * yaw_error
        if self.mode == "ACQUIRE":
            relative_yaw_rate = self.last_yaw_rate - target.target_yaw_rate_deg_s
            position_correction -= self.acquire_kd * relative_yaw_rate
            braking_rate = math.sqrt(2.0 * self.max_yaw_accel_dps2 * abs(yaw_error))
            position_correction = clamp(position_correction, -braking_rate, braking_rate)
        yaw_rate = clamp(target.target_yaw_rate_deg_s + position_correction,
                         -self.max_yaw_command * self.YAW_DEG_S_PER_COMMAND,
                         self.max_yaw_command * self.YAW_DEG_S_PER_COMMAND)
        yaw_rate = self._slew_yaw_rate(yaw_rate, dt_s)
        pan = int(clamp(round(yaw_rate / self.YAW_DEG_S_PER_COMMAND) * self.RS4_YAW_SIGN,
                        -self.max_yaw_command, self.max_yaw_command))
        tilt = 0 if pitch_error is None else self.pitch_actuator.command(pitch_error) * self.RS4_PITCH_SIGN
        self.last_yaw_rate = yaw_rate
        self.estimated_yaw_deg = wrap180(self.estimated_yaw_deg + yaw_rate * dt_s)
        requested_pitch = target.target_pitch_rate_deg_s if pitch_error is not None else 0.0
        return ControllerOutput(self.mode, yaw_error, pitch_error, yaw_rate, requested_pitch, pan, tilt)

    def _slew_yaw_rate(self, desired_rate, dt_s):
        change = self.max_yaw_accel_dps2 * dt_s
        return clamp(desired_rate, self.last_yaw_rate - change, self.last_yaw_rate + change)
