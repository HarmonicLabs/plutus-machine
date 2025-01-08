import { CEKError } from "../../CEKValue";

export function writeBit( bs: Uint8Array, i: number, bit: boolean ): undefined | CEKError
{
    const byteLen = bs.length;
    const nBits = byteLen * 8;
    if( i < 0 || i >= nBits ) return new CEKError(
        "writeBit :: index out of bounds",
        { i, nBits }
    );

    const iByte = Math.floor( i / 8 );
    let iBit = i % 8;

    const byteIndex = byteLen - 1 - iByte;

    if( bit )
    {
        bs[byteIndex] |= 1 << iBit;
    }
    else
    {
        bs[byteIndex] &= (~(1 << iBit)) & 0xff;
    }

    return undefined;
}