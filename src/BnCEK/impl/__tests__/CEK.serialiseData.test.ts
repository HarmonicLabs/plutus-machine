import { DataB, DataConstr, DataI, DataList, DataMap, DataPair, dataFromCbor } from "@harmoniclabs/plutus-data";
import { Application, UPLCBuiltinTag, UPLCConst, Builtin } from "@harmoniclabs/uplc";
import { serialiseData } from "../serialiseData";
import { Machine } from "../../../Machine/Machine";
import { CEKConst } from "../../../CEKValue/CEKConst";

// What `serialiseData` writes is what a script hashes, so it must be, byte
// for byte, what the ledger's own encoder writes (`PlutusCore.Data`): lists
// and constructor fields of indefinite length (one byte, 80, when empty),
// maps of DEFINITE length, 64-byte chunks for long byte strings and big
// integers.

const hex = ( b: Uint8Array ) => Array.from( b ).map( x => x.toString( 16 ).padStart( 2, "0" ) ).join( "" );
const I = ( n: number | bigint ) => new DataI( BigInt( n ) );
const B = ( h: string ) => new DataB( Uint8Array.from( ( h.match( /../g ) ?? [] ).map( x => parseInt( x, 16 ) ) ) );
const M = ( ...kv: [ any, any ][] ) => new DataMap( kv.map( ( [ k, v ] ) => new DataPair( k, v ) ) );

describe("serialiseData: the ledger's encoding", () => {

    test("a map has a definite length, whatever its size", () => {
        expect( hex( serialiseData( M() ) ) ).toBe( "a0" );
        expect( hex( serialiseData( M( [ I( 1 ), I( 2 ) ] ) ) ) ).toBe( "a10102" );
        expect( hex( serialiseData( M( [ I( 1 ), I( 2 ) ], [ B( "ff" ), new DataList( [] ) ] ) ) ) ).toBe( "a2010241ff80" );
        const big = M( ...Array.from( { length: 24 }, ( _, i ) => [ I( i ), I( 0 ) ] as [ any, any ] ) );
        expect( hex( serialiseData( big ) ).slice( 0, 4 ) ).toBe( "b818" );
        // a value, as a script sees one: a map of maps
        const value = M( [ B( "" ), M( [ B( "" ), I( 2_000_000 ) ] ) ] );
        expect( hex( serialiseData( value ) ) ).toBe( "a140a1401a001e8480" );
    });

    test("a list and a constructor's fields have an indefinite length, and one byte when empty", () => {
        expect( hex( serialiseData( new DataList( [] ) ) ) ).toBe( "80" );
        expect( hex( serialiseData( new DataList( [ I( 1 ), I( 2 ) ] ) ) ) ).toBe( "9f0102ff" );
        expect( hex( serialiseData( new DataConstr( 0, [] ) ) ) ).toBe( "d87980" );
        expect( hex( serialiseData( new DataConstr( 1, [ I( 1 ) ] ) ) ) ).toBe( "d87a9f01ff" );
        expect( hex( serialiseData( new DataConstr( 6, [] ) ) ) ).toBe( "d87f80" );
    });

    test("constructors beyond the compact tags", () => {
        expect( hex( serialiseData( new DataConstr( 7, [] ) ) ) ).toBe( "d9050080" );
        expect( hex( serialiseData( new DataConstr( 127, [] ) ) ) ).toBe( "d9057880" );
        expect( hex( serialiseData( new DataConstr( 128, [ I( 0 ) ] ) ) ) ).toBe( "d8668218809f00ff" );
    });

    test("integers: 64 bits, then bignums", () => {
        expect( hex( serialiseData( I( 0 ) ) ) ).toBe( "00" );
        expect( hex( serialiseData( I( 23 ) ) ) ).toBe( "17" );
        expect( hex( serialiseData( I( 24 ) ) ) ).toBe( "1818" );
        expect( hex( serialiseData( I( -1 ) ) ) ).toBe( "20" );
        expect( hex( serialiseData( I( -25 ) ) ) ).toBe( "3818" );
        expect( hex( serialiseData( I( 2n ** 64n - 1n ) ) ) ).toBe( "1bffffffffffffffff" );
        expect( hex( serialiseData( I( 2n ** 64n ) ) ) ).toBe( "c249010000000000000000" );
        expect( hex( serialiseData( I( -( 2n ** 64n ) ) ) ) ).toBe( "3bffffffffffffffff" );
        expect( hex( serialiseData( I( -( 2n ** 64n ) - 1n ) ) ) ).toBe( "c349010000000000000000" );
    });

    test("byte strings: whole up to 64 bytes, then chunks of 64", () => {
        expect( hex( serialiseData( B( "" ) ) ) ).toBe( "40" );
        expect( hex( serialiseData( B( "ab".repeat( 64 ) ) ) ) ).toBe( "5840" + "ab".repeat( 64 ) );
        expect( hex( serialiseData( B( "ab".repeat( 65 ) ) ) ) ).toBe( "5f5840" + "ab".repeat( 64 ) + "41ab" + "ff" );
        expect( hex( serialiseData( B( "ab".repeat( 128 ) ) ) ) ).toBe( "5f5840" + "ab".repeat( 64 ) + "5840" + "ab".repeat( 64 ) + "ff" );
        // a bignum of more than 64 bytes is chunked the same way
        expect( hex( serialiseData( I( 2n ** 520n ) ) ).slice( 0, 8 ) ).toBe( "c25f5840" );
    });

    test("what it writes reads back as the same data", () => {
        const d = new DataConstr( 3, [
            M( [ B( "00" ), M( [ B( "" ), I( 7 ) ] ) ], [ I( -5 ), new DataList( [ B( "cd".repeat( 70 ) ), I( 2n ** 70n ) ] ) ] ),
            new DataList( [] ),
        ] );
        expect( hex( serialiseData( dataFromCbor( serialiseData( d ) ) ) ) ).toBe( hex( serialiseData( d ) ) );
    });

    test("the builtin gives a script those bytes", () => {
        const d = M( [ B( "" ), M( [ B( "" ), I( 2_000_000 ) ] ) ] );
        const { result } = Machine.eval( new Application( new Builtin( UPLCBuiltinTag.serialiseData ), UPLCConst.data( d ) ) );
        expect( result instanceof CEKConst ).toBe( true );
        expect( hex( ( result as CEKConst ).value as Uint8Array ) ).toBe( "a140a1401a001e8480" );
    });
});
