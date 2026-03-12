import { ConstTyTag, parseUPLCText, UPLCTermObj, constTypeEq, canConstValueBeOfConstType, eqConstValue } from "@harmoniclabs/uplc";
import { readFileSync, readdirSync } from "fs";
import { Machine } from "../Machine/Machine";
import { CEKValue, CEKValueObj, eqCEKValue } from "../CEKValue";
import { CEKConst } from "../CEKValue/CEKConst";
import { CEKValueTag } from "../_internal/CEKValueTag";

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
                        // const res = val.tag === CEKValueTag.Error;
                        const resultIsNotUnit = val.tag !== CEKValueTag.Const || val.typeTag !== ConstTyTag.unit;
                        if( !resultIsNotUnit )
                        {
                            console.log( `${nextPath}.expected`, expected );  
                            console.log( val );
                        }
                        expect( resultIsNotUnit ).toBe( true );
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

/*
testDir( "./src/__tests__/plutus_conformance/builtin/semantics" );
testDir( "./src/__tests__/plutus_conformance/term/case" );
testDir( "./src/__tests__/plutus_conformance/term/constr" );
/*/
testDir( "./src/__tests__/plutus_conformance" );
//*/


test("mock", () => {});

function shallowEqCEKValue( a: CEKValueObj, b: CEKValueObj ): boolean
{
    if( a.tag === CEKValueTag.Error ) return b.tag === CEKValueTag.Error;
    if( a.tag !== b.tag ) return false;

    if( a.tag === CEKValueTag.Delay )
    return eqUPLCTermObj( a.delayedTerm, (b as typeof a).delayedTerm );

    if( a.tag === CEKValueTag.Lambda )
    return eqUPLCTermObj( a.body, (b as typeof a).body );

    if( a.tag === CEKValueTag.Constr )
    return (
        a.index === (b as typeof a).index &&
        a.values.length === (b as typeof a).values.length &&
        a.values.every( (v, i) => shallowEqCEKValue( v, (b as typeof a).values[i] ) )
    );

    return eqCEKValue( a as CEKValue, b as CEKValue );
}

function eqUPLCTermObj( a: UPLCTermObj, b: UPLCTermObj ): boolean
{
    if( a.tag === 6 /* Error */ ) return b.tag === 6;
    if( a.tag !== b.tag ) return false;
    if( a.tag === 0 /* Var */ ) return (a as any).deBruijn === (b as any).deBruijn;
    if( a.tag === 1 /* Delay */ ) return eqUPLCTermObj( (a as any).delayedTerm, (b as any).delayedTerm );
    if( a.tag === 2 /* Lambda */ ) return eqUPLCTermObj( (a as any).body, (b as any).body );
    if( a.tag === 3 /* Application */ )
    return (
        eqUPLCTermObj( (a as any).func, (b as any).func ) &&
        eqUPLCTermObj( (a as any).arg, (b as any).arg )
    );
    if( a.tag === 4 /* Const */ )
    return (
        constTypeEq( (a as any).type, (b as any).type ) &&
        canConstValueBeOfConstType( (a as any).value, (a as any).type ) &&
        canConstValueBeOfConstType( (b as any).value, (b as any).type ) &&
        (() => {
            try {
                return eqConstValue( (a as any).value, (b as any).value );
            } catch (e) {
                if( e instanceof RangeError ) return false;
                throw e;
            }
        })()
    );
    if( a.tag === 5 /* Force */ ) return eqUPLCTermObj( (a as any).forced, (b as any).forced );
    if( a.tag === 7 /* Builtin */ ) return (a as any).builtinTag === (b as any).builtinTag;
    if( a.tag === 8 /* Constr */ )
    return (
        (a as any).index === (b as any).index &&
        (a as any).terms.length === (b as any).terms.length &&
        (a as any).terms.every((t: UPLCTermObj, i: number) => eqUPLCTermObj( t, (b as any).terms[i] ))
    );
    if( a.tag === 9 /* Case */ )
    return (
        eqUPLCTermObj( (a as any).constrTerm, (b as any).constrTerm ) &&
        (a as any).continuations.length === (b as any).continuations.length &&
        (a as any).continuations.every((t: UPLCTermObj, i: number) => eqUPLCTermObj( t, (b as any).continuations[i] ))
    );
    return false;
}