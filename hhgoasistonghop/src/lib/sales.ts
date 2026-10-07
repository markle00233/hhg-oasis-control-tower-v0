import { SALES_PEOPLE, type SalesPersonCode } from "@/config/crm.config";

export function isValidSalesPersonCode(code: string | null | undefined): code is SalesPersonCode {
  return !!code && SALES_PEOPLE.some((s) => s.code === code);
}

export function parseSalesPersonCode(formData: FormData): SalesPersonCode | null {
  const code = String(formData.get("salesPersonCode") || "").trim();
  return isValidSalesPersonCode(code) ? code : null;
}

export function requireSalesPersonCode(formData: FormData): SalesPersonCode | { error: string } {
  const code = parseSalesPersonCode(formData);
  if (!code) {
    return { error: "Chọn NV kinh doanh (Sale)" };
  }
  return code;
}
