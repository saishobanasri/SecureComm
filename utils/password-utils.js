// utils/password-utils.js

/**
 * WARNING: This is an insecure, custom-made password hashing implementation.
 * It is for educational purposes only and should NOT be used in production.
 * It is vulnerable to many forms of cryptographic attack.
 */

// A simple, insecure function to generate a random "salt".
// In a real app, you would use crypto.randomBytes(16).toString('hex').
const generateInsecureSalt = (length = 16) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let salt = '';
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
};

/**
 * Hashes a password using a simple, insecure custom algorithm.
 * @param {string} password The plain-text password.
 * @returns {string} A string containing the salt and the insecure hash, separated by a '$'.
 */
const hashPassword = (password) => {
  if (!password) {
    throw new Error('Password cannot be empty');
  }
  const salt = generateInsecureSalt();
  let hash = 0;
  const saltedPassword = password + salt;

  // Simple, non-cryptographic hashing loop.
  for (let i = 0; i < saltedPassword.length; i++) {
    const charCode = saltedPassword.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash |= 0; // Convert to 32bit integer
  }

  // Combine salt and hash for storage.
  return `${salt}$${hash}`;
};

/**
 * Compares a plain-text password against a stored insecure hash.
 * @param {string} candidatePassword The password to check.
 * @param {string} storedHash The stored hash string (e.g., "salt$hash").
 * @returns {boolean} True if the passwords match, false otherwise.
 */
const comparePassword = (candidatePassword, storedHash) => {
  if (!candidatePassword || !storedHash) {
    return false;
  }
  
  try {
    const [salt, originalHash] = storedHash.split('$');
    let hash = 0;
    const saltedPassword = candidatePassword + salt;
  
    for (let i = 0; i < saltedPassword.length; i++) {
      const charCode = saltedPassword.charCodeAt(i);
      hash = (hash << 5) - hash + charCode;
      hash |= 0; // Convert to 32bit integer
    }
  
    return hash.toString() === originalHash;

  } catch (error) {
    // If the storedHash format is invalid, comparison fails.
    console.error("Error during password comparison:", error);
    return false;
  }
};

module.exports = {
  hashPassword,
  comparePassword,
};