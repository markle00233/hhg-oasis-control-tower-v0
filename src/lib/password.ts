import bcrypt from "bcryptjs";

const ROUNDS = 12;

/** Server-only. Never import from client bundles. */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(plain, ROUNDS);
}

/** Server-only. Never import from client bundles. */
export async function verifyPassword(
  plain: string,
  passwordHash: string
): Promise<boolean> {
  if (!plain || !passwordHash) return false;
  return bcrypt.compare(plain, passwordHash);
}
