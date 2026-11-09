# @harmoniclabs/plutus-machine

[![CI](https://github.com/HarmonicLabs/plutus-machine/actions/workflows/ci.yml/badge.svg)](https://github.com/HarmonicLabs/plutus-machine/actions/workflows/ci.yml)

CEK machine implementation in TypeScript, to evaluate UPLC terms.

## Install

```bash
npm install @harmoniclabs/plutus-machine
```

## Evaluate

```ts
import { Machine } from "@harmoniclabs/plutus-machine";

const { result, budgetSpent, logs } = Machine.eval( term );
```

## Evaluate with WebCrypto

`evalAsync` gives the result, budget and logs of `eval`, but computes `verifyEd25519Signature`,
and `sha2_256` on inputs of 2 KB or more, with the platform's WebCrypto
(`globalThis.crypto.subtle`: native code, off the main thread in Node). The machine does not wait
for these results where it starts them, only where a builtin or a `case` reads them: it goes on
meanwhile, and several can be computed at once.

```ts
const { result, budgetSpent, logs } = await Machine.evalAsync( term );
```

- The answers are those of the node. Each WebCrypto algorithm is checked once per `subtle` on a
  few probes, and one that answers otherwise is not used (an Ed25519 verifier that checks the
  equation with the cofactor accepts signatures the node rejects). Before the engine checks an
  Ed25519 signature, the machine applies libsodium's byte checks (`ed25519SignatureMayBeValid`).
  The machine does not wait for the probes: a result started before they end waits for them.
- `sha2_256` on shorter inputs stays in JavaScript: below about 1.5 KB that is faster than
  waiting for WebCrypto (Node 22). `sha2_256MinBytes` sets the threshold.
- `subtle` gives another implementation; `subtle: null` computes everything in JavaScript.
- Other crypto builtins (blake2b, sha3, keccak, ripemd, secp256k1, BLS) have no WebCrypto
  counterpart and run as in `eval`.
- An evaluation that starts no WebCrypto computation is done before `evalAsync` returns its
  promise. A batch launched at once (`Promise.all`) therefore runs the evaluations one after the
  other, and those waiting for WebCrypto give way to the rest.
- A machine runs one evaluation at a time and refuses others until it is done.
  `Machine.evalAsync` takes a machine of its own for each evaluation still waiting.

An Ed25519 verification takes 1.5 ms in JavaScript and 0.19 ms on WebCrypto when awaited at once,
0.05 ms each with 64 in flight (Node 22). On the 89 scripts of `plutus_use_cases`, the ones that
verify signatures run 1.2x faster; the others take the same time as with `eval`.

## Source maps: where a script failed

A compiler can write a source map next to a script; when the script fails, `locateFailure`
tells where in the source it failed, and which function calls were open:

```ts
import { locateFailure, parseSourceMap, formatFailure } from "@harmoniclabs/plutus-machine";

const map = parseSourceMap( readFileSync( "out/out.flat.map", "utf8" ) );

// `term`: what failed, parameters and script arguments applied
const failure = locateFailure({ term, map, costModel, budget });
if( failure ) console.log( formatFailure( failure, map ) );
```

```text
error: explicit error from uplc
failed at src/index.pebble:6:5
    at check (src/index.pebble:6:5)
    at entry (src/index.pebble:11:15)
```

`locateFailure` evaluates the term again on a new machine, following it with a step hook, so a
failing script costs nothing more until it is located; pass the cost model and the budget of
the failed evaluation so that it fails the same way. It finds the program the map describes
under the root applications (parameters and script arguments), comparing term count and
program hash, and returns `undefined` when the map is for another program.

The failure's location is, in order: the assert whose condition returned `false` (an assert
fails right after, whatever term raises the error: one shared by several asserts, a condition
the compiler rewrote); for a `case` the compiler dropped failing branches from, the failure they
stood for (`failures`); the failing term (an `error`, the application of a failing builtin, a
`case` with no matching branch); else the last mapped term of the innermost open call. Each
open call frame points at the call that made it.

`Machine.setStepHook( hook )` exposes the same mechanism: the hook receives every machine
state before it is stepped. Without a hook a step costs one comparison more.

### Format, version 1

The format is not tied to a compiler: any compiler can emit it.

```json
{
  "version": 1,
  "compiler": "pebble 0.6.0",
  "programHash": "<blake2b-256 of the flat program, hex>",
  "programVersion": "1.1.0",
  "termCount": 52,
  "sources": [ "src/index.pebble" ],
  "names": [ "isBig", "check", "entry" ],
  "mappings": [ [ 12, 0, 6, 12, 6, 22 ] ],
  "functions": [ [ 3, 1, 0, 5, 1 ] ],
  "asserts": [ [ 9, 0, 6, 5, 6, 23 ] ],
  "inlinedCalls": [ [ 3, 0, 11, 15, 11, 25 ] ],
  "failures": [ [ 17, 0, 7, 5, 7, 20 ] ]
}
```

- **Term index**: the position of a term in a pre-order walk of the unapplied program, children
  in flat order: `Application` function then argument; `Lambda`, `Delay` and `Force` their
  child; `Constr` fields in order; `Case` scrutinee, then branches in order. `termCount` is the
  length of that walk (`indexProgram` implements it).
- **`programHash`**: blake2b-256 of the flat encoding of the unapplied program, that is, of the
  compiled file itself: `b2sum -l 256 out.flat` prints it. `programVersion` is its UPLC version.
- **`mappings`**: `[ termIndex, sourceIndex, startLine, startColumn, endLine, endColumn ]`,
  sorted by term index, at most one per term.
- **`functions`**: `[ entryTermIndex, nameIndex, sourceIndex, line, column ]`. The entry term is
  the root of a function's body: evaluating it enters the function, after a call or where the
  compiler copied the body in. `nameIndex` is `-1` for a function without a name.
- **`asserts`**: `[ conditionTermIndex, sourceIndex, startLine, startColumn, endLine, endColumn,
  negated? ]`, the root of an assert's condition and the range of the assert statement.
  `negated` `1`: the term computes the condition negated, so it is true when the assert fails
  (a compiler that swapped the branches to compare with a constant, `x < 20` checked as
  `20 <= x`); absent or `0`: the condition itself.
- **`inlinedCalls`** (optional): `[ entryTermIndex, sourceIndex, startLine, startColumn, endLine,
  endColumn ]`, a body copied in place of a call, and that call's range.
- **`failures`** (optional): `[ caseTermIndex, sourceIndex, startLine, startColumn, endLine,
  endColumn ]`, a `case` the compiler dropped failing branches from (a value with no branch
  fails just the same), and the range of the failure they stood for (the assert, the `match`).
- **`traces`** and **`tracePoints`** (optional): see below.
- **Positions**: lines and columns start at 1, columns count UTF-16 code units, ends are
  exclusive.
- **Sources**: paths relative to the project root, with forward slashes. Only user code is
  mapped. `sourcesContent` (optional, parallel to `sources`) holds the texts, for code frames.
- **Compatibility**: readers reject any `version` but 1 and ignore unknown fields.

### Traces the compiler removed

A compiler can remove a program's traces (Pebble's `removeTraces`): the program is the one the
source without them compiles to, smaller and optimized as if they were never there, and the map
keeps them, so tools evaluating the program with the map print them where they would have run:

