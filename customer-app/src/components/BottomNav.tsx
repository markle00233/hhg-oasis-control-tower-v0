"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/home", label: "Trang chủ", icon: "⌂" },
  { href: "/scan", label: "Quét QR", icon: "◎", primary: true },
  { href: "/account", label: "Tài khoản", icon: "◯" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-oasis-line/80 bg-oasis-sand/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-end justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          if (item.primary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="-mt-7 flex flex-col items-center gap-1"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-oasis-deep text-2xl text-oasis-sand shadow-soft ring-4 ring-oasis-sand">
                  {item.icon}
                </span>
                <span className="text-[11px] font-semibold text-oasis-deep">
                  {item.label}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${
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
