import { constTypeEq, canConstValueBeOfConstType, eqConstValue, ErrorUPLC, Case, Constr, UPLCTerm, Application, Builtin, Delay, Force, Lambda, UPLCVar, eqUPLCTerm } from "@harmoniclabs/uplc";
import { PartialBuiltin } from "../BnCEK/PartialBuiltin";
import { CEKDelay } from "./CEKDelay";
import { CEKLambda } from "./CEKLambda";
import { CEKEnv } from "../CEKEnv";
import { CEKConst } from "./CEKConst";
import { CEKError } from "./CEKError";
import { CEKConstr } from "./CEKConstr";

export type CEKValue
    = CEKConst
    | CEKDelay
    | CEKLambda
    | CEKConstr
    | PartialBuiltin
    | CEKError;

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
        CEKEnv.eq( a.env, b.env ) &&
        eqUPLCTerm( a.delayedTerm, b.delayedTerm )
    );
    
    if( a instanceof CEKLambda && b instanceof CEKLambda )
    return (
        CEKEnv.eq( a.env, b.env ) &&
        eqUPLCTerm( a.body, b.body )
    );

    if( a instanceof CEKConstr && b instanceof CEKConstr )
    return (
        a.tag === b.tag &&
        a.values.length === b.values.length &&
        a.values.every((v,i) => eqCEKValue( v, b.values[i] ))
    );

    if( a instanceof PartialBuiltin && b instanceof PartialBuiltin )
    return (
        a.tag === b.tag &&
        a.nMissingArgs === b.nMissingArgs &&
        a.args.every( (arg, i) => eqCEKValue( arg, b.args[ i ] ) )
    );
    
    return false;
}