import { shiftU8Arr } from "../shiftU8Arr";
import { toHex } from "@harmoniclabs/uint8array-utils";
import { CEKError } from "../../../CEKValue";

describe("readBit", () => {
    test("positive shift left", () => {
        const arr = new Uint8Array([0x00, 0xff]);

        let res = shiftU8Arr(arr, 0);
        expect(toHex(res)).toEqual("00ff");

        res = shiftU8Arr(arr, 1);
        expect(toHex(res)).toEqual("01fe");

        res = shiftU8Arr(arr, 8);
        expect(toHex(res)).toEqual("ff00");

        res = shiftU8Arr(arr, 9);
        expect(toHex(res)).toEqual("fe00");

        res = shiftU8Arr(arr, 15);
        expect(toHex(res)).toEqual("8000");

        res = shiftU8Arr(arr, 16);
        expect(toHex(res)).toEqual("0000");
    });

    test("negative shift right", () => {
        let arr = new Uint8Array([0x00, 0xff]);

        let res = shiftU8Arr(arr, -1);
        expect(toHex(res)).toEqual("007f");

        res = shiftU8Arr(arr, -6);
        expect(toHex(res)).toEqual("0003");

        res = shiftU8Arr(arr, -8);
        expect(toHex(res)).toEqual("0000");

        arr = new Uint8Array([0xff, 0x00]);

        res = shiftU8Arr(arr, -1);
        expect(toHex(res)).toEqual("7f80");

        res = shiftU8Arr(arr, -8);
        expect(toHex(res)).toEqual("00ff");

        res = shiftU8Arr(arr, -9);
        expect(toHex(res)).toEqual("007f");

        res = shiftU8Arr(arr, -15);
        expect(toHex(res)).toEqual("0001");

        res = shiftU8Arr(arr, -16);
        expect(toHex(res)).toEqual("0000");
    });
});