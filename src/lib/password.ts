import bcrypt from "bcryptjs";

const ROUNDS = 12;

/**
 * Server-only. Never import from client bundles.
 * bcryptjs chạy trên luồng chính — cost 12 dễ chiếm 5–8 giây và chặn quầy.
 * Tài khoản tạo tại quầy (mật khẩu = SĐT) dùng cost thấp hơn.
 */
export async function hashPassword(
  plain: string,
  rounds = ROUNDS
): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(plain, rounds);
}

/** Server-only. Never import from client bundles. */
export async function verifyPassword(
  plain: string,
  passwordHash: string
): Promise<boolean> {
  if (!plain || !passwordHash) return false;
  return bcrypt.compare(plain, passwordHash);
}
