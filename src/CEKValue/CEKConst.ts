import { ByteString } from "@harmoniclabs/bytestring";
import { BlsG1, BlsG2, BlsResult } from "@harmoniclabs/crypto";
import { Data } from "@harmoniclabs/plutus-data";
import { ConstType, ConstValue, ConstValueList, UPLCConst } from "@harmoniclabs/uplc";

export class CEKConst
{
    type: ConstType
    value: ConstValue

    constructor( type: ConstType, value: ConstValue )
    {
        this.type = type;
        this.value = value;
    }

    static fromUplc(
        uplc: UPLCConst | CEKConst
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

    static byteString( bs: ByteString ): CEKConst
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