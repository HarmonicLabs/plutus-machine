import { log2, abs } from "@harmoniclabs/bigint-utils";
import { ByteString } from "@harmoniclabs/bytestring";
import { Pair } from "@harmoniclabs/pair";
import { fromHex, fromUtf8, toHex, toUtf8 } from "@harmoniclabs/uint8array-utils";
import { isData, Data, DataConstr, DataMap, DataList, DataI, DataB, DataPair, dataToCbor, eqData } from "@harmoniclabs/plutus-data";
import { ConstValue, isConstValueInt, UPLCTerm, ConstType, constTypeEq, constT, ConstTyTag, UPLCBuiltinTag, constPairTypeUtils, constListTypeUtils, constTypeToStirng } from "@harmoniclabs/uplc";
import { BuiltinCostsOf } from "../Machine/BuiltinCosts/BuiltinCosts";
import { ExBudget } from "../Machine/ExBudget";
import { PartialBuiltin } from "./PartialBuiltin";
import { BlsG1, BlsG2, BlsResult, blake2b, blake2b_224, bls12_381_G1_add, bls12_381_G1_compress, bls12_381_G1_equal, bls12_381_G1_hashToGroup, bls12_381_G1_neg, bls12_381_G1_scalarMul, bls12_381_G1_uncompress, bls12_381_G2_add, bls12_381_G2_compress, bls12_381_G2_equal, bls12_381_G2_hashToGroup, bls12_381_G2_neg, bls12_381_G2_scalarMul, bls12_381_G2_uncompress, bls12_381_finalVerify, bls12_381_millerLoop, bls12_381_mulMlResult, byte, isBlsG1, isBlsG2, isBlsResult, keccak_256, sha2_256, sha3, verifyEcdsaSecp256k1Signature, verifyEd25519Signature, verifySchnorrSecp256k1Signature } from "@harmoniclabs/crypto";
import { CEKError } from "../CEKValue/CEKError";
import { CEKConst } from "../CEKValue/CEKConst";
import { CEKValue } from "../CEKValue/CEKValue";

function intToSize( n: bigint ): bigint
{
    n = BigInt( n );
    if ( n === _0n ) return BigInt( 1 );

    // same as `intToSize( -n - BigInt( 1 ) )` but inlined
    if( n  < _0n ) return ( log2( ( -n - BigInt( 1 ) ) << BigInt( 1 ) ) / BigInt( 8 )) + BigInt( 1 ) ;

    return ( log2( n << BigInt( 1 ) ) / BigInt( 8 )) + BigInt( 1 );
}

function bsToSize( bs: ByteString | Uint8Array ): bigint
{
    const len = (( bs instanceof Uint8Array ) ? bs : bs.toBuffer()).length;
    return len === 0 ?
        // TODO: Bug in cardano-node; to fix next hard fork
        BigInt(1) :
        BigInt( len );
}

function strToSize( str: string ): bigint
{
    return bsToSize( fromUtf8( str ) )
};

const BLS_G1_SIZE: bigint = BigInt( 48 );
const BLS_G2_SIZE: bigint = BigInt( 96 );
const BLS_ML_RESULT_SIZE: bigint = BigInt( 192 );
const BOOL_SIZE: bigint = BigInt( 1 );
const ANY_SIZE: bigint = BigInt( 1 );

function constValueToSize( v: ConstValue ): bigint
{
    if( isConstValueInt( v ) ) return intToSize( BigInt( v as any ) );
    if( v instanceof ByteString ) return bsToSize( v.toBuffer() );
    if( typeof v === "string" ) return strToSize( v );
    if( typeof v === "undefined" ) return ANY_SIZE;
    if( typeof v === "boolean" ) return BOOL_SIZE;
    if( isData( v ) ) return dataToSize( v );

    if( Array.isArray( v ) ) return listToSize( v );

    if( v instanceof Pair ) return pairToSize( v );

    console.warn("unexpected 'constValueToSize'; exec costs evaluation might be inaccurate");
    return ANY_SIZE;
}

function listToSize( l: ConstValue[] ): bigint
{
    return l.reduce<bigint>( (acc, elem) => acc + constValueToSize( elem ), BigInt(0) );
}

function pairToSize( pairValue: Pair<ConstValue,ConstValue> ): bigint
{
    return constValueToSize( pairValue.fst ) + constValueToSize( pairValue.snd )
}

function dataToSize( data: Data ): bigint
{
    const stack: Data[] = [ data ];
    let tot: bigint = _0n;

    while( stack.length > 0 )
    {
        const top = stack.pop();
        tot += BigInt( 4 );

        if( top instanceof DataConstr )
        {
            stack.unshift( ...top.fields );
        }
        else if( top instanceof DataMap )
        {
            stack.unshift(
                ...top.map.reduce<Data[]>(
                    ( accum, elem ) => [ elem.fst, elem.snd, ...accum ] , []
                )
            );
        }
        else if( top instanceof DataList )
        {
            stack.unshift(
                ...top.list
            );
        }
        else if( top instanceof DataI )
        {
            tot += intToSize( top.int );
        }
        else if( top instanceof DataB )
        {
            tot += bsToSize( top.bytes )
        }
        else break; // top === undefined; stack empty (unreachable)
    }

    return tot;
}


function isConstOfType( constant: Readonly<UPLCTerm>, ty: Readonly<ConstType> ): constant is CEKConst
{
    const checkValue = ( v: ConstValue ): boolean =>
    {
        if( constTypeEq( constT.int, ty ) )
        {
            return isConstValueInt( v );
        }

        if( constTypeEq( constT.bool, ty ) )
        {
            return typeof v === "boolean";
        }

        if( constTypeEq( constT.byteStr, ty ) )
        {
            return ( ByteString.isStrictInstance( v ) )
        }

        if( constTypeEq( constT.data, ty ) )
        {
            return ( isData( v ) )
        }

        if( constTypeEq( constT.str, ty ) )
        {
            return typeof v === "string";
        }

        if( constTypeEq( constT.unit, ty ) )
        {
            return v === undefined;
        }
        return false;
    }

    // if( constant instanceof HoistedUPLC ) constant = constant.UPLC;

    return (
        constant instanceof CEKConst &&
        constTypeEq( constant.type, ty ) &&
        checkValue( constant.value )
    );
}

function getInt( a: CEKValue ): bigint | undefined
{
    if( !isConstOfType( a, constT.int ) ) return undefined;
    return BigInt( a.value as any );
}

function getInts( a: CEKValue, b: CEKValue ): ( { a: bigint,  b: bigint } | undefined )
{
    if( !isConstOfType( a, constT.int ) ) return undefined;
    if( !isConstOfType( b, constT.int ) ) return undefined;

    return {
        a: BigInt( a.value as any ),
        b: BigInt( b.value as any )
    };
}

function getBS( a: CEKValue ): ByteString | undefined
{
    if( !isConstOfType( a, constT.byteStr ) ) return undefined;
    return a.value as any;
}

function getStr( a: CEKValue ): string | undefined
{
    if( !isConstOfType( a, constT.str ) ) return undefined;
    return a.value as any;
}

function getList( list: CEKValue ): ConstValue[] | undefined
{
    if(!(
        list instanceof CEKConst &&
        list.type[0] === ConstTyTag.list &&
        Array.isArray( list.value )
    )) return undefined;

    return list.value.slice();
}

function getPair( pair: CEKValue ): Pair<ConstValue,ConstValue> | undefined
{
    if(!(
        pair instanceof CEKConst &&
        pair.type[0] === ConstTyTag.pair &&
        Pair.isStrictInstance( pair.value )
    )) return undefined;

    // no need to clone
    return pair.value;
}

function getData( data: CEKValue ): Data | undefined
{
    if(!(
        data instanceof CEKConst &&
        constTypeEq( data.type, constT.data ) &&
        isData( data.value )
    )) return undefined;

    return data.value;
}

