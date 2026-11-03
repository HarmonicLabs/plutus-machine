import { UPLCTermObj } from "@harmoniclabs/uplc";
import { MachineState } from "../Machine/MachineState";
import { MachineContext } from "../Machine/MachineContext";
import { MachineStateTag } from "../_internal/MachineStateTag";
import { MachineContextTag } from "../_internal/MachineContextTag";
import { CEKValueTag } from "../_internal/CEKValueTag";
import { CEKValueObj } from "../CEKValue";
import { ProgramIndex } from "./ProgramIndex";
import { UPLCSourceMap } from "./UPLCSourceMap";
import { ScriptFailure, ScriptFailureFrame, SourceLocation } from "./ScriptFailure";

interface OpenCall {
    /** index in `map.functions` */
    readonly fn: number;
    /** frame that receives the call's result */
    readonly entryFrame: MachineContext;
    /** term that made the call, `-1` if unknown */
    readonly callSite: number;
    /** the call a copied-in body stands for (`map.inlinedCalls`), preferred over `callSite` */
    readonly inlinedCall: number;
    /** last term with a mapping evaluated in this call (not in its callees), `-1` if none */
    lastSite: number;
}

interface OpenCondition {
    /** index in `map.asserts` */
    readonly assert: number;
    /** frame that receives the condition's value */
    readonly entryFrame: MachineContext;
}

/**
 * Step hook that follows an evaluation of a program described by a source map, to tell
 * where it failed (see `locateFailure`).
 *
 * The machine's frames are an immutable linked list, so a frame object identifies one
 * pending computation. A function call or an assert condition is open from the moment its
 * entry term is computed until a value returns to the frame that was current then.
 */
export class FailureTracker
{
    private readonly mappingAt: Int32Array;
    private readonly functionAt: Int32Array;
    private readonly assertAt: Int32Array;
    private readonly inlinedCallAt: Int32Array;
    private readonly failureAt: Int32Array;

    /** term that pushed each frame */
    private readonly owners = new Map<MachineContext, number>();
    private readonly calls: OpenCall[] = [];
    private readonly conditions: OpenCondition[] = [];
    /** like `OpenCall.lastSite`, outside any function */
    private rootLastSite = -1;
    /** last assert whose condition returned `false`, `-1` if none */
    private lastFalseAssert = -1;
    private prev: Readonly<MachineState> | undefined = undefined;

    private failed = false;
    /** term the evaluation failed at, `-1` if outside the program */
    private failedAt = -1;

    constructor(
        readonly index: ProgramIndex,
        readonly map: UPLCSourceMap
    )
    {
        const n = index.terms.length;
        this.mappingAt = new Int32Array( n ).fill( -1 );
        this.functionAt = new Int32Array( n ).fill( -1 );
        this.assertAt = new Int32Array( n ).fill( -1 );
        this.inlinedCallAt = new Int32Array( n ).fill( -1 );
        this.failureAt = new Int32Array( n ).fill( -1 );
        map.mappings.forEach( ( m, k ) => { if( m[0] < n ) this.mappingAt[ m[0] ] = k; });
        map.functions.forEach( ( f, k ) => { if( f[0] < n ) this.functionAt[ f[0] ] = k; });
        map.asserts.forEach( ( a, k ) => { if( a[0] < n ) this.assertAt[ a[0] ] = k; });
        ( map.inlinedCalls ?? [] ).forEach( ( c, k ) => { if( c[0] < n ) this.inlinedCallAt[ c[0] ] = k; });
        ( map.failures ?? [] ).forEach( ( f, k ) => { if( f[0] < n ) this.failureAt[ f[0] ] = k; });
    }

    /** pass to `Machine.setStepHook` */
    readonly onStep = ( state: Readonly<MachineState> ): void =>
    {
        switch( state.tag )
        {
            case MachineStateTag.Compute:
                this.onCompute( state.term, state.ctx );
                break;
            case MachineStateTag.Return:
                // a returned error ends the evaluation; it is not a return
                if( state.term.tag === CEKValueTag.Error ) this.onFailure();
                else this.onReturn( state.term, state.ctx );
                break;
            case MachineStateTag.Done:
                if( state.term.tag === CEKValueTag.Error ) this.onFailure();
                break;
        }
        this.prev = state;
    }

    private onCompute( term: UPLCTermObj, ctx: MachineContext ): void
    {
        const i = this.index.indexOf( term );
        if( i === undefined ) return;

        // the first term computed under a new frame is a child of the term that pushed it
        if( ctx.tag !== MachineContextTag.NoFrame && !this.owners.has( ctx ) )
        {
            const parent = this.index.parents[i];
            if( parent >= 0 )
            {
                this.owners.set( ctx, parent );
                // a case passing constructor fields to its branch pushes one frame per
                // field; the lower ones are first reached from inside the branch
                if( ctx.tag === MachineContextTag.FrameAwaitFunValue )
                {
                    for(
                        let c: MachineContext | undefined = ctx.ctx;
                        c !== undefined && c.tag === MachineContextTag.FrameAwaitFunValue && !this.owners.has( c );
                        c = c.ctx
                    ) this.owners.set( c, parent );
                }
            }
        }

        const fn = this.functionAt[i];
        if( fn >= 0 ) this.calls.push({
            fn,
            entryFrame: ctx,
            callSite: this.callSite(),
            inlinedCall: this.inlinedCallAt[i],
            lastSite: -1
        });

        const assert = this.assertAt[i];
        if( assert >= 0 ) this.conditions.push({ assert, entryFrame: ctx });

        if( this.mappingAt[i] >= 0 )
        {
            const top = this.calls[ this.calls.length - 1 ];
            if( top !== undefined ) top.lastSite = i;
            else this.rootLastSite = i;
        }
    }

