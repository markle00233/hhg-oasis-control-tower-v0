import { ServiceTag } from "@/components/service-tag";
import { cn } from "@/lib/utils";
import { isFullAccessPlan } from "@/config/crm.config";

/**
 * Membership: hiện từng khu (X) trong gói.
 * Gói Full → text thường, không dùng tag màu.
 */
export function MembershipPlanTag({
  planCode,
  planName,
  status,
  services = [],
  className,
}: {
  planCode?: string | null;
  planName: string;
  status?: string | null;
  services?: { code: string; name: string }[];
  className?: string;
}) {
  if (isFullAccessPlan(planCode, planName)) {
    return (
      <span
        className={cn(
          "text-sm font-medium text-[#111827]",
          status && status !== "ACTIVE" && "text-[#9ca3af]",
          className
        )}
      >
        {planName}
      </span>
    );
  }

  if (services.length > 0) {
    return (
      <div
        className={cn(
          "flex flex-wrap gap-1",
          status && status !== "ACTIVE" && "opacity-70",
          className
        )}
      >
        {services.map((s) => (
          <ServiceTag key={s.code} code={s.code} name={s.name} />
        ))}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#374151]",
        className
      )}
    >
      {planName}
    </span>
  );
}