function getBool( c: CEKValue ): boolean | undefined
{
    if(!(
        c instanceof CEKConst &&
        constTypeEq( c.type, constT.bool ) &&
        typeof c.value === "boolean"
    )) return undefined;
    return c.value;
}

function getBlsG1( elem: CEKValue ): BlsG1 | undefined
{
    if(!(
        elem instanceof CEKConst &&
        constTypeEq( elem.type, constT.bls12_381_G1_element ) &&
        isBlsG1( elem.value )
    )) return undefined;

    return elem.value;
}

function getBlsG2( elem: CEKValue ): BlsG2 | undefined
{
    if(!(
        elem instanceof CEKConst &&
        constTypeEq( elem.type, constT.bls12_381_G2_element ) &&
        isBlsG2( elem.value )
    )) return undefined;

    return elem.value;
}

function getBlsResult( elem: CEKValue ): BlsResult | undefined
{
    if(!(
        elem instanceof CEKConst &&
        constTypeEq( elem.type, constT.bls12_381_MlResult ) &&
        isBlsResult( elem.value )
    )) return undefined;

    return elem.value;
}

function intBinOp( a: CEKValue, b: CEKValue , op: (a: bigint, b: bigint) => bigint | undefined , fnName: string ): ConstOrErr
{
    const ints = getInts( a, b );
    if( ints === undefined )
    return new CEKError(
        `${fnName} :: invalid arguments`,
        { a, b }
    );

    const result = op( ints.a, ints.b);
    if( result === undefined ) return new CEKError(
        `${fnName} :: operation error`, 
        { a, b, ints_a: ints.a, ints_b: ints.b }
    );

    return CEKConst.int( result );
}

export function haskellQuot( a: bigint, b: bigint ): bigint | undefined
{
    if( b === _0n ) return undefined;
    return a / b;
}

export function haskellRem( a: bigint, b: bigint ): bigint | undefined
{
    if( b === _0n ) return undefined;
    return a % b;
}

function haskellQuotRem( a: bigint, b: bigint ): [ quot: bigint, rem: bigint ] | undefined
{
    const quot = haskellQuot( a, b );
    if( quot === undefined ) return quot;
    const rem = haskellRem( a, b );
    if( rem === undefined ) return rem;
    
    return [ quot, rem ];
}

function haskellDivMod( a: bigint, b: bigint ): [ div: bigint, mod: bigint ] | undefined
{
    if( b === _0n ) return undefined;
    
    if( a > _0n && b < _0n )
    {
        const qr = haskellQuotRem( a - BigInt( 1 ), b );
        if( qr === undefined ) return undefined;

        return [
            qr[0] - BigInt( 1 ),
            qr[1] + b + BigInt( 1 )
        ]
    }

    if( a < _0n && b > _0n )
    {
        const qr = haskellQuotRem( a + BigInt( 1 ), b );
        if( qr === undefined ) return undefined;

        return [
            qr[0] - BigInt( 1 ),
            qr[1] + b - BigInt( 1 )
        ]
    }

    return haskellQuotRem( a, b );
}

export function haskellDiv( a: bigint, b: bigint ): bigint | undefined
{
    const dm = haskellDivMod( a, b );
    if( dm === undefined ) return undefined;
    return dm[0];
}

export function haskellMod( a: bigint, b: bigint ): bigint | undefined
{
    const dm = haskellDivMod( a, b );
    if( dm === undefined ) return undefined;
    return dm[1];
}

type ConstOrErr = CEKConst | CEKError;

function constOrErr( getConst: () => CEKConst ): ConstOrErr
{
    try {
        return getConst();
    } catch( e ) {
        return new CEKError( e.message, { e } );
    }
}

export class BnCEK
{
    /**
     * **reference** to the budget of the actual machine
    **/
    readonly machineBudget: ExBudget;
    constructor(
        readonly getBuiltinCostFunc: <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag>,
        machineBudget: ExBudget,
        readonly logs: string[]  
    ){
        this.machineBudget = machineBudget;
    };

