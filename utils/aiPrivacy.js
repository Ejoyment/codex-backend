function parsePrivacyMode(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  console.warn(`[ai] invalid local privacy mode "${normalized}"; using local routing for safety`);
  return true;
}

module.exports = { parsePrivacyMode };
