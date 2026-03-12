import { UPLCTerm, UPLCTermObj } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";
import { ICEKValue } from "./CEKValue";
import { CEKValueTag } from "../_internal/CEKValueTag";

export interface ICEKDelay extends ICEKValue {
    readonly tag: CEKValueTag.Delay;
    delayedTerm: UPLCTermObj;
    env: CEKEnv;
}

export class CEKDelay
    implements ICEKDelay
{
    readonly tag: CEKValueTag.Delay = CEKValueTag.Delay;
    public delayedTerm: UPLCTermObj;
    public env: CEKEnv;

    constructor( delayedTerm: UPLCTermObj, env: CEKEnv )
    {
        this.delayedTerm = delayedTerm;
        this.env = env;
    }

    clone(): CEKDelay
    {
        return new CEKDelay( Object.freeze( this.delayedTerm ), this.env );
    }
}