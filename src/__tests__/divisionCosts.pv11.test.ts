// What `divideInteger` and `modInteger` cost from protocol version 11 on.
//
// Until version 10 the four division builtins cost a constant when the first argument has
// fewer words than the second (`const_above_diagonal`), and a quadratic in the two sizes
// otherwise. From version 11 (Plutus V3 then runs the builtins' "variant E") `divideInteger`
// and `modInteger` cost the quadratic of the LARGER size and the smaller one, always
// (`above_and_below_diagonal`); `quotientInteger` and `remainderInteger` keep the constant.
// The numbers of the cost model do not say which: the protocol version does.
//
// Found on a node. A script reduced a zero modulo the 255-bit order of BLS12-381's scalar
// field, 65 times; the machine declared 85,848 steps for each, and the ledger of
// cardano-node 11.0 (`cardano-cli conway transaction calculate-plutus-script-cost online`)
// computed 141,224: the quadratic at (4 words, 1 word). The transaction was refused as over
// its budget by 3,599,440 steps — 65 times the difference — while the same script on
// arguments of the same size (8 words by 4) was costed alike by both, to the unit.
//
// The Plutus conformance suite (`plutus_conformance_2026`) has the budgets of version 10's
// functions, and no case where the first argument of a division is the smaller: it could
// not show this.

import { parseUPLCText } from "@harmoniclabs/uplc";
import { defaultV3Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { Machine } from "../Machine/Machine";
import { LATEST_PROTOCOL_VERSION } from "../Machine/BuiltinCosts";
import { CEKValueTag } from "../_internal/CEKValueTag";

/** the order of the scalar field of BLS12-381: 255 bits, four words */
const R = "52435875175126190479447740508185965837690552500527637822603658699938581184513";
/** eight words */
const WIDE = ( BigInt( R ) * BigInt( R ) - BigInt( 12345 ) ).toString();

/** startup, and a step for each of two applications, two constants and a builtin */
const STEPS = BigInt( 100 + 5 * 16_000 );

function cost( builtin: string, a: string, b: string, majorProtocolVersion?: number ): bigint
{
    const machine = new Machine( defaultV3Costs, undefined, majorProtocolVersion === undefined ? {} : { majorProtocolVersion } );
    const { result, budgetSpent } = machine.eval(
        parseUPLCText( `(program 1.1.0 [ [ (builtin ${builtin}) (con integer ${a}) ] (con integer ${b}) ])` ) as any
    );
    expect( result.tag ).toBe( CEKValueTag.Const );
    return budgetSpent.cpu - STEPS;
}

/** c00 + c10 x + c01 y + c20 x² + c11 xy + c02 y², with the numbers every network has had since version 11 */
const quadratic = ( x: number, y: number ): bigint =>
    BigInt( 123203 + 1716 * x + 7305 * y + 57 * x * x + 960 * x * y - 900 * y * y );

describe( "division costs by protocol version", () => {

    test( "the default is the latest version the package knows: 11", () => {
        expect( LATEST_PROTOCOL_VERSION ).toBe( 11 );
        expect( cost( "modInteger", "0", R ) ).toBe( cost( "modInteger", "0", R, 11 ) );
    } );

    test( "version 11: a small number modulo a large one costs the quadratic of ( larger, smaller ), as the ledger computes it", () => {
        // the figure cardano-node 11.0 charged, 65 times, in the transaction this was found with
        expect( quadratic( 4, 1 ) ).toBe( BigInt( 141224 ) );
        expect( cost( "modInteger", "0", R ) ).toBe( BigInt( 141224 ) );
        expect( cost( "modInteger", "7", R ) ).toBe( BigInt( 141224 ) );
        expect( cost( "divideInteger", "0", R ) ).toBe( BigInt( 141224 ) );
        expect( cost( "modInteger", R, WIDE ) ).toBe( quadratic( 8, 4 ) );
        expect( cost( "divideInteger", "-5", WIDE ) ).toBe( quadratic( 8, 1 ) );
    } );

    test( "version 11: with the first argument the larger, or of the same size, nothing changed", () => {
        for( const op of [ "modInteger", "divideInteger" ] )
        {
            expect( cost( op, WIDE, R ) ).toBe( quadratic( 8, 4 ) );
            expect( cost( op, WIDE, R, 10 ) ).toBe( quadratic( 8, 4 ) );
            expect( cost( op, R, R ) ).toBe( quadratic( 4, 4 ) );
            expect( cost( op, R, R, 10 ) ).toBe( quadratic( 4, 4 ) );
            expect( cost( op, "9", "4" ) ).toBe( quadratic( 1, 1 ) );
            expect( cost( op, "9", "4", 10 ) ).toBe( quadratic( 1, 1 ) );
        }
    } );

    test( "version 10: a first argument of fewer words costs the constant", () => {
        expect( cost( "modInteger", "0", R, 10 ) ).toBe( BigInt( 85848 ) );
        expect( cost( "divideInteger", "0", R, 10 ) ).toBe( BigInt( 85848 ) );
        expect( cost( "modInteger", R, WIDE, 9 ) ).toBe( BigInt( 85848 ) );
    } );

    test( "quotientInteger and remainderInteger keep the constant at every version", () => {
        for( const version of [ 9, 10, 11, 12, undefined ] )
            for( const op of [ "quotientInteger", "remainderInteger" ] )
            {
                expect( cost( op, "0", R, version ) ).toBe( BigInt( 85848 ) );
                expect( cost( op, R, WIDE, version ) ).toBe( BigInt( 85848 ) );
                expect( cost( op, WIDE, R, version ) ).toBe( quadratic( 8, 4 ) );
            }
    } );

    test( "version 12 costs as version 11 does", () => {
        expect( cost( "modInteger", "0", R, 12 ) ).toBe( BigInt( 141224 ) );
        expect( cost( "divideInteger", "0", R, 12 ) ).toBe( BigInt( 141224 ) );
    } );

    test( "what the result takes in memory did not change", () => {
        const mem = ( version?: number ) => {
            const machine = new Machine( defaultV3Costs, undefined, version === undefined ? {} : { majorProtocolVersion: version } );
            return machine.eval( parseUPLCText( `(program 1.1.0 [ [ (builtin modInteger) (con integer 0) ] (con integer ${R}) ])` ) as any ).budgetSpent.mem;
        };
        expect( mem( 10 ) ).toBe( mem( 11 ) );
    } );
} );
