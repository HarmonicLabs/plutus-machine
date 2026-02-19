import { eqUPLCTerm, parseUPLC, parseUPLCText } from "@harmoniclabs/uplc";
import { readFileSync, readdirSync } from "fs";
import { Machine } from "../Machine/Machine";
import { CEKError } from "../CEKValue/CEKError";
import { CEKValue, eqCEKValue } from "../CEKValue";
import { CEKDelay } from "../CEKValue/CEKDelay";
import { CEKLambda } from "../CEKValue/CEKLambda";
import { CEKConst } from "../CEKValue/CEKConst";
import { CEKConstr } from "../CEKValue/CEKConstr";

test("mock", () => {});

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
    const times: number[] = [];
    for( const entry of dir )
    {
        const nextPath = `${path}/${entry.name}`;
        if( entry.isDirectory() ) testDir( nextPath );

        //*
        if(!(
            entry.isFile() 
            && entry.name.endsWith(".flat") 
        )) continue;

        test(nextPath, () => {
            const uplc = parseUPLC( readFileSync( nextPath ), "flat" );

            const start = performance.now();
            const val = Machine.evalSimple( uplc.body );
            const end = performance.now();
            times.push( end - start );
            
            // console.log( `${nextPath}: ${end - start}ms` );
        })
        //*/
    }

    test("final",() => {
        const avg = times.reduce( (a,b) => a + b, 0 ) / times.length;
        console.log( "times:", times );
        console.log( `Average time for ${path}: ${avg}ms` );
    })
}

testDir( "./src/__tests__/bench" );

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

    if( a instanceof CEKConstr && b instanceof CEKConstr )
    return a.tag === b.tag && (
        Array.isArray( a.values ) &&
        Array.isArray( b.values ) &&
        a.values.length === b.values.length &&
        a.values.every( (a_val,i) => shallowEqCEKValue( a_val, b.values[i] ) )
    );

    return eqCEKValue( a, b );
}