import { defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";

export class RApp
{
    readonly arg!: UPLCTerm;
    readonly env: CEKEnv;

    src?: string | undefined
    
    constructor( arg: UPLCTerm, env: CEKEnv, src?: string )
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
            this.arg,
            this.env.clone(),
            this.src
        );
    }
}