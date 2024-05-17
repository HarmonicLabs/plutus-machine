import { defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";
import { CEKValue, isCEKValue } from "../CEKValue/CEKValue";

export class RApp
{
    readonly arg!: UPLCTerm | CEKValue;
    readonly env: CEKEnv;

    src?: string | undefined
    
    constructor( arg: UPLCTerm | CEKValue, env: CEKEnv, src?: string )
    {
        defineReadOnlyProperty(
            this,
            "arg",
            arg
        );

        this.env = env;
        this.src = src;
    }

    clone(): RApp
    {
        return new RApp(
            this.arg.clone(),
            this.env.clone(),
            this.src
        );
    }

    isRightAppToValue(): boolean
    {
        return isCEKValue( this.arg );
    }
}