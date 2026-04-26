// src/lib/crypto.js
import crypto from 'crypto';

const RAW_KEY = process.env.ENCRYPTION_KEY || 'applypilot_default_key_32chars!!';
// Always use exactly 32 bytes
const KEY_BUFFER = Buffer.from(RAW_KEY.padEnd(32, '0').substring(0, 32));

/**
 * Encrypts a plaintext string (API key) using AES-256-CBC.
 * Returns a string in the format: iv_hex:encrypted_hex
 */
export function encryptKey(plaintext) {
  if (!plaintext) return null;
  // Already encrypted? (iv:data pattern)
  if (typeof plaintext === 'string' && plaintext.includes(':') && plaintext.length > 60) {
    return plaintext;
  }
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', KEY_BUFFER, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (e) {
    console.error('[Crypto] Encryption error:', e.message);
    return plaintext;
  }
}

/**
 * Decrypts an AES-256-CBC encrypted string (iv_hex:encrypted_hex).
 */
export function decryptKey(encrypted) {
  if (!encrypted) return null;
  if (!encrypted.includes(':')) return encrypted; // Plaintext / old format
  try {
    const [ivHex, data] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY_BUFFER, iv);
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[Crypto] Decryption error:', e.message);
    return encrypted;
  }
}

/**
 * Returns a masked hint for display: first 4 + ... + last 4 chars
 */
export function maskKey(plaintext) {
  if (!plaintext || plaintext.length < 8) return '****';
  return `${plaintext.slice(0, 4)}...${plaintext.slice(-4)}`;
}
