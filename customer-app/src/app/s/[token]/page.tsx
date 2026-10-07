"use client";

import { use } from "react";
import { CheckinFlow } from "@/components/CheckinFlow";

export default function ServiceQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <CheckinFlow serviceToken={token} />;
}
