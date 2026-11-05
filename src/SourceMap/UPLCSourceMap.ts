
/**
 * `[ termIndex, sourceIndex, startLine, startColumn, endLine, endColumn ]`
 *
 * `termIndex` is the position of the term in a pre-order walk of the unapplied program
 * (see `indexProgram`). Lines and columns start at 1, columns count UTF-16 code units,
 * and the end is exclusive.
 */
export type UPLCSourceMapping = [ number, number, number, number, number, number ];

/**
 * `[ entryTermIndex, nameIndex, sourceIndex, line, column ]`
 *
 * The entry term is the root of a function's body: evaluating it enters the function,
 * both after a call and where the compiler copied the body in.
 * `nameIndex` is `-1` when the function has no name.
 */
export type UPLCSourceMapFunction = [ number, number, number, number, number ];

/**
 * `[ conditionTermIndex, sourceIndex, startLine, startColumn, endLine, endColumn, negated? ]`
 *
 * The root of an assert's condition and the range of the assert statement. `negated` `1`: the
 * term computes the condition negated (the compiler swapped the branches), it is true when the
 * assert fails; absent or `0`: the condition itself.
 */
export type UPLCSourceMapAssert = [ number, number, number, number, number, number ] | [ number, number, number, number, number, number, 0 | 1 ];

/**
 * `[ entryTermIndex, sourceIndex, startLine, startColumn, endLine, endColumn ]`
 *
 * A function body the compiler copied in place of a call, and the range of that call:
 * with no application left to point at, it is where the call frame's caller stands.
 */
export type UPLCSourceMapInlinedCall = [ number, number, number, number, number, number ];

/**
 * `[ caseTermIndex, sourceIndex, startLine, startColumn, endLine, endColumn ]`
 *
 * A `case` the compiler dropped failing branches from (a value with no branch fails just the
 * same) and the range of the failure they stood for: when that case fails, that failed.
 */
export type UPLCSourceMapFailure = [ number, number, number, number, number, number ];

/**
 * A trace the compiler removed from the program (Pebble's `removeTraces`): the program is the
 * one compiled without it, and tools evaluating it with the map print it where it would have
 * run (see `tracePoints`, `evaluateWithSourceMap`).
 */
export interface UPLCSourceMapTrace {
    /** `trace`: a trace statement; `assert`: the message of an assert; `fail`: the message of a failure */
    kind: "trace" | "assert" | "fail";
    /** the statement, `[ sourceIndex, startLine, startColumn, endLine, endColumn ]`; none in library code */
    at?: [ number, number, number, number, number ];
    /** the message, when it is always the same */
    message?: string;
    /** a message computed from values: its source text */
    expression?: string;
    /**
     * a message computed from values: a program (flat, hex) that is a function of those values
     * (see the trace point's arguments) and returns the message, a string; a `delay` of the
     * message when it takes none
     */
    program?: string;
}

/**
 * `[ termIndex, traceIndex, when, branch, ...arguments ]`: where the trace `traces[traceIndex]`
 * would have run. Sorted by term index; a term's traces in the order they ran.
 *
 * - `when` `0`: when the term is computed
 * - `when` `1`: when the term, an assert's condition, returns false
 * - `when` `2`: when the evaluation fails at the term (an `error`; or a `case` the compiler dropped
 *   failing branches from: `branch` is the index of the one the trace was in, `-1` for any)
 * - `when` `3`: when the term returns its value, which the message's program takes after the
 *   arguments (`trace v;` of a variable computed there)
 *
 * `arguments`, for a computed message: the de Bruijn index of each value its program takes, in the
 * environment of the term (`0` is the innermost lambda); `-1` when the program no longer has it.
 */
export type UPLCSourceMapTracePoint = number[];

/** Source map of a UPLC program, version 1. */
export interface UPLCSourceMap {
    version: 1;
    /** producer, informational */
    compiler?: string;
    /** blake2b-256 (hex) of the flat encoding of the unapplied program */
    programHash: string;
    /** version of that program, `major.minor.patch` */
    programVersion?: string;
    /** number of terms of the unapplied program */
    termCount: number;
    /** paths relative to the project root */
    sources: string[];
    /** source texts, parallel to `sources`; `null` when not included */
    sourcesContent?: ( string | null )[];
    names: string[];
    /** sorted by term index, at most one per term */
    mappings: UPLCSourceMapping[];
    functions: UPLCSourceMapFunction[];
    asserts: UPLCSourceMapAssert[];
    /** optional; entry terms also listed in `functions` */
    inlinedCalls?: UPLCSourceMapInlinedCall[];
    /** optional */
    failures?: UPLCSourceMapFailure[];
    /** optional: the traces the compiler removed */
    traces?: UPLCSourceMapTrace[];
    /** optional: where they would have run */
    tracePoints?: UPLCSourceMapTracePoint[];
}

export class UPLCSourceMapError extends Error {}

/**
 * Checks a parsed or serialized source map and returns it typed.
 * Unknown fields are ignored; any `version` other than 1 is rejected.
 */
