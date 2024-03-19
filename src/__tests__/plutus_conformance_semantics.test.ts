import { eqUPLCTerm, parseUPLCText } from "@harmoniclabs/uplc";
import { readFileSync, readdirSync } from "fs";
import { Machine } from "../Machine/Machine";
import { CEKError } from "../CEKValue/CEKError";
import { CEKValue, eqCEKValue } from "../CEKValue";
import { CEKDelay } from "../CEKValue/CEKDelay";
import { CEKLambda } from "../CEKValue/CEKLambda";

jest.setTimeout( 5_000 );

function removeComments( src: string ): string
{
    const lines = src.split("\n");

    // map in place
    lines.forEach(( line, i ) => {
        const idx = line.indexOf("--");
        if( idx < 0 ) return;
        lines[i] = line.slice( 0, idx );
    });

    return lines.join("\n");
}

function dirEntries( path: string )
{
    return readdirSync( path, {
        encoding: "utf-8",
        recursive: false,
        withFileTypes: true
    });
}

function testDir( path: string )
{
    const dir = dirEntries( path );
    for( const entry of dir )
    {
        const nextPath = `${path}/${entry.name}`;
        if( entry.isDirectory() ) testDir( nextPath );

        //*
        if( entry.isFile() && entry.name.endsWith(".uplc") )
        {
            let expected = readFileSync( `${nextPath}.expected`, "utf8" );
            let uplcSrc = removeComments(
                readFileSync( nextPath, "utf-8" )
            );
            uplcSrc = uplcSrc.trim();

            if( expected.startsWith("parse error") )
            {
                // incorrect uplc is not responsability of this module
                // this is assumed to be tested in `@harmoniclabs/uplc` module
                continue;
            }
            else
            {
                if( nextPath.toLowerCase().includes("force") ) continue;
                test(nextPath, () => {
                    const uplc = parseUPLCText( uplcSrc );
                    const val = Machine.evalSimple( uplc );
                    if(expected.startsWith("evaluation failure"))
                    {
                        const res = val instanceof CEKError;
                        if( !res )
                        {
                            console.log( `${nextPath}.expected`, expected );  
                            console.log( val );
                        }
                        expect( res ).toBe( true );
                    }
                    else
                    {
                        const expectedUplc = parseUPLCText( removeComments( expected ) );
                        const expectedVal = Machine.evalSimple( expectedUplc );
                        const result = shallowEqCEKValue( val, expectedVal );
                        if( !result )
                        {
                            console.log( nextPath );
                            console.log( expectedVal );
                            console.log( val );
                        }
                        expect( result ).toBe( true );
                    }
                })
            }
        }
        //*/
    }
}

const base_path = "./src/__tests__/plutus_conformance/builtin/semantics";

testDir( base_path );

test("mock", () => {});

function shallowEqCEKValue( a: CEKValue, b: CEKValue ): boolean
{
    if( a instanceof CEKDelay && b instanceof CEKDelay )
    return (
        // CEKEnv.eq( a.env, b.env ) &&
        eqUPLCTerm( a.delayedTerm, b.delayedTerm )
    );
    
    if( a instanceof CEKLambda && b instanceof CEKLambda )
    return (
        // CEKEnv.eq( a.env, b.env ) &&
        eqUPLCTerm( a.body, b.body )
    );

    return eqCEKValue( a, b );
}