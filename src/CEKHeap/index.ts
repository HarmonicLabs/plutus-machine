import { CEKValue, eqCEKValue } from "../CEKValue/CEKValue";


export class CEKHeap
{
    private _heap: CEKValue[];

    constructor( init: CEKValue[] = [] )
    {
        this._heap = init;
    }

    clone(): CEKHeap
    {
        return new CEKHeap( this._heap.map( uplc => uplc.clone() ) )
    }

    add( varValue: CEKValue ): number
    {
        const alreadyPresent = this._heap.findIndex(
            ( heapValue ) => eqCEKValue( heapValue, varValue )
        );
        if( alreadyPresent < 0 )
        {
            this._heap.push( Object.freeze( varValue ) );
            return this._heap.length - 1;
        }
        return alreadyPresent;
    }

    get( idx: number ): CEKValue | undefined
    {
        if( idx < 0 || idx >= this._heap.length || idx !== Math.round( idx ) ) return undefined;
        return this._heap[ idx ].clone();
    }

    _unsafe_clear(): void
    {
        this._heap.length = 0;
    }
}