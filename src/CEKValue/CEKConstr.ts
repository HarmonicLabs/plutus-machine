import { CEKValueTag } from "../_internal/CEKValueTag";
import type { CEKValue, CEKValueObj, ICEKValue } from "./CEKValue";

export interface UntaggedCEKConstr {
    readonly index: bigint;
    readonly values: CEKValueObj[];
}
export interface ICEKConstr extends ICEKValue, UntaggedCEKConstr {
    readonly tag: CEKValueTag.Constr;
    readonly index: bigint;
    readonly values: CEKValueObj[];
}

export class CEKConstr
    implements ICEKConstr
{
    readonly tag: CEKValueTag.Constr = CEKValueTag.Constr;
    readonly index: bigint;
    readonly values: CEKValueObj[]

    constructor( index: bigint | number, values: CEKValueObj[] )
    {
        this.index = typeof index === "bigint" ? index : BigInt( index );
        this.values = values;
    }

    clone(): CEKConstr
    {
        return new CEKConstr(
            this.index,
            // this.values.map( v => v.clone() )
            this.values.slice()
        );
    }
}
