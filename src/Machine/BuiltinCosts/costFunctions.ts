import { defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { max, min } from "@harmoniclabs/bigint-utils";

type PossibleNArgs = 1| 2 | 3 | 6;

type CostFuncNToArgs<N extends PossibleNArgs> = 
    N extends 1 ? [ x: bigint ] :
    N extends 2 ? [ x: bigint, y: bigint ] :
    N extends 3 ? [ x: bigint, y: bigint, z: bigint ] :
    N extends 6 ? [ a: bigint, b: bigint, c: bigint, d: bigint, e: bigint, f: bigint ] : 
    never;

export interface CostFunc<NArgs extends PossibleNArgs> {
    at: (...args: CostFuncNToArgs<NArgs>) => bigint
}

export interface ConstantCostFunc {
    const: bigint
}

export interface LinearCostFunc<N extends PossibleNArgs> extends CostFunc<N> {
    quote: bigint,
    slope: bigint
}

export interface Minimum {
    min: bigint
}

export class FixedCost implements CostFunc<1 | 2 | 3 | 6>, ConstantCostFunc
{
    readonly const!: bigint;
    constructor( constant: bigint )
    {
        this.const = BigInt( constant );
    }
    at( ...xs: bigint[] ) { return this.const; }
}

class BaseLinear
{
    readonly quote!: bigint;
    readonly slope!: bigint;
    constructor( quote: bigint, slope: bigint )
    {
        this.quote = BigInt( quote );
        this.slope = BigInt( slope );
    }
}

export class Linear1 extends BaseLinear
    implements LinearCostFunc<1>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint ) { return this.quote + ( x * this.slope ) }
}

export class Linear2InX extends BaseLinear
    implements LinearCostFunc<2>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint ) { return this.quote + ( x * this.slope ) }
}

export class Linear2InY extends BaseLinear
    implements LinearCostFunc<2>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint ) { return this.quote + ( y * this.slope ) }
}

export class Linear2InBothAdd extends BaseLinear
    implements LinearCostFunc<2>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint ) { return this.quote + ((x + y) * this.slope ) }
}

export class Linear2InBothSub extends BaseLinear
    implements LinearCostFunc<2>, Minimum
{
    readonly min!: bigint;
    constructor( quote: bigint, slope: bigint, min: bigint )
    {
        super( quote, slope );
        this.min = BigInt( min );
    }
    at( x: bigint, y: bigint ) { return this.quote + ( max( this.min, (x - y) ) * this.slope ) }
}

export class Linear2InBothMult extends BaseLinear
    implements LinearCostFunc<2>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint ) { return this.quote + ((x * y) * this.slope) }
}

export class Linear2InMin extends BaseLinear
    implements LinearCostFunc<2>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint ) { return this.quote + (min(x, y) * this.slope) }
}

export class Linear2InMax extends BaseLinear
    implements LinearCostFunc<2>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint ) { return this.quote + (max(x, y) * this.slope) }
}

export class LinearOnEqualXY extends BaseLinear
    implements LinearCostFunc<2>, ConstantCostFunc
{
    readonly const!: bigint;
    constructor( quote: bigint, slope: bigint, constant: bigint )
    {
        super( quote, slope );
        this.const = BigInt( constant );
    }
    at( x: bigint, y: bigint ) { return x === y ? this.quote + (x * this.slope) : this.const }
}

export class YGtEqOrConst<CostF extends CostFunc<2>>
    implements CostFunc<2>, ConstantCostFunc
{
    readonly const!: bigint;
    readonly f!: CostF
    constructor( constant: bigint, f: CostF )
    {
        this.const = BigInt( constant );
        this.f = f;
    }
    at( x: bigint, y: bigint ) { return x > y ? this.const : this.f.at( x, y ) }
}

export class XGtEqOrConst<CostF extends CostFunc<2>>
    implements CostFunc<2>, ConstantCostFunc
{
    readonly const!: bigint;
    readonly f!: CostF
    constructor( constant: bigint, f: CostF )
    {
        this.const = BigInt( constant );
        this.f = f;
    }
    at( x: bigint, y: bigint ) { return x < y ? this.const : this.f.at( x, y ) }
}

export class LinearInAll3 extends BaseLinear
    implements LinearCostFunc<3>
{
    constructor( quote: bigint, slope: bigint, constant: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint, z: bigint ) { return this.quote + ((x + y + z) * this.slope) }
}

export class Linear3InX extends BaseLinear
    implements LinearCostFunc<3>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint, z: bigint ) { return this.quote + ( x * this.slope ) }
}

export class Linear3InY extends BaseLinear
    implements LinearCostFunc<3>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint, z: bigint ) { return this.quote + ( y * this.slope ) }
}

export class Linear3InZ extends BaseLinear
    implements LinearCostFunc<3>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint, z: bigint ) { return this.quote + ( z * this.slope ) }
}

