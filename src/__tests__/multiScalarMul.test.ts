// bls12_381_G1_multiScalarMul / bls12_381_G2_multiScalarMul (CIP-133)
//
// The two builtins used a point class of a second copy of the curve library, while every
// other BLS builtin of the machine works on the classes of `@harmoniclabs/crypto`. That
// class refused the machine's points ("invalid point at index 0"), so any script calling
// the builtin with a non-empty list failed; and the zero it returned for empty lists was
// a point no other builtin accepted.
//
// The cases under `plutus_conformance_2026/builtin/semantics/bls12_381_G{1,2}_multiScalarMul`
// are the ones of the Plutus conformance suite: their results and their budgets (the cost is
// linear in the number of scalars, whatever the number of points) are checked here with the
// default cost model, and the sums are then passed on to other builtins.

import { parseUPLCText, UPLCConst, Application, Builtin, UPLCBuiltinTag, constT, UPLCTerm, ConstTyTag } from "@harmoniclabs/uplc";
import { BlsG1, BlsG2, bls12_381_G1_add, bls12_381_G1_compress, bls12_381_G1_scalarMul, bls12_381_G2_add, bls12_381_G2_compress, bls12_381_G2_scalarMul, isBlsG1, isBlsG2 } from "@harmoniclabs/crypto";
import { readFileSync, readdirSync } from "fs";
import { Machine } from "../Machine/Machine";
import { CEKValueTag } from "../_internal/CEKValueTag";

const SEMANTICS = "./src/__tests__/plutus_conformance_2026/builtin/semantics";

function removeComments( src: string ): string
{
    return src.split("\n").map( line => {
        const idx = line.indexOf("--");
        return idx < 0 ? line : line.slice( 0, idx );
    }).join("\n").trim();
}

/** `({cpu: 424034831\n| mem: 1437})` */
function parseBudget( src: string ): { cpu: bigint, mem: bigint }
{
    const cpu = /cpu:\s*(\d+)/.exec( src );
    const mem = /mem:\s*(\d+)/.exec( src );
    if( !cpu || !mem ) throw new Error( "not a budget: " + src );
    return { cpu: BigInt( cpu[1] ), mem: BigInt( mem[1] ) };
}

const hex = ( bytes: Uint8Array ): string => Array.from( bytes, b => b.toString( 16 ).padStart( 2, "0" ) ).join( "" );

const msmG1 = () => new Builtin( UPLCBuiltinTag.bls12_381_G1_multiScalarMul );
const msmG2 = () => new Builtin( UPLCBuiltinTag.bls12_381_G2_multiScalarMul );
const app = ( f: UPLCTerm, ...args: UPLCTerm[] ): UPLCTerm => args.reduce<UPLCTerm>( ( fn, arg ) => new Application( fn, arg ), f );
const ints = ( ns: bigint[] ): UPLCTerm => new UPLCConst( constT.listOf( constT.int ), ns as any );
const g1s = ( ps: BlsG1[] ): UPLCTerm => new UPLCConst( constT.listOf( constT.bls12_381_G1_element ), ps as any );
const g2s = ( ps: BlsG2[] ): UPLCTerm => new UPLCConst( constT.listOf( constT.bls12_381_G2_element ), ps as any );

describe.each([ "bls12_381_G1_multiScalarMul", "bls12_381_G2_multiScalarMul" ])( "%s: conformance cases", ( builtin ) => {

    const dir = `${SEMANTICS}/${builtin}`;
    const cases = readdirSync( dir, { withFileTypes: true } ).filter( e => e.isDirectory() ).map( e => e.name ).sort();

    test( "all twenty cases are there", () => {
        expect( cases.length ).toBe( 20 );
    });

    test.each( cases )( "%s: result and budget", ( name ) => {
        const path = `${dir}/${name}/${name}.uplc`;
        const program = parseUPLCText( removeComments( readFileSync( path, "utf-8" ) ) );
        const expected = removeComments( readFileSync( `${path}.expected`, "utf-8" ) );
        const budget = parseBudget( readFileSync( `${path}.budget.expected`, "utf-8" ) );

        const { result, budgetSpent } = Machine.eval( program );

        // every case of this builtin compares the sum with the same sum built otherwise
        expect( expected ).toBe( "(program 1.0.0 (con bool True))" );
        expect( result.tag ).toBe( CEKValueTag.Const );
        expect( ( result as any ).typeTag ).toBe( ConstTyTag.bool );
        expect( ( result as any ).value ).toBe( true );

        expect( budgetSpent.cpu ).toBe( budget.cpu );
        expect( budgetSpent.mem ).toBe( budget.mem );
    });
});

