import { AnyV1CostModel, AnyV2CostModel, AnyV3CostModel, AnyV4CostModel, defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { UPLCTerm, UPLCVersion } from "@harmoniclabs/uplc";
import { Machine } from "../Machine/Machine";
import { ExBudget } from "../Machine/ExBudget";
import { CEKError } from "../CEKValue";
import { indexProgram } from "./ProgramIndex";
import { findMappedProgram } from "./findMappedProgram";
import { FailureTracker } from "./FailureTracker";
import { UPLCSourceMap } from "./UPLCSourceMap";
import { ScriptFailure } from "./ScriptFailure";

export interface LocateFailureOptions {
    /** the term that failed, with parameters and script arguments applied */
    term: UPLCTerm;
    map: UPLCSourceMap;
    /** the subterm `map` describes; searched with `findMappedProgram` when missing */
    program?: UPLCTerm;
    /** version of the program `term` comes from, used by `findMappedProgram` */
    version?: UPLCVersion | string;
    /** cost model and budget of the failed evaluation, so that it fails the same way again */
    costModel?: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel | AnyV4CostModel;
    budget?: ExBudget;
    strictV3?: boolean;
}

/**
 * Evaluates `term` again, on a new machine, following it with a `FailureTracker`, and
 * returns where it failed. Evaluation is deterministic, so a term that failed once fails
 * the same way with the same cost model and budget.
 *
 * Returns `undefined` when `map` does not describe the program or the evaluation succeeds.
 */
export function locateFailure( opts: LocateFailureOptions ): ScriptFailure | undefined
{
    const { term, map } = opts;
    const program = opts.program ?? findMappedProgram( term, map, opts.version );
    if( program === undefined ) return undefined;

    const index = indexProgram( program );
    if( index.terms.length !== map.termCount ) return undefined;

    const tracker = new FailureTracker( index, map );
    const machine = new Machine( opts.costModel ?? defaultV4Costs, opts.budget );
    if( opts.strictV3 === true ) machine.setStrictV3( true );
    machine.setStepHook( tracker.onStep );

    const { result } = machine.eval( term );
    if(!( result instanceof CEKError )) return undefined;

    return tracker.resolve( result.msg ?? "explicit error from uplc" );
}
