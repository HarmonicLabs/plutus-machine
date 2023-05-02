import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";

export class DelayCEK
{
    public delayedTerm: UPLCTerm;
    public env: CEKEnv;

    constructor( delayedTerm: UPLCTerm, env: CEKEnv )
    {
        this.delayedTerm = delayedTerm;
        this.env = env;
    }

    clone(): DelayCEK
    {
        return new DelayCEK( Object.freeze( this.delayedTerm ), this.env.clone() );
    }
}