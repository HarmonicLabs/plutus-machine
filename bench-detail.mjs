import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import { createRequire } from "module";

const require = createRequire(new URL("./package.json", import.meta.url));
const { parseUPLCText } = require("@harmoniclabs/uplc");
const { Machine } = require("./dist/index.js");

const CONFORMANCE_DIR = "/home/michele/hlabs/packages/blaze-cardano/packages/blaze-plutus/conformance/tests";
const blazeModule = await import("/home/michele/hlabs/packages/blaze-cardano/packages/blaze-plutus/dist/index.mjs");
const { parse, nameToDeBruijn, CekMachine, unlimitedBudget } = blazeModule;

// Benchmark individual files in a given subdir
async function benchDir(subdir) {
  const dir = join(CONFORMANCE_DIR, subdir);
  const rows = [];

  function walk(current) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".uplc") && !entry.name.endsWith(".expected")) {
        const expectedPath = fullPath + ".expected";
        if (existsSync(expectedPath)) {
          const expected = readFileSync(expectedPath, "utf-8");
          if (!expected.startsWith("parse error") && !expected.startsWith("evaluation failure"))
            rows.push(fullPath);
        }
      }
    }
  }
  walk(dir);

  console.log(`\n=== ${subdir} (${rows.length} files) ===`);
  const results = [];
  for (const file of rows) {
    const src = readFileSync(file, "utf-8");
    let pmTime = NaN, bpTime = NaN;
    try {
      const term = parseUPLCText(src);
      const t0 = performance.now();
      Machine.evalSimple(term);
      pmTime = performance.now() - t0;
    } catch(_) {}
    try {
      const dProg = nameToDeBruijn(parse(src));
      const t0 = performance.now();
      new CekMachine(unlimitedBudget()).run(dProg.term);
      bpTime = performance.now() - t0;
    } catch(_) {}
    const rel = relative(dir, file);
    results.push({ name: rel, pmTime, bpTime, ratio: bpTime > 0.01 ? pmTime/bpTime : NaN });
  }
  results.sort((a, b) => (b.ratio||0) - (a.ratio||0));
  for (const r of results.slice(0, 15)) {
    const flag = r.ratio > 5 ? " !!!" : r.ratio > 2 ? " !" : "";
    console.log(
      r.name.slice(0,45).padEnd(45),
      isNaN(r.pmTime) ? "  ERR" : r.pmTime.toFixed(2).padStart(8) + "ms",
      isNaN(r.bpTime) ? "  ERR" : r.bpTime.toFixed(2).padStart(8) + "ms",
      (isNaN(r.ratio) ? " N/A" : r.ratio.toFixed(1) + "x").padStart(6) + flag
    );
  }
}

await benchDir("term");
await benchDir("example");
