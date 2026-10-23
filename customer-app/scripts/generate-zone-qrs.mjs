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
 * QR in mới — Mía + Hồ gộp 1 mã MIA_OLYMPIC
 */
const zones = [
  ["ENTRANCE", "Entrance"],
  ["MIA_OLYMPIC", "Mía Ơi · Hồ Olympic"],
  ["SPA", "Spa"],
  ["SAUNA", "Sauna (alias Spa)"],
  ["PICKLEBALL", "Pickleball"],
  ["LONG_NUONG", "Lòng Nướng"],
  ["RESORT_POOL", "Resort Pool"],
  ["JACUZZI", "Jacuzzi"],
  ["EXIT", "Exit"],
];

/** Deprecated — không in mới, giữ file cũ nếu cần */
const deprecated = [
  ["OLYMPIC_POOL", "Olympic Pool (cũ — gộp vào MIA_OLYMPIC)"],
  ["MIA_OI", "Mía Ơi (cũ — gộp vào MIA_OLYMPIC)"],
  ["VIP_RESORT", "VIP Resort (ẩn Home)"],
];

fs.mkdirSync(outPublic, { recursive: true });
fs.mkdirSync(outZoneQrs, { recursive: true });

const lines = [
  `# Zone QR — HHG Oasis (cập nhật ${new Date().toISOString().slice(0, 10)})`,
  ``,
  `Base: ${base}`,
  `Gallery: ${base}/dev/qr`,
  ``,
  `Mía Ơi + Hồ Olympic = 1 QR (MIA_OLYMPIC) · 1 quầy · menu order 2 section.`,
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
  console.log(`${code.padEnd(14)} ${name.padEnd(28)} -> ${url}`);
  lines.push(`| ${code} | ${url} |`);
  txt.push(`${code}\t${url}`);
}

lines.push(``, `## Không in mới (QR cũ vẫn quét được)`);
txt.push(``, `# Deprecated`);
for (const [code, name] of deprecated) {
  const url = `${base}/s/${code}`;
  lines.push(`| ${code} | ${url} · ${name} |`);
  txt.push(`# ${code}\t${url}\t${name}`);
}

fs.writeFileSync(path.join(outZoneQrs, "URLS.md"), lines.join("\n") + "\n");
fs.writeFileSync(path.join(outZoneQrs, "URLS.txt"), txt.join("\n") + "\n");
console.log(`\nWrote ${path.join(outZoneQrs, "URLS.md")}`);
