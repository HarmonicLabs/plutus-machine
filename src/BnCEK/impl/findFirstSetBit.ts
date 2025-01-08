export function findFirstSetBit( bytes: Uint8Array ): number
{
    let n = 0;
    for(
        let i = bytes.length - 1;
        i >= 0 && bytes[i] === 0;
        i--, n++
    ) {}
    if( n === bytes.length ) return -1; // all bits are 0
    const inByte = findFirstSetBitInByte( bytes[n] );
    if( inByte === -1 ) return -1; // all bits are 0
    n--;
    return n * 8 + inByte;
}

function findFirstSetBitInByte( byte: number ): number
{
    for( let i = 0; i < 8; i++ ) {
        if( byte & 1 ) return i;
        byte >>= 1;
    }
    return -1;
}