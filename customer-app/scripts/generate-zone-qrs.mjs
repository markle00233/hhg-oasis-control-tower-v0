import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "qr");

const base =
  process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "") ||
  "https://hhg-oasis-customer-app.vercel.app";

const zones = [
  ["ENTRANCE", "Entrance"],
  ["OLYMPIC_POOL", "Olympic Pool"],
  ["RESORT_POOL", "Resort Pool"],
  ["VIP_RESORT", "VIP Resort"],
  ["SAUNA", "Sauna"],
  ["JACUZZI", "Jacuzzi"],
  ["MIA_OI", "Mía Ơi"],
  ["PICKLEBALL", "Pickleball"],
  ["EXIT", "Exit"],
];

fs.mkdirSync(outDir, { recursive: true });

for (const [code, name] of zones) {
  const url = `${base}/s/${code}`;
  const file = path.join(outDir, `${code}.png`);
  await QRCode.toFile(file, url, {
    width: 640,
    margin: 2,
    color: { dark: "#0C1F1A", light: "#FFFFFF" },
  });
  console.log(`${code.padEnd(14)} ${name.padEnd(14)} -> ${url}`);
}

// Convenience alias for Entrance
fs.copyFileSync(path.join(outDir, "ENTRANCE.png"), path.join(root, "public", "qr-entrance.png"));
console.log(`\nWrote ${zones.length} zone QRs under public/qr/`);
