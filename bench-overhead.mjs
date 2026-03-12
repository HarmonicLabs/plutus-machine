import { createRequire } from "module";
const require = createRequire(new URL("./package.json", import.meta.url));
const { parseUPLCText } = require("@harmoniclabs/uplc");
const { Machine } = require("./dist/index.js");

const trivial = "(program 1.0.0 (con integer 42))";
const termPM = parseUPLCText(trivial);

// Warm up
for (let i = 0; i < 20; i++) Machine.evalSimple(termPM);

const N = 500;
// Time just constructor
const { defaultV3Costs } = require("./dist/index.js");
const t0 = performance.now();
for (let i = 0; i < N; i++) new Machine(defaultV3Costs);
const ctorTime = (performance.now() - t0) / N;

// Time just run (reuse same machine - need direct access)
const m = new Machine(defaultV3Costs);
const t1 = performance.now();
for (let i = 0; i < N; i++) {
  m.eval(termPM);
}
const evalTime = (performance.now() - t1) / N;

console.log(`constructor: ${(ctorTime*1000).toFixed(0)}μs`);
console.log(`eval (reused):  ${(evalTime*1000).toFixed(0)}μs`);
console.log(`evalSimple overhead from ctor: ${(ctorTime*100/((ctorTime+evalTime))).toFixed(0)}%`);
