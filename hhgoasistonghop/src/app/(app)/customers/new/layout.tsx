import { requireFeature } from "@/lib/require-feature";

export default async function NewCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("customers_write");
  return children;
}
