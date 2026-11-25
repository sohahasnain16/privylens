// Parses every browser module so typos are caught without a build step.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const dir = join(import.meta.dirname, "..", "public");
const files = [...readdirSync(join(dir, "js")).map((f) => join(dir, "js", f)), join(dir, "config.js"), join(dir, "sw.js")].filter((f) => f.endsWith(".js"));
for (const f of files) execFileSync(process.execPath, ["--check", f], { stdio: "inherit" });
console.log(`syntax ok (${files.length} files)`);
