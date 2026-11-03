import { AnyV1CostModel, AnyV2CostModel, AnyV3CostModel, AnyV4CostModel, defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { UPLCTerm } from "@harmoniclabs/uplc";
import { Machine } from "../Machine/Machine";
import { ExBudget } from "../Machine/ExBudget";
import { MachineState } from "../Machine/MachineState";
import { MachineContext } from "../Machine/MachineContext";
import { CEKValueObj } from "../CEKValue";
import { MachineStateTag } from "../_internal/MachineStateTag";
import { CEKValueTag } from "../_internal/CEKValueTag";

export interface RecordEvaluationOptions {
    /** cost model and budget of the evaluation to reproduce; default: V4 costs, no limit */
    costModel?: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel | AnyV4CostModel;
    budget?: ExBudget;
    strictV3?: boolean;
    /**
     * states kept at most (default 2,000,000); the evaluation goes on past them unrecorded,
     * and the recording says it is incomplete
     */
    maxStates?: number;
}

const DEFAULT_MAX_STATES = 2_000_000;

/**
 * Every state of one evaluation, in order, with the budget spent and the lines logged before
 * each was stepped.
 *
 * Machine states never change once created: environments are persistent lists and frames are
 * immutable, so the recording keeps the states themselves. Any of them can be inspected after
 * the evaluation, which is how a debugger steps back.
 */
export class EvaluationRecording
{
    private _returns: Int32Array | undefined = undefined;

    constructor(
        readonly states: readonly Readonly<MachineState>[],
        /** cpu spent before each state, startup cost included */
        readonly cpu: Float64Array,
        /** memory spent before each state, startup cost included */
        readonly mem: Float64Array,
        /** lines logged before each state */
        readonly logCount: Uint32Array,
        /** the evaluation's value, or its `CEKError` */
        readonly result: CEKValueObj,
        readonly budgetSpent: ExBudget,
        readonly logs: readonly string[],
        /** `false` when `maxStates` cut the recording short */
        readonly complete: boolean
    ) {}

    get length(): number { return this.states.length; }

    /** whether the evaluation ended with an error */
    get failed(): boolean { return this.result.tag === CEKValueTag.Error; }

    isCompute( step: number ): boolean { return this.states[step]?.tag === MachineStateTag.Compute; }
    isReturn( step: number ): boolean { return this.states[step]?.tag === MachineStateTag.Return; }
    isDone( step: number ): boolean { return this.states[step]?.tag === MachineStateTag.Done; }

    /**
     * The state that returns the value of the term computed at `step`, `-1` when that term
     * did not return (the evaluation failed first, or `step` is not a compute state).
     *
     * A term computed under frame `K` returns its value to `K`, and nothing else returns to
     * `K` before it: the first later return to the same frame object carries the value.
     */
    returnOf( step: number ): number
    {
        const returns = this._returns ??= computeReturns( this.states );
        return step >= 0 && step < returns.length ? returns[step] : -1;
    }

    /** the value the term computed at `step` evaluates to; `undefined` when it does not return */
    valueOf( step: number ): CEKValueObj | undefined
    {
        const r = this.returnOf( step );
        return r < 0 ? undefined : this.states[r].term as CEKValueObj;
    }
}

function computeReturns( states: readonly Readonly<MachineState>[] ): Int32Array
{
    const returns = new Int32Array( states.length ).fill( -1 );
    const pending = new Map<MachineContext, number[]>();
    for( let j = 0; j < states.length; j++ )
    {
        const s = states[j];
        if( s.tag === MachineStateTag.Compute )
        {
            const waiting = pending.get( s.ctx );
            if( waiting === undefined ) pending.set( s.ctx, [ j ] );
            else waiting.push( j );
        }
        // an error value ends the evaluation; it is no term's value
        else if( s.tag === MachineStateTag.Return && s.term.tag !== CEKValueTag.Error )
        {
            const waiting = pending.get( s.ctx );
            if( waiting === undefined ) continue;
            for( const k of waiting ) returns[k] = j;
            pending.delete( s.ctx );
        }
    }
    return returns;
}

/**
 * Evaluates `term` on a new machine, keeping every state (see `EvaluationRecording`).
 * Evaluation is deterministic: with the cost model and budget of a failed evaluation, the
 * recording fails the same way.
 */
export function recordEvaluation( term: UPLCTerm, opts: RecordEvaluationOptions = {} ): EvaluationRecording
{
    const machine = new Machine( opts.costModel ?? defaultV4Costs, opts.budget );
    if( opts.strictV3 === true ) machine.setStrictV3( true );
    const maxStates = Math.max( 0, opts.maxStates ?? DEFAULT_MAX_STATES );

    // nothing is pending yet, so this charges nothing; the object is mutated later, the
    // destructured values are not
    const { cpu: startCpu, mem: startMem } = machine.remainingBudget;

    const states: Readonly<MachineState>[] = [];
    const cpu: number[] = [];
    const mem: number[] = [];
    const logCount: number[] = [];
    let complete = true;

    machine.setStepHook( state => {
        if( states.length >= maxStates ) { complete = false; return; }
        const left = machine.peekRemainingBudget();
        states.push( state );
        cpu.push( Number( startCpu - left.cpu ) );
        mem.push( Number( startMem - left.mem ) );
        logCount.push( machine.logCount );
    });
    const { result, budgetSpent, logs } = machine.eval( term );
    machine.setStepHook( undefined );

    return new EvaluationRecording(
        states,
        Float64Array.from( cpu ),
        Float64Array.from( mem ),
        Uint32Array.from( logCount ),
        result,
        budgetSpent,
        logs.slice(),
        complete
    );
}
