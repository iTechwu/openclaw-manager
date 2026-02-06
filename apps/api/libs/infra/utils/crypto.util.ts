import * as crypto from 'crypto';
import * as CryptoJS from 'crypto-js';

export function rsaDecrypt(val: string) {
  if (!val || typeof val !== 'string') {
    console.error('[rsaDecrypt] Invalid input:', {
      val: val?.substring(0, 50),
    });
    return '';
  }
  try {
    // 将 base64 编码的加密数据转换为 Buffer
    const bytes = CryptoJS.AES.decrypt(val, 'qmez2n1llvatr8gczip6uyokpi1wi8ys');
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText || originalText.trim() === '') {
      console.error('[rsaDecrypt] Decryption result is empty', {
        inputLength: val.length,
        inputPreview: val.substring(0, 50),
      });
    }
    return originalText;
  } catch (error) {
    console.error('[rsaDecrypt] Decryption failed:', {
      error: error.message || error,
      inputLength: val.length,
      inputPreview: val.substring(0, 50),
    });
    return '';
  }
}

/**
 * AES 加密（实际是 AES，但函数名保持与 Vue 代码一致）
 */
export function rsaEncrypt(val: string): string {
  const key = 'qmez2n1llvatr8gczip6uyokpi1wi8ys';
  const cipher = CryptoJS.AES.encrypt(val, key);
  return cipher.toString();
}

/**
 * 使用 AES 算法解密数据
 * @param val 加密后的字符串（通常是 Base64 编码）
 * @param secretKey 密钥（必须是字符串）
 * @returns 解密后的字符串
 */
/**
 * AES CBC decryption function
 * @param {string} val - Encrypted data (Base64 encoded string)
 * @param {string} secretKey - Secret key (string)
 * @param {string} iv - Initialization vector (string)
 * @returns {string} - Decrypted data (original text)
 */
export function aesCbcDecrypt(val, secretKey, iv) {
  try {
    // Validate inputs
    if (!val || typeof val !== 'string') {
      throw new Error(`Invalid encrypted data: ${typeof val}`);
    }
    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error(`Invalid secret key: ${typeof secretKey}`);
    }
    if (!iv || typeof iv !== 'string') {
      throw new Error(`Invalid IV: ${typeof iv}`);
    }

    const ivBuffer = CryptoJS.enc.Utf8.parse(iv);

    const decryptedBytes = CryptoJS.AES.decrypt(
      val,
      CryptoJS.enc.Utf8.parse(secretKey),
      {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivBuffer,
      },
    );

    // Check if decryption produced any output
    if (!decryptedBytes || decryptedBytes.sigBytes <= 0) {
      throw new Error(
        `Decryption produced empty result. Input length: ${val.length}, Key length: ${secretKey.length}, IV length: ${iv.length}`,
      );
    }

    const originalText = decryptedBytes.toString(CryptoJS.enc.Utf8);

    // Validate the decrypted text is not empty
    if (!originalText) {
      throw new Error(
        `Decryption produced empty string. sigBytes: ${decryptedBytes.sigBytes}`,
      );
    }

    return originalText;
  } catch (error) {
    console.error('Decryption failed:', error);
    console.error('Decryption context:', {
      inputLength: val?.length,
      inputPreview: val?.substring(0, 50),
      keyLength: secretKey?.length,
      ivLength: iv?.length,
    });
    throw new Error('Failed to decrypt data due to an error.');
  }
}

/**
 * AES CBC encryption function
 * @param {string} plainText - Data to encrypt (string)
 * @param {string} secretKey - Secret key (string)
 * @param {string} iv - Initialization vector (string or Buffer)
 * @returns {string} - Encrypted data (Base64 encoded string)
 */
export function aesCbcEncrypt(plainText, secretKey, iv) {
  const ivBuffer = CryptoJS.enc.Utf8.parse(iv);

  const ciphered = CryptoJS.AES.encrypt(
    plainText,
    CryptoJS.enc.Utf8.parse(secretKey),
    {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivBuffer,
    },
  );

  return ciphered.toString();
}
/**
 * 解密
 * @param dataStr {string}
 * @param key {string}
 * @param iv {string}
 * @return {string}
 */
export function decrypt(dataStr: string, key: string, iv: string): string {
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(dataStr, 'base64', 'utf8');
    try {
      decrypted += decipher.final('utf8');
    } catch (err) {
      console.error('Decryption failed:', err);
      throw err; // 或者您可以选择返回一个错误消息或空字符串
    }
    return decrypted;
  } catch (err) {
    console.error('Error in decryption setup:', err);
    throw err; // 抛出错误或返回错误消息
  }
}

/**
 * 加密
 * @param dataStr {string}
 * @param key {string}
 * @param iv {string} 16位
 * @return {string}
 */
export function encrypt(dataStr: string, key: string, iv: string): string {
  try {
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(true);

    let encrypted = cipher.update(dataStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return encrypted;
  } catch (err) {
    console.error('Error in encryption:', err);
    throw new Error('Error encrypting data');
  }
}

export function WXBizDataCrypt(appId, sessionKey, encryptedData, iv) {
  // base64 decode
  sessionKey = Buffer.from(sessionKey, 'base64');
  encryptedData = Buffer.from(encryptedData, 'base64');
  iv = Buffer.from(iv, 'base64');

  let decoded;
  try {
    // 解密
    const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, iv);
    // 设置自动 padding 为 true，删除填充补位
    decipher.setAutoPadding(true);
    decoded = decipher.update(encryptedData, 'binary', 'utf8');
    decoded += decipher.final('utf8');
    decoded = JSON.parse(decoded);
  } catch (err) {
    throw new Error('解密失败');
  }

  if (decoded.watermark.appid !== appId) {
    throw new Error('appid 错误');
  }

  return decoded;
}

/**
 * @param {string} algorithm
 * @param {any} content
 *  @return {string}
 */
export const signEncrypt = (algorithm, content) => {
  const hash = crypto.createHash(algorithm);
  hash.update(content);
  return hash.digest('hex');
};

/**
 * @param {any} content
 *  @return {string}
 */
export const sha1 = (content) => signEncrypt('sha1', content);

export const signUrl = (uri: string, key: string): string => {
  // 使用CryptoJS计算HMAC_SHA1
  const hash = CryptoJS.HmacSHA1(uri, key);

  const wordArray = hash.words;
  const sigBytes = hash.sigBytes;
  const buffer = Buffer.from(wordArray.map((word) => (word >>> 0) & 0xff));
  // 使用Base64 URL安全的编码
  const hash_encoded = buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 将签名信息添加到URL末尾
  const signedUrl = `${uri}sig=${hash_encoded}`;

  return signedUrl;
};
