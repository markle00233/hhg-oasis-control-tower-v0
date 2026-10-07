"use client";

import { getOpsNotices, markOpsNoticesRead } from "@/app/notice-actions";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = {
  id: string;
  title: string;
  detail: string | null;
  href: string | null;
  actorName: string;
  department: string | null;
  at: string;
  unread: boolean;
};

export function NoticesBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await getOpsNotices();
    setUnread(res.unread);
    setItems(res.items);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      if (unread > 0) {
        await markOpsNoticesRead();
        setUnread(0);
        setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
      }
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827]"
        aria-label="Thông báo từ acc khác"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#dc2626] px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[#ececef] bg-white shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-semibold text-[#111827]">
            Acc kia vừa thao tác
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-muted">Chưa có thông báo</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="border-b border-[#f3f4f6] last:border-0">
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-[#f9fafb]"
                    >
                      <NoticeBody n={n} />
                    </Link>
                  ) : (
                    <div className="px-3 py-2.5">
                      <NoticeBody n={n} />
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NoticeBody({ n }: { n: Item }) {
  return (
    <>
      <div className="flex items-start gap-2">
        {n.unread ? (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#dc2626]" />
        ) : (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e5e7eb]" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#111827]">{n.title}</div>
          <div className="text-[11px] text-[#6b7280]">
            {n.actorName}
            {n.department ? ` · ${n.department}` : ""} · {n.at}
          </div>
          {n.detail ? <div className="mt-0.5 text-xs text-[#6b7280]">{n.detail}</div> : null}
        </div>
      </div>
    </>
  );
}
