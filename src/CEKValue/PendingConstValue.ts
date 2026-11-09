import { CEKValueTag } from "../_internal/CEKValueTag";
import { CEKConst } from "./CEKConst";
import { CEKValueObj } from "./CEKValue";

/**
 * The value of a constant whose builtin is still computing it, during
 * `Machine.evalAsync`. When `settled` resolves, the constant holds its value;
 * the machine reads no constant before that.
 */
export class PendingConstValue
{
    constructor( readonly settled: Promise<void> ) {}
}

/** a constant whose value is still being computed (see `PendingConstValue`) */
export function isPendingConst( value: CEKValueObj ): value is CEKConst
{
    return value.tag === CEKValueTag.Const && ( value as CEKConst ).value instanceof PendingConstValue;
}
