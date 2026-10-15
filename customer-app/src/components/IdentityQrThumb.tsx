"use client";

import Link from "next/link";

/** Mini QR thumb — pass shared dataUrl from parent to avoid N fetches. */
export function IdentityQrThumb({
  dataUrl,
  size = 72,
  className = "",
  href = "/qr",
  asDiv,
}: {
  dataUrl?: string;
  size?: number;
  className?: string;
  href?: string;
  /** When nested inside another Link */
  asDiv?: boolean;
}) {
  const inner = dataUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="" width={size} height={size} className="h-full w-full" />
  ) : (
    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
      QR
    </span>
  );
  const cls = `grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ${className}`;
  const style = { width: size, height: size };
  if (asDiv) {
    return (
      <div className={cls} style={style}>
        {inner}
      </div>
    );
  }
  return (
    <Link href={href} className={cls} style={style} aria-label="QR">
      {inner}
    </Link>
  );
}
