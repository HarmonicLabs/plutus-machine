import { compileUPLC, UPLCProgram, UPLCTerm, UPLCVersion } from "@harmoniclabs/uplc";
import { UPLCTermTag } from "@harmoniclabs/uplc/dist/UPLCTerm/UPLCTermTag";
import { blake2b_256 } from "@harmoniclabs/crypto";
import { toHex } from "@harmoniclabs/uint8array-utils";
import { countTerms } from "./ProgramIndex";
import { UPLCSourceMap } from "./UPLCSourceMap";

/** script arguments plus applied parameters; more than this is not a compiler's output */
const MAX_PEEL = 64;

/**
 * Finds the subterm of `term` that `map` describes: the program before parameters and
 * script arguments were applied to it. Walks down the root `Application`s (and `Force`s),
 * comparing the term count first and then the program hash.
 *
 * `version` is the version of the program the term was decoded from; it defaults to the
 * map's `programVersion`.
 */
export function findMappedProgram(
    term: UPLCTerm,
    map: UPLCSourceMap,
    version?: UPLCVersion | string
): UPLCTerm | undefined
{
    const v = toVersion( version ?? map.programVersion );
    if( v === undefined ) return undefined;

    let t: UPLCTerm | undefined = term;
    for( let i = 0; t !== undefined && i <= MAX_PEEL; i++ )
    {
        if( countTerms( t, map.termCount ) === map.termCount )
        {
            let hash: string | undefined = undefined;
            // a term that does not encode cannot be the program
            try { hash = programHashOf( t, v ); } catch {}
            if( hash === map.programHash ) return t;
        }

        t = (
            t.tag === UPLCTermTag.Application ? t.func :
            t.tag === UPLCTermTag.Force ? t.forced :
            undefined
        );
    }
    return undefined;
}

/** blake2b-256 (hex) of the flat encoding of `body` as a program of the given version */
export function programHashOf( body: UPLCTerm, version: UPLCVersion | string ): string
{
    const v = toVersion( version );
    if( v === undefined ) throw new Error( "invalid UPLC version: " + String( version ) );
    return toHex( blake2b_256( compileUPLC( new UPLCProgram( v, body ) ) ) );
}

function toVersion( version: UPLCVersion | string | undefined ): UPLCVersion | undefined
{
    // not `instanceof`: the caller may hold another copy of the uplc package
    if( typeof version === "object" && version !== null && typeof version.major === "number" )
    return new UPLCVersion( version.major, version.minor, version.patch );
    if( typeof version !== "string" ) return undefined;
    try { return UPLCVersion.fromString( version ); }
    catch { return undefined; }
}
