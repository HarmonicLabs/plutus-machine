import { Data, DataB, DataConstr, DataI, DataList, DataMap } from "@harmoniclabs/plutus-data";

/**
 * The CBOR of a `Data` value exactly as the ledger's `serialiseData` writes
 * it (`PlutusCore.Data.encodeData`): what a script hashes on a node.
 *
 * - a constructor is tag 121 to 127 (index 0 to 6), tag 1280 to 1400 (7 to
 *   127), or tag 102 over `[ index, fields ]`;
 * - a list, and a constructor's fields, are an array of INDEFINITE length,
 *   and the one byte `80` when empty;
 * - a map is a map of DEFINITE length, whatever its size;
 * - an integer is a CBOR integer if it fits 64 bits, else a bignum (tag 2 or
 *   3) over its big-endian bytes;
 * - a byte string of more than 64 bytes — a bignum's too — is an
 *   indefinite-length string of 64-byte chunks.
 *
 * `dataToCbor` of `@harmoniclabs/plutus-data` differs on the map (it writes
 * an indefinite-length one), which a CBOR reader takes for the same data and
 * a hash does not.
 */
export function serialiseData( data: Data ): Uint8Array
{
    const out: number[] = [];
    write( out, data );
    return Uint8Array.from( out );
}

const U64 = BigInt( 1 ) << BigInt( 64 );

/** a CBOR head: major type and argument, in the shortest form */
function head( out: number[], major: number, n: bigint ): void
{
    const m = major << 5;
    if( n < BigInt( 24 ) ) { out.push( m | Number( n ) ); return; }
    let size = 8, info = 27;
    if( n < BigInt( 0x100 ) ) { size = 1; info = 24; }
    else if( n < BigInt( 0x10000 ) ) { size = 2; info = 25; }
    else if( n < BigInt( 0x100000000 ) ) { size = 4; info = 26; }
    out.push( m | info );
    for( let i = size - 1; i >= 0; i-- ) out.push( Number( ( n >> BigInt( 8 * i ) ) & BigInt( 0xff ) ) );
}

function bytes( out: number[], b: Uint8Array ): void
{
    if( b.length <= 64 )
    {
        head( out, 2, BigInt( b.length ) );
        for( let i = 0; i < b.length; i++ ) out.push( b[i] );
        return;
    }
    out.push( 0x5f );
    for( let at = 0; at < b.length; at += 64 )
    {
        const end = Math.min( at + 64, b.length );
        head( out, 2, BigInt( end - at ) );
        for( let i = at; i < end; i++ ) out.push( b[i] );
    }
    out.push( 0xff );
}

/** the big-endian bytes of a positive integer, with no leading zero */
function magnitude( n: bigint ): Uint8Array
{
    let hex = n.toString( 16 );
    if( hex.length % 2 === 1 ) hex = "0" + hex;
    const b = new Uint8Array( hex.length / 2 );
    for( let i = 0; i < b.length; i++ ) b[i] = parseInt( hex.slice( 2 * i, 2 * i + 2 ), 16 );
    return b;
}

function integer( out: number[], n: bigint ): void
{
    if( n >= BigInt( 0 ) )
    {
        if( n < U64 ) head( out, 0, n );
        else { out.push( 0xc2 ); bytes( out, magnitude( n ) ); }
        return;
    }
    // a negative integer is written as -1 - n
    const m = -BigInt( 1 ) - n;
    if( m < U64 ) head( out, 1, m );
    else { out.push( 0xc3 ); bytes( out, magnitude( m ) ); }
}

function list( out: number[], items: Data[] ): void
{
    if( items.length === 0 ) { out.push( 0x80 ); return; }
    out.push( 0x9f );
    for( const item of items ) write( out, item );
    out.push( 0xff );
}

function write( out: number[], d: Data ): void
{
    if( d instanceof DataConstr )
    {
        const index = BigInt( d.constr );
        if( index < BigInt( 7 ) ) head( out, 6, BigInt( 121 ) + index );
        else if( index < BigInt( 128 ) ) head( out, 6, BigInt( 1280 ) + index - BigInt( 7 ) );
        else
        {
            head( out, 6, BigInt( 102 ) );
            out.push( 0x82 );
            head( out, 0, index );
        }
        list( out, d.fields );
        return;
    }
    if( d instanceof DataMap )
    {
        head( out, 5, BigInt( d.map.length ) );
        for( const entry of d.map as any[] )
        {
            write( out, entry.fst );
            write( out, entry.snd );
        }
        return;
    }
    if( d instanceof DataList ) { list( out, d.list ); return; }
    if( d instanceof DataI ) { integer( out, BigInt( d.int ) ); return; }
    if( d instanceof DataB )
    {
        const raw: any = d.bytes;
        bytes( out, raw instanceof Uint8Array ? raw : raw.toBuffer() );
        return;
    }
    throw new Error( "serialiseData: not a Data value" );
}
