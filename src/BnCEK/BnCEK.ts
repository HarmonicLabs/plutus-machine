import { log2 } from "@harmoniclabs/bigint-utils";

import { concatUint8Array, fromHex, fromUtf8, toHex, toUtf8 } from "@harmoniclabs/uint8array-utils";
import { isData, Data, DataConstr, DataMap, DataList, DataI, DataB, DataPair, dataToCbor, eqData } from "@harmoniclabs/plutus-data";
import { ConstValue, LedgerValue, Pair, isConstValueInt, UPLCTerm, ConstType, constTypeEq, constT, ConstTyTag, UPLCBuiltinTag, constPairTypeUtils, constListTypeUtils, constArrayTypeUtils, constTypeToStirng, isPair } from "@harmoniclabs/uplc";
import { BuiltinCostsOf } from "../Machine/BuiltinCosts/BuiltinCosts";
import { ExBudget } from "../Machine/ExBudget";
import { PartialBuiltin } from "./PartialBuiltin";
import { BlsG1, BlsG2, BlsResult, blake2b, blake2b_224, bls12_381_G1_add, bls12_381_G1_compress, bls12_381_G1_equal, bls12_381_G1_hashToGroup, bls12_381_G1_neg, bls12_381_G1_scalarMul, bls12_381_G1_uncompress, bls12_381_G2_add, bls12_381_G2_compress, bls12_381_G2_equal, bls12_381_G2_hashToGroup, bls12_381_G2_neg, bls12_381_G2_scalarMul, bls12_381_G2_uncompress, bls12_381_finalVerify, bls12_381_millerLoop, bls12_381_mulMlResult, isBlsG1, isBlsG2, isBlsResult, keccak_256, verifyEcdsaSecp256k1Signature, verifySchnorrSecp256k1Signature, ripemd160, sha2_256_sync, verifyEd25519Signature_sync } from "@harmoniclabs/crypto";
import { sha3_256 as noble_sha3_256 } from "@noble/hashes/sha3";
import { CEKError } from "../CEKValue/CEKError";
import { CEKConst } from "../CEKValue/CEKConst";
import { CEKValue } from "../CEKValue/CEKValue";
import { CEKValueTag } from "../_internal/CEKValueTag";
import { shiftU8Arr } from "./impl/shiftU8Arr";
import { rotateU8Arr } from "./impl/rotateU8Arr";
import { countSetBits } from "./impl/countSetBits";
import { findFirstSetBit } from "./impl/findFirstSetBit";
import { readBit } from "./impl/readBit";
import { writeBit } from "./impl/writeBit";
import { isObject } from "@harmoniclabs/obj-utils";
import { bls12_381 as noble_bls12_381 } from "@noble/curves/bls12-381";

function intToSize( n: bigint ): bigint
{
    n = BigInt( n );
    if ( n === _0n ) return BigInt( 1 );

    // same as `intToSize( -n - BigInt( 1 ) )` but inlined
    if( n  < _0n ) return ( log2( ( -n - BigInt( 1 ) ) << BigInt( 1 ) ) / BigInt( 8 )) + BigInt( 1 ) ;

    return ( log2( n << BigInt( 1 ) ) / BigInt( 8 )) + BigInt( 1 );
}

function bsToSize( bs: Uint8Array ): bigint
{
    const len = bs.length;
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
    if( v instanceof Uint8Array ) return bsToSize( v );
    if( typeof v === "string" ) return strToSize( v );
    if( typeof v === "undefined" ) return ANY_SIZE;
    if( typeof v === "boolean" ) return BOOL_SIZE;
    if( isData( v ) ) return dataToSize( v );

    if( Array.isArray( v ) ) return listToSize( v );

    if( isPair( v ) ) return pairToSize( v );

    console.warn("unexpected 'constValueToSize'; exec costs evaluation might be inaccurate");
    return ANY_SIZE;
}

function listToSize( l: ConstValue[] ): bigint
{
    return l.reduce<bigint>( (acc, elem) => acc + constValueToSize( elem ), BigInt(0) );
}

/** Total number of token entries across all policies in a LedgerValue */
function ledgerValueSizeExMem( v: LedgerValue ): bigint
{
    let size = 0;
    for( const entry of v ) size += entry.snd.length;
    return BigInt( size );
}

/**
 * Logarithmic depth metric for LedgerValue, used by insertCoin / lookupCoin cost models.
 * floor(log2(outerLen))+1 + floor(log2(maxInner))+1
 */
