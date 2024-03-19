import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";
import { CEKValue } from "../CEKValue";

export class CaseFrame
{
    readonly terms: UPLCTerm[];
    readonly env: CEKEnv;

    src?: string | undefined
    
    constructor( terms: UPLCTerm[], env: CEKEnv, src?: string )
    {
        this.terms = terms;
        this.env = env;
        this.src = src;
    }

    clone(): CaseFrame
    {
        return new CaseFrame(
            this.terms.map( t => t.clone() ),
            this.env.clone(),
            this.src
        );
    }
}