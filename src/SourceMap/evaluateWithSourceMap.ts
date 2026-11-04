import { AnyV1CostModel, AnyV2CostModel, AnyV3CostModel, AnyV4CostModel, defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { UPLCTerm, UPLCVersion } from "@harmoniclabs/uplc";
import { Machine } from "../Machine/Machine";
import { ExBudget } from "../Machine/ExBudget";
import { CEKError, CEKValueObj } from "../CEKValue";
import { indexProgram } from "./ProgramIndex";
import { findMappedProgram } from "./findMappedProgram";
import { FailureTracker } from "./FailureTracker";
import { TraceReplay } from "./TraceReplay";
import { UPLCSourceMap } from "./UPLCSourceMap";
import { ScriptFailure } from "./ScriptFailure";

export interface EvaluateWithSourceMapOptions {
    /** the term to evaluate: the program, with parameters and script arguments applied */
    term: UPLCTerm;
    map: UPLCSourceMap;
    /** the subterm `map` describes; searched with `findMappedProgram` when missing */
    program?: UPLCTerm;
    /** version of the program `term` comes from, used by `findMappedProgram` */
    version?: UPLCVersion | string;
    costModel?: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel | AnyV4CostModel;
    budget?: ExBudget;
    strictV3?: boolean;
}

export interface EvaluationWithSourceMap {
    result: CEKValueObj;
    budgetSpent: ExBudget;
    /**
     * the machine's logs, with the traces the compiler removed (the map's `traces`) put back
     * where they would have run
     */
    logs: string[];
    /** where it failed, as `locateFailure` says; only when it failed and the map describes the program */
    failure?: ScriptFailure;
    /** whether the map describes the program (otherwise this is a plain evaluation) */
    mapped: boolean;
}

/**
 * Evaluates `term` once, following it with the map: the result and cost are the machine's,
 * the logs include the traces the compiler removed from the program, and a failure says where
 * it failed. A map that does not describe the program gives a plain evaluation.
 */
export function evaluateWithSourceMap( opts: EvaluateWithSourceMapOptions ): EvaluationWithSourceMap
{
    const { term, map } = opts;
    const machine = new Machine( opts.costModel ?? defaultV4Costs, opts.budget );
    if( opts.strictV3 === true ) machine.setStrictV3( true );

    const program = opts.program ?? findMappedProgram( term, map, opts.version );
    const index = program === undefined ? undefined : indexProgram( program );
    if( index === undefined || index.terms.length !== map.termCount )
    {
        const { result, budgetSpent, logs } = machine.eval( term );
        return { result, budgetSpent, logs: logs.slice(), mapped: false };
    }

    const tracker = new FailureTracker( index, map );
    const replay = new TraceReplay( index, map, { machineLogs: () => machine.currentLogs, costModel: opts.costModel } );
    machine.setStepHook( replay.hasTraces
        ? state => { tracker.onStep( state ); replay.onStep( state ); }
        : tracker.onStep
    );
    const { result, budgetSpent, logs } = machine.eval( term );
    machine.setStepHook( undefined );
    const failure = result instanceof CEKError ? tracker.resolve( result.msg ?? "explicit error from uplc" ) : undefined;
    return {
        result,
        budgetSpent,
        logs: replay.hasTraces ? replay.logs.slice() : logs.slice(),
        ...( failure === undefined ? {} : { failure } ),
        mapped: true,
    };
}
