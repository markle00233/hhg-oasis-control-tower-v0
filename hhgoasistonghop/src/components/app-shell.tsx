"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { TopHeader } from "@/components/top-header";

export function AppShell({
  user,
  children,
}: {
  user: {
    name: string;
    role: string;
    email: string;
    department?: string;
    features?: Record<string, boolean>;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen bg-[#f7f7f8]">
      <Sidebar
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          userName={user.name}
          onMenuClick={() => setMenuOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 pb-8 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
