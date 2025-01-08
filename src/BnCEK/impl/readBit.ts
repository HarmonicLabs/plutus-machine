import { CEKError } from "../../CEKValue";

export function readBit( bs: Uint8Array, i: number ): boolean | CEKError
{
    const byteLen = bs.length;
    const nBits = byteLen * 8;
    if( i < 0 || i >= nBits ) return new CEKError(
        "readBit :: index out of bounds",
        { i, nBits }
    );

    // i == 0 is the LAST bit of the LAST byte
    // i == nBits - 1 is the FIRST bit of the FIRST byte

    const iByte = Math.floor( i / 8 );
    let iBit = i % 8;

    const byte = bs[ bs.length - 1 - iByte ];

    return (( byte >> iBit ) & 1) === 1;
}