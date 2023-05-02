import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";

export class LambdaCEK
{
    public body: UPLCTerm;
    public env: CEKEnv;

    constructor( body: UPLCTerm, env: CEKEnv )
    {
        this.body = body;
        this.env = env;
    }

    clone(): LambdaCEK
    {
        return new LambdaCEK( Object.freeze( this.body ), this.env.clone() );
    }
}