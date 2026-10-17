import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const repoRoot = path.join(root, "..");
const outPublic = path.join(root, "public", "qr");
const outZoneQrs = path.join(repoRoot, "zone-qrs");

const base =
  process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "") ||
  "https://huyhoanggiaoasis.vercel.app";

/**
 * Danh sách QR hiện hành (2026-10-17)
 * - Khách: Olympic (upgrade hội viên trên Home) · Spa · Mía · Pickleball · Lòng Nướng
 * - Vật lý: Entrance / Exit (+ Resort / Jacuzzi nếu còn biển)
 * - Đã ẩn / không in mới: VIP_RESORT, GYM (ưu đãi Home đã tắt)
 */
const zones = [
  ["ENTRANCE", "Entrance"],
  ["OLYMPIC_POOL", "Olympic Pool"],
  ["SPA", "Spa"],
  ["SAUNA", "Sauna (alias Spa)"],
  ["MIA_OI", "Mía Ơi"],
  ["PICKLEBALL", "Pickleball"],
  ["LONG_NUONG", "Lòng Nướng"],
  ["RESORT_POOL", "Resort Pool"],
  ["JACUZZI", "Jacuzzi"],
  ["EXIT", "Exit"],
];

/** Deprecated — không in mới, giữ file cũ nếu cần */
const deprecated = [["VIP_RESORT", "VIP Resort (ẩn Home)"]];

fs.mkdirSync(outPublic, { recursive: true });
fs.mkdirSync(outZoneQrs, { recursive: true });

const lines = [
  `# Zone QR — HHG Oasis (cập nhật ${new Date().toISOString().slice(0, 10)})`,
  ``,
  `Base: ${base}`,
  `Gallery: ${base}/dev/qr`,
  ``,
  `Home: không hiện Ưu đãi Collect · có Nâng cấp hội viên (1/3/6/12 tháng).`,
  `Quét QR → check-in → Home (bản mới).`,
  ``,
  `| Khu | URL quét |`,
  `|-----|----------|`,
];

const txt = [
  `HHG Oasis — Zone QR (${new Date().toISOString().slice(0, 10)})`,
  `App: ${base}`,
  `Gallery: ${base}/dev/qr`,
  ``,
];

for (const [code, name] of zones) {
  const url = `${base}/s/${code}`;
  for (const dir of [outPublic, outZoneQrs]) {
    const file = path.join(dir, `${code}.png`);
    await QRCode.toFile(file, url, {
      width: 640,
      margin: 2,
      color: { dark: "#0C1F1A", light: "#FFFFFF" },
    });
  }
  console.log(`${code.padEnd(14)} ${name.padEnd(22)} -> ${url}`);
  lines.push(`| ${code} | ${url} |`);
  txt.push(`${code}\t${url}`);
}

lines.push(``, `## Không in mới (đã ẩn Home)`);
txt.push(``, `# Deprecated`);
for (const [code, name] of deprecated) {
  const url = `${base}/s/${code}`;
  lines.push(`| ${code} | ${url} · ${name} |`);
  txt.push(`# ${code}\t${url}`);
  // vẫn ghi PNG tới domain mới nếu ai còn biển cũ
  for (const dir of [outPublic, outZoneQrs]) {
    await QRCode.toFile(path.join(dir, `${code}.png`), url, {
      width: 640,
      margin: 2,
      color: { dark: "#0C1F1A", light: "#FFFFFF" },
    });
  }
}

fs.copyFileSync(
  path.join(outPublic, "ENTRANCE.png"),
  path.join(root, "public", "qr-entrance.png")
);

fs.writeFileSync(path.join(outZoneQrs, "URLS.md"), lines.join("\n") + "\n");
fs.writeFileSync(path.join(outZoneQrs, "URLS.txt"), txt.join("\n") + "\n");

console.log(`\nWrote ${zones.length} active zone QRs → public/qr/ + zone-qrs/`);
console.log(`Docs: zone-qrs/URLS.md`);
