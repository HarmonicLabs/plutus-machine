/**
 * The index of the lowest bit that is set, -1 if none is. Bit 0 is the least significant
 * bit of the last byte, and indexes grow towards the first byte.
 */
export function findFirstSetBit( bytes: Uint8Array ): number
{
    const last = bytes.length - 1;
    for( let i = last; i >= 0; i-- )
    {
        const byte = bytes[i];
        if( byte !== 0 ) return ( last - i ) * 8 + findFirstSetBitInByte( byte );
    }
    return -1; // all bits are 0
}

function findFirstSetBitInByte( byte: number ): number
{
    for( let i = 0; i < 8; i++ ) {
        if( byte & 1 ) return i;
        byte >>= 1;
    }
    return -1;
}
