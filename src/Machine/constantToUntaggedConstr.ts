import { constPairTypeUtils, ConstType, ConstTyTag } from "@harmoniclabs/uplc";
import { CEKConst, CEKConstr, CEKError, ICEKConst, ICEKConstr, ICEKError, TypedCEKConst, UntaggedCEKConstr } from "../CEKValue";

export function constantToUntaggedConstr(
    value: TypedCEKConst,
    numBranches: number
): ICEKConstr | ICEKError
{
    switch( value.typeTag ) {
        case ConstTyTag.int: {
            const n = value.value as bigint;
            if( n < BigInt(0) ) return new CEKError( `Negative integer ${n} cannot be converted to a constructor` );
            return new CEKConstr(
                n,
                []
            );
        }
        case ConstTyTag.bool: {
            if( numBranches > 2 ) return new CEKError( `Cannot convert boolean to constructor with more than 2 branches` );
            return new CEKConstr(
                value.value ? 1 : 0,
                []
            );
        }
        case ConstTyTag.unit: {
            if( numBranches > 1 ) return new CEKError( `Cannot convert unit to constructor with more than 1 branch` );
            return new CEKConstr(
                0,
                []
            );
        }
        case ConstTyTag.pair: {
            if( numBranches > 1 ) return new CEKError( `Cannot convert pair to constructor with more than 2 branches` );
            const fstType = constPairTypeUtils.getFirstTypeArgument( value.type );
            const sndType = value.type.slice( 1 + fstType.length ) as ConstType;
            const fst = new CEKConst( fstType, value.value.fst );
            const snd = new CEKConst( sndType, value.value.snd );
            return new CEKConstr(
                0,
                [ fst, snd ]
            );
            break;
        }
        case ConstTyTag.list: {
            if( numBranches > 2 ) return new CEKError( `Cannot convert list to constructor with more than 2 branches` );
            if( value.value.length === 0 ) return new CEKConstr( 1, [] );
            return new CEKConstr( 0,[
                new CEKConst(
                    value.type.slice( 1 ) as ConstType,
                    value.value[0]
                ),
                new CEKConst(
                    value.type,
                    value.value.slice( 1 )
                )
            ]);
        }
        default: {
            
        }
    }
    return new CEKError(
        `case: cannot case on constant of type ${(value as any).typeTag}`,
    );
}