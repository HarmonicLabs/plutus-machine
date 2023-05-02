import { defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { PartialBuiltin } from "../BnCEK/PartialBuiltin";
import { UPLCTerm } from "@harmoniclabs/uplc";

export class LApp
{
    readonly func!: UPLCTerm;
    constructor( func: UPLCTerm | PartialBuiltin )
    {
        defineReadOnlyProperty(
            this,
            "func",
            func
        )
    }
    clone(): LApp
    {
        return new LApp(
            this.func
        );
    }
}