```json
"traces": [
  { "kind": "assert", "at": [ 0, 4, 5, 4, 45 ], "message": "x must be positive" },
  { "kind": "trace", "at": [ 0, 3, 5, 3, 17 ], "expression": "x * 2", "program": "0101…" }
],
"tracePoints": [ [ 14, 1, 0, -1, 0 ], [ 20, 0, 1, -1 ], [ 31, 0, 2, 1 ] ]
```

- **`traces`**: `kind` is `trace` (a trace statement), `assert` (an assert's message) or `fail`
  (a failure's message); `at` the statement, `[ sourceIndex, startLine, startColumn, endLine,
  endColumn ]`, none in library code. A message that is always the same is `message`; one
  computed from values is its source text, `expression`, and a program (flat, hex) computing it
  from those values (a `delay` of the message when it reads none). `of` (optional): the entry is
  trace `of` at one place of it, where the compiler replaced a value the message reads with an
  expression (a helper inlined with its argument); its program takes that place's values, and a
  tool listing the removed traces lists trace `of` once.
- **`tracePoints`**: `[ termIndex, traceIndex, when, branch, ...arguments ]`, sorted by term
  index, a term's traces in the order they ran. `when` `0`: when the term is computed; `1`: when
  the term, an assert's condition, returns false; `2`: when the evaluation fails at the term (an
  `error`; a `case` that lost failing branches, `branch` being the one the trace was in, `-1` for
  any); `3`: when the term returns its value, which the message's program takes last; `4`: when
  the term, an assert's condition negated, returns true; `5`: whenever the value the term
  computes is applied, the traces of a function the compiler reduced to that value (`λx. 2 * x`
  to the builtin `multiplyInteger 2`: one call, one application), an argument `-2` standing for
  the value it is applied to (the function's parameter); `6`: when such an application returns,
  the message's program taking the result last. `arguments`:
  the de Bruijn index, in the term's environment, of each value the program takes (`0` is the
  innermost lambda), `-1` when the program no longer has it.
- A trace without a point has no place left in the program: the optimizer removed the code
  around it, which never runs (a branch whose condition it found constant).

`evaluateWithSourceMap({ term, map, costModel, budget })` evaluates once and returns the result,
the cost, the logs with the removed traces back (in order with the ones the program kept) and,
when it failed, where (as `locateFailure`). A computed message is evaluated on the side, from the
values the program holds at that point, uncounted and unable to stop the evaluation; when a value
is missing the log says so (`<x * 2: not computed by the stripped script>`). `TraceReplay` is the
step hook doing it, and `recordEvaluation( term, { map } )` puts the traces in a recording's logs.

## Recording an evaluation: stepping backwards

`recordEvaluation` evaluates a term on a new machine and keeps every state. Machine states never
change once created (environments are persistent lists, frames are immutable), so the recording
holds the states themselves and any of them can be inspected afterwards: this is how a debugger
steps backwards.

```ts
import { recordEvaluation } from "@harmoniclabs/plutus-machine";

const rec = recordEvaluation( term, { costModel, budget } );
rec.states;            // every state, in order
rec.cpu[ i ];          // budget spent before state i (rec.mem too)
rec.valueOf( i );      // what the term computed at state i evaluates to
rec.result, rec.logs, rec.failed;
```

`returnOf( i )` is the state that returns the value of the term computed at `i`: the first later
state returning to the same frame object. `envDepth` and `envExtends` tell which environments
extend which (a term evaluated in a call, or in a closure made there, sees an extension of the
call's). A recording stops keeping states after `maxStates` (default 2,000,000) and says so
(`complete`); the evaluation goes on.

## Saved evaluations

A script evaluation saved to a file runs again elsewhere, the same way: the script (parameters
applied), its arguments, the cost model and the budget. buildooor saves the ones that fail
(`saveFailedEvaluations`); `pebble debug --eval <file>` replays them.

```ts
import { parseSavedEvaluation, savedEvaluationTerm, savedEvaluationToJson } from "@harmoniclabs/plutus-machine";

writeFileSync( file, JSON.stringify( savedEvaluationToJson({ program, args, budget, costModel }) ) );

const ev = parseSavedEvaluation( readFileSync( file, "utf8" ) );
const rec = recordEvaluation( savedEvaluationTerm( ev ), { costModel: ev.costModel, budget: ev.budget } );
```

```json
{
  "type": "plutus-script-evaluation",
  "version": 1,
  "program": "<flat program, hex>",
  "args": [ "<CBOR data, hex>" ],
  "budget": { "cpu": "10000000000", "mem": "14000000" },
  "costModel": { },
  "purpose": "spend", "index": 0, "scriptHash": "<hex>",
  "error": "explicit error from uplc",
  "location": { "source": "src/index.pebble", "line": 50, "column": 13, "endLine": 50, "endColumn": 41 }
}
```

Only `type`, `version`, `program` and `args` are required.
