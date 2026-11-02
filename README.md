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

The failure's location is, in order: the failing term (an `error`, the application of a
failing builtin, a `case` with no matching branch); for an `error` shared by several asserts,
the assert whose condition returned `false`; else the last mapped term of the innermost open
call. Each open call frame points at the call that made it.

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
  "inlinedCalls": [ [ 3, 0, 11, 15, 11, 25 ] ]
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
- **`asserts`**: `[ conditionTermIndex, sourceIndex, startLine, startColumn, endLine, endColumn ]`,
  the root of an assert's condition and the range of the assert statement.
- **`inlinedCalls`** (optional): `[ entryTermIndex, sourceIndex, startLine, startColumn, endLine,
  endColumn ]`, a body copied in place of a call, and that call's range.
- **Positions**: lines and columns start at 1, columns count UTF-16 code units, ends are
  exclusive.
- **Sources**: paths relative to the project root, with forward slashes. Only user code is
  mapped. `sourcesContent` (optional, parallel to `sources`) holds the texts, for code frames.
- **Compatibility**: readers reject any `version` but 1 and ignore unknown fields.
