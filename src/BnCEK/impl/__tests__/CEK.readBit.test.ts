import { readBit } from "../readBit";

describe("readBit", () => {
    test("i = 0 is last", () => {
        expect(
            readBit(
                new Uint8Array([0x00, 0xff]),
                0
            )
        ).toEqual( true )
        expect(
            readBit(
                new Uint8Array([0x00, 0x01]),
                0
            )
        ).toEqual( true )

        expect(
            readBit(
                new Uint8Array([0xff, 0x00]),
                0
            )
        ).toEqual( false )
        expect(
            readBit(
                new Uint8Array([0xff, 0b11111110]),
                0
            )
        ).toEqual( false )
    });
});