export function parseSourceMap( json: string | object ): UPLCSourceMap
{
    let obj: any = json;
    if( typeof json === "string" )
    {
        try { obj = JSON.parse( json ); }
        catch( e ) { throw new UPLCSourceMapError( "source map is not valid JSON: " + String( e ) ); }
    }
    if( typeof obj !== "object" || obj === null ) throw new UPLCSourceMapError( "source map must be an object" );
    if( obj.version !== 1 ) throw new UPLCSourceMapError( "unsupported source map version: " + String( obj.version ) );

    const programHash = obj.programHash;
    if( typeof programHash !== "string" || !/^[0-9a-f]{64}$/.test( programHash ) )
    throw new UPLCSourceMapError( "source map 'programHash' must be 64 lowercase hex characters" );

    const termCount = obj.termCount;
    if( !isNat( termCount ) ) throw new UPLCSourceMapError( "source map 'termCount' must be a non-negative integer" );

    const sources = obj.sources;
    if( !Array.isArray( sources ) || !sources.every( s => typeof s === "string" ) )
    throw new UPLCSourceMapError( "source map 'sources' must be an array of strings" );

    const names = obj.names ?? [];
    if( !Array.isArray( names ) || !names.every( s => typeof s === "string" ) )
    throw new UPLCSourceMapError( "source map 'names' must be an array of strings" );

    let sourcesContent: ( string | null )[] | undefined = undefined;
    if( obj.sourcesContent !== undefined )
    {
        if(
            !Array.isArray( obj.sourcesContent ) ||
            obj.sourcesContent.length !== sources.length ||
            !obj.sourcesContent.every( ( s: unknown ) => s === null || typeof s === "string" )
        ) throw new UPLCSourceMapError( "source map 'sourcesContent' must be parallel to 'sources'" );
        sourcesContent = obj.sourcesContent;
    }

    const programVersion = obj.programVersion;
    if( programVersion !== undefined && ( typeof programVersion !== "string" || !/^\d+\.\d+\.\d+$/.test( programVersion ) ) )
    throw new UPLCSourceMapError( "source map 'programVersion' must look like 1.1.0" );

    const checkRange = ( entry: number[], at: number, what: string ) => {
        const [ startLine, startColumn, endLine, endColumn ] = entry.slice( at, at + 4 );
        if(
            startLine < 1 || startColumn < 1 || endLine < 1 || endColumn < 1 ||
            endLine < startLine || ( endLine === startLine && endColumn < startColumn )
        ) throw new UPLCSourceMapError( `source map ${what} has an invalid range: ${JSON.stringify( entry )}` );
    };
    const checkTerm = ( idx: number, what: string ) => {
        if( idx >= termCount ) throw new UPLCSourceMapError( `source map ${what} refers to term ${idx}, beyond 'termCount'` );
    };
    const checkSource = ( idx: number, what: string ) => {
        if( idx >= sources.length ) throw new UPLCSourceMapError( `source map ${what} refers to source ${idx}, which does not exist` );
    };

    const mappings = tuples( obj.mappings, 6, "mappings" ) as UPLCSourceMapping[];
    let prevTerm = -1;
    for( const m of mappings )
    {
        checkTerm( m[0], "mapping" );
        checkSource( m[1], "mapping" );
        checkRange( m, 2, "mapping" );
        if( m[0] <= prevTerm ) throw new UPLCSourceMapError( "source map 'mappings' must be sorted by term index, one per term" );
        prevTerm = m[0];
    }

    const functions = tuples( obj.functions ?? [], 5, "functions" ) as UPLCSourceMapFunction[];
    for( const f of functions )
    {
        checkTerm( f[0], "function" );
        if( f[1] >= names.length ) throw new UPLCSourceMapError( `source map function refers to name ${f[1]}, which does not exist` );
        checkSource( f[2], "function" );
        if( f[3] < 1 || f[4] < 1 ) throw new UPLCSourceMapError( `source map function has an invalid position: ${JSON.stringify( f )}` );
    }

    const asserts = tuples( obj.asserts ?? [], [ 6, 7 ], "asserts" ) as UPLCSourceMapAssert[];
    for( const a of asserts )
    {
        checkTerm( a[0], "assert" );
        checkSource( a[1], "assert" );
        checkRange( a, 2, "assert" );
        if( a.length === 7 && a[6] > 1 ) throw new UPLCSourceMapError( `source map assert has an invalid 'negated': ${JSON.stringify( a )}` );
    }

    const inlinedCalls = obj.inlinedCalls === undefined ? undefined : tuples( obj.inlinedCalls, 6, "inlinedCalls" ) as UPLCSourceMapInlinedCall[];
    for( const c of inlinedCalls ?? [] )
    {
        checkTerm( c[0], "inlined call" );
        checkSource( c[1], "inlined call" );
        checkRange( c, 2, "inlined call" );
    }

    const failures = obj.failures === undefined ? undefined : tuples( obj.failures, 6, "failures" ) as UPLCSourceMapFailure[];
    for( const f of failures ?? [] )
    {
        checkTerm( f[0], "failure" );
        checkSource( f[1], "failure" );
        checkRange( f, 2, "failure" );
    }

    let traces: UPLCSourceMapTrace[] | undefined = undefined;
    if( obj.traces !== undefined )
    {
        if( !Array.isArray( obj.traces ) ) throw new UPLCSourceMapError( "source map 'traces' must be an array" );
        traces = obj.traces.map( ( t: any, k: number ): UPLCSourceMapTrace => {
            const what = `trace ${k}`;
            if( typeof t !== "object" || t === null ) throw new UPLCSourceMapError( `source map ${what} must be an object` );
            if( t.kind !== "trace" && t.kind !== "assert" && t.kind !== "fail" )
            throw new UPLCSourceMapError( `source map ${what} has an unknown kind: ${String( t.kind )}` );
            const trace: UPLCSourceMapTrace = { kind: t.kind };
            if( t.at !== undefined )
            {
                if( !Array.isArray( t.at ) || t.at.length !== 5 || !t.at.every( isNat ) )
                throw new UPLCSourceMapError( `source map ${what} 'at' must be 5 non-negative integers` );
                checkSource( t.at[0], what );
                checkRange( t.at, 1, what );
                trace.at = t.at;
            }
            for( const field of [ "message", "expression" ] as const )
            {
                if( t[ field ] === undefined ) continue;
                if( typeof t[ field ] !== "string" ) throw new UPLCSourceMapError( `source map ${what} '${field}' must be a string` );
                trace[ field ] = t[ field ];
            }
            if( t.program !== undefined )
            {
                if( typeof t.program !== "string" || !/^([0-9a-f]{2})*$/.test( t.program ) )
                throw new UPLCSourceMapError( `source map ${what} 'program' must be hex` );
                trace.program = t.program;
            }
            return trace;
        });
    }

    let tracePoints: UPLCSourceMapTracePoint[] | undefined = undefined;
    if( obj.tracePoints !== undefined )
    {
        if( !Array.isArray( obj.tracePoints ) ) throw new UPLCSourceMapError( "source map 'tracePoints' must be an array" );
        let prev = -1;
        tracePoints = obj.tracePoints.map( ( p: any ) => {
            if(
                !Array.isArray( p ) || p.length < 4 ||
                !p.every( ( x: unknown, i: number ) => typeof x === "number" && Number.isSafeInteger( x ) && (
                    x >= 0 ||
                    ( i >= 3 && x === -1 ) ||
                    // the argument a reduced function is applied to (`when` 5, 6)
                    ( i >= 4 && x === -2 && ( p[2] === 5 || p[2] === 6 ) )
                ))
            ) throw new UPLCSourceMapError( `source map trace point is invalid: ${JSON.stringify( p )}` );
            checkTerm( p[0], "trace point" );
            if( traces === undefined || p[1] >= traces.length ) throw new UPLCSourceMapError( `source map trace point refers to trace ${p[1]}, which does not exist` );
            if( p[2] > 6 ) throw new UPLCSourceMapError( `source map trace point has an unknown 'when': ${p[2]}` );
            if( p[0] < prev ) throw new UPLCSourceMapError( "source map 'tracePoints' must be sorted by term index" );
            prev = p[0];
            return p as UPLCSourceMapTracePoint;
        });
    }

    const result: UPLCSourceMap = {
        version: 1,
        programHash,
        termCount,
        sources,
        names,
        mappings,
        functions,
        asserts,
    };
    if( typeof obj.compiler === "string" ) result.compiler = obj.compiler;
    if( programVersion !== undefined ) result.programVersion = programVersion;
    if( sourcesContent !== undefined ) result.sourcesContent = sourcesContent;
    if( inlinedCalls !== undefined ) result.inlinedCalls = inlinedCalls;
    if( failures !== undefined ) result.failures = failures;
    if( traces !== undefined ) result.traces = traces;
    if( tracePoints !== undefined ) result.tracePoints = tracePoints;
    return result;
}

function isNat( n: unknown ): n is number
{
    return typeof n === "number" && Number.isSafeInteger( n ) && n >= 0;
}

/**
 * `len`: the number of fields, or the numbers allowed (an optional last field);
 * `functions` allows `-1` as name index, every other field is a natural number
 */
function tuples( arr: unknown, len: number | readonly number[], what: string ): number[][]
{
    if( !Array.isArray( arr ) ) throw new UPLCSourceMapError( `source map '${what}' must be an array` );
    const lens = typeof len === "number" ? [ len ] : len;
    for( const entry of arr )
    {
        if(
            !Array.isArray( entry ) ||
            !lens.includes( entry.length ) ||
            !entry.every( ( n, i ) => isNat( n ) || ( what === "functions" && i === 1 && n === -1 ) )
        ) throw new UPLCSourceMapError( `source map '${what}' entries must be arrays of ${lens.join( " or " )} integers: ${JSON.stringify( entry )}` );
    }
    return arr as number[][];
}
