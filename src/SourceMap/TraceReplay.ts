import { Application, Force, parseUPLC, UPLCTermObj } from "@harmoniclabs/uplc";
import { fromHex } from "@harmoniclabs/uint8array-utils";
import { MachineState } from "../Machine/MachineState";
import { MachineContext } from "../Machine/MachineContext";
import { MachineStateTag } from "../_internal/MachineStateTag";
import { MachineContextTag } from "../_internal/MachineContextTag";
import { CEKValueTag } from "../_internal/CEKValueTag";
import { CEKValueObj } from "../CEKValue";
import { dischargeCEKValue } from "../CEKValue/discharge";
import { CEKEnv, lookupEnv } from "../CEKEnv";
import { ExBudget } from "../Machine/ExBudget";
import { Machine } from "../Machine/Machine";
import { ProgramIndex } from "./ProgramIndex";
import { UPLCSourceMap, UPLCSourceMapTrace } from "./UPLCSourceMap";

interface Point {
    /** index in `map.traces` */
    readonly trace: number;
    readonly when: number;
    readonly branch: number;
    readonly args: readonly number[];
}

interface OpenTerm {
    /**
     * `1`: an assert's condition, its points run if it returns false; `4`: one negated, they run
     * if it returns true; `3`: they take the value
     */
    readonly when: 1 | 3 | 4;
    readonly points: readonly Point[];
    /** frame that receives the term's value */
    readonly entryFrame: MachineContext;
    readonly env: CEKEnv;
}

export interface TraceReplayOptions {
    /**
     * the logs the machine has written so far (`Machine.currentLogs`): the traces the program
     * still has, kept in order with the ones put back
     */
    machineLogs?: () => readonly string[];
    /** cost model for the programs computing messages; default the machine's default */
    costModel?: ConstructorParameters<typeof Machine>[0];
    /** what computing one message may spend */
    messageBudget?: ExBudget;
}

/** generous: a message is a few conversions, but the values it reads may be large */
const DEFAULT_MESSAGE_BUDGET = { cpu: 10_000_000_000n, mem: 100_000_000n };

/**
 * Step hook that puts back the traces the compiler removed from a program (the map's `traces`
 * and `tracePoints`): what the program compiled with its traces would have logged, in order.
 *
 * The evaluation does not change: a message computed from values is evaluated on the side,
 * from the values the program has at that point, and its cost is not counted.
 */
export class TraceReplay
{
    private readonly pointsAt = new Map<number, Point[]>();
    /** term that pushed each frame */
    private readonly owners = new Map<MachineContext, number>();
    private readonly open: OpenTerm[] = [];
    /** traces printed because their assert's condition failed: the failure that follows does not print them again */
    private readonly printedOnFalse = new Set<number>();
    private readonly programs = new Map<number, UPLCTermObj | null>();
    private readonly out: string[] = [];
    private machineSeen = 0;
    private prev: Readonly<MachineState> | undefined = undefined;
    private failed = false;

    constructor(
        readonly index: ProgramIndex,
        readonly map: UPLCSourceMap,
        readonly opts: TraceReplayOptions = {}
    )
    {
        for( const p of map.tracePoints ?? [] )
        {
            const [ term, trace, when, branch, ...args ] = p;
            let at = this.pointsAt.get( term );
            if( at === undefined ) this.pointsAt.set( term, at = [] );
            at.push({ trace, when, branch, args });
        }
    }

    /** whether the map has traces to put back */
    get hasTraces(): boolean { return this.pointsAt.size > 0; }

    /** the logs so far: the machine's and the ones put back, in order */
    get logs(): string[]
    {
        this.syncMachineLogs();
        return this.out;
    }

    /** pass to `Machine.setStepHook` (or call from a hook that does more) */
    readonly onStep = ( state: Readonly<MachineState> ): void =>
    {
        switch( state.tag )
        {
            case MachineStateTag.Compute:
                this.onCompute( state.term, state.env, state.ctx );
                break;
            case MachineStateTag.Return:
                if( state.term.tag === CEKValueTag.Error ) this.onFailure();
                else this.onReturn( state.term, state.ctx );
                break;
            case MachineStateTag.Done:
                if( state.term.tag === CEKValueTag.Error ) this.onFailure();
                break;
        }
        this.prev = state;
    }

    private onCompute( term: UPLCTermObj, env: CEKEnv, ctx: MachineContext ): void
    {
        const i = this.index.indexOf( term );
        if( i === undefined ) return;

        // the first term computed under a new frame is a child of the term that pushed it
        // (as in `FailureTracker`): a failing case is found through the frame it pushed
        if( ctx.tag !== MachineContextTag.NoFrame && !this.owners.has( ctx ) )
        {
            const parent = this.index.parents[i];
            if( parent >= 0 ) this.owners.set( ctx, parent );
        }

        const points = this.pointsAt.get( i );
        if( points === undefined ) return;
        const onFalse: Point[] = [];
        const onTrue: Point[] = [];
        const onValue: Point[] = [];
        for( const p of points )
        {
            if( p.when === 0 ) this.emit( p, env );
            else if( p.when === 1 ) onFalse.push( p );
            else if( p.when === 4 ) onTrue.push( p );
            else if( p.when === 3 ) onValue.push( p );
        }
        if( onFalse.length > 0 ) this.open.push({ when: 1, points: onFalse, entryFrame: ctx, env });
        if( onTrue.length > 0 ) this.open.push({ when: 4, points: onTrue, entryFrame: ctx, env });
        if( onValue.length > 0 ) this.open.push({ when: 3, points: onValue, entryFrame: ctx, env });
    }

