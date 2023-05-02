import { UPLCTerm, UPLCVar, Delay, Lambda, Application, UPLCConst, constTypeEq, canConstValueBeOfConstType, eqConstValue, Force, ErrorUPLC, Builtin } from "@harmoniclabs/uplc";
import { PartialBuiltin } from "../BnCEK/PartialBuiltin";
import { CEKEnv } from "../CEKEnv";
import { DelayCEK } from "../DelayCEK";
import { LambdaCEK } from "../LambdaCEK";

export type CEKValue = UPLCTerm | PartialBuiltin | LambdaCEK | DelayCEK

export function eqCEKValue( a: Readonly<CEKValue>, b: Readonly<CEKValue> ): boolean
{
    if(!(
        Object.getPrototypeOf( a ) === Object.getPrototypeOf( b )
    )) return false;

    if( a instanceof DelayCEK && b instanceof DelayCEK )
    {
        return CEKEnv.eq( a.env, b.env ) && eqCEKValue( a.delayedTerm, b.delayedTerm );
    }

    if( a instanceof LambdaCEK && b instanceof LambdaCEK )
    {
        return CEKEnv.eq( a.env, b.env ) && eqCEKValue( a.body, b.body );
    }

    if( a instanceof PartialBuiltin && b instanceof PartialBuiltin )
    {
        return (
            a.tag === b.tag &&
            a.nMissingArgs === b.nMissingArgs &&
            a.args.every( (arg, i) => eqCEKValue( arg, b.args[ i ] ) )
        );
    }

    if( a instanceof UPLCVar && b instanceof UPLCVar)
    {
        return a.deBruijn === b.deBruijn;
    }

    if( a instanceof Delay && b instanceof Delay )
    {
        return eqCEKValue( a.delayedTerm, b.delayedTerm )
    }

    if( a instanceof Lambda && b instanceof Lambda)
    {
        return eqCEKValue( a.body, b.body );
    }

    if( a instanceof Application && b instanceof Application )
    {
        return eqCEKValue( a.argTerm, b.argTerm ) && eqCEKValue( a.funcTerm, b.funcTerm );
    }

    if( a instanceof UPLCConst && b instanceof UPLCConst )
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

    if( a instanceof Force && b instanceof Force )
    {
        return (
            eqCEKValue( a.termToForce, b.termToForce )
        );
    }
    
    if( a instanceof ErrorUPLC ) return b instanceof ErrorUPLC;

    if( a instanceof Builtin && b instanceof Builtin ) return a.tag === b.tag;

    return false;
}