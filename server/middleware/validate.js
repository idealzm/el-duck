function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim();
  if (normalized.length < 6 || normalized.length > 254) return false;
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(normalized);
}

function validateNumber(value, min, max) {
  if (typeof value !== 'number' || isNaN(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function validateString(value, minLength, maxLength) {
  if (typeof value !== 'string') return false;
  if (minLength !== undefined && value.length < minLength) return false;
  if (maxLength !== undefined && value.length > maxLength) return false;
  return true;
}

function validateBoolean(value) {
  return typeof value === 'boolean';
}

function createValidator(rules) {
  return (req, res, next) => {
    const errors = [];
    const source = req.body || {};

    for (const [field, rule] of Object.entries(rules)) {
      const value = source[field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} обязателен`);
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        if (rule.type === 'email' && !validateEmail(value)) {
          errors.push(`${field} должен быть email`);
        }
        if (rule.type === 'number' && !validateNumber(value, rule.min, rule.max)) {
          errors.push(`${field} должен быть числом${rule.min !== undefined ? ` от ${rule.min}` : ''}${rule.max !== undefined ? ` до ${rule.max}` : ''}`);
        }
        if (rule.type === 'string' && !validateString(value, rule.minLength, rule.maxLength)) {
          errors.push(`${field} должен быть строкой${rule.minLength ? ` от ${rule.minLength} символов` : ''}`);
        }
        if (rule.type === 'boolean' && !validateBoolean(value)) {
          errors.push(`${field} должен быть boolean`);
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`${field} должен быть одним из: ${rule.enum.join(', ')}`);
        }
        if (rule.mustBeTrue && value !== true) {
          errors.push(`${field} должен быть true`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    next();
  };
}

module.exports = {
  validateEmail,
  validateNumber,
  validateString,
  createValidator
};
