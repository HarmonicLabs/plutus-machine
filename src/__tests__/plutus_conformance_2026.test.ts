// The Plutus conformance suite as of January 2026 (991 cases, under
// `plutus_conformance_2026`), checked for what a program evaluates to AND for what the
// evaluation costs.
//
// `plutus_conformance` beside it is an older copy of the suite in its older layout; the
// test of that name checks results only, and its budget files were made with a cost model
// that is no longer the one of any network. Here every case that has a budget is held to it:
// the cost of a script is what a transaction declares and pays for, so a machine that gets
// the result right and the cost wrong builds transactions that either overpay or fail.
//
// What this suite caught when it was added:
//
//  - sizes were counted in bytes where Plutus counts 64-bit words (integers, byte strings),
//    and a string by its bytes where Plutus counts its characters: every cost that grows
//    with a size grew eight times as fast, and costs that compare two sizes (division is
//    cheaper when the dividend is the smaller number) took the wrong branch;
//  - `multiplyInteger` and `verifyEd25519Signature` kept the cost shape they had before V3;
//  - the quadratic term in the divisor of the division costs was not squared;
//  - widths, lengths and counts given as numbers (`integerToByteString`, `replicateByte`,
//    `dropList`, shifts and rotations) were costed on the size of the number;
//  - `andByteString`, `orByteString`, `xorByteString` were costed on the padded or truncated
//    operands, and `xorByteString` padded with ones; `sliceByteString` cost nothing when the
//    slice was empty; `unValueData` was costed on the size of the data and not on its nodes;
//  - `bls12_381_G1_multiScalarMul` and its G2 twin failed on any non-empty list;
//  - `findFirstSetBit` and `rotateByteString` returned wrong results;
//  - a cost beyond 64 bits did not stop at the largest one.
//
// (Three more were in the packages below: a list of BLS constants and `value` constants in
// the text parser of `@harmoniclabs/uplc`, and ECDSA verification in the built
// `@harmoniclabs/crypto`. They have their own tests there; the cases here depend on them.)

