"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Click cả dòng → mở profile khách */
export function CustomerRowLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer border-b border-border/70 transition hover:bg-slate-50/80"
    >
      {children}
    </tr>
  );
}
