import crypto from "node:crypto";

/**
 * Chiffrement des identifiants de connecteurs (tokens Shopify, etc.).
 * AES-256-GCM, cle derivee de APP_ENCRYPTION_KEY.
 * Un token ne doit JAMAIS etre stocke en clair en base.
 */
function key() {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY manquante ou trop courte (32 caracteres minimum)");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(texteClair: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const chiffre = Buffer.concat([cipher.update(texteClair, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), chiffre]).toString("base64");
}

export function decrypt(paquet: string): string {
  const buf = Buffer.from(paquet, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const chiffre = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(chiffre), decipher.final()]).toString("utf8");
}