import { parseUPLCText, constTypeEq, canConstValueBeOfConstType, eqConstValue, UPLCTermObj } from "@harmoniclabs/uplc";
import { defaultV3Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { readFileSync, readdirSync, existsSync } from "fs";
import { Machine } from "../Machine/Machine";
import { CEKValueTag } from "../_internal/CEKValueTag";
import { dischargeCEKValue } from "../CEKValue/discharge";

jest.setTimeout( 20_000 );

const ROOT = "./src/__tests__/plutus_conformance_2026";

/**
 * The budgets of the suite are the ones of the cost model the Plutus repository had when
 * the suite was taken. The default model of this package is a later one, read from a
 * network: twelve of its numbers differ, and are put back here. (Parameters are data; the
 * suite checks the functions that use them.)
 */
const SUITE_COSTS = Object.freeze({
    ...defaultV3Costs,
    "divideInteger-cpu-arguments-model-arguments-c11": 549,
    "modInteger-cpu-arguments-model-arguments-c11": 549,
    "quotientInteger-cpu-arguments-model-arguments-c11": 549,
    "remainderInteger-cpu-arguments-model-arguments-c11": 549,
    "equalsByteString-cpu-arguments-constant": 24548,
    "equalsByteString-cpu-arguments-intercept": 29498,
    "equalsByteString-cpu-arguments-slope": 38,
    "valueData-cpu-arguments-intercept": 199604,
    "valueData-cpu-arguments-slope": 39211,
    "unValueData-cpu-arguments-c1": 204904,
    "unValueData-memory-arguments-intercept": 11,
    "unValueData-memory-arguments-slope": 1,
});

// (and its functions are the ones of protocol version 10, as its numbers are: at version 11
// `divideInteger` and `modInteger` cost otherwise — see divisionCosts.pv11.test.ts)
const machine = new Machine( SUITE_COSTS as any, undefined, { majorProtocolVersion: 10 } );

function evaluate( term: any )
{
    machine.resetBudget();
    machine.resetLogs();
    return machine.eval( term );
}

function removeComments( src: string ): string
{
    return src.split("\n").map( line => {
        const idx = line.indexOf("--");
        return idx < 0 ? line : line.slice( 0, idx );
    }).join("\n").trim();
}

function eqTerm( a: any, b: any ): boolean
{
    if( a.tag === 6 /* Error */ ) return b.tag === 6;
    if( a.tag !== b.tag ) return false;
    if( a.tag === 0 /* Var */ ) return a.deBruijn === b.deBruijn;
    if( a.tag === 1 /* Delay */ ) return eqTerm( a.delayedTerm, b.delayedTerm );
    if( a.tag === 2 /* Lambda */ ) return eqTerm( a.body, b.body );
    if( a.tag === 3 /* Application */ ) return eqTerm( a.func, b.func ) && eqTerm( a.arg, b.arg );
    if( a.tag === 4 /* Const */ )
    return (
        constTypeEq( a.type, b.type ) &&
        canConstValueBeOfConstType( a.value, a.type ) &&
        canConstValueBeOfConstType( b.value, b.type ) &&
        ( () => {
            try { return eqConstValue( a.value, b.value ); }
            catch( e ) { if( e instanceof RangeError ) return false; throw e; }
        } )()
    );
    if( a.tag === 5 /* Force */ ) return eqTerm( a.forced, b.forced );
    if( a.tag === 7 /* Builtin */ ) return a.builtinTag === b.builtinTag;
    if( a.tag === 8 /* Constr */ )
    return (
        a.index === b.index &&
        a.terms.length === b.terms.length &&
        a.terms.every( ( t: UPLCTermObj, i: number ) => eqTerm( t, b.terms[i] ) )
    );
    if( a.tag === 9 /* Case */ )
    return (
        eqTerm( a.constrTerm, b.constrTerm ) &&
        a.continuations.length === b.continuations.length &&
        a.continuations.every( ( t: UPLCTermObj, i: number ) => eqTerm( t, b.continuations[i] ) )
    );
    return false;
}

/** `({cpu: 424034831\n| mem: 1437})`; undefined for a case that has no budget (it fails) */
function readBudget( path: string ): { cpu: bigint, mem: bigint } | undefined
{
    if( !existsSync( path ) ) return undefined;
    const src = readFileSync( path, "utf8" );
    const cpu = /cpu:\s*(\d+)/.exec( src );
    const mem = /mem:\s*(\d+)/.exec( src );
    return cpu && mem ? { cpu: BigInt( cpu[1] ), mem: BigInt( mem[1] ) } : undefined;
}

let nResults = 0;
let nBudgets = 0;

function testDir( dir: string ): void
{
    for( const entry of readdirSync( dir, { withFileTypes: true } ) )
    {
        const path = `${dir}/${entry.name}`;
        if( entry.isDirectory() ) { testDir( path ); continue; }
        if( !entry.name.endsWith(".uplc") ) continue;

        const expected = removeComments( readFileSync( `${path}.expected`, "utf8" ) );
        // what is not a program is the business of the parser, and tested with it
        if( expected.startsWith("parse error") ) continue;

        const source = removeComments( readFileSync( path, "utf8" ) );
        const budget = readBudget( `${path}.budget.expected` );
        const fails = expected.startsWith("evaluation failure");

        nResults++;
        if( budget !== undefined ) nBudgets++;

        test( path.slice( ROOT.length + 1 ), () => {
            let program: any;
            try { program = parseUPLCText( source ); }
            catch( e )
            {
                // the parser refuses a term with a free variable, which Plutus reads and then
                // fails to evaluate: the same outcome, found earlier
                if( fails ) return;
                throw e;
            }

            const { result, budgetSpent } = evaluate( program );

            if( fails ) expect( result.tag ).toBe( CEKValueTag.Error );
            else
            {
                expect( result.tag ).not.toBe( CEKValueTag.Error );
                const wanted = evaluate( parseUPLCText( expected ) ).result;
                expect( eqTerm( dischargeCEKValue( result ), dischargeCEKValue( wanted ) ) ).toBe( true );
            }

            if( budget !== undefined )
            {
                // `budgetSpent` was read before the expected term was evaluated on the same machine
                expect({ cpu: budgetSpent.cpu, mem: budgetSpent.mem }).toEqual( budget );
            }
        });
    }
}

testDir( ROOT );

test( "the whole suite was found", () => {
    // 991 cases: 55 of them are not programs (parse errors), 936 are evaluated, 724 have a budget
    expect( nResults ).toBe( 936 );
    expect( nBudgets ).toBe( 724 );
});
