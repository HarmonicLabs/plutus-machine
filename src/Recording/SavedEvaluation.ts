import { Application, compileUPLC, parseUPLC, UPLCConst, UPLCProgram, UPLCTerm, UPLCVersion } from "@harmoniclabs/uplc";
import { Data, dataFromCbor, dataToCbor } from "@harmoniclabs/plutus-data";
import { fromHex, toHex } from "@harmoniclabs/uint8array-utils";
import { ExBudget } from "../Machine/ExBudget";
import type { SourceLocation } from "../SourceMap/ScriptFailure";

/**
 * A script evaluation saved to a file, to run it again elsewhere (a debugger): the script, the
 * arguments it was applied to, and the cost model and budget it ran with. Evaluation is
 * deterministic, so the saved evaluation runs (and fails) the same way again.
 *
 * buildooor writes one for every script that fails, when asked (`TxBuilder` option
 * `saveFailedEvaluations`); `pebble debug --eval <file>` replays it.
 */
export interface SavedEvaluationJson {
    type: "plutus-script-evaluation";
    version: 1;
    /** the script's flat encoding, hex, as the transaction holds it (parameters applied) */
    program: string;
    /** the arguments applied to the script, in order (for V3 the script context), CBOR hex */
    args: string[];
    /** the budget the evaluation had */
    budget?: { cpu: string, mem: string };
    /** the cost model the evaluation used (an object or array, as the machine takes it) */
    costModel?: unknown;
    /** what the evaluation is (informational) */
    purpose?: string;
    /** the redeemer index (informational) */
    index?: number;
    /** the script's hash, hex (informational) */
    scriptHash?: string;
    /** the machine's error message, when it failed */
    error?: string;
    /** where it failed in the source, when a source map described the script */
    location?: SourceLocation;
}

export interface SavedEvaluation {
    program: UPLCProgram;
    args: Data[];
    budget?: ExBudget;
    costModel?: unknown;
    purpose?: string;
    index?: number;
    scriptHash?: string;
    error?: string;
    location?: SourceLocation;
}

export class SavedEvaluationError extends Error {}

/** the JSON form of an evaluation (`JSON.stringify` it to save it) */
export function savedEvaluationToJson( ev: SavedEvaluation ): SavedEvaluationJson
{
    const json: SavedEvaluationJson = {
        type: "plutus-script-evaluation",
        version: 1,
        program: toHex( compileUPLC( ev.program ) ),
        args: ev.args.map( d => toHex( dataToCbor( d ) ) ),
    };
    if( ev.budget !== undefined ) json.budget = { cpu: ev.budget.cpu.toString(), mem: ev.budget.mem.toString() };
    if( ev.costModel !== undefined ) json.costModel = jsonSafe( ev.costModel );
    if( ev.purpose !== undefined ) json.purpose = ev.purpose;
    if( ev.index !== undefined ) json.index = ev.index;
    if( ev.scriptHash !== undefined ) json.scriptHash = ev.scriptHash;
    if( ev.error !== undefined ) json.error = ev.error;
    if( ev.location !== undefined ) json.location = ev.location;
    return json;
}

/** reads a saved evaluation (JSON text or parsed) */
export function parseSavedEvaluation( json: string | object ): SavedEvaluation
{
    let obj: any = json;
    if( typeof json === "string" )
    {
        try { obj = JSON.parse( json ); }
        catch( e ) { throw new SavedEvaluationError( "saved evaluation is not valid JSON: " + String( e ) ); }
    }
    if( typeof obj !== "object" || obj === null || obj.type !== "plutus-script-evaluation" )
    throw new SavedEvaluationError( "not a saved script evaluation (expected \"type\": \"plutus-script-evaluation\")" );
    if( obj.version !== 1 ) throw new SavedEvaluationError( "unsupported saved evaluation version: " + String( obj.version ) );
    if( typeof obj.program !== "string" ) throw new SavedEvaluationError( "saved evaluation 'program' must be hex" );
    if( !Array.isArray( obj.args ) || !obj.args.every( ( a: unknown ) => typeof a === "string" ) )
    throw new SavedEvaluationError( "saved evaluation 'args' must be an array of CBOR hex strings" );

    let program: UPLCProgram;
    try { program = parseUPLC( fromHex( obj.program ) ); }
    catch( e ) { throw new SavedEvaluationError( "saved evaluation 'program' does not decode: " + String( e ) ); }
    let args: Data[];
    try { args = obj.args.map( ( a: string ) => dataFromCbor( a ) ); }
    catch( e ) { throw new SavedEvaluationError( "saved evaluation 'args' do not decode: " + String( e ) ); }

    const ev: SavedEvaluation = { program, args };
    if( obj.budget !== undefined ) ev.budget = new ExBudget({ cpu: BigInt( obj.budget.cpu ), mem: BigInt( obj.budget.mem ) });
    if( obj.costModel !== undefined ) ev.costModel = obj.costModel;
    for( const k of [ "purpose", "scriptHash", "error" ] as const ) if( typeof obj[k] === "string" ) ev[k] = obj[k];
    if( typeof obj.index === "number" ) ev.index = obj.index;
    if( typeof obj.location === "object" && obj.location !== null ) ev.location = obj.location;
    return ev;
}

/** the term the evaluation ran: the script's body applied to its arguments */
export function savedEvaluationTerm( ev: SavedEvaluation ): UPLCTerm
{
    let term: UPLCTerm = ev.program.body;
    for( const arg of ev.args ) term = new Application( term, UPLCConst.data( arg ) );
    return term;
}

/** bigints as numbers when exact, else strings: cost models are plain numbers */
function jsonSafe( x: unknown ): unknown
{
    return JSON.parse( JSON.stringify( x, ( _k, v ) =>
        typeof v === "bigint"
            ? ( v <= BigInt( Number.MAX_SAFE_INTEGER ) && v >= BigInt( Number.MIN_SAFE_INTEGER ) ? Number( v ) : v.toString() )
            : v
    ));
}

/** `program`'s version, as `findMappedProgram` takes it */
export function savedEvaluationVersion( ev: SavedEvaluation ): UPLCVersion
{
    return ev.program.version;
}
