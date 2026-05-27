import { fromHex, toHex } from "@harmoniclabs/uint8array-utils";
import { integerToByteString } from "../BnCEK";
import { CEKConst } from "../../CEKValue";

test("integerToByteString", () => {

    console.log(
        (integerToByteString( true, 0n, 404n ) as CEKConst).value
    );

    expect( (integerToByteString( true, 0n, 404n ) as CEKConst).value ).toEqual( fromHex("0194") );

});