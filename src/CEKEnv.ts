import { UPLCTerm } from "@harmoniclabs/uplc";
import { CEKHeap } from "./CEKHeap";

export class CEKEnv
{
    private _heapRef: CEKHeap;
    private _heapPtrs: number[];

    constructor( heapRef: CEKHeap, init: number[] = [] )
    {
        this._heapRef = heapRef;
        this._heapPtrs = init;
    }

    clone(): CEKEnv
    {
        return new CEKEnv( this._heapRef, this._heapPtrs.map( ptr => ptr ) )
    }

    push( varValue: UPLCTerm ): void
    {
        this._heapPtrs.push( this._heapRef.add( varValue ) );
    }

    get( dbn: number | bigint ): UPLCTerm | undefined
    {
        const _dbn: number = 
            typeof dbn === "bigint" ? Number( dbn ):
            dbn;
        if( (this._heapPtrs.length - _dbn) < 1 ) return undefined;
        return this._heapRef.get( this._heapPtrs[ this._heapPtrs.length - 1 - _dbn ] );
    }

    static eq( a: CEKEnv, b: CEKEnv ): boolean
    {
        if(!(
            a instanceof CEKEnv ||
            b instanceof CEKEnv
        )) return false;
    
        if( a === b ) return true; // shallow eq

        return (
            a._heapRef === b._heapRef &&
            a._heapPtrs.length === b._heapPtrs.length &&
            a._heapPtrs.every(( ptr,i ) => ptr === b._heapPtrs[i] )
        );
    }
}