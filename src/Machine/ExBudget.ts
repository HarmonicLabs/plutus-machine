import type { CanBeUInteger } from "@harmoniclabs/biguint";
import { ToCbor, CborString, Cbor, CborArray, CborUInt, CanBeCborString, forceCborString, CborObj, ToCborString, ToCborObj } from "@harmoniclabs/cbor";
import { definePropertyIfNotPresent, defineReadOnlyProperty, isObject } from "@harmoniclabs/obj-utils";

export interface IExBudget {
    mem: CanBeUInteger,
    cpu: CanBeUInteger
}

export interface ExBudgetJson {
    steps: number,
    memory: number
}

export class ExBudget
    implements IExBudget, ToCborString, ToCborObj
{
    private _cpu!: bigint;
    get cpu(): bigint { return this._cpu; }

    private _mem!: bigint;
    get mem(): bigint { return this._mem; }

    constructor( args: IExBudget)
    constructor( cpu: CanBeUInteger, mem: CanBeUInteger )
    constructor( args_or_cpu: IExBudget | CanBeUInteger, mem?: CanBeUInteger | undefined )
    {
        if( typeof args_or_cpu === "object" )
        {
            this._cpu = BigInt( args_or_cpu.cpu );
            this._mem = BigInt( args_or_cpu.mem );
        }
        else
        {
            this._cpu = BigInt( args_or_cpu );
            if( mem === undefined )
            {
                throw new Error(
                    'missing "mem" paramter while cosntructing "ExBudget" instance'
                );
            }
            this._mem = BigInt( mem );
        }
    }

    add(other: Readonly<IExBudget>): void {
        this._cpu = this._cpu + BigInt( other.cpu );
        this._mem = this._mem + BigInt( other.mem );
    }
    sub(other: Readonly<IExBudget>): void {
        this._cpu = this._cpu - BigInt( other.cpu );
        this._mem = this._mem - BigInt( other.mem );
    }

    static add( a: ExBudget, b: ExBudget ): ExBudget
    {
        return new ExBudget( a.cpu + b.cpu, a.mem + b.mem );
    }

    static sub( a: ExBudget, b: ExBudget ): ExBudget
    {
        const cpu = a.cpu - b.cpu;
        const mem = a.mem - b.mem;
        return new ExBudget( cpu, mem );
    }

    static get default(): ExBudget
    {
        return new ExBudget(
            10_000_000_000, // cpu
            14_000_000 // mem
        );
    }

    static get maxCborSize(): ExBudget
    {
        const max_uint64 = ( BigInt(1) << BigInt(64) ) - BigInt(1);
        return new ExBudget(
            max_uint64, // cpu
            max_uint64  // mem
        );
    }

    clone(): ExBudget
    {
        return new ExBudget( this.cpu, this.mem );
    }

    toCborBytes(): Uint8Array
    {
        return this.toCbor().toBuffer();
    }
    toCbor(): CborString
    {
        return Cbor.encode( this.toCborObj() );
    }
    toCborObj(): CborArray
    {
        return new CborArray([
            new CborUInt( this.mem ),
            new CborUInt( this.cpu )
        ]);
    }
    
    static fromCbor( cStr: CanBeCborString ): ExBudget
    {
        return ExBudget.fromCborObj( Cbor.parse( forceCborString( cStr ) ) );
    }
    static fromCborObj( cObj: CborObj ): ExBudget
    {
        if(!(
            cObj instanceof CborArray &&
            cObj.array[0] instanceof CborUInt &&
            cObj.array[1] instanceof CborUInt
        ))
        throw new Error(`Invalid CBOR format for "ExBudget"`);

        return new ExBudget({
            mem: cObj.array[0].num,
            cpu: cObj.array[1].num,
        });
    }

    toJson()
    {
        return {
            steps: this.cpu.toString(),
            memory: this.mem.toString()
        };
    }
    /** standard interface for `JSON.stringify` */
    toJSON()
    {
        return this.toJson();
    }

    static fromJson( stuff: ExBudgetJson ): ExBudget
    {
        return new ExBudget({
            mem: stuff.memory,
            cpu: stuff.steps,
        })
    }

    static isJson<T>( stuff: T ): stuff is (T & ExBudgetJson)
    {
        return (
            isObject( stuff ) &&
            typeof (stuff as any).memory === "number" &&
            typeof (stuff as any).steps === "number"
        )
    }
}