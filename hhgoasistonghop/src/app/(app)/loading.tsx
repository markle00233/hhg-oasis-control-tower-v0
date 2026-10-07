export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-48 rounded-lg bg-[#e5e7eb]" />
      <div className="h-4 w-80 rounded bg-[#ececef]" />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]" />
        <div className="h-40 rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]" />
      </div>
      <div className="h-72 rounded-2xl bg-white" />
    </div>
  );
}
