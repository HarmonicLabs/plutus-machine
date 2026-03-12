import { constTypeEq, canConstValueBeOfConstType, eqConstValue, ErrorUPLC, Case, Constr, UPLCTerm, Application, Builtin, Delay, Force, Lambda, UPLCVar, eqUPLCTerm } from "@harmoniclabs/uplc";
import { IPartialBuiltin, PartialBuiltin } from "../BnCEK/PartialBuiltin";
import { CEKDelay, ICEKDelay } from "./CEKDelay";
import { CEKLambda, ICEKLambda } from "./CEKLambda";
import { CEKConst, ICEKConst } from "./CEKConst";
import { CEKError, ICEKError } from "./CEKError";
import { CEKConstr, ICEKConstr } from "./CEKConstr";
import { CEKValueTag } from "../_internal/CEKValueTag";

export type CEKValueObj
    = ICEKConst
    | ICEKDelay
    | ICEKLambda
    | ICEKConstr
    | IPartialBuiltin
    | ICEKError
    ;

export interface ICEKValue {
    tag: CEKValueTag;
}

export type CEKValue
    = CEKConst
    | CEKDelay
    | CEKLambda
    | CEKConstr
    | PartialBuiltin
    | CEKError;

/** @deprecated */
export function isCEKValue( stuff: any ): stuff is CEKValue
{
    return (
        stuff instanceof CEKConst       ||
        stuff instanceof CEKDelay       ||
        stuff instanceof CEKLambda      ||
        stuff instanceof CEKConstr      ||
        stuff instanceof PartialBuiltin ||
        stuff instanceof CEKError
    );
}

/** @deprecated */
export function eqCEKValue( a: Readonly<CEKValue>, b: Readonly<CEKValue> ): boolean
{
    if( a instanceof CEKError ) return b instanceof CEKError;

    if( a instanceof CEKConst && b instanceof CEKConst )
    {
        return (
            constTypeEq( a.type, b.type ) &&
            canConstValueBeOfConstType( a.value, a.type ) &&
            canConstValueBeOfConstType( b.value, b.type ) &&
            (() => {
                try {
                    return eqConstValue( a.value, b.value );
                } catch (e) {
                    if( e instanceof RangeError ) return false;

                    throw e;
                }
            })()
        );
    }

    if( a instanceof CEKDelay && b instanceof CEKDelay )
    return (
        a.env === b.env &&
        eqUPLCTerm( a.delayedTerm as any, b.delayedTerm as any )
    );

    if( a instanceof CEKLambda && b instanceof CEKLambda )
    return (
        a.env === b.env &&
        eqUPLCTerm( a.body as any, b.body as any )
    );

    if( a instanceof CEKConstr && b instanceof CEKConstr )
    return (
        a.index === b.index &&
        a.values.length === b.values.length &&
        a.values.every((v,i) => eqCEKValue( v as any, b.values[i] as any ))
    );

    if( a instanceof PartialBuiltin && b instanceof PartialBuiltin )
    return (
        a.builtinTag === b.builtinTag &&
        a.nMissingArgs === b.nMissingArgs &&
        a.args.every( (arg, i) => eqUPLCTerm( arg as any, b.args[ i ] as any ) )
    );
    
    return false;
}