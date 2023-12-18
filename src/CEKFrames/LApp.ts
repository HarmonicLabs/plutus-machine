import { defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { CEKValue } from "../CEKValue";

export class LApp
{
    readonly func!: CEKValue;

    src?: string | undefined

    constructor( func: CEKValue, src?: string )
    {
        defineReadOnlyProperty(
            this,
            "func",
            func
        );
        this.src = src
    }
    
    clone(): LApp
    {
        return new LApp(
            this.func,
            this.src
        );
    }
}