"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sideLeft = [
  { href: "/home", label: "Home", icon: "⌂" },
  { href: "/activity", label: "Activity", icon: "☰" },
];
const sideRight = [
  { href: "/messages", label: "Messages", icon: "◌" },
  { href: "/account", label: "Account", icon: "◯" },
];

export function BottomNav() {
  const pathname = usePathname();
  const scanActive =
    pathname === "/scan" || pathname.startsWith("/scan/");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-oasis-line/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-end justify-around px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5">
        {sideLeft.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold ${
                active ? "text-oasis-moss" : "text-oasis-mute"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {/* Center: quét QR khu vực — camera auto bật, flow walk-in cũ */}
        <Link
          href="/scan"
          className="-mt-7 flex flex-1 flex-col items-center gap-1"
          aria-label="Quét QR khu vực"
        >
          <span
            className={`grid h-16 w-16 place-items-center rounded-full text-sm font-black shadow-soft ring-4 ring-white ${
              scanActive
                ? "bg-oasis-moss text-white"
                : "bg-oasis-deep text-oasis-sand"
            }`}
          >
            QR
          </span>
          <span className="text-[11px] font-semibold text-oasis-deep">
            Quét QR
          </span>
        </Link>

        {sideRight.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold ${
                active ? "text-oasis-moss" : "text-oasis-mute"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
