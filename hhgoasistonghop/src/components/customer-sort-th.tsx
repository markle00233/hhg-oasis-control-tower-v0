import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomerSortKey =
  | "code"
  | "name"
  | "phone"
  | "dob"
  | "goi"
  | "membership"
  | "remaining"
  | "note"
  | "personality"
  | "status"
  | "createdAt";

const DEFAULT_DIR: Record<CustomerSortKey, "asc" | "desc"> = {
  code: "asc",
  name: "asc",
  phone: "asc",
  dob: "asc",
  goi: "asc",
  membership: "asc",
  remaining: "asc",
  note: "asc",
  personality: "asc",
  status: "asc",
  createdAt: "desc",
};

export function SortTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  searchParams,
  className,
}: {
  label: string;
  sortKey: CustomerSortKey;
  currentSort: string;
  currentDir: "asc" | "desc";
  searchParams: Record<string, string | undefined>;
  className?: string;
}) {
  const active = currentSort === sortKey;
  const nextDir = active
    ? currentDir === "asc"
      ? "desc"
      : "asc"
    : DEFAULT_DIR[sortKey];

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v != null && v !== "" && k !== "page") params.set(k, v);
  }
  params.set("sort", sortKey);
  params.set("dir", nextDir);

  return (
    <th className={cn("px-4 py-3 font-medium", className)}>
      <Link
        href={`/customers?${params.toString()}`}
        className={cn(
          "inline-flex items-center gap-1 transition hover:text-[#111827]",
          active ? "text-[#111827]" : "text-muted"
        )}
        title="Bấm để sắp xếp"
      >
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </Link>
    </th>
  );
}

export function isDbSort(sort: string) {
  return ["code", "name", "phone", "dob", "note", "personality", "createdAt"].includes(
    sort
  );
}

export function prismaOrderBy(
  sort: string,
  dir: "asc" | "desc"
): Prisma.CustomerOrderByWithRelationInput {
  switch (sort) {
    case "code":
      return { customerCode: dir };
    case "name":
      return { fullName: dir };
    case "phone":
      return { phone: dir };
    case "dob":
      return { dateOfBirth: dir };
    case "note":
      return { note: dir };
    case "personality":
      return { personality: dir };
    case "createdAt":
    default:
      return { createdAt: dir };
  }
}