export class Linear3InYAndZ
    implements CostFunc<3>
{
    constructor(
        readonly quote: bigint,
        readonly slope1: bigint,
        readonly slope2: bigint
    ){}

    at( _x: bigint, y: bigint, z: bigint ) { return this.quote + (y * this.slope1) + ( z * this.slope2 ); }
}

export class Linear3InMaxYZ extends BaseLinear
    implements LinearCostFunc<3>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at( x: bigint, y: bigint, z: bigint ) { return this.quote + ( max( y, z ) * this.slope ) }
}

/**
 * function in the form of
 * `a + b * x + c * (x**2)`
 */
class BaseQuadratic
{
    /** a */
    readonly x0: bigint;
    /** b * x  */
    readonly x1: bigint;
    /** c * x**2 */
    readonly x2: bigint;
    constructor( x0: bigint, x1: bigint, x2: bigint )
    {
        this.x0 = BigInt( x0 );
        this.x1 = BigInt( x1 );
        this.x2 = BigInt( x2 );
    }
}

export class Quadratic3InZ extends BaseQuadratic
    implements CostFunc<3>
{
    constructor( x0: bigint, x1: bigint, x2: bigint )
    {
        super( x0, x1, x2 );
    }
    at(x: bigint, y: bigint, z: bigint)
    {
        return this.x0 + (this.x1 * z) + (this.x2 * z * z)
    };
}

export class Quadratic2InY extends BaseQuadratic
    implements CostFunc<2>
{
    constructor( x0: bigint, x1: bigint, x2: bigint )
    {
        super( x0, x1, x2 );
    }
    at(x: bigint, y: bigint)
    {
        return this.x0 + (this.x1 * y) + (this.x2 * y * y)
    };
}

const _0n = BigInt( 0 );

export class ConstYOrLinearZ extends BaseLinear
    implements LinearCostFunc<3>
{
    constructor( quote: bigint, slope: bigint )
    {
        super( quote, slope );
    }
    at(x: bigint, y: bigint, z: bigint): bigint
    {
        return y === _0n ? this.quote + (this.slope * z) : y;
    }
}

/**
 * function in the form of
 * c00 + c10*x + c01*y + c20*x*x + c11*x*y + c02 * y
 */
class BaseDoubleQuadratic
{
    readonly c00: bigint;
    readonly c01: bigint;
    readonly c02: bigint;
    readonly c10: bigint;
    readonly c11: bigint;
    readonly c20: bigint;

    constructor(
        c00: bigint,
        c01: bigint,
        c02: bigint,
        c10: bigint,
        c11: bigint,
        c20: bigint
    )
    {
        defineReadOnlyProperty( this, "c00", BigInt( c00 ) );
        defineReadOnlyProperty( this, "c01", BigInt( c01 ) );
        defineReadOnlyProperty( this, "c02", BigInt( c02 ) );
        defineReadOnlyProperty( this, "c10", BigInt( c10 ) );
        defineReadOnlyProperty( this, "c11", BigInt( c11 ) );
        defineReadOnlyProperty( this, "c20", BigInt( c20 ) );
    }
}

export class ConstMinOrQuadratic2InXY extends BaseDoubleQuadratic
    implements CostFunc<2>
{
    readonly constant: bigint;
    readonly minimum: bigint;
    constructor(
        constant: bigint,
        minimum: bigint,
        c00: bigint,
        c01: bigint,
        c02: bigint,
        c10: bigint,
        c11: bigint,
        c20: bigint
    )
    {
        super( c00, c01, c02, c10, c11, c20 );
        defineReadOnlyProperty( this, "constant", BigInt( constant ) );
        defineReadOnlyProperty( this, "minimum", BigInt( minimum ) );
    }
    at(x: bigint, y: bigint)
    {
        if( x < y ) return this.constant;
        const { c00, c01, c02, c10, c11, c20, minimum } = this;
        const real = c00 + c10*x + c01*y + c20*x*x + c11*x*y + c02*y;
        return real < minimum ? minimum : real;
    };
}

export type OneArg
    = FixedCost
    | Linear1;

export type TwoArgs
    = FixedCost
    | Linear2InX
    | Linear2InY
    | Linear2InBothAdd
    | Linear2InBothSub
    | Linear2InBothMult
    | Linear2InMin
    | Linear2InMax
    | LinearOnEqualXY
    | YGtEqOrConst<CostFunc<2>>
    | XGtEqOrConst<CostFunc<2>>
    | Quadratic2InY
    | ConstMinOrQuadratic2InXY

export type ThreeArgs
    = FixedCost
    | LinearInAll3
    | Linear3InX
    | Linear3InY
    | Linear3InZ
    | Quadratic3InZ
    | ConstYOrLinearZ
    | Linear3InYAndZ
    | Linear3InMaxYZ;

export type SixArgs
    = FixedCost;

export type CostFunction
    = OneArg
    | TwoArgs
    | ThreeArgs
    | SixArgs;