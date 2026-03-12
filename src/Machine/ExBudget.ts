import { ToCbor, CborString, Cbor, CborArray, CborUInt, CanBeCborString, forceCborString, CborObj, ToCborString, ToCborObj } from "@harmoniclabs/cbor";
import { definePropertyIfNotPresent, defineReadOnlyProperty, isObject } from "@harmoniclabs/obj-utils";

export const I64_MAX = BigInt("9223372036854775807");

export interface IExBudget {
    mem: bigint | number,
    cpu: bigint | number
}

export interface ExBudgetJson {
    steps: number,
    memory: number
}

export class ExBudget
    implements IExBudget, ToCborString, ToCborObj
{
    public cpu: bigint;
    public mem!: bigint;

    constructor( args: IExBudget )
    {
        if(!( typeof args === "object" && args !== null )) throw new Error(
            'invalid argument while constructing "ExBudget" instance'
        );
        this.cpu = BigInt( args.cpu );
        this.mem = BigInt( args.mem );
    }

    add(other: Readonly<IExBudget>): void {
        this.cpu = this.cpu + BigInt( other.cpu );
        this.mem = this.mem + BigInt( other.mem );
    }
    sub(other: Readonly<IExBudget>): void {
        this.cpu = this.cpu - BigInt( other.cpu );
        this.mem = this.mem - BigInt( other.mem );
    }

    static add( a: ExBudget, b: ExBudget ): ExBudget
    {
        return new ExBudget({
            cpu: a.cpu + b.cpu,
            mem: a.mem + b.mem 
        });
    }

    static sub( a: ExBudget, b: ExBudget ): ExBudget
    {
        return new ExBudget({
            cpu: a.cpu - b.cpu,
            mem: a.mem - b.mem 
        });
    }

    static get default(): ExBudget
    {
        return new ExBudget({
            cpu: 10_000_000_000, // cpu
            mem: 16_500_000 // mem
        });
    }

    static get maxCborSize(): ExBudget
    {
        const max_uint64 = ( BigInt(1) << BigInt(64) ) - BigInt(1);
        return new ExBudget({
            cpu: max_uint64, // cpu
            mem: max_uint64  // mem
        });
    }

    static unlimited(): ExBudget
    {
        return new ExBudget({
            cpu: I64_MAX, // cpu
            mem: I64_MAX  // mem
        });
    }

    static zero(): ExBudget
    {
        return new ExBudget({
            cpu: BigInt(0), // cpu
            mem: BigInt(0)  // mem
        });
    }

    clone(): ExBudget
    {
        return new ExBudget( this );
    }

    toCborBytes(): Uint8Array
    {
        return this.toCbor();
    }
    toCbor(): Uint8Array
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