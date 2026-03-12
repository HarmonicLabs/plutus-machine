import { UPLCTerm, UPLCTermObj } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";
import { CEKValue, ICEKValue } from "./CEKValue";
import { CEKValueTag } from "../_internal/CEKValueTag";

export interface ICEKLambda extends ICEKValue {
    readonly tag: CEKValueTag.Lambda;
    body: UPLCTermObj;
    env: CEKEnv;
}

export class CEKLambda
    implements ICEKLambda
{
    readonly tag: CEKValueTag.Lambda = CEKValueTag.Lambda;
    public body: UPLCTermObj;
    public env: CEKEnv;

    constructor( body: UPLCTermObj, env: CEKEnv )
    {
        this.body = body;
        this.env = env;
    }

    clone(): CEKLambda
    {
        return new CEKLambda( Object.freeze( this.body ), this.env );
    }
}