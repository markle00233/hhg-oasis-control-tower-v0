"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ScanLine,
  Layers,
  Settings,
  LogOut,
  FileText,
  Lock,
  BarChart3,
  X,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import type { FeatureCode } from "@/config/features";

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; feature: FeatureCode }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard" },
  { href: "/customers", label: "Customers", icon: Users, feature: "customers" },
  { href: "/checkin", label: "Check-in tất cả", icon: ScanLine, feature: "checkin" },
];

const DATABASE: { href: string; label: string; icon: typeof LayoutDashboard; feature: FeatureCode }[] =
  [
    { href: "/receipts", label: "Receipt", icon: FileText, feature: "receipts" },
    { href: "/services", label: "Services", icon: Layers, feature: "services" },
    { href: "/settings", label: "Settings", icon: Settings, feature: "settings" },
  ];

const INTERNAL: { href: string; label: string; icon: typeof LayoutDashboard; feature: FeatureCode }[] =
  [
    { href: "/internal", label: "Nội bộ", icon: Lock, feature: "internal" },
    { href: "/static", label: "Static", icon: BarChart3, feature: "static" },
  ];

export function Sidebar({
  user,
  open = false,
  onClose,
}: {
  user: {
    name: string;
    role: string;
    email: string;
    department?: string;
    features?: Record<string, boolean>;
  };
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const isAdminUser = user.role === "ADMIN";
  const can = (code: FeatureCode) => isAdminUser || !!user.features?.[code];

  function item(href: string, label: string, Icon: React.ComponentType<{ className?: string }>) {
    const active =
      href === "/"
        ? pathname === "/" || pathname.startsWith("/areas/")
        : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        prefetch
        onClick={onClose}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition sm:py-2",
          active
            ? "bg-[#f3f4f6] font-medium text-[#111827]"
            : "text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#111827]"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    );
  }

  const navItems = NAV.filter((n) => can(n.feature));
  const dbItems = DATABASE.filter((n) => can(n.feature));
  const internalItems = INTERNAL.filter((n) => can(n.feature));

  const panel = (
    <aside
      className={cn(
        "flex h-full w-[min(100vw-3rem,280px)] shrink-0 flex-col border-r border-[#ececef] bg-white sm:w-[248px]",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      <div className="flex items-center justify-between gap-2 px-5 py-4 sm:py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111827] text-xs font-bold text-white">
            H
          </div>
          <div>
            <div className="text-sm font-semibold text-[#111827]">HHGO CRM</div>
            <div className="text-[11px] text-[#9ca3af]">Sports & F&B</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] lg:hidden"
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {navItems.length > 0 && (
          <ul className="space-y-0.5">
            {navItems.map((n) => (
              <li key={n.href}>{item(n.href, n.label, n.icon)}</li>
            ))}
          </ul>
        )}

        {dbItems.length > 0 && (
          <>
            <div className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
              Database
            </div>
            <ul className="space-y-0.5">
              {dbItems.map((n) => (
                <li key={n.href}>{item(n.href, n.label, n.icon)}</li>
              ))}
            </ul>
          </>
        )}

        {(internalItems.length > 0 || isAdminUser) && (
          <>
            <div className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
              Internal
            </div>
            <ul className="space-y-0.5">
              {internalItems.map((n) => (
                <li key={n.href}>{item(n.href, n.label, n.icon)}</li>
              ))}
              {isAdminUser && (
                <li>{item("/admin", "Administration", ShieldCheck)}</li>
              )}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-[#ececef] p-4">
        <div className="mb-3 rounded-lg bg-[#f9fafb] px-3 py-2.5">
          <div className="truncate text-sm font-medium text-[#111827]">{user.name}</div>
          <div className="truncate text-[11px] text-[#9ca3af]">
            {user.email}
            {user.department === "OPS_A"
              ? " · Acc A"
              : user.department === "OPS_B"
                ? " · Acc B"
                : user.role === "ADMIN"
                  ? " · Admin"
                  : user.role === "VIEWER"
                    ? " · Chỉ xem"
                    : ""}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      {panel}
    </>
  );
}
