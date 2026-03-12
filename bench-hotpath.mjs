import { createRequire } from "module";
const require = createRequire(new URL("./package.json", import.meta.url));
const { parseUPLCText } = require("@harmoniclabs/uplc");
const { Machine } = require("./dist/index.js");
const blazeModule = await import("/home/michele/hlabs/packages/blaze-cardano/packages/blaze-plutus/dist/index.mjs");
const { parse, nameToDeBruijn, CekMachine, unlimitedBudget } = blazeModule;
import { readFileSync } from "fs";

const files = [
  "IfIntegers/IfIntegers.uplc",
  "ApplyAdd1/ApplyAdd1.uplc",
].map(f => `/home/michele/hlabs/packages/blaze-cardano/packages/blaze-plutus/conformance/tests/example/${f}`);

for (const file of files) {
  const src = readFileSync(file, "utf-8");
  const termPM = parseUPLCText(src);
  const termBP = nameToDeBruijn(parse(src));

  // Warmup
  for (let i = 0; i < 20; i++) {
    Machine.evalSimple(termPM);
    new CekMachine(unlimitedBudget()).run(termBP.term);
  }

  const N = 200;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) Machine.evalSimple(termPM);
  const pmTime = (performance.now() - t0) / N;

  const t1 = performance.now();
  for (let i = 0; i < N; i++) new CekMachine(unlimitedBudget()).run(termBP.term);
  const bpTime = (performance.now() - t1) / N;

  console.log(`${file.split("/").pop()}: PM=${(pmTime*1000).toFixed(0)}μs  BP=${(bpTime*1000).toFixed(0)}μs  ratio=${(pmTime/bpTime).toFixed(1)}x`);
}
