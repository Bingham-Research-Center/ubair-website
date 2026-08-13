/* Hot-Dry-Windy Index classifier. Thresholds must match the backend
   (server/fireWeatherService.js HDW_THRESHOLDS). Single source of truth
   for colors used in HDW badge + map pins. */

const HDW_CLASSES = [
    { level: 'low',       max: 5,        label: 'Low',       color: '#2d6b3a' },
    { level: 'moderate',  max: 15,       label: 'Moderate',  color: '#b08600' },
    { level: 'high',      max: 30,       label: 'High',      color: '#b85a00' },
    { level: 'very_high', max: 50,       label: 'Very High', color: '#a82632' },
    { level: 'extreme',   max: Infinity, label: 'Extreme',   color: '#5a0000' }
];

function classifyHDW(hdw) {
    if (hdw == null || !Number.isFinite(hdw)) return null;
    return HDW_CLASSES.find(c => hdw < c.max) || HDW_CLASSES[HDW_CLASSES.length - 1];
}

function levelMeta(level) {
    return HDW_CLASSES.find(c => c.level === level) || null;
}

window.HDW_CLASSES = HDW_CLASSES;
window.classifyHDW = classifyHDW;
window.levelMeta = levelMeta;