function ledgerValueMaxDepth( v: LedgerValue ): bigint
{
    const outerLen = v.length;
    let maxInner = 0;
    for( const entry of v )
        if( entry.snd.length > maxInner ) maxInner = entry.snd.length;
    const logOuter = outerLen > 0 ? Math.floor( Math.log2( outerLen ) ) + 1 : 0;
    const logInner = maxInner > 0 ? Math.floor( Math.log2( maxInner ) ) + 1 : 0;
    return BigInt( logOuter + logInner );
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


function isConstOfType( constant: CEKValue, ty: Readonly<ConstType> ): constant is CEKConst
{
    if(!(
        constant instanceof CEKConst &&
        constTypeEq( constant.type, ty )
    )) return false;

    const v = constant.value;
    const fstTag = ty[0];
    // if( constTypeEq( constT.int, ty ) )
    if( fstTag === ConstTyTag.int )
    {
        return isConstValueInt( v );
    }

    // if( constTypeEq( constT.bool, ty ) )
    if( fstTag === ConstTyTag.bool )
    {
        return typeof v === "boolean";
    }

    if( fstTag === ConstTyTag.byteStr )
    {
        return v instanceof Uint8Array;
    }

    // if( constTypeEq( constT.data, ty ) )
    if( fstTag === ConstTyTag.data )
    {
        return isData( v );
    }

    // if( constTypeEq( constT.str, ty ) )
    if( fstTag === ConstTyTag.str )
    {
        return typeof v === "string";
    }

    // if( constTypeEq( constT.unit, ty ) )
    if( fstTag === ConstTyTag.unit )
    {
        return v === undefined;
    }
    return false;
}

function getInt( a: CEKValue ): bigint | undefined
{
    if( a.tag !== CEKValueTag.Const ) return undefined;
    const c = a as CEKConst;
    if( c.typeTag !== ConstTyTag.int ) return undefined;
    return c.value as bigint;
}

function getIntNumFromConstValue( a: ConstValue ): number | undefined
{
    if( !isConstValueInt( a ) ) return undefined;
    const n = Number( a as any );
    if( !Number.isSafeInteger( n ) ) return undefined;
    return n;
}

function getInts( a: CEKValue, b: CEKValue ): ( { a: bigint,  b: bigint } | undefined )
{
    if( a.tag !== CEKValueTag.Const ) return undefined;
    const ca = a as CEKConst;
    if( ca.typeTag !== ConstTyTag.int ) return undefined;
    if( b.tag !== CEKValueTag.Const ) return undefined;
    const cb = b as CEKConst;
    if( cb.typeTag !== ConstTyTag.int ) return undefined;

    return {
        a: ca.value as bigint,
        b: cb.value as bigint
    };
}

function getBytes( a: CEKValue ): Uint8Array | undefined
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
        pair.typeTag === ConstTyTag.pair &&
        isPair( pair.value )
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

// -------- helpers for Chang2 / Plutus V4 builtins --------

function getLedgerValue( v: CEKValue ): LedgerValue | undefined
{
    if(!(
        v instanceof CEKConst &&
        v.type[0] === ConstTyTag.value &&
        Array.isArray( v.value )
    )) return undefined;
    return v.value as LedgerValue;
}

function u8ArrayCmp( a: Uint8Array, b: Uint8Array ): number
{
    const len = Math.min( a.length, b.length );
    for( let i = 0; i < len; i++ )
    {
        if( a[i]! < b[i]! ) return -1;
        if( a[i]! > b[i]! ) return 1;
    }
    return a.length - b.length;
}

function u8ArrayEq( a: Uint8Array, b: Uint8Array ): boolean
{
    if( a.length !== b.length ) return false;
    for( let i = 0; i < a.length; i++ )
        if( a[i] !== b[i] ) return false;
    return true;
}

function ledgerLookupCoin( v: LedgerValue, ccy: Uint8Array, token: Uint8Array ): bigint
{
    for( const entry of v )
        if( u8ArrayEq( entry.fst, ccy ) )
            for( const tok of entry.snd )
                if( u8ArrayEq( tok.fst, token ) )
                    return tok.snd;
    return BigInt( 0 );
}

function ledgerDeleteToken( v: LedgerValue, ccy: Uint8Array, token: Uint8Array ): LedgerValue
{
    const result: LedgerValue = [];
    for( const entry of v )
    {
        if( u8ArrayEq( entry.fst, ccy ) )
        {
            const newTokens = entry.snd.filter( t => !u8ArrayEq( t.fst, token ) );
            if( newTokens.length > 0 ) result.push({ fst: entry.fst, snd: newTokens });
        }
        else result.push( entry );
    }
    return result;
}

function ledgerInsertToken( v: LedgerValue, ccy: Uint8Array, token: Uint8Array, qty: bigint ): LedgerValue
{
    const result: LedgerValue = [];
    let inserted = false;
    for( const entry of v )
    {
        const cmp = u8ArrayCmp( entry.fst, ccy );
        if( cmp < 0 ) { result.push( entry ); continue; }
        if( cmp === 0 )
        {
            const newTokens: Array<Pair<Uint8Array, bigint>> = [];
            let tokInserted = false;
            for( const tok of entry.snd )
            {
                const tcmp = u8ArrayCmp( tok.fst, token );
                if( tcmp < 0 ) { newTokens.push( tok ); continue; }
                if( tcmp === 0 ) { newTokens.push({ fst: token, snd: qty }); tokInserted = true; continue; }
                if( !tokInserted ) { newTokens.push({ fst: token, snd: qty }); tokInserted = true; }
                newTokens.push( tok );
            }
            if( !tokInserted ) newTokens.push({ fst: token, snd: qty });
            result.push({ fst: entry.fst, snd: newTokens });
            inserted = true;
            continue;
        }
        if( !inserted )
        {
            result.push({ fst: ccy, snd: [{ fst: token, snd: qty }] });
            inserted = true;
        }
        result.push( entry );
    }
    if( !inserted ) result.push({ fst: ccy, snd: [{ fst: token, snd: qty }] });
    return result;
}

const _ledgerQMAX = (BigInt(1) << BigInt(127)) - BigInt(1);
const _ledgerQMIN = -(BigInt(1) << BigInt(127));
const _bigintZero = BigInt(0);
const _bigintOne = BigInt(1);

function ledgerUnion( v1: LedgerValue, v2: LedgerValue ): LedgerValue
{
    function mergeTokens(
        a: Array<Pair<Uint8Array, bigint>>,
        b: Array<Pair<Uint8Array, bigint>>
    ): Array<Pair<Uint8Array, bigint>>
    {
        const result: Array<Pair<Uint8Array, bigint>> = [];
        let i = 0, j = 0;
        while( i < a.length && j < b.length )
        {
            const cmp = u8ArrayCmp( a[i]!.fst, b[j]!.fst );
            if( cmp < 0 ) { result.push( a[i]! ); i++; }
            else if( cmp > 0 ) { result.push( b[j]! ); j++; }
            else
            {
                const sum = a[i]!.snd + b[j]!.snd;
                if( sum < _ledgerQMIN || sum > _ledgerQMAX ) throw new Error( "unionValue :: quantity overflow" );
                if( sum !== _bigintZero ) result.push({ fst: a[i]!.fst, snd: sum });
                i++; j++;
            }
        }
        while( i < a.length ) { result.push( a[i]! ); i++; }
        while( j < b.length ) { result.push( b[j]! ); j++; }
        return result;
    }
    const result: LedgerValue = [];
    let i = 0, j = 0;
    while( i < v1.length && j < v2.length )
    {
        const cmp = u8ArrayCmp( v1[i]!.fst, v2[j]!.fst );
        if( cmp < 0 ) { result.push( v1[i]! ); i++; }
        else if( cmp > 0 ) { result.push( v2[j]! ); j++; }
        else
        {
            const merged = mergeTokens( v1[i]!.snd, v2[j]!.snd );
            if( merged.length > 0 ) result.push({ fst: v1[i]!.fst, snd: merged });
            i++; j++;
        }
    }
    while( i < v1.length ) { result.push( v1[i]! ); i++; }
    while( j < v2.length ) { result.push( v2[j]! ); j++; }
    return result;
}

function bigintMod( a: bigint, m: bigint ): bigint
{
    const r = a % m;
    return r < _bigintZero ? r + m : r;
}

function bigintGcd( a: bigint, b: bigint ): bigint
{
    let x = a < _bigintZero ? -a : a;
    let y = b < _bigintZero ? -b : b;
    while( y !== _bigintZero ) { const t = y; y = x % y; x = t; }
    return x;
}

function modPow( base: bigint, exp: bigint, m: bigint ): bigint
{
    let result = _bigintOne;
    let b = bigintMod( base, m );
    let e = exp;
    while( e > _bigintZero )
    {
        if( e & _bigintOne ) result = bigintMod( result * b, m );
        e >>= _bigintOne;
        b = bigintMod( b * b, m );
    }
    return result;
}

function modInverse( a: bigint, m: bigint ): bigint
{
    let old_r = a, r = m, old_s = _bigintOne, s = _bigintZero;
    while( r !== _bigintZero )
    {
        const q = old_r / r;
        const adj_q = old_r % r !== _bigintZero && ( old_r < _bigintZero ) !== ( r < _bigintZero ) ? q - _bigintOne : q;
        const temp_r = r; r = old_r - adj_q * r; old_r = temp_r;
        const temp_s = s; s = old_s - adj_q * s; old_s = temp_s;
    }
    return bigintMod( old_s, m );
}

// bls12-381 curve order r:
const BLS12_381_R = BigInt( "0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001" );

function blsReduceScalar( s: bigint ): bigint
{
    const r = s % BLS12_381_R;
    return r < _bigintZero ? r + BLS12_381_R : r;
}

// -------- end helpers --------

function intBinOp( a: CEKValue, b: CEKValue , op: (a: bigint, b: bigint) => bigint | undefined , fnName: string ): ConstOrErr
{
    const ia = getInt( a );
    if( ia === undefined )
    return new CEKError(
        `${fnName} :: invalid arguments`,
        { a, b }
    );
    const ib = getInt( b );
    if( ib === undefined )
    return new CEKError(
        `${fnName} :: invalid arguments`,
        { a, b }
    );

    const result = op( ia, ib );
    if( result === undefined ) return new CEKError(
        `${fnName} :: operation error`,
        { a, b }
    );

    return new CEKConst( constT.int, result );
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


export function haskellDiv( a: bigint, b: bigint ): bigint | undefined
{
    if( b === _0n ) return undefined;
    const q = a / b;
    // adjust toward -∞ when signs differ and there is a remainder
    if( a % b !== _0n && ( a < _0n ) !== ( b < _0n ) ) return q - _1n;
    return q;
}

export function haskellMod( a: bigint, b: bigint ): bigint | undefined
{
    if( b === _0n ) return undefined;
    const r = a % b;
    // adjust to match sign of b
    if( r !== _0n && ( r < _0n ) !== ( b < _0n ) ) return r + b;
    return r;
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
    public machineBudget: ExBudget;
    constructor(
        readonly getBuiltinCostFunc: <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag>,
        machineBudget: ExBudget,
        public logs: string[]  
    ){
        this.machineBudget = machineBudget;
    };

    resetBudget( newBudget: ExBudget ): void
    {
        this.machineBudget = newBudget;
    }

    resetLogs( newLogs: string[] ): void
    {
        this.logs = newLogs;
    }

    eval( tag: UPLCBuiltinTag, args: readonly CEKValue[] ): CEKValue
    {
        switch( tag )
        {
            case UPLCBuiltinTag.addInteger :                        return this.addInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.subtractInteger :                   return this.subtractInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.multiplyInteger :                   return this.multiplyInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.divideInteger :                     return this.divideInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.quotientInteger :                   return this.quotientInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.remainderInteger :                  return this.remainderInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.modInteger :                        return this.modInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.equalsInteger :                     return this.equalsInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.lessThanInteger :                   return this.lessThanInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.lessThanEqualInteger :              return this.lessThanEqualInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.appendByteString :                  return this.appendByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.consByteString :                    return this.consByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.sliceByteString :                   return this.sliceByteString( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.lengthOfByteString :                return this.lengthOfByteString( args[0]! );
            case UPLCBuiltinTag.indexByteString :                   return this.indexByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.equalsByteString :                  return this.equalsByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.lessThanByteString :                return this.lessThanByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.lessThanEqualsByteString :          return this.lessThanEqualsByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.sha2_256 :                          return this.sha2_256( args[0]! );
            case UPLCBuiltinTag.sha3_256 :                          return this.sha3_256( args[0]! );
            case UPLCBuiltinTag.blake2b_256 :                       return this.blake2b_256( args[0]! );
            case UPLCBuiltinTag.verifyEd25519Signature:             return this.verifyEd25519Signature( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.appendString :                      return this.appendString( args[0]!, args[1]! );
            case UPLCBuiltinTag.equalsString :                      return this.equalsString( args[0]!, args[1]! );
            case UPLCBuiltinTag.encodeUtf8 :                        return this.encodeUtf8( args[0]! );
            case UPLCBuiltinTag.decodeUtf8 :                        return this.decodeUtf8( args[0]! );
            case UPLCBuiltinTag.ifThenElse :                        return this.ifThenElse( args[0]!, args[1]! as ConstOrErr, args[2]! as ConstOrErr );
            case UPLCBuiltinTag.chooseUnit :                        return this.chooseUnit( args[0]!, args[1]! );
            case UPLCBuiltinTag.trace :                             return this.trace( args[0]!, args[1]! );
            case UPLCBuiltinTag.fstPair :                           return this.fstPair( args[0]! );
            case UPLCBuiltinTag.sndPair :                           return this.sndPair( args[0]! );
            case UPLCBuiltinTag.chooseList :                        return this.chooseList( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.mkCons :                            return this.mkCons( args[0]!, args[1]! );
            case UPLCBuiltinTag.headList :                          return this.headList( args[0]! );
            case UPLCBuiltinTag.tailList :                          return this.tailList( args[0]! );
            case UPLCBuiltinTag.nullList :                          return this.nullList( args[0]! );
            case UPLCBuiltinTag.chooseData :                        return this.chooseData( args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]! );
            case UPLCBuiltinTag.constrData :                        return this.constrData( args[0]!, args[1]! );
            case UPLCBuiltinTag.mapData :                           return this.mapData( args[0]! );
            case UPLCBuiltinTag.listData :                          return this.listData( args[0]! );
            case UPLCBuiltinTag.iData    :                          return this.iData( args[0]! );
            case UPLCBuiltinTag.bData    :                          return this.bData( args[0]! );
            case UPLCBuiltinTag.unConstrData :                      return this.unConstrData( args[0]! );
            case UPLCBuiltinTag.unMapData    :                      return this.unMapData( args[0]! );
            case UPLCBuiltinTag.unListData   :                      return this.unListData( args[0]! );
            case UPLCBuiltinTag.unIData      :                      return this.unIData( args[0]! );
            case UPLCBuiltinTag.unBData      :                      return this.unBData( args[0]! );
            case UPLCBuiltinTag.equalsData   :                      return this.equalsData( args[0]!, args[1]! );
            case UPLCBuiltinTag.mkPairData   :                      return this.mkPairData( args[0]!, args[1]! );
            case UPLCBuiltinTag.mkNilData    :                      return this.mkNilData( args[0]! );
            case UPLCBuiltinTag.mkNilPairData:                      return this.mkNilPairData( args[0]! );
            case UPLCBuiltinTag.serialiseData:                      return this.serialiseData( args[0]! );
            case UPLCBuiltinTag.verifyEcdsaSecp256k1Signature:      return this.verifyEcdsaSecp256k1Signature( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.verifySchnorrSecp256k1Signature:    return this.verifySchnorrSecp256k1Signature( args[0]!, args[1]!, args[2]! );

            case UPLCBuiltinTag.bls12_381_G1_add                     : return this.bls12_381_G1_add( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G1_neg                     : return this.bls12_381_G1_neg( args[0]! );
            case UPLCBuiltinTag.bls12_381_G1_scalarMul               : return this.bls12_381_G1_scalarMul( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G1_equal                   : return this.bls12_381_G1_equal( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G1_hashToGroup             : return this.bls12_381_G1_hashToGroup( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G1_compress                : return this.bls12_381_G1_compress( args[0]! );
            case UPLCBuiltinTag.bls12_381_G1_uncompress              : return this.bls12_381_G1_uncompress( args[0]! );
            case UPLCBuiltinTag.bls12_381_G2_add                     : return this.bls12_381_G2_add( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G2_neg                     : return this.bls12_381_G2_neg( args[0]! );
            case UPLCBuiltinTag.bls12_381_G2_scalarMul               : return this.bls12_381_G2_scalarMul( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G2_equal                   : return this.bls12_381_G2_equal( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G2_hashToGroup             : return this.bls12_381_G2_hashToGroup( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G2_compress                : return this.bls12_381_G2_compress( args[0]! );
            case UPLCBuiltinTag.bls12_381_G2_uncompress              : return this.bls12_381_G2_uncompress( args[0]! );
            case UPLCBuiltinTag.bls12_381_millerLoop                 : return this.bls12_381_millerLoop( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_mulMlResult                : return this.bls12_381_mulMlResult( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_finalVerify                : return this.bls12_381_finalVerify( args[0]!, args[1]! );
            case UPLCBuiltinTag.keccak_256                           : return this.keccak_256( args[0]! );
            case UPLCBuiltinTag.blake2b_224                          : return this.blake2b_224( args[0]! );

            case UPLCBuiltinTag.byteStringToInteger                  : return this.byteStringToInteger( args[0]!, args[1]! );
            case UPLCBuiltinTag.integerToByteString                  : return this.integerToByteString( args[0]!, args[1]!, args[2]! );
            // plomin
            case UPLCBuiltinTag.andByteString                        : return this.andByteString( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.orByteString                         : return this.orByteString( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.xorByteString                        : return this.xorByteString( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.complementByteString                 : return this.complementByteString( args[0]! );
            case UPLCBuiltinTag.readBit                              : return this.readBit( args[0]!, args[1]! );
            case UPLCBuiltinTag.writeBits                            : return this.writeBits( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.replicateByte                        : return this.replicateByte( args[0]!, args[1]! );
            case UPLCBuiltinTag.shiftByteString                      : return this.shiftByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.rotateByteString                     : return this.rotateByteString( args[0]!, args[1]! );
            case UPLCBuiltinTag.countSetBits                         : return this.countSetBits( args[0]! );
            case UPLCBuiltinTag.findFirstSetBit                      : return this.findFirstSetBit( args[0]! );
            case UPLCBuiltinTag.ripemd_160                           : return this.ripemd_160( args[0]! );

            // Chang2 / Plutus V4
            case UPLCBuiltinTag.expModInteger                        : return this.expModInteger( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.dropList                             : return this.dropList( args[0]!, args[1]! );
            case UPLCBuiltinTag.lengthOfArray                        : return this.lengthOfArray( args[0]! );
            case UPLCBuiltinTag.listToArray                          : return this.listToArray( args[0]! );
            case UPLCBuiltinTag.indexArray                           : return this.indexArray( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G1_multiScalarMul          : return this.bls12_381_G1_multiScalarMul( args[0]!, args[1]! );
            case UPLCBuiltinTag.bls12_381_G2_multiScalarMul          : return this.bls12_381_G2_multiScalarMul( args[0]!, args[1]! );
            case UPLCBuiltinTag.insertCoin                           : return this.insertCoin( args[0]!, args[1]!, args[2]!, args[3]! );
            case UPLCBuiltinTag.lookupCoin                           : return this.lookupCoin( args[0]!, args[1]!, args[2]! );
            case UPLCBuiltinTag.unionValue                           : return this.unionValue( args[0]!, args[1]! );
            case UPLCBuiltinTag.valueContains                        : return this.valueContains( args[0]!, args[1]! );
            case UPLCBuiltinTag.valueData                            : return this.valueData( args[0]! );
            case UPLCBuiltinTag.unValueData                          : return this.unValueData( args[0]! );
            case UPLCBuiltinTag.scaleValue                           : return this.scaleValue( args[0]!, args[1]! );

            default:
                tag; // check that is of type 'never'
                return new CEKError("unrecognized builtin tag", { tag });
        }
    }

    addInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "addInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "addInteger :: invalid arguments", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.addInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.int, ia + ib );
    }
    subtractInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "subtractInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "subtractInteger :: invalid arguments", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.subtractInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.int, ia - ib );
    }
    multiplyInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "multiplyInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "multiplyInteger :: invalid arguments", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.multiplyInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.int, ia * ib );
    }
    divideInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "divideInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "divideInteger :: invalid arguments", { a: _a, b: _b } );
        if( ib === _0n ) return new CEKError( "divideInteger :: divide by zero", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.divideInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.int, haskellDiv( ia, ib )! );
    }
    quotientInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "quotientInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "quotientInteger :: invalid arguments", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.quotientInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        const result = haskellQuot( ia, ib );
        if( result === undefined ) return new CEKError( "quotientInteger :: divide by zero", { a: _a, b: _b } );
        return new CEKConst( constT.int, result );
    }
    remainderInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "remainderInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "remainderInteger :: invalid arguments", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.remainderInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        const result = haskellRem( ia, ib );
        if( result === undefined ) return new CEKError( "remainderInteger :: divide by zero", { a: _a, b: _b } );
        return new CEKConst( constT.int, result );
    }
    modInteger( _a: CEKValue, _b: CEKValue ): ConstOrErr
    {
        const ia = getInt( _a );
        if( ia === undefined ) return new CEKError( "modInteger :: invalid arguments", { a: _a, b: _b } );
        const ib = getInt( _b );
        if( ib === undefined ) return new CEKError( "modInteger :: invalid arguments", { a: _a, b: _b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.modInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        const result = haskellMod( ia, ib );
        if( result === undefined ) return new CEKError( "modInteger :: divide by zero", { a: _a, b: _b } );
        return new CEKConst( constT.int, result );
    }
    equalsInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const ia = getInt( a );
        if( ia === undefined ) return new CEKError( "equalsInteger :: not integers", { a, b } );
        const ib = getInt( b );
        if( ib === undefined ) return new CEKError( "equalsInteger :: not integers", { a, b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.equalsInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.bool, ia === ib );
    }
    lessThanInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const ia = getInt( a );
        if( ia === undefined ) return new CEKError( "lessThanInteger :: not integers", { a, b } );
        const ib = getInt( b );
        if( ib === undefined ) return new CEKError( "lessThanInteger :: not integers", { a, b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.bool, ia < ib );
    }
    lessThanEqualInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const ia = getInt( a );
        if( ia === undefined ) return new CEKError( "lessThanEqualInteger :: not integers", { a, b } );
        const ib = getInt( b );
        if( ib === undefined ) return new CEKError( "lessThanEqualInteger :: not integers", { a, b } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanEqualInteger );
        const sa = intToSize( ia );
        const sb = intToSize( ib );
        this.machineBudget.sub({ mem: f.mem.at( sa, sb ), cpu: f.cpu.at( sa, sb ) });

        return new CEKConst( constT.bool, ia <= ib );
    }
    appendByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBytes( a );
        if( _a === undefined ) return new CEKError("appendByteString :: not BS", { a });
        const _b = getBytes( b );
        if(_b === undefined ) return new CEKError("appendByteString :: not BS", { b });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.appendByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.byteString( concatUint8Array( _a, _b ) );
    }
    consByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        let _a = getInt( a );
        if( _a === undefined ) return new CEKError("consByteString :: not Int", { a });
        
        if( _a < 0 ) return new CEKError("consByteString :: negative byte");
        if( _a >= BigInt( 256 ) ) return new CEKError("consByteString :: UInt8 overflow");

        const _b = getBytes( b );
        if(_b === undefined ) return new CEKError("consByteString :: not BS", { b });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.consByteString );
                
        const sa = intToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        const nextBytes = new Uint8Array( _b.length + 1 );
        nextBytes[0] = Number( _a );
        nextBytes.set( _b, 1 );

        return CEKConst.byteString( nextBytes )
    }
    sliceByteString( fromIdx: CEKValue, ofLength: CEKValue, bs: CEKValue ): ConstOrErr
    {
        const idx = getInt( fromIdx );
        if( idx === undefined ) return new CEKError("sliceByteString :: not int", { fromIdx });

        const length = getInt( ofLength );
        if( length === undefined ) return new CEKError("sliceByteString :: not int", { ofLength });

        const _bs = getBytes( bs );
        if( _bs === undefined ) return new CEKError("sliceByteString :: not BS", { bs });

        const i = idx < _0n ? _0n : idx;

        const endIdx = i + length;
        const maxIdx = BigInt( _bs.length );

        const j = endIdx > maxIdx ? maxIdx : endIdx;

        if( j < i ) return CEKConst.byteString( new Uint8Array([]) );


        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sliceByteString );
                
        const sidx = intToSize( idx );
        const slength = intToSize( length );
        const sbs = bsToSize( _bs );
        
        this.machineBudget.sub({
            mem: f.mem.at( sidx, slength, sbs ),
            cpu: f.cpu.at( sidx, slength, sbs )
        });

        return CEKConst.byteString(
                Uint8Array.prototype.slice.call(
                    _bs,
                    Number( i ), Number( j )
                )
        );
    }
    lengthOfByteString( bs: CEKValue ): ConstOrErr
    {
        const _bs = getBytes( bs );
        if( _bs === undefined ) return new CEKError("lengthOfByteString :: not BS", { bs });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lengthOfByteString );
                
        const sbs = bsToSize( _bs );
        
        this.machineBudget.sub({
            mem: f.mem.at( sbs ),
            cpu: f.cpu.at( sbs )
        });

        return CEKConst.int( _bs.length );
    }
    indexByteString( bs: CEKValue, idx: CEKValue ): ConstOrErr
    {
        const _bs = getBytes( bs );
        if( _bs === undefined ) return new CEKError("indexByteString :: not BS", { bs });
        
        const i = getInt( idx );
        if( i === undefined || i >= _bs.length || i < _0n ) return new CEKError("indexByteString :: not int", { idx });

        if( i >= BigInt("9223372036854775808") )
        return new CEKError("indexByteString :: (maxBound :: Int64) overflow")

        const result = _bs[ Number( i ) ];
        if( result === undefined ) return new CEKError(
            "indexByteString :: out of bytestring length",
            { bs_length: _bs.length, index: i }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.indexByteString );
                
        const sbs = bsToSize( _bs );
        const sidx = intToSize( i );
        
        this.machineBudget.sub({
            mem: f.mem.at( sbs, sidx ),
            cpu: f.cpu.at( sbs, sidx )
        });

        return CEKConst.int( result );
    }
    equalsByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBytes( a );
        if( _a === undefined )
        return new CEKError(
            "equalsByteString :: first argument not BS",
            {
                bs_0: a,
                bs_1: b 
            }
        );
        
        const _b = getBytes( b );
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
        
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return CEKConst.bool( u8ArrayEq( _a, _b ) );
    }
    lessThanByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBytes( a );
        if( _a === undefined ) return new CEKError(
            "lessThanByteString :: not BS",
            { a }
        );
        
        const _b = getBytes( b );
        if( _b === undefined ) return new CEKError(
            "lessThanByteString :: not BS",
            { b }
        );

        const aBytes = _a;
        const bBytes = _b;

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        if( aBytes.length < bBytes.length ) return CEKConst.bool( true );

        // aBytes.length is either greather or equal bBytes.length
        for(let i = 0; i < aBytes.length; i++)
        {
            const aByte = aBytes[i] ?? Infinity;
            const bByte = bBytes[i];
            if( bByte === undefined ) return CEKConst.bool( false );

            if( aByte < bByte ) return CEKConst.bool( true );
            if( aByte > bByte ) return CEKConst.bool( false );
        }
        return CEKConst.bool( false );
    }
    lessThanEqualsByteString( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const _a = getBytes( a );
        if( _a === undefined ) return new CEKError(
            "lessThanEqualsByteString :: not BS",
            { a }
        );
        
        const _b = getBytes( b );
        if( _b === undefined ) return new CEKError(
            "lessThanEqualsByteString :: not BS",
            { b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lessThanEqualsByteString );
                
        const sa = bsToSize( _a );
        const sb = bsToSize( _b );
        
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        if( u8ArrayEq( _a, _b ) ) return CEKConst.bool( true );

        // lessThanBytestring but with new environment for costs;
        return (new BnCEK(this.getBuiltinCostFunc, ExBudget.zero(), [])).lessThanByteString( a, b );
    }

    sha2_256( stuff: CEKValue ): ConstOrErr
    {
        const b = getBytes( stuff );
        if( b === undefined ) return new CEKError(
            "sha2_256 :: not BS",
            { stuff }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sha2_256 );
        const sb = bsToSize( b );
        this.machineBudget.sub({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return CEKConst.byteString(
            new Uint8Array(
                sha2_256_sync( b )
            )
        );
    }

    sha3_256( stuff: CEKValue ): ConstOrErr
    {
        const b = getBytes( stuff );
        if( b === undefined ) return new CEKError(
            "sha3_256 :: not BS",
            stuff
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.sha3_256 );

        const sb = bsToSize( b );

        this.machineBudget.sub({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return CEKConst.byteString(
            new Uint8Array(
                noble_sha3_256( b )
            )
        );
    }

    blake2b_256( stuff: CEKValue ): ConstOrErr
    {
        const b = getBytes( stuff );
        if( b === undefined ) return new CEKError(
            "blake2b_256 :: not BS",
            { stuff }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.blake2b_256 );

        const sb = bsToSize( b );

        this.machineBudget.sub({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return constOrErr(() => CEKConst.byteString(
            blake2b( b, 32 )
        ));
    }

    verifyEd25519Signature( key: CEKValue, message: CEKValue, signature: CEKValue ): ConstOrErr
    {
        const k = getBytes( key );
        if( k === undefined ) return new CEKError(
            "verifyEd25519Signature :: key not BS",
            { key }
        );
        
        const kBytes = k;
        if( kBytes.length !== 32 ) return new CEKError(
            "sha2_verifyEd25519Signature256 :: wrong message length",
            {
                kBytes,
                kStr: k.toString()
            }
        );

        const m = getBytes( message );
        if( m === undefined ) return new CEKError(
            "verifyEd25519Signature :: message not BS",
            { message }
        );

        const s = getBytes( signature );
        if( s === undefined ) return new CEKError(
            "verifyEd25519Signature :: singature not BS",
            { signature }
        );
        const sBytes = s;
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

        this.machineBudget.sub({
            mem: f.mem.at( sk, sm, ss ),
            cpu: f.cpu.at( sk, sm, ss )
        });

        return constOrErr(() => CEKConst.bool( verifyEd25519Signature_sync( sBytes, m, kBytes ) ));
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
            mem: f.mem.at( sa ),
            cpu: f.cpu.at( sa )
        });

        return CEKConst.byteString( fromUtf8( _a ) );
    }
    decodeUtf8( a: CEKValue ): ConstOrErr
    {
        const _a = getBytes( a );
        if( _a === undefined ) 
        return new CEKError(
            "decodeUtf8 :: not BS",
            { arg: a }
        );

        const _a_buff = _a;
        
        if( !isValidUtf8( _a_buff ) )
        return new CEKError("decodeUtf8 :: invalid utf8", { hex: toHex( _a_buff ) });

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.decodeUtf8 );

        const sa = bsToSize( _a_buff );

        this.machineBudget.sub({
            mem: f.mem.at( sa ),
            cpu: f.cpu.at( sa )
        });

        return CEKConst.str( toUtf8( _a_buff ) );
    }
    ifThenElse( condition: CEKValue, caseTrue: ConstOrErr, caseFalse: ConstOrErr ): ConstOrErr
    {
        if( condition.tag !== CEKValueTag.Const || (condition as CEKConst).typeTag !== ConstTyTag.bool )
        return new CEKError(
            "ifThenElse :: condition was not a boolean",
            { condition }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.ifThenElse );

        this.machineBudget.sub({
            mem: f.mem.at( BOOL_SIZE, ANY_SIZE, ANY_SIZE ),
            cpu: f.cpu.at( BOOL_SIZE, ANY_SIZE, ANY_SIZE ),
        });

        return (condition as CEKConst).value ? caseTrue : caseFalse;
    }

    chooseUnit( unit: CEKValue, b: CEKValue ): CEKValue
    {
        if( !isConstOfType( unit, constT.unit ) ) return new CEKError(
            "chooseUnit :: not a unit",
            { unit }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.chooseUnit );

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
            mem: f.mem.at( sl ),
            cpu: f.cpu.at( sl )
        });

        return CEKConst.bool( l.length === 0 )
    }
    chooseData(
        data: CEKValue, 
        constr: CEKValue, 
        map: CEKValue, 
        list: CEKValue, 
        int: CEKValue, 
        bs: CEKValue
    ): CEKValue
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError(
            "chooseData :: not data",
            { data }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.chooseData );

        const sd = dataToSize( d );

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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
                isPair( pair ) &&
                isData( pair.fst ) &&
                isData( pair.snd ) 
            )
        ) return new CEKError(
            "some elements are not a pair, mismatching const type",
            { listOfPair, list}
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.mapData );

        const size = listToSize( list );

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.data( new DataI( i ) );
    }
    bData( bs: CEKValue ): ConstOrErr
    {
        const b = getBytes( bs );
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
            mem: f.mem.at( size ),
            cpu: f.cpu.at( size )
        });

        return CEKConst.listOf( constT.pairOf( constT.data, constT.data ) )( d.map );
    }
    unListData( data: CEKValue ): ConstOrErr
    {
        const d = getData( data );
        if( d === undefined ) return new CEKError("unListData :: not data",{ data });

        if( !( d instanceof DataList ) ) return new CEKError("unListData :: not a data list", { data: d } );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unListData );

        const size = dataToSize( d );

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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
        this.machineBudget.sub({
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

        this.machineBudget.sub({
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

        this.machineBudget.sub({
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
        this.machineBudget.sub({
            mem: f.mem.at( sData ),
            cpu: f.cpu.at( sData )
        });

        return CEKConst.byteString( dataToCbor( d ) );
    } 
    verifyEcdsaSecp256k1Signature( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const pubKey = getBytes( a );
        const messageHash = getBytes( b );
        const signature = getBytes( c );
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
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb, sc ),
            cpu: f.cpu.at( sa, sb, sc )
        });

        return constOrErr(() =>
            CEKConst.bool(
                verifyEcdsaSecp256k1Signature(
                    pubKey,
                    messageHash,
                    signature
                )
            )
        );
    }
    verifySchnorrSecp256k1Signature( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const pubKey = getBytes( a );
        const messageHash = getBytes( b );
        const signature = getBytes( c );
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
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb, sc ),
            cpu: f.cpu.at( sa, sb, sc )
        });

        return constOrErr(() =>
            CEKConst.bool(
                verifySchnorrSecp256k1Signature(
                    pubKey,
                    messageHash,
                    signature
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
            mem: f.mem.at( BLS_G1_SIZE, BLS_G1_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE, BLS_G1_SIZE )
        });
        
        return constOrErr(() => CEKConst.bool( bls12_381_G1_equal( fst, snd ) ));
    }
    bls12_381_G1_hashToGroup( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBytes( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G1_hashToGroup :: first argument not bytestring",
            { a, b }
        );
        const snd = getBytes( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G1_hashToGroup :: second argument not bytestring",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_hashToGroup );
        const sa = bsToSize( fst );
        const sb = bsToSize( snd );
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return constOrErr(() => CEKConst.bls12_381_G1_element( bls12_381_G1_hashToGroup( fst, snd ) ));
    }
    bls12_381_G1_compress( a: CEKValue ): ConstOrErr
    {
        const g1 = getBlsG1( a );
        if( g1 === undefined ) return new CEKError(
            "bls12_381_G1_compress :: first argument not BlsG1 elem",
            { a }
        );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_compress );
        this.machineBudget.sub({
            mem: f.mem.at( BLS_G1_SIZE ),
            cpu: f.cpu.at( BLS_G1_SIZE )
        });
        
        return constOrErr(() => CEKConst.byteString( bls12_381_G1_compress( g1 ) ) );
    }
    bls12_381_G1_uncompress( a: CEKValue ): ConstOrErr
    {
        const bs = getBytes( a );
        if( bs === undefined ) return new CEKError(
            "bls12_381_G1_uncompress :: first argument not bs",
            { a }
        );

        const bytes = bs;
        if( bytes.length !== Number( BLS_G1_SIZE ) )
        {
            return new CEKError(
                "bls12_381_G1_uncompress :: invalid bytes length",
                { bytes: toHex( bytes ) }
            );    
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_uncompress );
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
            mem: f.mem.at( BLS_G2_SIZE, BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G2_SIZE, BLS_G2_SIZE )
        });
        
        return constOrErr(() => CEKConst.bool( bls12_381_G2_equal( fst, snd ) ));
    }
    bls12_381_G2_hashToGroup( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const fst = getBytes( a );
        if( fst === undefined ) return new CEKError(
            "bls12_381_G2_hashToGroup :: first argument not bytestring",
            { a, b }
        );
        const snd = getBytes( b );
        if( snd === undefined ) return new CEKError(
            "bls12_381_G2_hashToGroup :: second argument not bytestring",
            { fst, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_hashToGroup );
        const sa = bsToSize( fst );
        const sb = bsToSize( snd );
        this.machineBudget.sub({
            mem: f.mem.at( sa, sb ),
            cpu: f.cpu.at( sa, sb )
        });

        return constOrErr(() => 
            CEKConst.bls12_381_G2_element( bls12_381_G2_hashToGroup( fst, snd ) )
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
        this.machineBudget.sub({
            mem: f.mem.at( BLS_G2_SIZE ),
            cpu: f.cpu.at( BLS_G2_SIZE )
        });
        
        return constOrErr(() => 
            CEKConst.byteString( bls12_381_G2_compress( G2 ) )
        );
    }
    bls12_381_G2_uncompress( a: CEKValue ): ConstOrErr
    {
        const bs = getBytes( a );
        if( bs === undefined ) return new CEKError(
            "bls12_381_G2_uncompress :: first argument not bs",
            { a }
        );

        const bytes = bs;
        if( bytes.length !== Number( BLS_G2_SIZE ) )
        {
            return new CEKError(
                "bls12_381_G2_uncompress :: invalid bytes length",
                { bytes: toHex( bytes ) }
            );    
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_uncompress );
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
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
        this.machineBudget.sub({
            mem: f.mem.at( BLS_ML_RESULT_SIZE, BLS_ML_RESULT_SIZE ),
            cpu: f.cpu.at( BLS_ML_RESULT_SIZE, BLS_ML_RESULT_SIZE )
        });

        return constOrErr(() =>
            CEKConst.bool( bls12_381_finalVerify( res1, res2 ) ) 
        );
    }
    keccak_256( a: CEKValue ): ConstOrErr
    {
        const b = getBytes( a );
        if( b === undefined ) return new CEKError(
            "keccak_256 :: not BS",
            { b, a }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.keccak_256 );
        const sb = bsToSize( b );
        this.machineBudget.sub({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return constOrErr(() => CEKConst.byteString(
            keccak_256( b )
        ));
    }
    blake2b_224( a: CEKValue ): ConstOrErr
    {
        const b = getBytes( a );
        if( b === undefined ) return new CEKError(
            "blake2b_224 :: not BS",
            { b, a }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.blake2b_224 );
        const sb = bsToSize( b );
        this.machineBudget.sub({
            mem: f.mem.at( sb ),
            cpu: f.cpu.at( sb )
        });

        return constOrErr(() => CEKConst.byteString(
            blake2b_224( b )
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

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.integerToByteString );
        const bSize = BOOL_SIZE;
        const nSize = intToSize( size );
        const nInt = intToSize( integer );
        this.machineBudget.sub({
            mem: f.mem.at( bSize, nSize, nInt ),
            cpu: f.cpu.at( bSize, nSize, nInt )
        });

        return integerToByteString( bigEndian, size, integer );
    }
    byteStringToInteger( a: CEKValue, b: CEKValue ): ConstOrErr
    {
        const bigEndian = getBool( a );
        if( bigEndian === undefined ) return new CEKError(
            "byteStringToInteger :: first arg not boolean", 
            { a, b }
        );
        const bs = getBytes( b );
        if( bs === undefined ) return new CEKError(
            "integerToByteString :: second arg not bs", 
            { bigEndian, b }
        );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.byteStringToInteger );
        const bSize = BOOL_SIZE;
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
            mem: f.mem.at( bSize, bsSize ),
            cpu: f.cpu.at( bSize, bsSize )
        });
        
        return bytestringToInteger( bigEndian, bs );
    }

    andByteString( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const shouldExtend = getBool( a );
        if( shouldExtend === undefined ) return new CEKError(
            "andByteString :: first arg not boolean",
            { a, b, c }
        );
        let bs1 = getBytes( b );
        if( bs1 === undefined ) return new CEKError(
            "andByteString :: second arg not bs",
            { shouldExtend, b, c }
        );
        let bs2 = getBytes( c );
        if( bs2 === undefined ) return new CEKError(
            "andByteString :: third arg not bs",
            { shouldExtend, b, c }
        );

        let len = 0;

        if( shouldExtend )
        {
            len = Math.max( bs1.length, bs2.length );
            bs1 = bitwiseExtend( bs1, len, true );
            bs2 = bitwiseExtend( bs2, len, true );
        }
        else // should truncate
        {
            len = Math.min( bs1.length, bs2.length );
            bs1 = bitwiseTruncate( bs1, len );
            bs2 = bitwiseTruncate( bs2, len );
        }

        const result = new Uint8Array( len );
        for( let i = 0; i < len; i++ )
        {
            result[i] = bs1[i] & bs2[i];
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.andByteString );
        const shouldExtendSize = BOOL_SIZE;
        const bs1Size = bsToSize( bs1 );
        const bs2Size = bsToSize( bs2 );
        this.machineBudget.sub({
            mem: f.mem.at( shouldExtendSize, bs1Size, bs2Size ),
            cpu: f.cpu.at( shouldExtendSize, bs1Size, bs2Size ) 
        })

        return CEKConst.byteString( result );
    }
    orByteString( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const shouldExtend = getBool( a );
        if( shouldExtend === undefined ) return new CEKError(
            "andByteString :: first arg not boolean",
            { a, b, c }
        );
        let bs1 = getBytes( b );
        if( bs1 === undefined ) return new CEKError(
            "andByteString :: second arg not bs",
            { shouldExtend, b, c }
        );
        let bs2 = getBytes( c );
        if( bs2 === undefined ) return new CEKError(
            "andByteString :: third arg not bs",
            { shouldExtend, b, c }
        );

        let len = 0;

        if( shouldExtend )
        {
            len = Math.max( bs1.length, bs2.length );
            bs1 = bitwiseExtend( bs1, len, false );
            bs2 = bitwiseExtend( bs2, len, false );
        }
        else // should truncate
        {
            len = Math.min( bs1.length, bs2.length );
            bs1 = bitwiseTruncate( bs1, len );
            bs2 = bitwiseTruncate( bs2, len );
        }

        const result = new Uint8Array( len );
        for( let i = 0; i < len; i++ )
        {
            result[i] = bs1[i] | bs2[i];
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.orByteString );
        const shouldExtendSize = BOOL_SIZE;
        const bs1Size = bsToSize( bs1 );
        const bs2Size = bsToSize( bs2 );
        this.machineBudget.sub({
            mem: f.mem.at( shouldExtendSize, bs1Size, bs2Size ),
            cpu: f.cpu.at( shouldExtendSize, bs1Size, bs2Size ) 
        })

        return CEKConst.byteString( result );
    }
    xorByteString( a: CEKValue, b: CEKValue, c: CEKValue ): ConstOrErr
    {
        const shouldExtend = getBool( a );
        if( shouldExtend === undefined ) return new CEKError(
            "andByteString :: first arg not boolean",
            { a, b, c }
        );
        let bs1 = getBytes( b );
        if( bs1 === undefined ) return new CEKError(
            "andByteString :: second arg not bs",
            { shouldExtend, b, c }
        );
        let bs2 = getBytes( c );
        if( bs2 === undefined ) return new CEKError(
            "andByteString :: third arg not bs",
            { shouldExtend, b, c }
        );

        let len = 0;

        if( shouldExtend )
        {
            len = Math.max( bs1.length, bs2.length );
            bs1 = bitwiseExtend( bs1, len, true );
            bs2 = bitwiseExtend( bs2, len, true );
        }
        else // should truncate
        {
            len = Math.min( bs1.length, bs2.length );
            bs1 = bitwiseTruncate( bs1, len );
            bs2 = bitwiseTruncate( bs2, len );
        }

        const result = new Uint8Array( len );
        for( let i = 0; i < len; i++ )
        {
            result[i] = bs1[i] ^ bs2[i];
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.xorByteString );
        const shouldExtendSize = BOOL_SIZE;
        const bs1Size = bsToSize( bs1 );
        const bs2Size = bsToSize( bs2 );
        this.machineBudget.sub({
            mem: f.mem.at( shouldExtendSize, bs1Size, bs2Size ),
            cpu: f.cpu.at( shouldExtendSize, bs1Size, bs2Size ) 
        })

        return CEKConst.byteString( result );
    }
    complementByteString( _bs: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "complementByteString :: not bs",
            { _bs }
        );

        const len = bs.length;
        const result = new Uint8Array( len );
        for( let i = 0; i < len; i++ )
        {
            result[i] = ~bs[i];
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.complementByteString );
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize ),
            cpu: f.cpu.at( bsSize )
        });

        return CEKConst.byteString( result );
    }
    // can fail
    readBit( _bs: CEKValue, _i: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "readBit :: not bs",
            { _bs, _i }
        );
        const i = getInt( _i );
        if( i === undefined ) return new CEKError(
            "readBit :: not integer",
            { bs, _i }
        );

        const result = readBit( bs, Number( i ) );
        if( result instanceof CEKError ) return result;

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.readBit );
        const bsSize = bsToSize( bs );
        const iSize = intToSize( i );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize, iSize ),
            cpu: f.cpu.at( bsSize, iSize )
        });

        return CEKConst.bool( result );
    }
    // can fail
    writeBits( _bs: CEKValue, _idxs: CEKValue, _bit: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "writeBits :: not bs",
            { _bs, _idxs, _bit }
        );
        const idxs = getList( _idxs );
        if( idxs === undefined ) return new CEKError(
            "writeBits :: second arg not a list",
            { bs, _idxs, _bit }
        );
        const bit = getBool( _bit );
        if( bit === undefined ) return new CEKError(
            "writeBits :: not boolean",
            { bs, idxs, _bit }
        );

        const result = Uint8Array.prototype.slice.call( bs );
        let elemIdx = 0;
        for( const elem of idxs )
        {
            const i = getIntNumFromConstValue( elem );
            if( i === undefined ) return new CEKError(
                "writeBits :: list element not integer",
                { bs, idxs, elem, elemIdx }
            );
            const res = writeBit( result, i, bit );
            if( res instanceof CEKError ) return res;
            elemIdx++;
        }

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.writeBits );
        const bsSize = bsToSize( bs );
        const idxsSize = listToSize( idxs );
        const bitSize = BOOL_SIZE;
        this.machineBudget.sub({
            mem: f.mem.at( bsSize, idxsSize, bitSize ),
            cpu: f.cpu.at( bsSize, idxsSize, bitSize )
        });

        return CEKConst.byteString( result );
    }
    // can fail
    replicateByte( _len: CEKValue, _byte: CEKValue ): ConstOrErr
    {
        const len = getInt( _len );
        if( len === undefined ) return new CEKError(
            "replicateByte :: first arg not integer",
            { _len, _byte }
        );
        const byte = getInt( _byte );
        if( byte === undefined ) return new CEKError(
            "replicateByte :: second arg not integer",
            { len, _byte }
        );

        if( len < 0 || len > BYTESTRING_LIMIT_LEN_N ) return new CEKError(
            "replicateByte :: invalid length",
            { len, byte }
        );
        if( byte < 0 || byte > 255 ) return new CEKError(
            "replicateByte :: invalid byte",
            { len, byte }
        );

        const result = new Uint8Array( Number( len ) ).fill( Number( byte ) );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.replicateByte );
        const lenSize = intToSize( len );
        const byteSize = intToSize( byte );
        this.machineBudget.sub({
            mem: f.mem.at( lenSize, byteSize ),
            cpu: f.cpu.at( lenSize, byteSize )
        });

        return CEKConst.byteString( result );
    }
    shiftByteString( _bs: CEKValue, _k: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "shiftByteString :: not bs",
            { _bs }
        );
        const k = getInt( _k );
        if( k === undefined ) return new CEKError(
            "shiftByteString :: not integer",
            { bs, _k }
        );

        const result = shiftU8Arr( bs, Number( k ) );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.shiftByteString );
        const bsSize = bsToSize( bs );
        const kSize = intToSize( k );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize, kSize ),
            cpu: f.cpu.at( bsSize, kSize )
        });

        return CEKConst.byteString( result );
    }
    rotateByteString( _bs: CEKValue, _k: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "shiftByteString :: not bs",
            { _bs }
        );
        const k = getInt( _k );
        if( k === undefined ) return new CEKError(
            "shiftByteString :: not integer",
            { bs, _k }
        );

        const result = rotateU8Arr( bs, Number( k ) );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.rotateByteString );
        const bsSize = bsToSize( bs );
        const kSize = intToSize( k );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize, kSize ),
            cpu: f.cpu.at( bsSize, kSize )
        });

        return CEKConst.byteString( result );
    }
    countSetBits( _bs: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "countSetBits :: not bs",
            { _bs }
        );

        const result = countSetBits( bs );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.countSetBits );
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize ),
            cpu: f.cpu.at( bsSize )
        });

        return CEKConst.int( result );
    }
    findFirstSetBit( _bs: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "findFirstSetBit :: not bs",
            { _bs }
        );

        const result = findFirstSetBit( bs );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.findFirstSetBit );
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize ),
            cpu: f.cpu.at( bsSize )
        });

        return CEKConst.int( result );
    }
    ripemd_160( _bs: CEKValue ): ConstOrErr
    {
        const bs = getBytes( _bs );
        if( bs === undefined ) return new CEKError(
            "ripemd_160 :: not bs",
            { _bs }
        );

        const result = ripemd160( bs );

        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.ripemd_160 );
        const bsSize = bsToSize( bs );
        this.machineBudget.sub({
            mem: f.mem.at( bsSize ),
            cpu: f.cpu.at( bsSize )
        });

        return CEKConst.byteString( result );
    }

    // -------- Chang2 / Plutus V4 builtins --------

    expModInteger( _base: CEKValue, _exp: CEKValue, _mod: CEKValue ): ConstOrErr
    {
        const base = getInt( _base );
        const exp  = getInt( _exp );
        const mod  = getInt( _mod );
        if( base === undefined || exp === undefined || mod === undefined )
            return new CEKError( "expModInteger :: invalid arguments", { _base, _exp, _mod } );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.expModInteger );
        const sb = intToSize( base );
        const se = intToSize( exp );
        const sm = intToSize( mod );
        this.machineBudget.sub({ mem: f.mem.at( sb, se, sm ), cpu: f.cpu.at( sb, se, sm ) });
        if( mod <= _bigintZero ) return new CEKError( "expModInteger :: modulus must be positive" );
        if( mod === _bigintOne ) return CEKConst.int( _bigintZero );
        if( exp === _bigintZero ) return CEKConst.int( _bigintOne );
        if( exp > _bigintZero ) return CEKConst.int( modPow( base, exp, mod ) );
        // negative exponent: need modular inverse
        if( base === _bigintZero ) return new CEKError( "expModInteger :: zero base with negative exponent" );
        const reduced = bigintMod( base, mod );
        if( bigintGcd( reduced, mod ) !== _bigintOne )
            return new CEKError( "expModInteger :: base and modulus are not coprime" );
        const inv = modInverse( reduced, mod );
        return CEKConst.int( modPow( inv, -exp, mod ) );
    }

    dropList( _n: CEKValue, _list: CEKValue ): ConstOrErr
    {
        const n = getInt( _n );
        const list = getList( _list );
        if( n === undefined || list === undefined )
            return new CEKError( "dropList :: invalid arguments", { _n, _list } );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.dropList );
        const sn = intToSize( n );
        const sl = listToSize( list );
        this.machineBudget.sub({ mem: f.mem.at( sn, sl ), cpu: f.cpu.at( sn, sl ) });
        if( n <= _bigintZero ) return new CEKConst( (_list as CEKConst).type, list as any );
        const dropped = list.slice( Number( n < BigInt(list.length) ? n : BigInt(list.length) ) );
        return new CEKConst( (_list as CEKConst).type, dropped as any );
    }

    lengthOfArray( _arr: CEKValue ): ConstOrErr
    {
        const arr = getList( _arr );
        if( arr === undefined ) return new CEKError( "lengthOfArray :: not an array", { _arr } );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lengthOfArray );
        this.machineBudget.sub({ mem: f.mem.at( _bigintOne ), cpu: f.cpu.at( _bigintOne ) });
        return CEKConst.int( BigInt( arr.length ) );
    }

    listToArray( _list: CEKValue ): ConstOrErr
    {
        const list = getList( _list );
        if( list === undefined ) return new CEKError( "listToArray :: not a list", { _list } );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.listToArray );
        const sl = listToSize( list );
        this.machineBudget.sub({ mem: f.mem.at( sl ), cpu: f.cpu.at( sl ) });
        const listType = (_list as CEKConst).type;
        const elemType = constListTypeUtils.getTypeArgument( listType as any );
        return new CEKConst( (constT as any).arrayOf( elemType ), list as any );
    }

    indexArray( _arr: CEKValue, _idx: CEKValue ): ConstOrErr
    {
        const arr = getList( _arr );
        const idx = getInt( _idx );
        if( arr === undefined || idx === undefined )
            return new CEKError( "indexArray :: invalid arguments", { _arr, _idx } );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.indexArray );
        this.machineBudget.sub({ mem: f.mem.at( _bigintOne, _bigintOne ), cpu: f.cpu.at( _bigintOne, _bigintOne ) });
        if( idx < _bigintZero || idx >= BigInt( arr.length ) )
            return new CEKError( "indexArray :: index out of bounds", { idx, length: arr.length } );
        const elemType = (constArrayTypeUtils as any).getTypeArgument( (_arr as CEKConst).type );
        return new CEKConst( elemType, arr[ Number( idx ) ] as any );
    }

    bls12_381_G1_multiScalarMul( _scalars: CEKValue, _points: CEKValue ): ConstOrErr
    {
        const scalars = getList( _scalars );
        const points  = getList( _points );
        if( scalars === undefined || points === undefined )
            return new CEKError( "bls12_381_G1_multiScalarMul :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G1_multiScalarMul );
        const sLen = BigInt( Math.min( scalars.length, points.length ) );
        this.machineBudget.sub({ mem: f.mem.at( sLen, sLen ), cpu: f.cpu.at( sLen, sLen ) });
        const len = Math.min( scalars.length, points.length );
        const G1 = noble_bls12_381.G1.ProjectivePoint;
        if( len === 0 ) return new CEKConst( constT.bls12_381_G1_element, G1.ZERO );
        const MSM_UB = (BigInt(1) << BigInt(4095)) - BigInt(1);
        const MSM_LB = -(BigInt(1) << BigInt(4095));
        const scalarVals: bigint[] = [];
        const pointVals: any[] = [];
        for( let i = 0; i < len; i++ )
        {
            const s = scalars[i] as bigint;
            if( s > MSM_UB || s < MSM_LB )
                return new CEKError( "bls12_381_G1_multiScalarMul :: scalar out of bounds" );
            scalarVals.push( blsReduceScalar( s ) );
            const p = points[i] as BlsG1;
            if( !isBlsG1( p ) ) return new CEKError( "bls12_381_G1_multiScalarMul :: not a G1 element" );
            pointVals.push( p );
        }
        const result = G1.msm( pointVals, scalarVals );
        return new CEKConst( constT.bls12_381_G1_element, result );
    }

    bls12_381_G2_multiScalarMul( _scalars: CEKValue, _points: CEKValue ): ConstOrErr
    {
        const scalars = getList( _scalars );
        const points  = getList( _points );
        if( scalars === undefined || points === undefined )
            return new CEKError( "bls12_381_G2_multiScalarMul :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.bls12_381_G2_multiScalarMul );
        const sLen = BigInt( Math.min( scalars.length, points.length ) );
        this.machineBudget.sub({ mem: f.mem.at( sLen, sLen ), cpu: f.cpu.at( sLen, sLen ) });
        const len = Math.min( scalars.length, points.length );
        const G2 = noble_bls12_381.G2.ProjectivePoint;
        if( len === 0 ) return new CEKConst( constT.bls12_381_G2_element, G2.ZERO );
        const MSM_UB = (BigInt(1) << BigInt(4095)) - BigInt(1);
        const MSM_LB = -(BigInt(1) << BigInt(4095));
        const scalarVals: bigint[] = [];
        const pointVals: any[] = [];
        for( let i = 0; i < len; i++ )
        {
            const s = scalars[i] as bigint;
            if( s > MSM_UB || s < MSM_LB )
                return new CEKError( "bls12_381_G2_multiScalarMul :: scalar out of bounds" );
            scalarVals.push( blsReduceScalar( s ) );
            const p = points[i] as BlsG2;
            if( !isBlsG2( p ) ) return new CEKError( "bls12_381_G2_multiScalarMul :: not a G2 element" );
            pointVals.push( p );
        }
        const result = G2.msm( pointVals, scalarVals );
        return new CEKConst( constT.bls12_381_G2_element, result );
    }

    insertCoin( _cs: CEKValue, _tn: CEKValue, _qty: CEKValue, _v: CEKValue ): ConstOrErr
    {
        const cs  = getBytes( _cs );
        const tn  = getBytes( _tn );
        const qty = getInt( _qty );
        const v   = getLedgerValue( _v );
        if( cs === undefined || tn === undefined || qty === undefined || v === undefined )
            return new CEKError( "insertCoin :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.insertCoin );
        const sv = ledgerValueMaxDepth( v );
        this.machineBudget.sub({ mem: f.mem.at( sv ), cpu: f.cpu.at( sv ) });
        const MAX_KEY = 32;
        if( qty === _bigintZero )
        {
            if( cs.length > MAX_KEY || tn.length > MAX_KEY )
                return new CEKConst( constT.value, v as any );
            return new CEKConst( constT.value, ledgerDeleteToken( v, cs, tn ) as any );
        }
        if( cs.length > MAX_KEY ) return new CEKError( "insertCoin :: currency key too long" );
        if( tn.length > MAX_KEY ) return new CEKError( "insertCoin :: token key too long" );
        if( qty < _ledgerQMIN || qty > _ledgerQMAX ) return new CEKError( "insertCoin :: quantity out of range" );
        return new CEKConst( constT.value, ledgerInsertToken( v, cs, tn, qty ) as any );
    }

    lookupCoin( _cs: CEKValue, _tn: CEKValue, _v: CEKValue ): ConstOrErr
    {
        const cs = getBytes( _cs );
        const tn = getBytes( _tn );
        const v  = getLedgerValue( _v );
        if( cs === undefined || tn === undefined || v === undefined )
            return new CEKError( "lookupCoin :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.lookupCoin );
        const scs = bsToSize( cs );
        const stn = bsToSize( tn );
        const sv  = ledgerValueMaxDepth( v );
        this.machineBudget.sub({ mem: f.mem.at( scs, stn, sv ), cpu: f.cpu.at( scs, stn, sv ) });
        return CEKConst.int( ledgerLookupCoin( v, cs, tn ) );
    }

    unionValue( _v1: CEKValue, _v2: CEKValue ): ConstOrErr
    {
        const v1 = getLedgerValue( _v1 );
        const v2 = getLedgerValue( _v2 );
        if( v1 === undefined || v2 === undefined )
            return new CEKError( "unionValue :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unionValue );
        const sv1 = ledgerValueSizeExMem( v1 );
        const sv2 = ledgerValueSizeExMem( v2 );
        this.machineBudget.sub({ mem: f.mem.at( sv1, sv2 ), cpu: f.cpu.at( sv1, sv2 ) });
        try { return new CEKConst( constT.value, ledgerUnion( v1, v2 ) as any ); }
        catch( e: any ) { return new CEKError( e.message ); }
    }

    valueContains( _v1: CEKValue, _v2: CEKValue ): ConstOrErr
    {
        const v1 = getLedgerValue( _v1 );
        const v2 = getLedgerValue( _v2 );
        if( v1 === undefined || v2 === undefined )
            return new CEKError( "valueContains :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.valueContains );
        const sv1 = ledgerValueSizeExMem( v1 );
        const sv2 = ledgerValueSizeExMem( v2 );
        this.machineBudget.sub({ mem: f.mem.at( sv1, sv2 ), cpu: f.cpu.at( sv1, sv2 ) });
        for( const outer of v1 )
            for( const inner of outer.snd )
                if( inner.snd < _bigintZero ) return new CEKError( "valueContains :: negative quantity in first value" );
        for( const outer of v2 )
            for( const inner of outer.snd )
                if( inner.snd < _bigintZero ) return new CEKError( "valueContains :: negative quantity in second value" );
        for( const outer of v2 )
            for( const inner of outer.snd )
                if( ledgerLookupCoin( v1, outer.fst, inner.fst ) < inner.snd )
                    return CEKConst.bool( false );
        return CEKConst.bool( true );
    }

    valueData( _v: CEKValue ): ConstOrErr
    {
        const v = getLedgerValue( _v );
        if( v === undefined ) return new CEKError( "valueData :: not a value", { _v } );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.valueData );
        const sv = ledgerValueSizeExMem( v );
        this.machineBudget.sub({ mem: f.mem.at( sv ), cpu: f.cpu.at( sv ) });
        const outerEntries: any[] = [];
        for( const outer of v )
        {
            const innerEntries: any[] = [];
            for( const inner of outer.snd )
                innerEntries.push({ fst: new DataB( inner.fst ), snd: new DataI( inner.snd ) });
            outerEntries.push({ fst: new DataB( outer.fst ), snd: new DataMap( innerEntries ) });
        }
        return CEKConst.data( new DataMap( outerEntries ) );
    }

    unValueData( _d: CEKValue ): ConstOrErr
    {
        const d = getData( _d );
        if( d === undefined || !( d instanceof DataMap ) )
            return new CEKError( "unValueData :: expected map data" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.unValueData );
        const sd = dataToSize( d );
        this.machineBudget.sub({ mem: f.mem.at( sd ), cpu: f.cpu.at( sd ) });
        const MAX_KEY = 32;
        const result: LedgerValue = [];
        let prevCcy: Uint8Array | null = null;
        for( const kv of d.map )
        {
            const key = kv.fst;
            const val = kv.snd;
            if( !( key instanceof DataB ) ) return new CEKError( "unValueData :: currency key must be bytestring" );
            if( key.bytes.length > MAX_KEY ) return new CEKError( "unValueData :: currency key too long" );
            if( prevCcy !== null && u8ArrayCmp( prevCcy, key.bytes ) >= 0 )
                return new CEKError( "unValueData :: currency keys not in ascending order" );
            prevCcy = key.bytes;
            if( !( val instanceof DataMap ) ) return new CEKError( "unValueData :: token map must be data map" );
            if( val.map.length === 0 ) return new CEKError( "unValueData :: empty token map" );
            const tokens: Array<Pair<Uint8Array, bigint>> = [];
            let prevTok: Uint8Array | null = null;
            for( const tkv of val.map )
            {
                const tKey = tkv.fst;
                const tVal = tkv.snd;
                if( !( tKey instanceof DataB ) ) return new CEKError( "unValueData :: token key must be bytestring" );
                if( tKey.bytes.length > MAX_KEY ) return new CEKError( "unValueData :: token key too long" );
                if( prevTok !== null && u8ArrayCmp( prevTok, tKey.bytes ) >= 0 )
                    return new CEKError( "unValueData :: token keys not in ascending order" );
                prevTok = tKey.bytes;
                if( !( tVal instanceof DataI ) ) return new CEKError( "unValueData :: quantity must be integer" );
                if( tVal.int === _bigintZero ) return new CEKError( "unValueData :: zero quantity" );
                if( tVal.int < _ledgerQMIN || tVal.int > _ledgerQMAX ) return new CEKError( "unValueData :: quantity out of range" );
                tokens.push({ fst: tKey.bytes, snd: tVal.int });
            }
            result.push({ fst: key.bytes, snd: tokens });
        }
        return new CEKConst( constT.value, result as any );
    }

    scaleValue( _n: CEKValue, _v: CEKValue ): ConstOrErr
    {
        const n = getInt( _n );
        const v = getLedgerValue( _v );
        if( n === undefined || v === undefined )
            return new CEKError( "scaleValue :: invalid arguments" );
        const f = this.getBuiltinCostFunc( UPLCBuiltinTag.scaleValue );
        const sn = intToSize( n );
        const sv = ledgerValueSizeExMem( v );
        this.machineBudget.sub({ mem: f.mem.at( sn, sv ), cpu: f.cpu.at( sn, sv ) });
        if( n === _bigintZero ) return new CEKConst( constT.value, [] as any );
        const result: LedgerValue = [];
        for( const outer of v )
        {
            const tokens: Array<Pair<Uint8Array, bigint>> = [];
            for( const inner of outer.snd )
            {
                const product = inner.snd * n;
                if( product < _ledgerQMIN || product > _ledgerQMAX )
                    return new CEKError( "scaleValue :: scaled quantity out of range" );
                if( product !== _bigintZero )
                    tokens.push({ fst: inner.fst, snd: product });
            }
            if( tokens.length > 0 )
                result.push({ fst: outer.fst, snd: tokens });
        }
        return new CEKConst( constT.value, result as any );
    }
}

const BYTESTRING_LIMIT_LEN_N = 8192;
const INTEGER_TO_BYTE_STRING_MAXIMUM_OUTPUT_LENGTH = BigInt( BYTESTRING_LIMIT_LEN_N );

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
        new Uint8Array( nsize )
    );
    
    let bytes = fromHex(
        integer.toString(16)
        // already pad to size
        // if integer is already bigger (or equal) than size this has no effect
        .padStart( nsize * 2, "0")
    );
    const bytesLen = bytes.length;
    bytes = bigEndian ? bytes : bytes.reverse();

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
    bs: Uint8Array
): ConstOrErr
{
    let bytes = bs;
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

function bitwiseTruncate( bs: Uint8Array, len: number ): Uint8Array
{
    if( bs.length <= len ) return bs;
    return bs.slice( 0, len );
}

function bitwiseExtend( bs: Uint8Array, len: number, fill: boolean ): Uint8Array
{
    if( bs.length >= len ) return bs;
    const newBs = new Uint8Array( len );
    newBs.set( bs );
    if( fill ) newBs.fill( 0xff, bs.length, len );
    return newBs;
}