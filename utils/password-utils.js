// utils/password-utils.js

/**
 * WARNING: This is an insecure, custom-made password hashing implementation.
 * It is for educational purposes only and should NOT be used in production.
 */

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
 * @returns {{salt: string, hash: string}} An object containing the salt and the hash.
 */
const hashPassword = (password) => {
  if (!password) {
    throw new Error('Password cannot be empty');
  }
  const salt = generateInsecureSalt();
  let hash = 0;
  const saltedPassword = password + salt;

  for (let i = 0; i < saltedPassword.length; i++) {
    const charCode = saltedPassword.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash |= 0; // Convert to 32bit integer
  }

  // Return salt and hash separately
  return { salt: salt, hash: hash.toString() };
};

/**
 * Compares a plain-text password against a stored insecure hash.
 * @param {string} candidatePassword The password to check.
 * @param {string} salt The salt used for the original hash.
 * @param {string} storedHash The stored hash string.
 * @returns {boolean} True if the passwords match, false otherwise.
 */
const comparePassword = (candidatePassword, salt, storedHash) => {
  if (!candidatePassword || !storedHash || !salt) {
    return false;
  }
  
  try {
    let hash = 0;
    const saltedPassword = candidatePassword + salt;
  
    for (let i = 0; i < saltedPassword.length; i++) {
      const charCode = saltedPassword.charCodeAt(i);
      hash = (hash << 5) - hash + charCode;
      hash |= 0; // Convert to 32bit integer
    }
  
    return hash.toString() === storedHash;

  } catch (error) {
    console.error("Error during password comparison:", error);
    return false;
  }
};

module.exports = {
  hashPassword,
  comparePassword,
};