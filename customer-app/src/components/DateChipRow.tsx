/** Horizontal date chips: weekday over day/month. */

export function DateChipRow({
  dates,
  value,
  onChange,
  activeClassName,
}: {
  dates: { key: string; weekday: string; dayNum: number; date: Date }[];
  value: string;
  onChange: (key: string) => void;
  activeClassName: string;
}) {
  return (
    <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
      {dates.map((d) => {
        const on = d.key === value;
        const dayMonth = `${d.dayNum}/${String(d.date.getMonth() + 1).padStart(2, "0")}`;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onChange(d.key)}
            className={`flex h-[3.35rem] w-[3.7rem] shrink-0 flex-col items-center justify-center rounded-2xl ${
              on ? activeClassName : "bg-white text-[#64748b] shadow-sm"
            }`}
          >
            <span className="text-[11px] font-bold leading-none">{d.weekday}</span>
            <span className="mt-1 text-sm font-black leading-none">{dayMonth}</span>
          </button>
        );
      })}
    </div>
  );
}
