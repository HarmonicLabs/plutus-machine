import { Application, Builtin, Case, Constr, Delay, ErrorUPLC, Force, Lambda, UPLCConst, UPLCTermObj } from "@harmoniclabs/uplc";
import { CEKValueTag } from "../_internal/CEKValueTag";
import { CEKEnv, lookupEnv } from "../CEKEnv";
import { CEKValueObj } from "./CEKValue";

/**
 * The term a machine value stands for: a constant, or a lambda, delay or partial builtin
 * with its environment substituted in (the reference machine's "discharge"). Evaluating the
 * term gives the value back, so values from one evaluation can be passed to another.
 */
export function dischargeCEKValue( v: CEKValueObj ): UPLCTermObj
{
    switch( v.tag )
    {
        case CEKValueTag.Const:
            return new UPLCConst( v.type as any, v.value as any );
        case CEKValueTag.Error:
            return new ErrorUPLC();
        case CEKValueTag.Lambda:
            return new Lambda( dischargeTerm( v.body, v.env, 1 ) as any );
        case CEKValueTag.Delay:
            return new Delay( dischargeTerm( v.delayedTerm, v.env, 0 ) as any );
        case CEKValueTag.Constr:
            return new Constr( BigInt( v.index ), v.values.map( dischargeCEKValue ) as any );
        case CEKValueTag.PartialBuiltin: {
            let term: UPLCTermObj = new Builtin( v.builtinTag );
            for( let i = 0; i < v.forces; i++ ) term = new Force( term as any );
            for( const arg of v.args ) term = new Application( term as any, dischargeCEKValue( arg ) as any );
            return term;
        }
    }
}

/** `t` with the variables bound in `env` replaced by their values; `depth` lambdas enclose it inside the value */
function dischargeTerm( t: UPLCTermObj, env: CEKEnv, depth: number ): UPLCTermObj
{
    switch( t.tag )
    {
        case 0 /* Var */: {
            const dbn = Number( ( t as any ).deBruijn );
            if( dbn < depth ) return t;
            const val = lookupEnv( env, dbn - depth );
            if( val === undefined ) return t;
            return dischargeCEKValue( val );
        }
        case 1 /* Delay */:
            return new Delay( dischargeTerm( ( t as any ).delayedTerm, env, depth ) as any );
        case 2 /* Lambda */:
            return new Lambda( dischargeTerm( ( t as any ).body, env, depth + 1 ) as any );
        case 3 /* Application */:
            return new Application(
                dischargeTerm( ( t as any ).func, env, depth ) as any,
                dischargeTerm( ( t as any ).arg, env, depth ) as any
            );
        case 5 /* Force */:
            return new Force( dischargeTerm( ( t as any ).forced, env, depth ) as any );
        case 8 /* Constr */:
            return new Constr(
                BigInt( ( t as any ).index ),
                ( ( t as any ).terms as UPLCTermObj[] ).map( term => dischargeTerm( term, env, depth ) ) as any
            );
        case 9 /* Case */:
            return new Case(
                dischargeTerm( ( t as any ).constrTerm, env, depth ) as any,
                ( ( t as any ).continuations as UPLCTermObj[] ).map( term => dischargeTerm( term, env, depth ) ) as any
            );
        default:
            return t;
    }
}
