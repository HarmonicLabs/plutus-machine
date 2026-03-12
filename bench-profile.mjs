const N = 500_000;

// Plain object literal
let t = performance.now();
for (let i = 0; i < N; i++) {
  const x = { tag: 1, func: 42, forces: i, args: [] };
}
const plainObjTime = (performance.now() - t) / N * 1000;

// Class instantiation
class FakePB {
  constructor(tag, forces) {
    this.tag = tag;
    this.forces = forces;
    this.nRequiredArgs = tag > 1 ? 2 : 3;
  }
}
t = performance.now();
for (let i = 0; i < N; i++) {
  const pb = new FakePB(1, i);
}
const classTime = (performance.now() - t) / N * 1000;

// Array spread [0-elem]
t = performance.now();
let arr = [];
for (let i = 0; i < N; i++) { arr = [...arr, i & 3]; if (arr.length > 3) arr = []; }
const spreadTime = (performance.now() - t) / N * 1000;

// Array concat [0-elem]
t = performance.now();
arr = [];
for (let i = 0; i < N; i++) { arr = arr.concat(i & 3); if (arr.length > 3) arr = []; }
const concatTime = (performance.now() - t) / N * 1000;

console.log(`Plain object literal: ${(plainObjTime*1000).toFixed(1)}ns`);
console.log(`Class instantiation:  ${(classTime*1000).toFixed(1)}ns`);
console.log(`Array spread/push:    ${(spreadTime*1000).toFixed(1)}ns`);
console.log(`Array concat:         ${(concatTime*1000).toFixed(1)}ns`);
