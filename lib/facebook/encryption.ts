/**
 * Encryption Module for Facebook Page Access Tokens
 * 
 * משתמש ב-AES-256-GCM להצפנה מאובטחת של tokens לפני שמירה ב-DB
 * 
 * השימוש:
 * - encryptToken(token) → מצפין token לפני שמירה
 * - decryptToken(encrypted) → מפענח token כשצריך להשתמש בו
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// המפתח מגיע ממשתנה הסביבה
//
// Rotation (2026-10-20): every secret in the product (Grow, Facebook, GreenAPI, receipt providers) is sealed with this ONE key,
// so changing it used to mean losing them all. To rotate: put the new key in TOKEN_ENCRYPTION_KEY and the old one in
// TOKEN_ENCRYPTION_KEY_PREVIOUS. New values are sealed with the new key; decryptToken still opens values sealed with the old
// one, so nothing breaks while rows are re-saved. Remove _PREVIOUS once every row has been re-sealed.
function keyFrom(keyHex: string | undefined, name: string): Buffer {
  if (!keyHex) {
    throw new Error(`${name} environment variable is not set`);
  }

  const key = Buffer.from(keyHex, 'hex');

  if (key.length !== 32) {
    throw new Error(
      `${name} must be 32 bytes (64 hex chars). Got ${key.length} bytes.`
    );
  }

  return key;
}

function getKey(): Buffer {
  return keyFrom(process.env.TOKEN_ENCRYPTION_KEY, 'TOKEN_ENCRYPTION_KEY');
}

/** The previous key during a rotation, or null. */
function getPreviousKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  return hex ? keyFrom(hex, 'TOKEN_ENCRYPTION_KEY_PREVIOUS') : null;
}

/**
 * הצפנת token
 * @param plaintext - הטקסט להצפנה (Page Access Token)
 * @returns מחרוזת מוצפנת בפורמט: iv:authTag:encrypted (hex)
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Cannot encrypt empty or non-string value');
  }
  
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // הפורמט הסופי: iv:authTag:encrypted (כולם בייצוג hex)
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex')
  ].join(':');
}

/**
 * פענוח token
 * @param encrypted - הטקסט המוצפן בפורמט: iv:authTag:encrypted
 * @returns הטקסט המקורי
 */
export function decryptToken(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('Cannot decrypt empty or non-string value');
  }
  
  const parts = encrypted.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format. Expected iv:authTag:encrypted');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');

  const open = (key: Buffer) => {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  };

  let decrypted: Buffer;
  try {
    decrypted = open(getKey());
  } catch (e) {
    // Sealed before a rotation: the previous key opens it. Anything else (tampered, wrong key) still throws.
    const previous = getPreviousKey();
    if (!previous) throw e;
    decrypted = open(previous);
  }

  return decrypted.toString('utf8');
}

/**
 * בדיקה שההצפנה עובדת תקין
 * שימושי לבדיקה ראשונית של ההגדרות
 */
export function testEncryption(): boolean {
  try {
    const testText = 'test-token-12345';
    const encrypted = encryptToken(testText);
    const decrypted = decryptToken(encrypted);
    return decrypted === testText;
  } catch (error) {
    console.error('Encryption test failed:', error);
    return false;
  }
}