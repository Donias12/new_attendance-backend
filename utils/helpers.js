/**
 * Generate a random alphanumeric string
 * @param {number} length - Length of the string to generate
 * @returns {string} - Random alphanumeric string
 */
exports.generateRandomString = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate a module invite code
 * @returns {string} - Module invite code in format 'INV-XXXXXX'
 */
exports.generateInviteCode = () => {
  return `INV-${this.generateRandomString(6)}`;
};

/**
 * Generate a session code for attendance
 * @returns {string} - Session code in format 'XXXXXX'
 */
exports.generateSessionCode = () => {
  return this.generateRandomString(6);
};

/**
 * Calculate date from now plus minutes
 * @param {number} minutes - Minutes to add to current time
 * @returns {Date} - Future date
 */
exports.calculateExpiryTime = (minutes) => {
  const now = new Date();
  return new Date(now.getTime() + minutes * 60000);
};