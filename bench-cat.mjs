import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { createRequire } from "module";

const require = createRequire(new URL("./package.json", import.meta.url));
const { parseUPLCText } = require("@harmoniclabs/uplc");
const { Machine } = require("./dist/index.js");

const CONFORMANCE_DIR = "/home/michele/hlabs/packages/blaze-cardano/packages/blaze-plutus/conformance/tests";

const blazeModule = await import("/home/michele/hlabs/packages/blaze-cardano/packages/blaze-plutus/dist/index.mjs");
const { parse, nameToDeBruijn, CekMachine, unlimitedBudget } = blazeModule;

function collectByCategory(dir) {
  const result = {};
  function walk(current, cat) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, cat || entry.name);
      } else if (entry.isFile() && entry.name.endsWith(".uplc") && !entry.name.endsWith(".expected")) {
        const expectedPath = fullPath + ".expected";
        if (existsSync(expectedPath)) {
          const expected = readFileSync(expectedPath, "utf-8");
          if (!expected.startsWith("parse error") && !expected.startsWith("evaluation failure")) {
            if (!result[cat]) result[cat] = [];
            result[cat].push(fullPath);
          }
        }
      }
    }
  }
  walk(dir, null);
  return result;
}

const categories = collectByCategory(CONFORMANCE_DIR);
const catNames = Object.keys(categories).sort();

// Warm up
const warmFiles = Object.values(categories).flat().slice(0, 10);
for (const file of warmFiles) {
  const src = readFileSync(file, "utf-8");
  try { Machine.evalSimple(parseUPLCText(src)); } catch(_) {}
  try { new CekMachine(unlimitedBudget()).run(nameToDeBruijn(parse(src)).term); } catch(_) {}
}

const rows = [];
let totalPM = 0, totalBP = 0, totalFiles = 0;

for (const cat of catNames) {
  const files = categories[cat];
  let pmTime = 0, bpTime = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf-8");

    try {
      const term = parseUPLCText(src);
      const t0 = performance.now();
      Machine.evalSimple(term);
      pmTime += performance.now() - t0;
    } catch(_) {}

    try {
      const prog = parse(src);
      const dProg = nameToDeBruijn(prog);
      const t0 = performance.now();
      new CekMachine(unlimitedBudget()).run(dProg.term);
      bpTime += performance.now() - t0;
    } catch(_) {}
  }

  totalPM += pmTime; totalBP += bpTime; totalFiles += files.length;
  const ratio = bpTime > 0.1 ? pmTime / bpTime : NaN;
  rows.push({ cat, n: files.length, pmTime, bpTime, ratio });
}

rows.sort((a, b) => (b.ratio||0) - (a.ratio||0));
console.log(`\n${"Category".padEnd(38)} ${"N".padStart(4)} ${"PM(ms)".padStart(9)} ${"BP(ms)".padStart(9)} ${"PM/BP".padStart(6)}`);
console.log("-".repeat(70));
for (const r of rows) {
  const flag = r.ratio > 2 ? " !!!" : r.ratio > 1.5 ? " !" : "";
  console.log(
    r.cat.slice(0,38).padEnd(38),
    String(r.n).padStart(4),
    r.pmTime.toFixed(1).padStart(9),
    r.bpTime.toFixed(1).padStart(9),
    (isNaN(r.ratio) ? " N/A" : r.ratio.toFixed(2)).padStart(6) + flag
  );
}
console.log("-".repeat(70));
console.log(`${"TOTAL".padEnd(38)} ${String(totalFiles).padStart(4)} ${totalPM.toFixed(1).padStart(9)} ${totalBP.toFixed(1).padStart(9)} ${(totalPM/totalBP).toFixed(2).padStart(6)}`);
