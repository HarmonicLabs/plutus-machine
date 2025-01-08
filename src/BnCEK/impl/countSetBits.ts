export function countSetBits( bytes: Uint8Array ): number
{
    let tot = 0;
    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        while( b ) {
            tot += b & 1; // add 1 if last bit is 1; add 0 otherwhise
            b >>= 1; // next bit
        }
    }
    return tot;
}