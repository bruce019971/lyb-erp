import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    throw new Error("密码不能为空");
  }

  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(normalizedPassword, salt, SCRYPT_KEY_LENGTH).toString(
    "base64url",
  );

  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) {
    return false;
  }

  const [algorithm, salt, storedHash] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const derivedHash = scryptSync(
    password.trim(),
    salt,
    SCRYPT_KEY_LENGTH,
  ).toString("base64url");

  return timingSafeEqual(
    Buffer.from(derivedHash),
    Buffer.from(storedHash),
  );
}
