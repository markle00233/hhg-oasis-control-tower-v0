export const metadata = {
  title: "HHG Oasis — Control Tower",
  description: "Control Tower Lite V0 + Prisma API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