    eval( bn: PartialBuiltin ): ConstOrErr
    {
        switch( bn.tag )
        {
            case UPLCBuiltinTag.addInteger :                        return (this.addInteger as any)( ...bn.args );
            case UPLCBuiltinTag.subtractInteger :                   return (this.subtractInteger as any)( ...bn.args );
            case UPLCBuiltinTag.multiplyInteger :                   return (this.multiplyInteger as any)( ...bn.args );
            case UPLCBuiltinTag.divideInteger :                     return (this.divideInteger as any)( ...bn.args );
            case UPLCBuiltinTag.quotientInteger :                   return (this.quotientInteger as any)( ...bn.args );
            case UPLCBuiltinTag.remainderInteger :                  return (this.remainderInteger as any)( ...bn.args );
            case UPLCBuiltinTag.modInteger :                        return (this.modInteger as any)( ...bn.args );
            case UPLCBuiltinTag.equalsInteger :                     return (this.equalsInteger as any)( ...bn.args );
            case UPLCBuiltinTag.lessThanInteger :                   return (this.lessThanInteger as any)( ...bn.args );
            case UPLCBuiltinTag.lessThanEqualInteger :              return (this.lessThanEqualInteger as any)( ...bn.args );
            case UPLCBuiltinTag.appendByteString :                  return (this.appendByteString as any)( ...bn.args );
            case UPLCBuiltinTag.consByteString :                    return (this.consByteString as any)( ...bn.args );
            case UPLCBuiltinTag.sliceByteString :                   return (this.sliceByteString as any)( ...bn.args );
            case UPLCBuiltinTag.lengthOfByteString :                return (this.lengthOfByteString as any)( ...bn.args );
            case UPLCBuiltinTag.indexByteString :                   return (this.indexByteString as any)( ...bn.args );
            case UPLCBuiltinTag.equalsByteString :                  return (this.equalsByteString as any)( ...bn.args );
            case UPLCBuiltinTag.lessThanByteString :                return (this.lessThanByteString as any)( ...bn.args );
            case UPLCBuiltinTag.lessThanEqualsByteString :          return (this.lessThanEqualsByteString as any)( ...bn.args );
            case UPLCBuiltinTag.sha2_256 :                          return (this.sha2_256 as any)( ...bn.args );
            case UPLCBuiltinTag.sha3_256 :                          return (this.sha3_256 as any)( ...bn.args );
            case UPLCBuiltinTag.blake2b_256 :                       return (this.blake2b_256 as any)( ...bn.args );
            case UPLCBuiltinTag.verifyEd25519Signature:             return (this.verifyEd25519Signature as any)( ...bn.args );
            case UPLCBuiltinTag.appendString :                      return (this.appendString as any)( ...bn.args );
            case UPLCBuiltinTag.equalsString :                      return (this.equalsString as any)( ...bn.args );
            case UPLCBuiltinTag.encodeUtf8 :                        return (this.encodeUtf8 as any)( ...bn.args );
            case UPLCBuiltinTag.decodeUtf8 :                        return (this.decodeUtf8 as any)( ...bn.args );
            case UPLCBuiltinTag.ifThenElse :                        return (this.ifThenElse as any)( ...bn.args );
            case UPLCBuiltinTag.chooseUnit :                        return (this.chooseUnit as any)( ...bn.args );
            case UPLCBuiltinTag.trace :                             return (this.trace as any)( ...bn.args );
            case UPLCBuiltinTag.fstPair :                           return (this.fstPair as any)( ...bn.args );
            case UPLCBuiltinTag.sndPair :                           return (this.sndPair as any)( ...bn.args );
            case UPLCBuiltinTag.chooseList :                        return (this.chooseList as any)( ...bn.args );
            case UPLCBuiltinTag.mkCons :                            return (this.mkCons as any)( ...bn.args );
            case UPLCBuiltinTag.headList :                          return (this.headList as any)( ...bn.args );
            case UPLCBuiltinTag.tailList :                          return (this.tailList as any)( ...bn.args );
            case UPLCBuiltinTag.nullList :                          return (this.nullList as any)( ...bn.args );
            case UPLCBuiltinTag.chooseData :                        return (this.chooseData as any)( ...bn.args );
            case UPLCBuiltinTag.constrData :                        return (this.constrData as any)( ...bn.args );
            case UPLCBuiltinTag.mapData :                           return (this.mapData as any)( ...bn.args );
            case UPLCBuiltinTag.listData :                          return (this.listData as any)( ...bn.args );
            case UPLCBuiltinTag.iData    :                          return (this.iData as any)( ...bn.args );
            case UPLCBuiltinTag.bData    :                          return (this.bData as any)( ...bn.args );
            case UPLCBuiltinTag.unConstrData :                      return (this.unConstrData as any)( ...bn.args );
            case UPLCBuiltinTag.unMapData    :                      return (this.unMapData as any)( ...bn.args );
            case UPLCBuiltinTag.unListData   :                      return (this.unListData as any)( ...bn.args );
            case UPLCBuiltinTag.unIData      :                      return (this.unIData as any)( ...bn.args );
            case UPLCBuiltinTag.unBData      :                      return (this.unBData as any)( ...bn.args );
            case UPLCBuiltinTag.equalsData   :                      return (this.equalsData as any)( ...bn.args );
            case UPLCBuiltinTag.mkPairData   :                      return (this.mkPairData as any)( ...bn.args );
            case UPLCBuiltinTag.mkNilData    :                      return (this.mkNilData as any)( ...bn.args );
            case UPLCBuiltinTag.mkNilPairData:                      return (this.mkNilPairData as any)( ...bn.args );
            case UPLCBuiltinTag.serialiseData:                      return (this.serialiseData as any)( ...bn.args );
            case UPLCBuiltinTag.verifyEcdsaSecp256k1Signature:      return (this.verifyEcdsaSecp256k1Signature as any)( ...bn.args );
            case UPLCBuiltinTag.verifySchnorrSecp256k1Signature:    return (this.verifySchnorrSecp256k1Signature as any)( ...bn.args );
            
            case UPLCBuiltinTag.bls12_381_G1_add                     : return (this.bls12_381_G1_add as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G1_neg                     : return (this.bls12_381_G1_neg as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G1_scalarMul               : return (this.bls12_381_G1_scalarMul as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G1_equal                   : return (this.bls12_381_G1_equal as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G1_hashToGroup             : return (this.bls12_381_G1_hashToGroup as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G1_compress                : return (this.bls12_381_G1_compress as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G1_uncompress              : return (this.bls12_381_G1_uncompress as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_add                     : return (this.bls12_381_G2_add as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_neg                     : return (this.bls12_381_G2_neg as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_scalarMul               : return (this.bls12_381_G2_scalarMul as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_equal                   : return (this.bls12_381_G2_equal as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_hashToGroup             : return (this.bls12_381_G2_hashToGroup as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_compress                : return (this.bls12_381_G2_compress as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_G2_uncompress              : return (this.bls12_381_G2_uncompress as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_millerLoop                 : return (this.bls12_381_millerLoop as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_mulMlResult                : return (this.bls12_381_mulMlResult as any)( ...bn.args );
            case UPLCBuiltinTag.bls12_381_finalVerify                : return (this.bls12_381_finalVerify as any)( ...bn.args );
            case UPLCBuiltinTag.keccak_256                           : return (this.keccak_256 as any)( ...bn.args );
            case UPLCBuiltinTag.blake2b_224                          : return (this.blake2b_224 as any)( ...bn.args );

            case UPLCBuiltinTag.byteStringToInteger                  : return (this.byteStringToInteger as any)( ...bn.args );
            case UPLCBuiltinTag.integerToByteString                  : return (this.integerToByteString as any)( ...bn.args );
            
            default:
                bn.tag; // check that is of type 'never'
                return new CEKError("unrecognized builtin tag", { tag: bn.tag });
        }
    }

    addInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.addInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return a + b;
            }).bind(this),
            "addInteger"
        );
    }
    subtractInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.subtractInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return a - b;

            }).bind(this),
            "subtractInteger"
        );
    }
    multiplyInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.multiplyInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return a * b;

            }).bind(this),
            "multiplyInteger"
        );
    }
    divideInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                if( b === _0n ) return undefined; // divide by 0

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.divideInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return haskellDiv( a, b );

            }).bind(this),
            "divideInteger"
        );
    }
    quotientInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.quotientInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return haskellQuot( a, b );

            }).bind(this),
            "quotientInteger"
        );
    }
    remainderInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.remainderInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return haskellRem( a, b );

            }).bind(this),
            "remainderInteger"
        );
    }
    modInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        return intBinOp( _a , _b,
            ((a: bigint, b: bigint) => {

                const f = this.getBuiltinCostFunc( UPLCBuiltinTag.modInteger );
                
                const sa = intToSize( a );
                const sb = intToSize( b );
                
                this.machineBudget.add({
                    mem: f.mem.at( sa, sb ),
                    cpu: f.cpu.at( sa, sb )
                });
                
                return haskellMod( a, b );

            }).bind(this),
            "modInteger"
        );
    }
    equalsInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const ints = getInts( a, b );
        if( ints === undefined )
        return new CEKError(
            "equalsInteger :: not integers",
            { a, b, ints }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.equalsInteger );
                
        const sa = intToSize( ints.a );
        const sb = intToSize( ints.b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( ints.a === ints.b );
    }
    lessThanInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const ints = getInts( a, b );
        if( ints === undefined )
        return new CEKError(
            "lessThanInteger :: not integers",
            { a, b, ints }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanInteger );
                
        const sa = intToSize( ints.a );
        const sb = intToSize( ints.b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( ints.a < ints.b );
    }
    lessThanEqualInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const ints = getInts( a, b );
        if( ints === undefined )
        return new CEKError(
            "lessThanEqualInteger :: not integers",
            { a, b, ints }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanEqualInteger );
                
        const sa = intToSize( ints.a );
        const sb = intToSize( ints.b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( ints.a <= ints.b );
    }
    appendByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBS( a );
        if( _a === undefined ) return new CEKError("appendByteString :: not BS", { a });
        const _b = getBS( b );
        if(_b === undefined ) return new CEKError("appendByteString :: not BS", { b });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.appendByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.byteString(  new ByteString( _a.toString() + _b.toString() ) );
    }
    consByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        let _a = getInt( a );
        if( _a === undefined ) return new CEKError("consByteString :: not Int", { a });
        
        if( _a < 0 ) return new CEKError("consByteString :: negative byte");
        if( _a >= BigInt( 256 ) ) return new CEKError("consByteString :: UInt8 overflow");

        const _b = getBS( b );
        if(_b === undefined ) return new CEKError("consByteString :: not BS", { b });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.consByteString );
                
        const sa = intToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.byteString(  new ByteString( _a.toString(16).padStart( 2, '0' ) + _b.toString() ) );
    }
    sliceByteString( fromIdx: CEKValue, ofLength: CEKValue, bs: CEKValue ): ConstOrErr
    {
        const idx = getInt( fromIdx );
        if( idx === undefined ) return new CEKError("sliceByteString :: not int", { fromIdx });

        const length = getInt( ofLength );
        if( length === undefined ) return new CEKError("sliceByteString :: not int", { ofLength });

        const _bs = getBS( bs );
        if( _bs === undefined ) return new CEKError("sliceByteString :: not BS", { bs });

        const i = idx < _0n ? _0n : idx;

        const endIdx = i + length;
        const maxIdx = BigInt( _bs.toBuffer().length );

        const j = endIdx > maxIdx ? maxIdx : endIdx;

        if( j < i ) return CEKConst.byteString( new ByteString( Uint8Array.from([]) ) );


        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sliceByteString );
                
        const sidx = intToSize( idx );
        const slength = intToSize( length );
        const sbs = bsToSize( _bs );
        
        this.machineBudget.add({
            mem: f.mem.at( sidx, slength, sbs ),
            cpu: f.cpu.at( sidx, slength, sbs )
        });

        return CEKConst.byteString(
            new ByteString(
                Uint8Array.from(
                    _bs.toBuffer().slice(
                        Number( i ), Number( j )
                    )
                )
            )
        );
    }
    lengthOfByteString( bs: CEKValue ): ConstOrErr
    {
        const _bs = getBS( bs );
        if( _bs === undefined ) return new CEKError("lengthOfByteString :: not BS", { bs });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lengthOfByteString );
                
        const sbs = bsToSize( _bs );
        
        this.machineBudget.add({
            mem: f.mem.at( sbs ),
            cpu: f.cpu.at( sbs )
        });

        return CEKConst.int( _bs.toBuffer().length );
    }
    indexByteString( bs: CEKValue, idx: CEKValue ): ConstOrErr
    {
        const _bs = getBS( bs );
        if( _bs === undefined ) return new CEKError("indexByteString :: not BS", { bs });
        
        const i = getInt( idx );
        if( i === undefined || i >= _bs.toBuffer().length || i < _0n ) return new CEKError("indexByteString :: not int", { idx });

        if( i >= BigInt("9223372036854775808") )
        return new CEKError("indexByteString :: (maxBound :: Int64) overflow")

        const result = _bs.toBuffer().at( Number( i ) );
        if( result === undefined ) return new CEKError(
            "indexByteString :: out of bytestring length",
            { bs_length: _bs.toBuffer().length, index: i }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.indexByteString );
                
        const sbs = bsToSize( _bs );
        const sidx = intToSize( i );
        
        this.machineBudget.add({
            mem: f.mem.at( sbs, sidx ),
            cpu: f.cpu.at( sbs, sidx )
        });

        return CEKConst.int( result );
    }
    equalsByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBS( a );
        if( _a === undefined )
        return new CEKError(
            "equalsByteString :: first argument not BS",
            {
                bs_0: a,
                bs_1: b 
            }
        );
        
        const _b = getBS( b );
        if( _b === undefined )
        return new CEKError(
            "equalsByteString :: second argument not BS",
            {
                bs_0: a,
                bs_1: b 
            }
        )

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.equalsByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( _a.toString() === _b.toString() );
    }
    lessThanByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBS( a );
        if( _a === undefined ) return new CEKError(
            "lessThanByteString :: not BS",
            { a }
        );
        
        const _b = getBS( b );
        if( _b === undefined ) return new CEKError(
            "lessThanByteString :: not BS",
            { b }
        );

        const aBytes = _a.toBuffer();
        const bBytes = _b.toBuffer();

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        if( aBytes.length < bBytes.length ) return CEKConst.bool( true );

        // aBytes.length is either greather or equal bBytes.length
        for(let i = 0; i < aBytes.length; i++)
        {
            const aByte = aBytes.at(i) ?? Infinity;
            const bByte = bBytes.at(i);
            if( bByte === undefined ) return CEKConst.bool( false );

            if( aByte < bByte ) return CEKConst.bool( true );
            if( aByte > bByte ) return CEKConst.bool( false );
        }
        return CEKConst.bool( false );
    }
    lessThanEqualsByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBS( a );
        if( _a === undefined ) return new CEKError(
            "lessThanEqualsByteString :: not BS",
            { a }
        );
        
        const _b = getBS( b );
        if( _b === undefined ) return new CEKError(
            "lessThanEqualsByteString :: not BS",
            { b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanEqualsByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        if( _a.toString() === _b.toString() ) return CEKConst.bool( true );

        // lessThanBytestring but with new environment for costs;
        return (new BnCEK(this.getBuiltinCostFunc,new ExBudget(0,0), [])).lessThanByteString( a, b );
    }

    sha2_256( stuff: CEKValue ): ConstOrErr
    {
        const b = getBS( stuff );
        if( b === undefined ) return new CEKError(
            "sha2_256 :: not BS",
            { stuff }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sha2_256 );
        const sb = bsToSize( b );
        this.machineBudget.add({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return CEKConst.byteString(
            new ByteString(
                new Uint8Array(
                    sha2_256( b.toBuffer() )
                )
            )
        );
    }

    sha3_256( stuff: CEKValue ): ConstOrErr
    {
        const b = getBS( stuff );
        if( b === undefined ) return new CEKError(
            "sha3_256 :: not BS",
            stuff
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sha3_256 );

        const sb = bsToSize( b );

        this.machineBudget.add({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return CEKConst.byteString(
            new ByteString(
                new Uint8Array(
                    sha3( b.toBuffer() )
                )
            )
        );
    }

    blake2b_256( stuff: CEKValue ): ConstOrErr
    {
        const b = getBS( stuff );
        if( b === undefined ) return new CEKError(
            "blake2b_256 :: not BS",
            { stuff }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.blake2b_256 );

        const sb = bsToSize( b );

        this.machineBudget.add({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return constOrErr(() => CEKConst.byteString(
            new ByteString(
                blake2b( b.toBuffer(), 32 )
            )
        ));
    }

    verifyEd25519Signature( key: CEKValue, message: CEKValue, signature: CEKValue ): ConstOrErr
    {
        const k = getBS( key );
        if( k === undefined ) return new CEKError(
            "verifyEd25519Signature :: key not BS",
            { key }
        );
        
        const kBytes = k.toBuffer();
        if( kBytes.length !== 32 ) return new CEKError(
            "sha2_verifyEd25519Signature256 :: wrong message length",
            {
                kBytes,
                kStr: k.toString()
            }
        );

        const m = getBS( message );
        if( m === undefined ) return new CEKError(
            "verifyEd25519Signature :: message not BS",
            { message }
        );

        const s = getBS( signature );
        if( s === undefined ) return new CEKError(
            "verifyEd25519Signature :: singature not BS",
            { signature }
        );
        const sBytes = s.toBuffer();
        if( sBytes.length !== 64 ) return new CEKError(
            "sha2_verifyEd25519Signature256 :: wrong signature length",
            {
                signature_length: sBytes.length,
                signatureHex: s.toString(),
                signatureBytes: sBytes
            }
        );


        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.verifyEd25519Signature );

        const sk = bsToSize( kBytes );
        const sm = bsToSize( m );
        const ss = bsToSize( sBytes );

        this.machineBudget.add({
            mem: f.mem.at( sk, sm, ss ),
            cpu: f.cpu.at( sk, sm, ss )
        });

        return constOrErr(() => CEKConst.bool( verifyEd25519Signature( sBytes, m.toBuffer(), kBytes ) ));
    }

    appendString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getStr( a );
        if( _a === undefined ) return new CEKError(
            "appendString :: not Str",
            { a }
        );
        
        const _b = getStr( b );
        if( _b === undefined ) return new CEKError(
            "appendString :: not Str",
            { b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.appendString );

        const sa = strToSize( _a );
        const sb = strToSize( _b );

        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.str( _a + _b )
    }
    equalsString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getStr( a );
        if( _a === undefined ) return new CEKError(
            "equalsString :: not Str",
            { a }
        );
        
        const _b = getStr( b );
        if( _b === undefined ) return new CEKError(
            "equalsString :: not Str",
            {
                b
            }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.equalsString );

        const sa = strToSize( _a );
        const sb = strToSize( _b );

        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( _a === _b )
    }
    encodeUtf8( a: CEKValue ): ConstOrErr
    {
        const _a = getStr( a );
        if( _a === undefined ) return new CEKError(
            "encodeUtf8 :: not Str",
            { a }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.encodeUtf8 );

        const sa = strToSize( _a );

        this.machineBudget.add({
            mem: f.mem.at( sa ),
            cpu: f.cpu.at( sa )
        });

        return CEKConst.byteString( new ByteString( fromUtf8( _a ) ) );
    }
    decodeUtf8( a: CEKValue ): ConstOrErr
    {
        const _a = getBS( a );
        if( _a === undefined ) 
        return new CEKError(
            "decodeUtf8 :: not BS",
            { arg: a }
        );

        const _a_buff = _a.toBuffer();
        
        if( !isValidUtf8( _a_buff ) )
        return new CEKError("decodeUtf8 :: invalid utf8", { hex: toHex( _a_buff ) });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.decodeUtf8 );

        const sa = bsToSize( _a_buff );

        this.machineBudget.add({
            mem: f.mem.at( sa ),
            cpu: f.cpu.at( sa )
        });

        return CEKConst.str( toUtf8( _a_buff ) );
    }
    ifThenElse( condition: CEKValue, caseTrue: ConstOrErr, caseFalse: ConstOrErr ): ConstOrErr
    {
        if(! isConstOfType( condition, constT.bool ) ) return new CEKError(
            "ifThenElse :: condition was not a boolean",
            { condition }
        );
        
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.ifThenElse );

        this.machineBudget.add({
            mem: f.mem.at( BOOL_SIZE, ANY_SIZE, ANY_SIZE ),
            cpu: f.cpu.at( BOOL_SIZE, ANY_SIZE, ANY_SIZE ),
        });

        return condition.value ? caseTrue : caseFalse;
    }

    chooseUnit( unit: CEKValue, b: CEKValue ): CEKValue
    {
        if( !isConstOfType( unit, constT.unit ) ) return new CEKError(
            "chooseUnit :: not a unit",
            { unit }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.chooseUnit );

        this.machineBudget.add({
            mem: f.mem.at( ANY_SIZE, ANY_SIZE ),
            cpu: f.cpu.at( ANY_SIZE, ANY_SIZE )
        });

        return b;
    }

    trace( msg: CEKValue, result: CEKValue ): CEKValue
    {
        const _msg = getStr( msg );
        
        this.logs.push(_msg ?? "_msg_not_a_string_");
        
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.trace );

        const smsg = _msg ? strToSize( _msg ) : BigInt(0) ;

        this.machineBudget.add({
            mem: f.mem.at( smsg, ANY_SIZE ),
            cpu: f.cpu.at( smsg, ANY_SIZE )
        });

        return result;
    }
    fstPair( pair: CEKValue ): ConstOrErr
    {
        const p = getPair( pair );
        if( p === undefined ) return new CEKError(
            "fstPair :: not a pair",
            { pair }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.fstPair );

        const sp = pairToSize( p );

        this.machineBudget.add({
            mem: f.mem.at( sp ),
            cpu: f.cpu.at( sp )
        });

        return new CEKConst(
            constPairTypeUtils.getFirstTypeArgument( (pair as CEKConst).type ),
            p.fst as any
        );
    }
    sndPair( pair: CEKValue ): ConstOrErr
    {
        const p = getPair( pair );
        if( p === undefined ) return new CEKError(
            "sndPair :: not a pair",
            { pair }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sndPair );

        const sp = pairToSize( p );

        this.machineBudget.add({
            mem: f.mem.at( sp ),
            cpu: f.cpu.at( sp )
        });

        return new CEKConst(
            constPairTypeUtils.getSecondTypeArgument( (pair as CEKConst).type ),
            p.snd as any
        );
    }
    chooseList( list: CEKValue, whateverA: CEKValue, whateverB: CEKValue ): CEKValue 
    {
        const l = getList( list );
        if( l === undefined ) return new CEKError(
            "chooseList :: not a list",
            { list }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.chooseList );

        const sl = listToSize( l );

        this.machineBudget.add({
            mem: f.mem.at( sl, ANY_SIZE, ANY_SIZE ),
            cpu: f.cpu.at( sl, ANY_SIZE, ANY_SIZE )
        })

        return l.length === 0 ? whateverA : whateverB;
    }
    mkCons( elem: CEKValue, list: CEKValue )
    {
        if(!(
            elem instanceof CEKConst &&
            list instanceof CEKConst &&
            list.type[0] === ConstTyTag.list &&
            constTypeEq( elem.type, constListTypeUtils.getTypeArgument( list.type as any ) )
        )) return new CEKError(
            "mkCons :: incongruent list types; listT: " +
            (list instanceof CEKConst ? constTypeToStirng( list.type ) : "" ) +
            "; elemsT: " +
            (elem instanceof CEKConst ? constTypeToStirng( elem.type ) : "" ),
            {
                list,
                elem
            }
        );

        const l = getList( list );
        if( l === undefined ) return new CEKError(
            "mkCons :: not a list",
            { list }
        );

        const value = elem.value;

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.mkCons );

        const sl = listToSize( l );
        const sv = constValueToSize( value );

        this.machineBudget.add({
            mem: f.mem.at( sv, sl ),
            cpu: f.cpu.at( sv, sl )
        });

        return new CEKConst(
            list.type,
            [ value, ...l ] as any
        );
    }
    headList( list: CEKValue ): ConstOrErr 
    {
        const l = getList( list );
        if( l === undefined || l.length === 0 ) return new CEKError(
            l === undefined ? 
            "headList :: not a list" : 
            "headList :: empty list passed to 'head'",
            { list }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.headList );

        const sl = listToSize( l );

        this.machineBudget.add({
            mem: f.mem.at( sl ),
            cpu: f.cpu.at( sl )
        });

        return new CEKConst(
            constListTypeUtils.getTypeArgument( (list as CEKConst).type as any ),
            l[0] as any
        );
    }
    tailList( list: CEKValue ): ConstOrErr 
    {
        const l = getList( list );
        if( l === undefined || l.length === 0 )
        return new CEKError(
            l === undefined ? 
            "tailList :: not a list" : 
            "tailList :: empty list passed to 'tail'",
            { list }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.tailList );

        const sl = listToSize( l );

        this.machineBudget.add({
            mem: f.mem.at( sl ),
            cpu: f.cpu.at( sl )
        });

        return new CEKConst(
            (list as CEKConst).type,
            l.slice(1) as any
        );
    }
    nullList( list: CEKValue ): ConstOrErr 
    {
        const l = getList( list );
        if( l === undefined ) 
        return new CEKError(
            "nullList :: not a list",
            { arg: list }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.nullList );

        const sl = listToSize( l );

        this.machineBudget.add({
            mem: f.mem.at( sl ),
            cpu: f.cpu.at( sl )
        });

        return CEKConst.bool( l.length === 0 )
    }
    chooseData( data: CEKValue, constr: CEKValue, map: CEKValue, list: CEKValue, int: CEKValue, bs: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError(
            "chooseData :: not data",
            { data }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.chooseData );

        const sd = dataToSize( d );

        this.machineBudget.add({
            mem: f.mem.at( sd ),
            cpu: f.cpu.at( sd )
        });

        if( d instanceof DataConstr ) return constr;
        if( d instanceof DataMap ) return map;
        if( d instanceof DataList ) return list;
        if( d instanceof DataI ) return int;
        if( d instanceof DataB ) return bs;

        return new CEKError(
            "unrecognized data, possibly DataPair",
            { data, d }
        );
    }
    constrData( idx: CEKValue, fields: CEKValue ): ConstOrErr
    {
        const i = getInt( idx );
        if( i === undefined ) return new CEKError(
            "constrData :: not int",
            { idx }
        );

        const _fields: Data[] | undefined = getList( fields ) as any;
        if( _fields === undefined ) return new CEKError(
            "constrData :: not a list",
            { fields }
        );

        if( !constTypeEq( (fields as any).type, constT.listOf( constT.data ) ) )
        return new CEKError(
            "constrData :: passed fields are not a list of Data",
            { fields, type: (fields as any)?.type }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.constrData );

        const si = intToSize( i );
        const sfields = _fields.reduce( (acc, elem) => acc + dataToSize( elem ), _0n );

        this.machineBudget.add({
            mem: f.mem.at( si, sfields ),
            cpu: f.cpu.at( si, sfields ),
        });

        // assert we got a list of data
        // ( the type has been forced but not the value )
        if( !_fields.every( field => isData( field ) ) ) return new CEKError(
            "constrData :: some of the fields are not Data, mismatching CEKConst type",
            { _fields }
        );

        return CEKConst.data(
            new DataConstr( i, _fields )
        );
    }
    mapData( listOfPair: CEKValue ): ConstOrErr
    {
        if(!(
            listOfPair instanceof CEKConst &&
            constTypeEq(
                listOfPair.type,
                constT.listOf(
                    constT.pairOf(
                        constT.data,
                        constT.data
                    )
                )
            )
        )) return new CEKError(
            "mapData :: not a map",
            { listOfPair }
        );

        const list: Pair<Data,Data>[] | undefined = getList( listOfPair ) as any ;
        if( list === undefined ) return new CEKError(
            "mapData :: not a list",
            { listOfPair }
        );

        // assert we got a list of pair of datas
        // ( the type has been forced but not the value )
        if(
            !list.every( pair =>
                Pair.isStrictInstance( pair ) &&
                isData( pair.fst ) &&
                isData( pair.snd ) 
            )
        ) return new CEKError(
            "some elements are not a pair, mismatching const type",
            { listOfPair, list}
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.mapData );

        const size = listToSize( list );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.data(
            new DataMap(
                list.map( pair => new DataPair( pair.fst, pair.snd ) )
            )
        );
    }
    listData( listOfData: CEKValue ): ConstOrErr
    {
        if(!(
            listOfData instanceof CEKConst &&
            constTypeEq(
                listOfData.type,
                constT.listOf(
                    constT.data
                )
            )
        ))
        return new CEKError(
            "listData :: not a list of data",
            { listOfData }
        );

        const list: Data[] | undefined = getList( listOfData ) as any ;
        if( list === undefined ) return new CEKError(
            "listData :: not a list",
            { listOfData }
        );

        // assert we got a list of data
        // ( the type has been forced but not the value )
        if( !list.every( data => isData( data ) ) ) return new CEKError(
            "some of the elements are not data, mismatching const type",
            { listOfData }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.listData );

        const size = listToSize( list );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.data(
            new DataList( list )
        );
    }
    iData( int: CEKValue ): ConstOrErr
    {
        const i = getInt( int );
        if( i === undefined )
        return new CEKError(
            "iData :: not an int",
            {
                arg: int,
                type: (int as any).type,
            }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.iData );

        const size = intToSize( i );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.data( new DataI( i ) );
    }
    bData( bs: CEKValue ): ConstOrErr
    {
        const b = getBS( bs );
        if( b === undefined )
        return new CEKError(
            "bData :: not BS",
            {
                arg: bs,
                type: (bs as any).type,
                value: (bs as any).value
            }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bData );

        const size = bsToSize( b );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.data( new DataB( b ) );
    }
    unConstrData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError(
            `unConstrData :: not data; ${ data instanceof CEKConst ? "CEKConst type: " + constTypeToStirng(data.type) :""}`,
            { data }
        );

        if( !( d instanceof DataConstr ) )
        return new CEKError(
            "unConstrData :: not a data constructor",
            {
                data: dataToCbor( d ).toString()
            }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unConstrData );

        const size = dataToSize( d );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.pairOf( constT.int, constT.listOf( constT.data ) )(
            d.constr,
            d.fields
        );
    }
    unMapData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError(
            "unMapData :: not data",
            { data }
        );

        if( !( d instanceof DataMap ) ) return new CEKError(
            "unMapData :: not a data map",
            { data }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unMapData );

        const size = dataToSize( d );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.listOf( constT.pairOf( constT.data, constT.data ) )(
            d.map.map( dataPair => new Pair<Data,Data>( dataPair.fst, dataPair.snd ) )
        );
    }
    unListData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError("unListData :: not data",{ data });

        if( !( d instanceof DataList ) ) return new CEKError("unListData :: not a data list", { data: d } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unListData );

        const size = dataToSize( d );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.listOf( constT.data )(
            d.list
        );
    }
    unIData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined )
            return new CEKError(
                "unIData :: not data value",
                { data }
            );

        if( !( d instanceof DataI ) ) return new CEKError(
            "unIData :: not a data integer",
            { data: d }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unIData );

        const size = dataToSize( d );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.int( d.int );
    }
    unBData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined )
            return new CEKError(
                "unBData :: not data value",
                { data }
            );

        if( !( d instanceof DataB ) ) return new CEKError(
            "unBData :: not a data BS",
            {
                data: d, 
                term: ((data as CEKConst)?.value as DataConstr)?.constr
            }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unBData );

        const size = dataToSize( d );

        this.machineBudget.add({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.byteString( d.bytes );
    }
    equalsData( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getData( a );
        if( _a === undefined ) return new CEKError(
            "equalsData :: not data; equalsData <first argument>",
            { a }
        );
        const _b = getData( b );
        if( _b === undefined ) return new CEKError(
            "equalsData :: not data; equalsData <second argument>",
            { b }
        );
        
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.equalsData );

        const sa = dataToSize( _a );
        const sb = dataToSize( _b );

        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( eqData( _a, _b ) );
    }
    mkPairData( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getData( a );
        if( _a === undefined ) return new CEKError(
            "mkPairData :: not data; mkPairData <frist argument>",
            { a }
        );
        const _b = getData( b );
        if( _b === undefined ) return new CEKError(
            "mkPairData :: not data; mkPairData <second argument>",
            { b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.mkPairData );
        const sa = dataToSize( _a );
        const sb = dataToSize( _b );
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });
        
        return CEKConst.pairOf( constT.data, constT.data )( _a, _b );
    }
    mkNilData( unit: CEKValue ): ConstOrErr
    {
        if( !isConstOfType( unit, constT.unit ) ) return new CEKError(
            "mkNilData :: not unit",
            { unit }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.mkNilData );

        this.machineBudget.add({
            mem: f.mem.at( ANY_SIZE ),
            cpu: f.cpu.at( ANY_SIZE )
        });

        return CEKConst.listOf( constT.data )([]);
    }
    mkNilPairData( unit: CEKValue ): ConstOrErr
    {
        if( !isConstOfType( unit, constT.unit ) ) return new CEKError(
            "mkNilPairData :: not unit",
            { unit }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.mkNilPairData );

        this.machineBudget.add({
            mem: f.mem.at( ANY_SIZE ),
            cpu: f.cpu.at( ANY_SIZE )
        });

        return CEKConst.listOf( constT.pairOf( constT.data, constT.data ) )([]);
    }

    serialiseData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError(
            "serialiseData :: not data input",
            { data }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.serialiseData );
        const sData = dataToSize( d );
        this.machineBudget.add({
            mem: f.mem.at( sData ),
            cpu: f.cpu.at( sData )
        });

        return CEKConst.byteString( new ByteString( dataToCbor( d ).toBuffer() ) );
    } 
    verifyEcdsaSecp256k1Signature( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const pubKey = getBS( a );
        const messageHash = getBS( b );
        const signature = getBS( c );
        if(
            pubKey === undefined ||
            messageHash === undefined ||
            signature === undefined
        ) return new CEKError(
            "verifyEcdsaSecp256k1Signature:: some argument was not byetstring",
            { a, b, c }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.verifyEcdsaSecp256k1Signature );
        const sa = bsToSize( pubKey );
        const sb = bsToSize( messageHash );
        const sc = bsToSize( signature );
        this.machineBudget.add({
            mem: f.mem.at( sa, sb, sc ),
            cpu: f.cpu.at( sa, sb, sc )
        });

        return constOrErr(() =>
            CEKConst.bool(
                verifyEcdsaSecp256k1Signature(
                    pubKey.toBuffer(),
                    messageHash.toBuffer(),
                    signature.toBuffer()
                )
            )
        );
    }
    verifySchnorrSecp256k1Signature( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const pubKey = getBS( a );
        const messageHash = getBS( b );
        const signature = getBS( c );
        if(
            pubKey === undefined ||
            messageHash === undefined ||
            signature === undefined
        ) return new CEKError(
            "verifySchnorrSecp256k1Signature:: some argument was not byetstring",
            { a, b, c }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.verifySchnorrSecp256k1Signature );
        const sa = bsToSize( pubKey );
        const sb = bsToSize( messageHash );
        const sc = bsToSize( signature );
        this.machineBudget.add({
            mem: f.mem.at( sa, sb, sc ),
            cpu: f.cpu.at( sa, sb, sc )
        });

        return constOrErr(() =>
            CEKConst.bool(
                verifySchnorrSecp256k1Signature(
                    pubKey.toBuffer(),
                    messageHash.toBuffer(),
                    signature.toBuffer()
                )
            )
        );
    }

    bls12_381_G1_add( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBlsG1( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G1_add :: first argument not BlsG1 elem",
            { a, b }
        );
        const snd = getBlsG1( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G1_add :: second argument not BlsG1 elem",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_add );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G1_SIZE, BLS_G1_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE, BLS_G1_SIZE )
        });
        return constOrErr(() => CEKConst.bls12_381_G1_element( bls12_381_G1_add( fst, snd ) ));
    }
    bls12_381_G1_neg( a: CEKValue ): ConstOrErr
    {
        const g1 = getBlsG1( a );
        if( g1 === undefined ) return new CEKError(
            "bls12_381_G1_neg :: first argument not BlsG1 elem",
            { a }
        );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_neg );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G1_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE )
        });
        
        return constOrErr(() => CEKConst.bls12_381_G1_element( bls12_381_G1_neg( g1 ) ));
    }
    bls12_381_G1_scalarMul( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const n = getInt( a );
        if( n === undefined ) return new CEKError(
            "bls12_381_G1_scalarMul :: first argument not integer",
            { a, b }
        );
        const g1 = getBlsG1( b );
        if( g1 === undefined ) return new CEKError(
            "bls12_381_G1_scalarMul :: second argument not BlsG1 elem",
            { n, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_scalarMul );
        const nSize = intToSize( n );
        this.machineBudget.add({
            mem: f.mem.at( nSize, BLS_G1_SIZE ),
            cpu: f.cpu.at( nSize, BLS_G1_SIZE )
        });

        return constOrErr(() => CEKConst.bls12_381_G1_element( bls12_381_G1_scalarMul( n, g1 ) ));
    }
    bls12_381_G1_equal( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBlsG1( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G1_equal :: first argument not BlsG1 elem",
            { a, b }
        );
        const snd = getBlsG1( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G1_equal :: second argument not BlsG1 elem",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_equal );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G1_SIZE, BLS_G1_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE, BLS_G1_SIZE )
        });
        
        return constOrErr(() => CEKConst.bool( bls12_381_G1_equal( fst, snd ) ));
    }
    bls12_381_G1_hashToGroup( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBS( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G1_hashToGroup :: first argument not bytestring",
            { a, b }
        );
        const snd = getBS( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G1_hashToGroup :: second argument not bytestring",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_hashToGroup );
        const sa = bsToSize( fst );
        const sb = bsToSize( snd );
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return constOrErr(() => CEKConst.bls12_381_G1_element( bls12_381_G1_hashToGroup( fst.toBuffer(), snd.toBuffer() ) ));
    }
    bls12_381_G1_compress( a: CEKValue ): ConstOrErr
    {
        const g1 = getBlsG1( a );
        if( g1 === undefined ) return new CEKError(
            "bls12_381_G1_compress :: first argument not BlsG1 elem",
            { a }
        );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_compress );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G1_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE )
        });
        
        return constOrErr(() => CEKConst.byteString( new ByteString( bls12_381_G1_compress( g1 ) ) ));
    }
    bls12_381_G1_uncompress( a: CEKValue ): ConstOrErr
    {
        const bs = getBS( a );
        if( bs === undefined ) return new CEKError(
            "bls12_381_G1_uncompress :: first argument not bs",
            { a }
        );

        const bytes = bs.toBuffer();
        if( bytes.length !== Number( BLS_G1_SIZE ) )
        {
            return new CEKError(
                "bls12_381_G1_uncompress :: invalid bytes length",
                { bytes: toHex( bytes ) }
            );    
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_uncompress );
        const bsSize = bsToSize( bs );
        this.machineBudget.add({
            mem: f.mem.at( bsSize ),
            cpu: f.cpu.at( bsSize )
        });
        
        return constOrErr(() => CEKConst.bls12_381_G1_element( bls12_381_G1_uncompress( bytes ) ));
    }

    bls12_381_G2_add( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBlsG2( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G2_add :: first argument not BlsG2 elem",
            { a, b }
        );
        const snd = getBlsG2( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G2_add :: second argument not BlsG2 elem",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_add );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G2_SIZE, BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G2_SIZE, BLS_G2_SIZE )
        });
        return constOrErr(() => CEKConst.bls12_381_G2_element( bls12_381_G2_add( fst, snd ) ));
    }
    bls12_381_G2_neg( a: CEKValue ): ConstOrErr
    {
        const G2 = getBlsG2( a );
        if( G2 === undefined ) return new CEKError(
            "bls12_381_G2_neg :: first argument not BlsG2 elem",
            { a }
        );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_neg );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G2_SIZE )
        });
        
        return constOrErr(() => CEKConst.bls12_381_G2_element( bls12_381_G2_neg( G2 ) ));
    }
    bls12_381_G2_scalarMul( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const n = getInt( a );
        if( n === undefined ) return new CEKError(
            "bls12_381_G2_scalarMul :: first argument not integer",
            { a, b }
        );
        const G2 = getBlsG2( b );
        if( G2 === undefined ) return new CEKError(
            "bls12_381_G2_scalarMul :: second argument not BlsG2 elem",
            { n, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_scalarMul );
        const nSize = intToSize( n );
        this.machineBudget.add({
            mem: f.mem.at( nSize, BLS_G2_SIZE ),
            cpu: f.cpu.at( nSize, BLS_G2_SIZE )
        });

        return constOrErr(() => CEKConst.bls12_381_G2_element( bls12_381_G2_scalarMul( n, G2 ) ));
    }
    bls12_381_G2_equal( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBlsG2( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G2_equal :: first argument not BlsG2 elem",
            { a, b }
        );
        const snd = getBlsG2( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G2_equal :: second argument not BlsG2 elem",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_equal );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G2_SIZE, BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G2_SIZE, BLS_G2_SIZE )
        });
        
        return constOrErr(() => CEKConst.bool( bls12_381_G2_equal( fst, snd ) ));
    }
    bls12_381_G2_hashToGroup( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBS( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G2_hashToGroup :: first argument not bytestring",
            { a, b }
        );
        const snd = getBS( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G2_hashToGroup :: second argument not bytestring",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_hashToGroup );
        const sa = bsToSize( fst );
        const sb = bsToSize( snd );
        this.machineBudget.add({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return constOrErr(() => 
            CEKConst.bls12_381_G2_element( bls12_381_G2_hashToGroup( fst.toBuffer(), snd.toBuffer() ) )
        );
    }
    bls12_381_G2_compress( a: CEKValue ): ConstOrErr
    {
        const G2 = getBlsG2( a );
        if( G2 === undefined ) return new CEKError(
            "bls12_381_G2_compress :: first argument not BlsG2 elem",
            { a }
        );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_compress );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G2_SIZE )
        });
        
        return constOrErr(() => 
            CEKConst.byteString( new ByteString( bls12_381_G2_compress( G2 ) ) )
        );
    }
    bls12_381_G2_uncompress( a: CEKValue ): ConstOrErr
    {
        const bs = getBS( a );
        if( bs === undefined ) return new CEKError(
            "bls12_381_G2_uncompress :: first argument not bs",
            { a }
        );

        const bytes = bs.toBuffer();
        if( bytes.length !== Number( BLS_G2_SIZE ) )
        {
            return new CEKError(
                "bls12_381_G2_uncompress :: invalid bytes length",
                { bytes: toHex( bytes ) }
            );    
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_uncompress );
        const bsSize = bsToSize( bs );
        this.machineBudget.add({
            mem: f.mem.at( bsSize ),
            cpu: f.cpu.at( bsSize )
        });
        
        return constOrErr(() => 
            CEKConst.bls12_381_G2_element( bls12_381_G2_uncompress( bytes ) )
        ); 
    }
    bls12_381_millerLoop( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const g1 = getBlsG1( a );
        if(g1 === undefined) return new CEKError(
            "bls12_381_millerLoop :: first argument not G1 element",
            { a, b }
        );
        const g2 = getBlsG2( b );
        if(g2 === undefined) return new CEKError(
            "bls12_381_millerLoop :: second argument not G2 element",
            { g1, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_millerLoop );
        this.machineBudget.add({
            mem: f.mem.at( BLS_G1_SIZE, BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE, BLS_G2_SIZE )
        });

        return constOrErr(() =>
            CEKConst.bls12_381_MlResult( bls12_381_millerLoop( g1, g2 ) )
        );
    }
    bls12_381_mulMlResult( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const res1 = getBlsResult( a );
        if( res1 === undefined ) return new CEKError(
            "bls12_381_mulMlResult :: first argument not Bls result",
            { a, b }
        );
        const res2 = getBlsResult( b );
        if( res2 === undefined ) return new CEKError(
            "bls12_381_mulMlResult :: second argument not Bls result",
            { res1, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_mulMlResult );
        this.machineBudget.add({
            mem: f.mem.at( BLS_ML_RESULT_SIZE, BLS_ML_RESULT_SIZE ),
            cpu: f.cpu.at( BLS_ML_RESULT_SIZE, BLS_ML_RESULT_SIZE )
        });

        return constOrErr(() =>
            CEKConst.bls12_381_MlResult( bls12_381_mulMlResult( res1, res2 ) ) 
        );
    }
    bls12_381_finalVerify( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const res1 = getBlsResult( a );
        if( res1 === undefined ) return new CEKError(
            "bls12_381_finalVerify :: first argument not Bls result",
            { a, b }
        );
        const res2 = getBlsResult( b );
        if( res2 === undefined ) return new CEKError(
            "bls12_381_finalVerify :: second argument not Bls result",
            { res1, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_finalVerify );
        this.machineBudget.add({
            mem: f.mem.at( BLS_ML_RESULT_SIZE, BLS_ML_RESULT_SIZE ),
            cpu: f.cpu.at( BLS_ML_RESULT_SIZE, BLS_ML_RESULT_SIZE )
        });

        return constOrErr(() =>
            CEKConst.bool( bls12_381_finalVerify( res1, res2 ) ) 
        );
    }
    keccak_256( a: CEKValue ): ConstOrErr
    {
        const b = getBS( a );
        if( b === undefined ) return new CEKError(
            "keccak_256 :: not BS",
            { b, a }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.keccak_256 );
        const sb = bsToSize( b );
        this.machineBudget.add({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return constOrErr(() => CEKConst.byteString(
            new ByteString( keccak_256( b.toBuffer() ) )
        ));
    }
    blake2b_224( a: CEKValue ): ConstOrErr
    {
        const b = getBS( a );
        if( b === undefined ) return new CEKError(
            "blake2b_224 :: not BS",
            { b, a }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.blake2b_224 );
        const sb = bsToSize( b );
        this.machineBudget.add({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return constOrErr(() => CEKConst.byteString(
            new ByteString( blake2b_224( b.toBuffer() ) )
        ));
    }
    integerToByteString( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const bigEndian = getBool( a );
        if( bigEndian === undefined ) return new CEKError(
            "integerToByteString :: first arg not boolean", 
            { a, b, c }
        );
        const size = getInt( b );
        if( size === undefined ) return new CEKError(
            "integerToByteString :: second arg not integer", 
            { bigEndian, b, c }
        );
        const integer = getInt( c );
        if( integer === undefined ) return new CEKError(
            "integerToByteString :: third arg not integer", 
            { bigEndian, size, c }
        );

        return integerToByteString( bigEndian, size, integer );
    }
    byteStringToInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const bigEndian = getBool( a );
        if( bigEndian === undefined ) return new CEKError(
            "byteStringToInteger :: first arg not boolean", 
            { a, b }
        );
        const bs = getBS( b );
        if( bs === undefined ) return new CEKError(
            "integerToByteString :: second arg not bs", 
            { bigEndian, b }
        );
        
        return bytestringToInteger( bigEndian, bs );
    }
}

const INTEGER_TO_BYTE_STRING_MAXIMUM_OUTPUT_LENGTH = BigInt( 8192 );

const _0n = BigInt( 0 );
const _8n = BigInt( 8 );
const _1n = BigInt( 1 );

function integerToByteString(
    bigEndian: boolean,
    size: bigint,
    integer: bigint
): ConstOrErr
{
    if( size < 0 ) return new CEKError("integerToByteString :: size must be positive");
    
    if( size > INTEGER_TO_BYTE_STRING_MAXIMUM_OUTPUT_LENGTH )
    return new CEKError(
        "integerToByteString :: size must NOT exceed " + 
        INTEGER_TO_BYTE_STRING_MAXIMUM_OUTPUT_LENGTH + 
        "; received " + size,
        { bigEndian, size, integer }
    );
    
    if(
        size === _0n && 
        ilog2( integer ) > (_8n * INTEGER_TO_BYTE_STRING_MAXIMUM_OUTPUT_LENGTH)
    )
    return new CEKError(
        "integerToByteString :: required minimum size for integer is " +
        (ilog2( integer ) / _8n + _1n) +
        "; while max possible size is " +
        INTEGER_TO_BYTE_STRING_MAXIMUM_OUTPUT_LENGTH,
        { bigEndian, size, integer }
    );

    if( integer < _0n )
    return new CEKError(
        "integerToByteString :: only positive integers accepted",
        { bigEndian, size, integer }
    );

    const nsize = Number( size );

    if( integer === _0n )
    return CEKConst.byteString(
        new ByteString(
            new Uint8Array( nsize )
        )
    );
    
    let bytes = new ByteString(
        integer.toString(16)
        // already pad to size
        // if integer is already bigger (or equal) than size this has no effect
        .padStart( nsize * 2, "0")
    );
    const bytesLen = bytes.toBuffer().length;
    bytes = bigEndian ? bytes : new ByteString( bytes.toBuffer().reverse() );

    if( nsize !== 0 && bytesLen > nsize )
    return new CEKError(
        "integerToByteString :: integer requires more bytes than specified; required: " + bytesLen,
        { bigEndian, size, integer }
    );

    if( bytesLen > 8192 )
    return new CEKError(
        "integerToByteString ::input integer too big, max allowed byte size is 8192",
        { bigEndian, size, integer }
    );

    return CEKConst.byteString(bytes);
}
function ilog2( i: bigint ): bigint
{
    return BigInt(i.toString(2).length - 1)
}

function bytestringToInteger(
    bigEndian: boolean,
    bs: ByteString
): ConstOrErr
{
    let bytes = bs.toBuffer();
    bytes = bigEndian ? bytes : bytes.reverse();
    if( bytes.length === 0 ) return CEKConst.int( 0 );
    return CEKConst.int( BigInt( "0x" + toHex( bytes ) ) )
}

function isValidUtf8(bytes: Uint8Array)
{
    if( !(globalThis.TextDecoder) ) return true;
    let decoder = new TextDecoder("utf8", { fatal: true });
    try {
      decoder.decode(bytes);
    } catch {
      return false;
    }
    return true;
  }