import { defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";

export class RApp
{
    readonly arg!: UPLCTerm;
    readonly env: CEKEnv;
    
    constructor( arg: UPLCTerm, env: CEKEnv )
    {
        defineReadOnlyProperty(
            this,
            "arg",
            arg
        );

        this.env = env;
    }

    clone(): RApp
    {
        return new RApp(
            this.arg,
            this.env.clone()
        );
    }
}