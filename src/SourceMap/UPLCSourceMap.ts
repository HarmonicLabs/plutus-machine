
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
 * `[ conditionTermIndex, sourceIndex, startLine, startColumn, endLine, endColumn ]`
 *
 * The root of an assert's condition and the range of the assert statement.
 */
export type UPLCSourceMapAssert = [ number, number, number, number, number, number ];

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

    const asserts = tuples( obj.asserts ?? [], 6, "asserts" ) as UPLCSourceMapAssert[];
    for( const a of asserts )
    {
        checkTerm( a[0], "assert" );
        checkSource( a[1], "assert" );
        checkRange( a, 2, "assert" );
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
    return result;
}

function isNat( n: unknown ): n is number
{
    return typeof n === "number" && Number.isSafeInteger( n ) && n >= 0;
}

/** `functions` allows `-1` as name index, every other field is a natural number */
function tuples( arr: unknown, len: number, what: string ): number[][]
{
    if( !Array.isArray( arr ) ) throw new UPLCSourceMapError( `source map '${what}' must be an array` );
    for( const entry of arr )
    {
        if(
            !Array.isArray( entry ) ||
            entry.length !== len ||
            !entry.every( ( n, i ) => isNat( n ) || ( what === "functions" && i === 1 && n === -1 ) )
        ) throw new UPLCSourceMapError( `source map '${what}' entries must be arrays of ${len} integers: ${JSON.stringify( entry )}` );
    }
    return arr as number[][];
}
