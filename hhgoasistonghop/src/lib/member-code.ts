/** Mã hội viên = mã khách hàng. Chỉ 2 dạng: cá nhân / gia đình (GĐ). */

export function displayMemberCode(
  customerCode: string | null | undefined,
  isFamily: boolean
): string {
  if (!customerCode) return "—";
  const base = customerCode.trim().replace(/\s*-\s*G[ĐD]\s*$/i, "");
  return isFamily ? `${base} - GĐ` : base;
}

export function isFamilyCustomer(
  customer: { familyGroupId?: string | null } | null | undefined
): boolean {
  return !!customer?.familyGroupId;
}
