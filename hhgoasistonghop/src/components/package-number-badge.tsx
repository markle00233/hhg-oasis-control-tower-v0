import { cn } from "@/lib/utils";
import { getPackageByCode } from "@/config/crm.config";

/**
 * Số STT 1–4 trong từng loại gói + khung màu:
 * xanh = Bơi · cam = Pick · tím = VIP Full
 */
export function PackageNumberBadge({
  planCode,
  className,
  showLabel = false,
}: {
  planCode?: string | null;
  className?: string;
  showLabel?: boolean;
}) {
  const pkg = getPackageByCode(planCode);
  if (!pkg) {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={pkg.name}>
      <span
        className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-sm font-bold tabular-nums"
        style={{
          background: pkg.theme.bg,
          color: pkg.theme.text,
          borderColor: pkg.theme.border,
        }}
      >
        {pkg.number}
      </span>
      {showLabel && (
        <span className="text-xs font-medium text-[#374151]">{pkg.name}</span>
      )}
    </span>
  );
}
