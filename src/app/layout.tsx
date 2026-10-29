import "./globals.css";
import { ScrollbarFade } from "@/components/scrollbar-fade";

const isAdminAllplace =
  process.env.NEXT_PUBLIC_APP_SURFACE === "adminAllplace";

export const metadata = {
  title: isAdminAllplace ? "adminAllplace" : "HHG Oasis — Control Tower",
  description: isAdminAllplace
    ? "Zone desk administration"
    : "Control Tower Lite V0 + Prisma API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <ScrollbarFade />
        {children}
      </body>
    </html>
  );
}
