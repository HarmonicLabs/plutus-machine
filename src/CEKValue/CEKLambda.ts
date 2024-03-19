import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";

export class CEKLambda
{
    public body: UPLCTerm;
    public env: CEKEnv;

    constructor( body: UPLCTerm, env: CEKEnv )
    {
        this.body = body;
        this.env = env;
    }

    clone(): CEKLambda
    {
        return new CEKLambda( Object.freeze( this.body ), this.env.clone() );
    }
}