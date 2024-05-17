import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKEnv } from "../CEKEnv";
import { CEKValue } from "../CEKValue/CEKValue";

export class ConstrFrame
{
    readonly tag: bigint;
    readonly terms: UPLCTerm[];
    readonly values: CEKValue[]
    readonly env: CEKEnv;

    src?: string | undefined
    
    constructor( tag: bigint, terms: UPLCTerm[], values: CEKValue[], env: CEKEnv, src?: string )
    {
        this.tag = tag;
        this.terms = terms;
        this.values = values;
        this.env = env;
        this.src = src;
    }

    clone(): ConstrFrame
    {
        return new ConstrFrame(
            this.tag,
            this.terms.map( t => t.clone() ),
            this.values.map( v => v.clone() ),
            this.env.clone(),
            this.src
        );
    }
}