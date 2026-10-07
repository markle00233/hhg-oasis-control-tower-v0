import { getAreaTheme } from "@/config/crm.config";
import { cn } from "@/lib/utils";

type ServiceTagProps = {
  code?: string | null;
  name?: string | null;
  /** sm = compact pill, md = default */
  size?: "sm" | "md";
  /** hiện chấm màu trước tên */
  dot?: boolean;
  className?: string;
};

/**
 * Tag màu cố định theo khu vực — dùng mọi nơi trong CRM
 * để staff nhận diện nhanh dịch vụ khách đã dùng.
 */
export function ServiceTag({
  code,
  name,
  size = "sm",
  dot = true,
  className,
}: ServiceTagProps) {
  const theme = getAreaTheme(code);
  const label = name || theme.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
      style={{
        background: theme.soft,
        color: theme.text,
        borderColor: theme.border,
      }}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: theme.solid }}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

/** Avatar / icon vuông theo màu khu */
export function ServiceAvatar({
  code,
  name,
  className,
}: {
  code?: string | null;
  name?: string | null;
  className?: string;
}) {
  const theme = getAreaTheme(code);
  const label = name || theme.label;
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white",
        className
      )}
      style={{ background: theme.solid }}
      title={label}
    >
      {label.slice(0, 1)}
    </div>
  );
}
