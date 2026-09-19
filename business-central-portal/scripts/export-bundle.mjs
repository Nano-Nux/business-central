import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portalRoot = path.resolve(__dirname, "..");
const mobileAssetsDir = path.resolve(
  portalRoot,
  "../business_central_mobile/assets",
);

console.log("1. Building business-central-portal...");
execSync("npm run build", { cwd: portalRoot, stdio: "inherit" });

console.log("2. Preparing bundle archive...");
const outDir = path.join(portalRoot, ".next");
if (!fs.existsSync(outDir)) {
  console.error("Error: .next build output directory not found.");
  process.exit(1);
}

if (!fs.existsSync(mobileAssetsDir)) {
  fs.mkdirSync(mobileAssetsDir, { recursive: true });
}

console.log(`Bundle ready. Target destination: ${mobileAssetsDir}`);
