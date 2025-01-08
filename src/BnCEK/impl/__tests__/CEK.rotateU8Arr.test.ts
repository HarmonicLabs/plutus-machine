import { rotateU8Arr } from "../rotateU8Arr";
import { toHex } from "@harmoniclabs/uint8array-utils";
import { CEKError } from "../../../CEKValue";

describe("rotateU8Arr", () => {
    test("positive rotates left", () => {
        const arr = new Uint8Array([0x00, 0xff]);

        let res = rotateU8Arr(arr, 0);
        expect(toHex(res)).toEqual("00ff");

        res = rotateU8Arr(arr, 1);
        expect(toHex(res)).toEqual("01fe");

        res = rotateU8Arr(arr, 8);
        expect(toHex(res)).toEqual("ff00");

        res = rotateU8Arr(arr, 9);
        expect(toHex(res)).toEqual("fe01");

        res = rotateU8Arr(arr, 15);
        expect(toHex(res)).toEqual("807f");

        res = rotateU8Arr(arr, 16);
        expect(toHex(res)).toEqual("00ff");
    });

    test("negative shift right", () => {
        let arr = new Uint8Array([0x00, 0xff]);

        let res = rotateU8Arr(arr, -1);
        expect(toHex(res)).toEqual("807f");

        res = rotateU8Arr(arr, -6);
        expect(toHex(res)).toEqual("fc03");

        res = rotateU8Arr(arr, -8);
        expect(toHex(res)).toEqual("ff00");

        res = rotateU8Arr(arr, -9);
        expect(toHex(res)).toEqual("7f80");

        res = rotateU8Arr(arr, -15);
        expect(toHex(res)).toEqual("01fe");

        res = rotateU8Arr(arr, -16);
        expect(toHex(res)).toEqual("00ff");


        arr = new Uint8Array([0xff, 0x00]);

        res = rotateU8Arr(arr, -1);
        expect(toHex(res)).toEqual("7f80");

        res = rotateU8Arr(arr, -8);
        expect(toHex(res)).toEqual("00ff");

        res = rotateU8Arr(arr, -9);
        expect(toHex(res)).toEqual("807f");

        res = rotateU8Arr(arr, -15);
        expect(toHex(res)).toEqual("fe01");

        res = rotateU8Arr(arr, -16);
        expect(toHex(res)).toEqual("ff00");
    });
});