    /**
     * The term that called the function being entered: the application, the case passing
     * fields to its branch, or the `force` of a function without parameters. Where the body
     * was copied in by the compiler there is no call; the caller's last site stands in.
     */
    private callSite(): number
    {
        const prev = this.prev;
        if( prev !== undefined && prev.tag === MachineStateTag.Return )
        {
            const t = prev.ctx.tag;
            if(
                t === MachineContextTag.FrameAwaitArg ||
                t === MachineContextTag.FrameAwaitFunValue ||
                t === MachineContextTag.FrameForce
            )
            {
                const owner = this.owners.get( prev.ctx );
                if( owner !== undefined ) return owner;
            }
        }
        const top = this.calls[ this.calls.length - 1 ];
        return top !== undefined ? top.lastSite : this.rootLastSite;
    }

    private onReturn( value: CEKValueObj, ctx: MachineContext ): void
    {
        const conditions = this.conditions;
        while( conditions.length > 0 && conditions[ conditions.length - 1 ].entryFrame === ctx )
        {
            const c = conditions.pop()!;
            if( isFalse( value ) ) this.lastFalseAssert = c.assert;
        }
        const calls = this.calls;
        while( calls.length > 0 && calls[ calls.length - 1 ].entryFrame === ctx ) calls.pop();
    }

    private onFailure(): void
    {
        if( this.failed ) return;
        this.failed = true;
        const prev = this.prev;
        if( prev === undefined ) return;
        // `error` (or an unbound variable): the term being computed failed;
        // otherwise the term owning the frame that received the last value failed
        // (an application for a builtin, a case with no matching branch, a force)
        const failedAt = (
            prev.tag === MachineStateTag.Compute ? this.index.indexOf( prev.term ) :
            prev.tag === MachineStateTag.Return ? this.owners.get( prev.ctx ) :
            undefined
        );
        this.failedAt = failedAt ?? -1;
    }

    /** the failure, once the evaluation has failed; `undefined` before */
    resolve( message: string ): ScriptFailure | undefined
    {
        if( !this.failed ) return undefined;

        const location = (
            // an assert whose condition was false fails right after: it is the failure, even
            // when the failing term stands elsewhere (a shared `error` of merged asserts, a
            // condition the optimizer built from a variable's initializer)
            this.locationOfAssert( this.lastFalseAssert ) ??
            // a case that lost its failing branches: the failure they stood for
            this.locationOfFailure( this.failedAt ) ??
            this.locationOfTerm( this.failedAt ) ??
            this.innermostSite()
        );

        const stack: ScriptFailureFrame[] = [];
        const calls = this.calls;
        for( let k = calls.length - 1; k >= 0; k-- )
        {
            const call = calls[k];
            const nameIdx = this.map.functions[ call.fn ][1];
            const functionName = nameIdx >= 0 ? this.map.names[ nameIdx ] : undefined;
            const frameLocation = (
                k === calls.length - 1 ? location :
                this.callLocation( calls[ k + 1 ] ) ?? this.locationOfTerm( call.lastSite )
            );
            stack.push( functionName === undefined ? { location: frameLocation } : { functionName, location: frameLocation } );
        }
        // outside any function the failure itself is the only frame (code that runs before
        // the outermost call, such as hoisted definitions, is not a caller)
        if( calls.length === 0 && location !== undefined ) stack.push({ location });

        return location === undefined ? { message, stack } : { message, location, stack };
    }

    private innermostSite(): SourceLocation | undefined
    {
        for( let k = this.calls.length - 1; k >= 0; k-- )
        {
            const call = this.calls[k];
            const loc = this.locationOfTerm( call.lastSite ) ?? this.callLocation( call );
            if( loc !== undefined ) return loc;
        }
        return this.locationOfTerm( this.rootLastSite );
    }

    /** where `call` was made from */
    private callLocation( call: OpenCall ): SourceLocation | undefined
    {
        if( call.inlinedCall >= 0 )
        {
            const c = ( this.map.inlinedCalls ?? [] )[ call.inlinedCall ];
            return { source: this.map.sources[ c[1] ], line: c[2], column: c[3], endLine: c[4], endColumn: c[5] };
        }
        return this.locationOfTerm( call.callSite );
    }

    private locationOfTerm( termIdx: number ): SourceLocation | undefined
    {
        if( termIdx < 0 || termIdx >= this.mappingAt.length ) return undefined;
        const k = this.mappingAt[ termIdx ];
        if( k < 0 ) return undefined;
        const m = this.map.mappings[k];
        return { source: this.map.sources[ m[1] ], line: m[2], column: m[3], endLine: m[4], endColumn: m[5] };
    }

    private locationOfFailure( termIdx: number ): SourceLocation | undefined
    {
        if( termIdx < 0 || termIdx >= this.failureAt.length ) return undefined;
        const k = this.failureAt[ termIdx ];
        if( k < 0 ) return undefined;
        const f = ( this.map.failures ?? [] )[k];
        return { source: this.map.sources[ f[1] ], line: f[2], column: f[3], endLine: f[4], endColumn: f[5] };
    }

    private locationOfAssert( assertIdx: number ): SourceLocation | undefined
    {
        if( assertIdx < 0 ) return undefined;
        const a = this.map.asserts[ assertIdx ];
        return { source: this.map.sources[ a[1] ], line: a[2], column: a[3], endLine: a[4], endColumn: a[5] };
    }
}

function isFalse( value: CEKValueObj ): boolean
{
    return value.tag === CEKValueTag.Const && ( value as any ).value === false;
}