describe( "the sum is a point of the machine", () => {

    const scalars = [ BigInt( 3 ), BigInt( -5 ), BigInt( 0 ), ( BigInt( 1 ) << BigInt( 300 ) ) + BigInt( 7 ) ];
    const p1 = scalars.map( ( _, i ) => bls12_381_G1_scalarMul( BigInt( 11 + i ), BlsG1.BASE ) );
    const p2 = scalars.map( ( _, i ) => bls12_381_G2_scalarMul( BigInt( 11 + i ), BlsG2.BASE ) );

    test( "G1: equal to the sum of the products, and of the class the other builtins take", () => {
        const { result } = Machine.eval( app( msmG1(), ints( scalars ), g1s( p1 ) ) );
        expect( result.tag ).toBe( CEKValueTag.Const );
        const sum = ( result as any ).value;
        expect( isBlsG1( sum ) ).toBe( true );
        const byHand = scalars.map( ( s, i ) => bls12_381_G1_scalarMul( s, p1[i] ) ).reduce( bls12_381_G1_add, BlsG1.ZERO );
        expect( hex( bls12_381_G1_compress( sum ) ) ).toBe( hex( bls12_381_G1_compress( byHand ) ) );
    });

    test( "G2: equal to the sum of the products, and of the class the other builtins take", () => {
        const { result } = Machine.eval( app( msmG2(), ints( scalars ), g2s( p2 ) ) );
        expect( result.tag ).toBe( CEKValueTag.Const );
        const sum = ( result as any ).value;
        expect( isBlsG2( sum ) ).toBe( true );
        const byHand = scalars.map( ( s, i ) => bls12_381_G2_scalarMul( s, p2[i] ) ).reduce( bls12_381_G2_add, BlsG2.ZERO );
        expect( hex( bls12_381_G2_compress( sum ) ) ).toBe( hex( bls12_381_G2_compress( byHand ) ) );
    });

    test( "the sum goes on into the other builtins: compressed, added, paired", () => {
        // e( msm, G2 ) == e( G1, msm2 ) when both sums use the same scalars over multiples of the bases
        const msm1 = app( msmG1(), ints( scalars ), g1s( p1 ) );
        const msm2 = app( msmG2(), ints( scalars ), g2s( p2 ) );
        const g1 = new UPLCConst( constT.bls12_381_G1_element, BlsG1.BASE as any );
        const g2 = new UPLCConst( constT.bls12_381_G2_element, BlsG2.BASE as any );
        const paired = app(
            Builtin.bls12_381_finalVerify,
            app( Builtin.bls12_381_millerLoop, msm1, g2 ),
            app( Builtin.bls12_381_millerLoop, g1, msm2 )
        );
        const { result } = Machine.eval( paired );
        expect( result.tag ).toBe( CEKValueTag.Const );
        expect( ( result as any ).value ).toBe( true );

        const compressed = Machine.eval( app( Builtin.bls12_381_G1_compress, app( Builtin.bls12_381_G1_add, msm1, msm1 ) ) ).result;
        expect( compressed.tag ).toBe( CEKValueTag.Const );
        const twice = scalars.map( ( s, i ) => bls12_381_G1_scalarMul( s * BigInt( 2 ), p1[i] ) ).reduce( bls12_381_G1_add, BlsG1.ZERO );
        const bytes = ( compressed as any ).value;
        expect( hex( bytes instanceof Uint8Array ? bytes : bytes.toBuffer() ) ).toBe( hex( bls12_381_G1_compress( twice ) ) );
    });

    test( "no pair gives the zero the other builtins know", () => {
        for( const [ msm, zero, isPoint ] of [
            [ app( msmG1(), ints( [] ), g1s( p1 ) ), BlsG1.ZERO, isBlsG1 ],
            [ app( msmG1(), ints( scalars ), g1s( [] ) ), BlsG1.ZERO, isBlsG1 ],
            [ app( msmG2(), ints( [] ), g2s( p2 ) ), BlsG2.ZERO, isBlsG2 ],
            [ app( msmG2(), ints( scalars ), g2s( [] ) ), BlsG2.ZERO, isBlsG2 ],
        ] as const )
        {
            const { result } = Machine.eval( msm );
            expect( result.tag ).toBe( CEKValueTag.Const );
            const point = ( result as any ).value;
            expect( ( isPoint as any )( point ) ).toBe( true );
            expect( point.equals( zero ) ).toBe( true );
        }
    });

    test( "a scalar is a signed integer of 4096 bits; only the scalars with a point are looked at", () => {
        const top = ( BigInt( 1 ) << BigInt( 4095 ) ) - BigInt( 1 );
        const bottom = -( BigInt( 1 ) << BigInt( 4095 ) );
        const fits = ( ns: bigint[], points: BlsG1[] = [ BlsG1.BASE ] ) =>
            Machine.eval( app( msmG1(), ints( ns ), g1s( points ) ) ).result.tag === CEKValueTag.Const;
        expect( fits( [ top ] ) ).toBe( true );
        expect( fits( [ bottom ] ) ).toBe( true );
        expect( fits( [ top + BigInt( 1 ) ] ) ).toBe( false );
        expect( fits( [ bottom - BigInt( 1 ) ] ) ).toBe( false );
        expect( fits( [ BigInt( 1 ), top + BigInt( 1 ) ] ) ).toBe( true );

        const fits2 = ( ns: bigint[] ) =>
            Machine.eval( app( msmG2(), ints( ns ), g2s( [ BlsG2.BASE ] ) ) ).result.tag === CEKValueTag.Const;
        expect( fits2( [ top ] ) ).toBe( true );
        expect( fits2( [ top + BigInt( 1 ) ] ) ).toBe( false );
    });
});
