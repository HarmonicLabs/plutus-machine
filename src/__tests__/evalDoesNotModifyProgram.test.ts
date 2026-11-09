import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parseUPLCText, showUPLC, UPLCTermObj } from "@harmoniclabs/uplc";
import { defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { Machine } from "../Machine/Machine";
import { CEKError, dischargeCEKValue } from "../CEKValue";

jest.setTimeout( 60_000 );

function conformancePrograms(): [ string, string ][]
{
    const programs: [ string, string ][] = [];
    const walk = ( dir: string ) => {
        for( const entry of readdirSync( dir, { withFileTypes: true } ) )
        {
            const path = join( dir, entry.name );
            if( entry.isDirectory() ) walk( path );
            else if( entry.name.endsWith( ".uplc" ) )
            {
                if( readFileSync( `${path}.expected`, "utf8" ).startsWith( "parse error" ) ) continue;
                const src = readFileSync( path, "utf8" ).split( "\n" ).map( line => line.replace( /--.*$/, "" ) ).join( "\n" );
                programs.push([ path, src ]);
            }
        }
    };
    walk( join( __dirname, "plutus_conformance" ) );
    return programs;
}

/**
 * Builtins get the constants of the program itself: one that changed its input
 * (`byteStringToInteger` reversed little-endian input in place) changed the
 * program, and evaluating it again gave another result.
 */
test("evaluating a program leaves it unchanged, and evaluating it again gives the same result", () => {
    const changed: string[] = [];
    for( const [ path, src ] of conformancePrograms() )
    {
        let term: UPLCTermObj;
        try { term = parseUPLCText( src ) as UPLCTermObj; }
        catch { continue; }
        const before = showUPLC( term );
        const results = [ 0, 1 ].map( () => {
            const { result } = new Machine( defaultV4Costs ).eval( term );
            return result instanceof CEKError ? "error" : showUPLC( dischargeCEKValue( result ) );
        });
        if( showUPLC( term ) !== before || results[0] !== results[1] ) changed.push( path.slice( path.indexOf( "plutus_conformance" ) ) );
    }
    expect( changed ).toEqual([]);
});
