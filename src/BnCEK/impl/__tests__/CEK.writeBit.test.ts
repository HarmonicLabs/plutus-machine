import exp from "constants";
import { writeBit } from "../writeBit";
import { toHex } from "@harmoniclabs/uint8array-utils";
import { CEKError } from "../../../CEKValue";

describe("readBit", () => {
    test("i = 0 is last", () => {
        const arr = new Uint8Array([0x00, 0xff]);

        writeBit(arr, 0, false);
        expect(arr).toEqual(new Uint8Array([0x00, 0xfe]));

        writeBit(arr, 0, true);
        expect(arr).toEqual(new Uint8Array([0x00, 0xff]));

        writeBit(arr, 7, false);
        expect(arr).toEqual(new Uint8Array([0x00, 0x7f]));

        writeBit(arr, 7, true);
        expect(arr).toEqual(new Uint8Array([0x00, 0xff]));

        writeBit(arr, 8, true);
        expect(arr).toEqual(new Uint8Array([0x01, 0xff]));

        writeBit(arr, 8, false);
        expect(arr).toEqual(new Uint8Array([0x00, 0xff]));

        writeBit(arr, 15, true);
        expect(toHex(arr)).toEqual("80ff");

        writeBit(arr, 15, false);
        expect(toHex(arr)).toEqual("00ff");

        expect(writeBit(arr, 16, true) instanceof CEKError).toEqual( true );
        expect(toHex(arr)).toEqual("00ff");

        expect(writeBit(arr, 16, false) instanceof CEKError).toEqual( true );
        expect(toHex(arr)).toEqual("00ff");

    });
});