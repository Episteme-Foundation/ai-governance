import { encrypt, decrypt } from './encryption';

describe('encryption', () => {
  beforeAll(() => {
    // Set a test encryption key
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('should encrypt and decrypt a string', () => {
    const plaintext = 'sk-ant-api03-test-key-12345';
    const ciphertext = encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext).toBeTruthy();

    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same-secret';
    const ciphertext1 = encrypt(plaintext);
    const ciphertext2 = encrypt(plaintext);

    expect(ciphertext1).not.toBe(ciphertext2);

    // But both should decrypt to the same value
    expect(decrypt(ciphertext1)).toBe(plaintext);
    expect(decrypt(ciphertext2)).toBe(plaintext);
  });

  it('should handle empty strings', () => {
    const ciphertext = encrypt('');
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe('');
  });

  it('should handle unicode content', () => {
    const plaintext = 'test-key-with-unicode-\u2603-\u{1F600}';
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should fail to decrypt tampered ciphertext', () => {
    const ciphertext = encrypt('test-secret');

    // Tamper with the ciphertext
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[tampered.length - 1] ^= 0xFF;
    const tamperedStr = tampered.toString('base64');

    expect(() => decrypt(tamperedStr)).toThrow();
  });
});
