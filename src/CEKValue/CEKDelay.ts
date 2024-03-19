import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";

export class CEKDelay
{
    public delayedTerm: UPLCTerm;
    public env: CEKEnv;

    constructor( delayedTerm: UPLCTerm, env: CEKEnv )
    {
        this.delayedTerm = delayedTerm;
        this.env = env;
    }

    clone(): CEKDelay
    {
        return new CEKDelay( Object.freeze( this.delayedTerm ), this.env.clone() );
    }
}