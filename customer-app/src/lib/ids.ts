/** Customer code like CUS-A82K91 */
export function generateCustomerCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let body = "";
  for (let i = 0; i < 6; i++) {
    body += alphabet[bytes[i]! % alphabet.length];
  }
  return `CUS-${body}`;
}
