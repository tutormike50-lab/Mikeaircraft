const control = require('./control');

module.exports = function cameraCalibration(req, res) {
  req.query = { ...(req.query || {}), page: 'calibration' };
  return control(req, res);
};
