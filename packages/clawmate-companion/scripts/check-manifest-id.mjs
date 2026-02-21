import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const packageJsonPath = path.join(root, "package.json");
const manifestPath = path.join(root, "openclaw.plugin.json");

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const packageName = typeof pkg.name === "string" ? pkg.name.trim() : "";
const unscoped = packageName.includes("/") ? packageName.split("/").pop() : packageName;
const manifestId = typeof manifest.id === "string" ? manifest.id.trim() : "";

if (!unscoped || !manifestId) {
  throw new Error("package name 或 manifest id 为空");
}
if (unscoped !== manifestId) {
  throw new Error(`包名与 manifest id 不一致: ${unscoped} !== ${manifestId}`);
}

const extensions = pkg.openclaw?.extensions;
if (!Array.isArray(extensions) || extensions.length === 0) {
  throw new Error("package.json openclaw.extensions 不能为空");
}

console.log("Manifest consistency check passed.");