    private onReturn( value: CEKValueObj, ctx: MachineContext ): void
    {
        const open = this.open;
        while( open.length > 0 && open[ open.length - 1 ].entryFrame === ctx )
        {
            const t = open.pop()!;
            if( t.when === 3 ) for( const p of t.points ) this.emit( p, t.env, value );
            else if( isBool( value, t.when === 4 ) ) for( const p of t.points )
            {
                this.printedOnFalse.add( p.trace );
                this.emit( p, t.env );
            }
        }
    }

    private onFailure(): void
    {
        if( this.failed ) return;
        this.failed = true;
        const prev = this.prev;
        if( prev === undefined ) return;
        let failedAt: number | undefined = undefined;
        let env: CEKEnv = undefined;
        // the branch a `case` looked for: the scrutinee's constructor
        let branch = -1;
        if( prev.tag === MachineStateTag.Compute )
        {
            failedAt = this.index.indexOf( prev.term );
            env = prev.env;
        }
        else if( prev.tag === MachineStateTag.Return )
        {
            failedAt = this.owners.get( prev.ctx );
            env = ( prev.ctx as any ).env;
            if( prev.ctx.tag === MachineContextTag.FrameCases ) branch = branchOf( prev.term );
        }
        if( failedAt === undefined ) return;
        for( const p of this.pointsAt.get( failedAt ) ?? [] )
        {
            if( p.when !== 2 ) continue;
            if( branch >= 0 && p.branch >= 0 && p.branch !== branch ) continue;
            // an assert whose false condition already printed its message
            if( this.printedOnFalse.has( p.trace ) ) continue;
            this.emit( p, env );
        }
    }

    private syncMachineLogs(): void
    {
        const logs = this.opts.machineLogs?.();
        if( logs === undefined ) return;
        // a new evaluation started with fresh logs
        if( logs.length < this.machineSeen ) this.machineSeen = 0;
        while( this.machineSeen < logs.length ) this.out.push( logs[ this.machineSeen++ ] );
    }

    private emit( p: Point, env: CEKEnv, value?: CEKValueObj ): void
    {
        this.syncMachineLogs();
        const trace = this.map.traces?.[ p.trace ];
        if( trace === undefined ) return;
        if( trace.message !== undefined ) { this.out.push( trace.message ); return; }
        this.out.push( this.compute( p, trace, env, value ) );
    }

    /** a computed message, from the values the program has at that point (and the value returned there) */
    private compute( p: Point, trace: UPLCSourceMapTrace, env: CEKEnv, returned: CEKValueObj | undefined ): string
    {
        const what = trace.expression ?? "a computed message";
        const program = this.program( p.trace );
        if( program === null ) return `<${what}>`;
        const values: CEKValueObj[] = [];
        for( const a of p.args )
        {
            const v = a < 0 ? undefined : lookupEnv( env, a );
            if( v === undefined ) return `<${what}: not computed by the stripped script>`;
            values.push( v );
        }
        if( returned !== undefined ) values.push( returned );
        let term: UPLCTermObj = program;
        for( const v of values ) term = new Application( term as any, dischargeCEKValue( v ) as any );
        // a program that takes nothing is delayed
        if( values.length === 0 ) term = new Force( term as any );
        try {
            const machine = new Machine( this.opts.costModel, this.opts.messageBudget ?? new ExBudget( DEFAULT_MESSAGE_BUDGET ) );
            const { result } = machine.eval( term );
            if( result.tag === CEKValueTag.Const && typeof ( result as any ).value === "string" ) return ( result as any ).value;
            if( result.tag === CEKValueTag.Error ) return `<${what}: failed${ ( result as any ).msg ? ": " + ( result as any ).msg : "" }>`;
            return `<${what}: not a string>`;
        }
        catch( e ) {
            return `<${what}: ${ e instanceof Error ? e.message : String( e ) }>`;
        }
    }

    private program( trace: number ): UPLCTermObj | null
    {
        let p = this.programs.get( trace );
        if( p !== undefined ) return p;
        const hex = this.map.traces?.[ trace ]?.program;
        try { p = hex === undefined ? null : parseUPLC( fromHex( hex ), "flat" ).body as UPLCTermObj; }
        catch { p = null; }
        this.programs.set( trace, p );
        return p;
    }
}

function isBool( value: CEKValueObj, b: boolean ): boolean
{
    return value.tag === CEKValueTag.Const && ( value as any ).value === b;
}

/** the branch `case` takes for `value`: a constructor's index (a boolean: false 0, true 1; an integer: itself) */
function branchOf( value: CEKValueObj ): number
{
    if( value.tag === CEKValueTag.Constr ) return Number( ( value as any ).index );
    if( value.tag === CEKValueTag.Const )
    {
        const v = ( value as any ).value;
        if( typeof v === "boolean" ) return v ? 1 : 0;
        if( typeof v === "bigint" && v >= 0n && v < 1_000_000n ) return Number( v );
    }
    return -1;
}
