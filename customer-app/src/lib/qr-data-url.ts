export async function fetchQrDataUrl(
  text: string,
  options?: { width?: number; margin?: number; dark?: string; light?: string }
): Promise<string> {
  const res = await fetch("/api/qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...options }),
  });
  if (!res.ok) throw new Error("qr");
  const data = (await res.json()) as { dataUrl?: string };
  if (!data.dataUrl) throw new Error("qr");
  return data.dataUrl;
}
