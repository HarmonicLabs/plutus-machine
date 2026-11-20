import { parseUPLC } from "@harmoniclabs/uplc";
import { readFileSync } from "fs";
import { Machine } from "../Machine/Machine";
import { CEKValueTag } from "../_internal/CEKValueTag";
import { ConstTyTag } from "@harmoniclabs/uplc";

jest.setTimeout( 30_000 );

/**
 * Cross-checked with `aiken uplc eval -f`:
 *   { "result": "(con unit ())", "cpu": 96645735, "mem": 420551 }
 *
 * This is a fully-applied indexer token minting policy script
 * (script body applied to its ScriptContext argument).
 * The script must evaluate to (con unit ()) — success.
 */
test("indexerTokenPolicy applied script matches aiken eval result", () => {
    const flatBytes = readFileSync(
        "./src/__tests__/indexerTokenPolicy-applied.flat"
    );
    const program = parseUPLC( flatBytes );
    const { result, logs } = Machine.eval( program.body );

    // aiken says this evaluates to (con unit ())
    expect( result.tag ).toBe( CEKValueTag.Const );
    expect( (result as any).typeTag ).toBe( ConstTyTag.unit );
});

/**
 * The same script costs what `aiken uplc eval` says it costs, to the unit.
 *
 * Aiken evaluated it with the cost model of mainnet at the time (the 297-entry Plutus V3
 * model); the default model here is a later one in which seven numbers differ, so those
 * are put back. With sizes counted in bytes instead of words the machine gave
 * 97107842 / 420599 for this script.
 */
test("indexerTokenPolicy applied script costs what aiken says", () => {
    const { defaultV3Costs } = require("@harmoniclabs/cardano-costmodels-ts");
    const machine = new Machine({
        ...defaultV3Costs,
        "divideInteger-cpu-arguments-model-arguments-c11": 549,
        "modInteger-cpu-arguments-model-arguments-c11": 549,
        "quotientInteger-cpu-arguments-model-arguments-c11": 549,
        "remainderInteger-cpu-arguments-model-arguments-c11": 549,
        "equalsByteString-cpu-arguments-constant": 24548,
        "equalsByteString-cpu-arguments-intercept": 29498,
        "equalsByteString-cpu-arguments-slope": 38,
    }, undefined, { majorProtocolVersion: 10 } ); // (mainnet was at protocol version 10 then)
    const program = parseUPLC( readFileSync( "./src/__tests__/indexerTokenPolicy-applied.flat" ) );
    const { result, budgetSpent } = machine.eval( program.body as any );

    expect( result.tag ).toBe( CEKValueTag.Const );
    expect( budgetSpent.cpu ).toBe( BigInt( 96645735 ) );
    expect( budgetSpent.mem ).toBe( BigInt( 420551 ) );
});
