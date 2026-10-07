"use client";

import { use } from "react";
import { CheckinFlow } from "@/components/CheckinFlow";

/** Legacy /scan/SAUNA — same flow as /s/[token]. */
export default function ConfirmScanPage({
  params,
}: {
  params: Promise<{ serviceCode: string }>;
}) {
  const { serviceCode } = use(params);
  return <CheckinFlow serviceToken={serviceCode} />;
}
