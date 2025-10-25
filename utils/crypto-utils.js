// utils/crypto-utils.js

/**
 * WARNING: This is an insecure, custom-made cryptographic implementation.
 * It is for educational purposes only and should NOT be used in production.
 * It is vulnerable to many forms of cryptographic attack.
 */

// Modular exponentiation (base^exp % mod) using BigInt
const power = (base, exp, mod) => {
  let res = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) res = (res * base) % mod;
    base = (base * base) % mod;
    exp /= 2n;
  }
  return res;
};

// Miller-Rabin primality test
const isProbablyPrime = (n, k = 5) => {
  if (n <= 1n || n === 4n) return false;
  if (n <= 3n) return true;

  let d = n - 1n;
  while (d % 2n === 0n) {
    d /= 2n;
  }

  for (let i = 0; i < k; i++) {
    const a = 2n + BigInt(Math.floor(Math.random() * Number(n - 4n)));
    let x = power(a, d, n);
    if (x === 1n || x === n - 1n) continue;

    let isWitness = true;
    let tempD = d;
    while (tempD < n - 1n) {
      x = (x * x) % n;
      if (x === n - 1n) {
        isWitness = false;
        break;
      }
      tempD *= 2n;
    }
    if (isWitness) return false;
  }
  return true;
};

// Extended Euclidean Algorithm to find modular inverse
const extendedEuclideanAlgorithm = (a, b) => {
  if (a === 0n) {
    return [b, 0n, 1n];
  }
  const [gcd, x1, y1] = extendedEuclideanAlgorithm(b % a, a);
  const x = y1 - (b / a) * x1;
  const y = x1;
  return [gcd, x, y];
};

const modInverse = (a, m) => {
  const [gcd, x] = extendedEuclideanAlgorithm(a, m);
  if (gcd !== 1n) {
    throw new Error('Inverse does not exist');
  }
  return (x % m + m) % m;
};


// Simple seeded pseudo-random number generator (LCG)
const seededPseudoRandom = (seed) => {
  let state = seed;
  const m = 2n ** 31n - 1n;
  const a = 1103515245n;
  const c = 12345n;
  return () => {
    state = (a * state + c) % m;
    return state;
  };
};


// Function to find a prime of a certain bit length using the seeded PRNG
const findPrime = (bits, prng) => {
  const min = 2n ** (BigInt(bits) - 1n);
  const max = 2n ** BigInt(bits) - 1n;
  while (true) {
    const p = (prng() % (max - min)) + min;
    if (p % 2n !== 0n && isProbablyPrime(p)) {
      return p;
    }
  }
};


// Main key generation function
const generateKeys = (password, salt, bits = 64) => {
  // 1. Create a deterministic seed from password and salt
  let seed = 1n;
  const combined = password + salt;
  for (let i = 0; i < combined.length; i++) {
    seed = (seed * 31n + BigInt(combined.charCodeAt(i))) % (2n ** 31n - 1n);
  }

  // 2. Initialize the seeded PRNG
  const prng = seededPseudoRandom(seed);

  // 3. Find two distinct prime numbers
  let p = findPrime(bits, prng);
  let q = findPrime(bits, prng);
  while (p === q) {
    q = findPrime(bits, prng);
  }

  // 4. Calculate n and phi(n)
  const n = p * q;
  const phi_n = (p - 1n) * (q - 1n);

  // 5. Choose public exponent e
  const e = 65537n;

  // 6. Calculate private exponent d
  const d = modInverse(e, phi_n);

  // Return keys (n, e, d as BigInts)
  return {
    publicKey: { n, e },
    privateKey: { n, d },
  };
};

module.exports = { generateKeys };