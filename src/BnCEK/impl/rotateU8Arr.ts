/**
 * `bytes` rotated by `k` bits: towards the most significant bit (the first bit of the first
 * byte) if `k` is positive, towards the least significant one if it is negative. Bits that
 * leave one end come back at the other, so only `k` modulo the number of bits matters:
 * it is reduced as an integer of any size, before anything is done with it.
 */
export function rotateU8Arr( bytes: Uint8Array, k: bigint | number ): Uint8Array
{
    const len = bytes.length;
    const result = new Uint8Array( len );
    if( len === 0 ) return result;

    const totalBits = BigInt( len * 8 );
    let shift = BigInt( k ) % totalBits;
    if( shift < BigInt( 0 ) ) shift += totalBits;

    const bits = Number( shift );
    const byteShift = bits >>> 3;
    const bitShift = bits & 7;

    for( let i = 0; i < len; i++ )
    {
        // what ends up at `i` sat `byteShift` bytes after it, with the top bits of the byte after that
        const here = bytes[ ( i + byteShift ) % len ];
        if( bitShift === 0 ) result[i] = here;
        else
        {
            const next = bytes[ ( i + byteShift + 1 ) % len ];
            result[i] = ( ( here << bitShift ) & 0xff ) | ( next >>> ( 8 - bitShift ) );
        }
    }

    return result;
}
