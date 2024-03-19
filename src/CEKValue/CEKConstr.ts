import type { CEKValue } from ".";

export class CEKConstr
{
    tag: bigint;
    values: CEKValue[]

    constructor( tag: bigint, values: CEKValue[] )
    {
        this.tag = tag
        this.values = values;
    }

    clone(): CEKConstr
    {
        return new CEKConstr(
            this.tag,
            this.values.map( v => v.clone() )
        );
    }
}