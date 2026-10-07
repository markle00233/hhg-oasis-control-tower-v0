"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReceiptPrintButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#111827] px-3 text-xs font-medium text-white hover:bg-[#1f2937]",
        className
      )}
    >
      <Printer className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

export function PrintToolbar({ title }: { title: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#e5e7eb] bg-white/95 px-4 py-3 backdrop-blur">
      <div className="text-sm font-medium text-[#111827]">{title}</div>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#111827] px-4 text-xs font-medium text-white"
      >
        <Printer className="h-3.5 w-3.5" />
        In hợp đồng
      </button>
    </div>
  );
}
