// Calibration bootstrap helpers for the public valuation page.
function getCalibrationForProperty(propertyType) { return AQAR_CALIBRATION_DEFAULTS.getPropertyConfig(AQAR_ACTIVE_CALIBRATION, propertyType); }
function getCalibrationCoefficient(propertyType, group, key, fallback) {
  const value = getCalibrationForProperty(propertyType)?.coefficients?.[group]?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
async function loadCalibrationConfig() {
  try {
    const response = await fetch(`/api/calibration-config?_calibration_fetch=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Calibration HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.config) AQAR_ACTIVE_CALIBRATION = payload.config;
    AQAR_V21_SHADOW_CONFIG = payload.config?.v21ShadowMultipliers || AQAR_V21_SHADOW_MULTIPLIERS.createNeutralConfig();
    window.aqarCalibrationConfig = AQAR_ACTIVE_CALIBRATION;
    window.aqarV21ShadowConfig = AQAR_V21_SHADOW_CONFIG;
  } catch (error) {
    window.aqarCalibrationConfig = AQAR_ACTIVE_CALIBRATION;
    window.aqarV21ShadowConfig = AQAR_V21_SHADOW_CONFIG;
    console.warn('Using default AQAR calibration:', error.message);
  }
}
