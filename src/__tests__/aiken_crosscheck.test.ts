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
