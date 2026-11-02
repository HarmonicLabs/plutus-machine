import { ScriptFailure, SourceLocation } from "./ScriptFailure";
import { UPLCSourceMap } from "./UPLCSourceMap";

/** `file:line:column` */
export function formatSourceLocation( loc: SourceLocation ): string
{
    return `${loc.source}:${loc.line}:${loc.column}`;
}

/** `at name (file:line:column)` lines, innermost first; consecutive repeats are collapsed */
export function formatFailureStack( failure: ScriptFailure ): string[]
{
    const lines: string[] = [];
    let prev: string | undefined = undefined;
    let repeats = 0;
    const flush = () => {
        if( repeats > 0 ) lines.push( `... repeated ${repeats} more time${repeats === 1 ? "" : "s"}` );
        repeats = 0;
    };
    for( const frame of failure.stack )
    {
        const where = frame.location ? formatSourceLocation( frame.location ) : "<unknown location>";
        const line = frame.functionName ? `at ${frame.functionName} (${where})` : `at ${where}`;
        if( line === prev ) { repeats++; continue; }
        flush();
        lines.push( line );
        prev = line;
    }
    flush();
    return lines;
}

/**
 * The source line of `loc` and a line marking its range, when `map` holds the source text.
 */
export function formatCodeFrame( loc: SourceLocation, map: UPLCSourceMap ): [ string, string ] | undefined
{
    const idx = map.sources.indexOf( loc.source );
    const text = idx >= 0 ? map.sourcesContent?.[ idx ] : undefined;
    if( typeof text !== "string" ) return undefined;

    const line = text.split( /\r?\n/ )[ loc.line - 1 ];
    if( line === undefined ) return undefined;

    const end = loc.endLine === loc.line ? Math.min( loc.endColumn, line.length + 1 ) : line.length + 1;
    // keep tabs, so that the marks line up with the source line
    const pad = line.slice( 0, loc.column - 1 ).replace( /[^\t]/g, " " );
    return [ line, pad + "^".repeat( Math.max( 1, end - loc.column ) ) ];
}

/**
 * The error message, `failed at <location>`, the code frame when `map` holds the source
 * text, and the stack, one per line.
 */
export function formatFailure( failure: ScriptFailure, map?: UPLCSourceMap ): string
{
    const lines = [ `error: ${failure.message}` ];
    if( failure.location !== undefined )
    {
        lines.push( `failed at ${formatSourceLocation( failure.location )}` );
        const frame = map !== undefined ? formatCodeFrame( failure.location, map ) : undefined;
        if( frame !== undefined ) lines.push( ...frame.map( l => "    " + l ) );
    }
    lines.push( ...formatFailureStack( failure ).map( l => "    " + l ) );
    return lines.join( "\n" );
}
