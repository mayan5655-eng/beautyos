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
function getKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }
  
  const key = Buffer.from(keyHex, 'hex');
  
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${key.length} bytes.`
    );
  }
  
  return key;
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
  
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final()
  ]);
  
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