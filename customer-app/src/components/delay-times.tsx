export function DelayTimes({
  planned,
  moved,
  tone = "light",
}: {
  planned: string;
  moved: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl px-3 py-3 ${
        dark ? "bg-white/10" : "border border-orange-200 bg-orange-50"
      }`}
    >
      <div>
        <p
          className={`text-[10px] font-extrabold uppercase tracking-[0.08em] ${
            dark ? "text-oasis-gold" : "text-orange-800"
          }`}
        >
          Giờ dự kiến
        </p>
        <p
          className={`mt-1 text-sm font-semibold line-through ${
            dark ? "text-white/75" : "text-orange-900"
          }`}
        >
          {planned}
        </p>
      </div>
      <span
        className={`text-lg font-extrabold ${dark ? "text-oasis-gold" : "text-orange-700"}`}
        aria-hidden
      >
        →
      </span>
      <div>
        <p
          className={`text-[10px] font-extrabold uppercase tracking-[0.08em] ${
            dark ? "text-oasis-gold" : "text-orange-800"
          }`}
        >
          Giờ dời
        </p>
        <p className={`mt-1 text-sm font-extrabold ${dark ? "text-white" : "text-orange-950"}`}>
          {moved}
        </p>
      </div>
    </div>
  );
}
