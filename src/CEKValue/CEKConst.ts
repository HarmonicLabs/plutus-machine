import { BlsG1, BlsG2, BlsResult } from "@harmoniclabs/crypto";
import { Data } from "@harmoniclabs/plutus-data";
import { ConstType, ConstTyTag, ConstValue, ConstValueList, IUPLCConst, UPLCConst } from "@harmoniclabs/uplc";
import { ICEKValue } from "./CEKValue";
import { CEKValueTag } from "../_internal/CEKValueTag";

export type TypedCEKConst
    = ICEKConstInt
    | ICEKConstBool
    | ICEKConstUnit
    | ICEKConstPair
    | ICEKConstList
    // | AnyTypedCEKConst
    ;

export interface ICEKConstInt {
    typeTag: ConstTyTag.int;
    value: bigint;
}

export interface ICEKConstBool {
    typeTag: ConstTyTag.bool;
    value: boolean;
}

export interface ICEKConstUnit {
    typeTag: ConstTyTag.unit;
    value: undefined;
}

export interface ICEKConstPair {
    type: ConstType;
    typeTag: ConstTyTag.pair;
    value: { fst: ConstValue, snd: ConstValue };
}

export interface ICEKConstList {
    type: ConstType;
    typeTag: ConstTyTag.list;
    value: ConstValueList
}

export interface AnyTypedCEKConst {
    typeTag: ConstTyTag;
    value: ConstValue;
}

export interface ICEKConst extends ICEKValue {
    tag: CEKValueTag.Const;
    type: ConstType;
    typeTag: ConstTyTag;
    value: ConstValue;
}

export class CEKConst
    implements ICEKConst
{
    readonly tag: CEKValueTag.Const = CEKValueTag.Const;
    type: ConstType
    typeTag: ConstTyTag
    value: ConstValue

    constructor( type: ConstType, value: ConstValue )
    {
        this.type = type;
        this.typeTag = type[0];
        this.value = value;
    }

    static fromUplc(
        uplc: UPLCConst | IUPLCConst | CEKConst
    ): CEKConst
    {
        if( uplc instanceof CEKConst ) return uplc;
        return new CEKConst(
            uplc.type,
            uplc.value
        );
    }

    clone(): CEKConst
    {
        return new CEKConst(
            this.type,
            this.value
        );
    }

    static int( int: number | bigint ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.int( int ) );
    }

    static byteString( bs: Uint8Array ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.byteString( bs ) );
    }

    static str( str: string ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.str( str ) );
    }

    static get unit(): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.unit );
    }

    static bool( bool: boolean ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.bool( bool ) );
    }

    static listOf( typeArg: ConstType ): ( ( values: ConstValueList ) => CEKConst )
    {
        return function ( values: ConstValueList ): CEKConst
        {
            return CEKConst.fromUplc( UPLCConst.listOf( typeArg )( values ) );
        };
    }

    static pairOf( typeArgFirst: ConstType, typeArgSecond: ConstType ): ( ( first: ConstValue, second: ConstValue ) => CEKConst )
    {
        return function ( first: ConstValue, second: ConstValue ): CEKConst
        {
            return CEKConst.fromUplc( UPLCConst.pairOf( typeArgFirst, typeArgSecond )( first, second ) );
        };
    }

    static data( data: Data ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.data( data ) );
    }

    static bls12_381_G1_element( g1: BlsG1 ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.bls12_381_G1_element( g1 ) );
    }

    static bls12_381_G2_element( g2: BlsG2 ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.bls12_381_G2_element( g2 ) );
    }

    static bls12_381_MlResult( mlResult: BlsResult ): CEKConst
    {
        return CEKConst.fromUplc( UPLCConst.bls12_381_MlResult( mlResult ) );
    }
}