import { redirect } from "next/navigation";

/** Membership đã gộp vào Customer profile — giữ route để link cũ không 404 */
export default function MembershipsRedirectPage() {
  redirect("/customers");
}
