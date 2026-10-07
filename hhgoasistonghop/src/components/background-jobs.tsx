"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createCustomer } from "@/app/actions";
import { cn } from "@/lib/utils";

type JobStatus = "running" | "success" | "error";

type BgJob = {
  id: string;
  label: string;
  status: JobStatus;
  message: string;
  href?: string;
};

type BackgroundJobsApi = {
  enqueueCreateCustomer: (
    formData: FormData,
    opts?: { label?: string; familyTab?: boolean }
  ) => void;
};

const BackgroundJobsContext = createContext<BackgroundJobsApi | null>(null);

export function useBackgroundJobs() {
  const ctx = useContext(BackgroundJobsContext);
  if (!ctx) throw new Error("useBackgroundJobs must be used within BackgroundJobsProvider");
  return ctx;
}

export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BgJob[]>([]);

  const updateJob = useCallback((id: string, patch: Partial<BgJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const dismiss = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const enqueueCreateCustomer = useCallback(
    (formData: FormData, opts?: { label?: string; familyTab?: boolean }) => {
      const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const label = opts?.label || "Lưu khách hàng";
      setJobs((prev) => [
        ...prev,
        {
          id,
          label,
          status: "running",
          message: "Chờ trong giây lát — đang lưu ngầm…",
        },
      ]);

      // Clone FormData so form unmount / navigation không mất dữ liệu
      const fd = new FormData();
      for (const [k, v] of formData.entries()) {
        fd.append(k, v);
      }

      void (async () => {
        try {
          let res = await createCustomer(fd);

          if (res && "overlap" in res && res.overlap) {
            fd.set("confirmOverlap", "1");
            res = await createCustomer(fd);
          }

          if (res && "duplicate" in res && res.duplicate) {
            updateJob(id, {
              status: "error",
              message: `SĐT đã tồn tại (${res.customerCode}). Mở hồ sơ cũ.`,
              href: `/customers/${res.customerId}`,
            });
            return;
          }

          if (res && "familyPhone" in res && res.familyPhone) {
            updateJob(id, {
              status: "error",
              message: res.error || "SĐT thuộc gói gia đình khác",
            });
            return;
          }

          if (res && "ok" in res && res.ok === false) {
            updateJob(id, {
              status: "error",
              message: res.error || "Không tạo được khách",
              href:
                "customerId" in res && res.customerId
                  ? `/customers/${res.customerId}`
                  : undefined,
            });
            return;
          }

          if (res && "ok" in res && res.ok && "customerId" in res) {
            const href = `/customers/${res.customerId}${
              opts?.familyTab ? "?tab=family" : ""
            }`;
            updateJob(id, {
              status: "success",
              message: "Đã lưu xong. Có thể mở hồ sơ khách.",
              href,
            });
            // Làm mới danh sách nếu đang ở /customers
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("hhgo:customers-refresh"));
            }
            return;
          }

          updateJob(id, {
            status: "error",
            message: "Không rõ kết quả lưu — kiểm tra danh sách khách.",
            href: "/customers",
          });
        } catch (err) {
          updateJob(id, {
            status: "error",
            message: err instanceof Error ? err.message : "Lỗi lưu khách",
          });
        }
      })();
    },
    [updateJob]
  );

  const api = useMemo(() => ({ enqueueCreateCustomer }), [enqueueCreateCustomer]);

  return (
    <BackgroundJobsContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100%-2rem,360px)] flex-col gap-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={cn(
              "pointer-events-auto rounded-xl border bg-white px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
              job.status === "running" && "border-[#fde68a] bg-[#fffbeb]",
              job.status === "success" && "border-[#bbf7d0] bg-[#f0fdf4]",
              job.status === "error" && "border-[#fecaca] bg-[#fef2f2]"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#111827]">{job.label}</div>
                <p
                  className={cn(
                    "mt-0.5 text-sm",
                    job.status === "running" && "text-amber-900",
                    job.status === "success" && "text-emerald-900",
                    job.status === "error" && "text-rose-900"
                  )}
                >
                  {job.message}
                </p>
                {job.href && job.status !== "running" && (
                  <Link
                    href={job.href}
                    className="mt-1 inline-block text-xs font-medium underline underline-offset-2"
                  >
                    Mở ngay
                  </Link>
                )}
              </div>
              {job.status !== "running" && (
                <button
                  type="button"
                  onClick={() => dismiss(job.id)}
                  className="rounded-md p-1 text-[#9ca3af] hover:bg-black/5 hover:text-[#111827]"
                  aria-label="Đóng"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {job.status === "running" && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-amber-100">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-400" />
              </div>
            )}
          </div>
        ))}
      </div>
    </BackgroundJobsContext.Provider>
  );
}
