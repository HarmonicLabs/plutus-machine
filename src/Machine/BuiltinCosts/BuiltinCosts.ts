import { UPLCBuiltinTag } from "@harmoniclabs/uplc";
import { ConstMinOrQuadratic2InXY, ConstYOrLinearZ, CostFunction, FixedCost, Linear1, Linear2InBothAdd, Linear2InBothMult, Linear2InBothSub, Linear2InMax, Linear2InMin, Linear2InX, Linear2InY, Linear3InMaxYZ, Linear3InX, Linear3InY, Linear3InYAndZ, Linear3InZ, LinearOnEqualXY, OneArg, Quadratic2InY, Quadratic3InZ, SixArgs, ThreeArgs, TwoArgs, XGtEqOrConst, YGtEqOrConst } from "./costFunctions";
import { AnyV1CostModel, costModelV1ToFakeV2, AnyV2CostModel, toCostModelV2, isCostModelsV2, costModelV2ToFakeV3, costModelV1ToFakeV3, AnyV3CostModel, toCostModelV3, isCostModelsV3 } from "@harmoniclabs/cardano-costmodels-ts";
import { defineReadOnlyProperty, hasOwn } from "@harmoniclabs/obj-utils";
import { assert } from "../../utils/assert";

export type ExecCostFuncs<F extends CostFunction> = {
    mem: F,
    cpu: F
};

// `ExecCostFuncs<TwoArg>` are commented out
// beacause as the most frequent is returned as default (instead of never)
// to simplify the typescript type checking
export type BuiltinCostsOf<Tag extends UPLCBuiltinTag> =
    // Tag extends UPLCBuiltinTag.addInteger ?                  ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.subtractInteger ?             ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.multiplyInteger ?             ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.divideInteger ?               ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.quotientInteger ?             ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.remainderInteger ?            ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.modInteger ?                  ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.equalsInteger ?               ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.lessThanInteger ?             ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.lessThanEqualInteger ?        ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.appendByteString ?            ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.consByteString ?              ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.sliceByteString ?             ExecCostFuncs<ThreeArgs> :
    Tag extends UPLCBuiltinTag.lengthOfByteString ?          ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.indexByteString ?             ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.equalsByteString ?            ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.lessThanByteString ?          ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.lessThanEqualsByteString ?    ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.sha2_256 ?                    ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.sha3_256 ?                    ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.blake2b_256 ?                 ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.verifyEd25519Signature ?      ExecCostFuncs<ThreeArgs> :
    // Tag extends UPLCBuiltinTag.appendString ?                ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.equalsString ?                ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.encodeUtf8 ?                  ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.decodeUtf8 ?                  ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.ifThenElse ?                  ExecCostFuncs<ThreeArgs> :
    // Tag extends UPLCBuiltinTag.chooseUnit ?                  ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.trace ?                       ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.fstPair ?                     ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.sndPair ?                     ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.chooseList ?                  ExecCostFuncs<ThreeArgs> :
    // Tag extends UPLCBuiltinTag.mkCons ?                      ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.headList ?                    ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.tailList ?                    ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.nullList ?                    ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.chooseData ?                  ExecCostFuncs<SixArgs> :
    // Tag extends UPLCBuiltinTag.constrData ?                  ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.mapData ?                     ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.listData ?                    ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.iData ?                       ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.bData ?                       ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.unConstrData ?                ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.unMapData ?                   ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.unListData ?                  ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.unIData ?                     ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.unBData ?                     ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.equalsData ?                  ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.mkPairData ?                  ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.mkNilData ?                   ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.mkNilPairData ?               ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.serialiseData ?                   ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.verifyEcdsaSecp256k1Signature ?   ExecCostFuncs<ThreeArgs> :
    Tag extends UPLCBuiltinTag.verifySchnorrSecp256k1Signature ? ExecCostFuncs<ThreeArgs>:
    // Tag extends UPLCBuiltinTag.bls12_381_G1_add ?           ExecCostFuncs<TwoArg> :
    Tag extends UPLCBuiltinTag.bls12_381_G1_neg ?           ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G1_scalarMul ?     ExecCostFuncs<TwoArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G1_equal ?         ExecCostFuncs<TwoArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G1_hashToGroup ?   ExecCostFuncs<TwoArg> :
    Tag extends UPLCBuiltinTag.bls12_381_G1_compress ?      ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.bls12_381_G1_uncompress ?    ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G2_add ?           ExecCostFuncs<TwoArg> :
    Tag extends UPLCBuiltinTag.bls12_381_G2_neg ?           ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G2_scalarMul ?     ExecCostFuncs<TwoArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G2_equal ?         ExecCostFuncs<TwoArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_G2_hashToGroup ?   ExecCostFuncs<TwoArg> :
    Tag extends UPLCBuiltinTag.bls12_381_G2_compress ?      ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.bls12_381_G2_uncompress ?    ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_millerLoop ?       ExecCostFuncs<TwoArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_mulMlResult ?      ExecCostFuncs<TwoArg> :
    // Tag extends UPLCBuiltinTag.bls12_381_finalVerify ?      ExecCostFuncs<TwoArg> :
    Tag extends UPLCBuiltinTag.keccak_256 ?                 ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.blake2b_224 ?                ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.integerToByteString ?        ExecCostFuncs<ThreeArgs> :

    Tag extends UPLCBuiltinTag.andByteString ?              ExecCostFuncs<ThreeArgs> :
    Tag extends UPLCBuiltinTag.orByteString ?               ExecCostFuncs<ThreeArgs> :
    Tag extends UPLCBuiltinTag.xorByteString ?              ExecCostFuncs<ThreeArgs> :
    Tag extends UPLCBuiltinTag.complementByteString ?       ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.readBit ?                    ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.writeBits ?                  ExecCostFuncs<ThreeArgs> :
    // Tag extends UPLCBuiltinTag.replicateByte ?              ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.shiftByteString ?            ExecCostFuncs<TwoArgs> :
    // Tag extends UPLCBuiltinTag.rotateByteString ?           ExecCostFuncs<TwoArgs> :
    Tag extends UPLCBuiltinTag.countSetBits ?               ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.findFirstSetBit ?            ExecCostFuncs<OneArg> :
    Tag extends UPLCBuiltinTag.ripemd_160 ?                 ExecCostFuncs<OneArg> :
    // Tag extends UPLCBuiltinTag.byteStringToInteger ?        ExecCostFuncs<TwoArg> :
    ExecCostFuncs<TwoArgs>
    // never;

type ToBuiltinCache = {
    [x in UPLCBuiltinTag]: BuiltinCostsOf<x>;
};

export function costModelV1ToBuiltinCosts( costmdls: AnyV1CostModel ): <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag>
{
    return costModelV3ToBuiltinCosts( costModelV1ToFakeV3({ ...costmdls }) )
}

export function costModelV2ToBuiltinCosts( costmdls: AnyV2CostModel ): <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag>
{
    return costModelV3ToBuiltinCosts( costModelV2ToFakeV3({ ...costmdls }) )
}

export function costModelV3ToBuiltinCosts( costmdls: AnyV3CostModel ): <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag>
{
    const costs = { ...toCostModelV3( costmdls ) };
    assert(
        isCostModelsV3( costs ),
        "invalid cost models passed"
    );
    
    const cache: ToBuiltinCache = {} as any;

    return (( tag: UPLCBuiltinTag ) => {

        if( hasOwn( cache, tag ) ) return cache[tag];

        function readonly<Tag extends typeof tag>( costs: ExecCostFuncs<CostFunction> ): BuiltinCostsOf<Tag> 
        {
            const result: BuiltinCostsOf<Tag>  = {} as any;

            defineReadOnlyProperty( result, "mem", costs.mem );
            defineReadOnlyProperty( result, "cpu", costs.cpu );

            // save in cache
            defineReadOnlyProperty( cache, tag, result );

            return result;
        }

        switch( tag )
        {
            case UPLCBuiltinTag.addInteger:
                return readonly({
                    cpu: new Linear2InMax(
                        BigInt( costs["addInteger-cpu-arguments-intercept"]) ,
                        BigInt( costs["addInteger-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InMax(
                        BigInt( costs["addInteger-memory-arguments-intercept"] ) ,
                        BigInt( costs["addInteger-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.subtractInteger:
                return readonly({
                    cpu: new Linear2InMax(
                        BigInt( costs["subtractInteger-cpu-arguments-intercept"] ),
                        BigInt( costs["subtractInteger-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InMax(
                        BigInt( costs["subtractInteger-memory-arguments-intercept"] ),
                        BigInt( costs["subtractInteger-memory-arguments-slope"] ),
                    )
                });
            break;
            case UPLCBuiltinTag.multiplyInteger:
                return readonly({
                    cpu: new Linear2InBothAdd(
                        BigInt( costs["multiplyInteger-cpu-arguments-intercept"] ),
                        BigInt( costs["multiplyInteger-cpu-arguments-slope"] ),
                    ),
                    mem: new Linear2InBothAdd(
                        BigInt( costs["multiplyInteger-memory-arguments-intercept"] ),
                        BigInt( costs["multiplyInteger-memory-arguments-slope"] ),
                    ) 
                });
            break;
            case UPLCBuiltinTag.divideInteger:
                return readonly({
                    cpu: new ConstMinOrQuadratic2InXY(
                        BigInt( costs["divideInteger-cpu-arguments-constant"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-minimum"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-c00"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-c01"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-c02"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-c10"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-c11"] ),
                        BigInt( costs["divideInteger-cpu-arguments-model-arguments-c20"] ),
                    ),
                    mem: new Linear2InBothSub(
                        BigInt( costs["divideInteger-memory-arguments-intercept"]) ,
                        BigInt( costs["divideInteger-memory-arguments-slope"] ),
                        BigInt( costs["divideInteger-memory-arguments-minimum"] )
                    )
                });
            break;
            case UPLCBuiltinTag.quotientInteger:
                return readonly({
                    cpu: new ConstMinOrQuadratic2InXY(
                        BigInt( costs["quotientInteger-cpu-arguments-constant"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-minimum"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-c00"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-c01"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-c02"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-c10"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-c11"] ),
                        BigInt( costs["quotientInteger-cpu-arguments-model-arguments-c20"] ),
                    ),
                    mem: new Linear2InBothSub(
                        BigInt( costs["quotientInteger-memory-arguments-intercept"] ),
                        BigInt( costs["quotientInteger-memory-arguments-slope"] ),
                        BigInt( costs["quotientInteger-memory-arguments-minimum"] )
                    )
                });
            break;
            case UPLCBuiltinTag.remainderInteger:
                return readonly({
                    cpu: new ConstMinOrQuadratic2InXY(
                        BigInt( costs["remainderInteger-cpu-arguments-constant"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-minimum"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-c00"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-c01"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-c02"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-c10"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-c11"] ),
                        BigInt( costs["remainderInteger-cpu-arguments-model-arguments-c20"] ),
                    ),
                    mem: new Linear2InY(
                        BigInt( costs["remainderInteger-memory-arguments-intercept"] ),
                        BigInt( costs["remainderInteger-memory-arguments-slope"] ),
                    )
                });
            break;
            case UPLCBuiltinTag.modInteger:
                return readonly({
                    cpu: new ConstMinOrQuadratic2InXY(
                        BigInt( costs["modInteger-cpu-arguments-constant"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-minimum"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-c00"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-c01"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-c02"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-c10"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-c11"] ),
                        BigInt( costs["modInteger-cpu-arguments-model-arguments-c20"] ),
                    ),
                    mem: new Linear2InY(
                        BigInt( costs["modInteger-memory-arguments-intercept"] ),
                        BigInt( costs["modInteger-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.equalsInteger:
                return readonly({
                    cpu: new Linear2InMin(
                        BigInt( costs["equalsInteger-cpu-arguments-intercept"]),
                        BigInt( costs["equalsInteger-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["equalsInteger-memory-arguments"]) )
                });
            break;
            case UPLCBuiltinTag.lessThanInteger:
                return readonly({
                    cpu: new Linear2InMin(
                        BigInt( costs["lessThanInteger-cpu-arguments-intercept"] ),
                        BigInt( costs["lessThanInteger-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["lessThanInteger-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.lessThanEqualInteger:
                return readonly({
                    cpu: new Linear2InMin(
                        BigInt( costs["lessThanEqualsInteger-cpu-arguments-intercept"] ),
                        BigInt( costs["lessThanEqualsInteger-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["lessThanEqualsInteger-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.appendByteString:
                return readonly({
                    cpu: new Linear2InBothAdd(
                        BigInt( costs["appendByteString-cpu-arguments-intercept"]) ,
                        BigInt( costs["appendByteString-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InBothAdd(
                        BigInt( costs["appendByteString-memory-arguments-intercept"]) ,
                        BigInt( costs["appendByteString-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.consByteString:
                return readonly({
                    cpu: new Linear2InY(
                        BigInt( costs["consByteString-cpu-arguments-intercept"]) ,
                        BigInt( costs["consByteString-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InBothAdd(
                        BigInt( costs["consByteString-memory-arguments-intercept"]) ,
                        BigInt( costs["consByteString-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.sliceByteString:
                return readonly({
                    mem: new Linear3InZ(
                        BigInt( costs["sliceByteString-memory-arguments-intercept"] ),
                        BigInt( costs["sliceByteString-memory-arguments-slope"] ),
                    ),
                    cpu: new Linear3InZ(
                        BigInt( costs["sliceByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["sliceByteString-cpu-arguments-slope"] ),
                    )
                });
            break;
            case UPLCBuiltinTag.lengthOfByteString:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["lengthOfByteString-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["lengthOfByteString-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.indexByteString:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["indexByteString-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["indexByteString-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.equalsByteString:
                return readonly({
                    cpu: new LinearOnEqualXY(
                        BigInt( costs["equalsByteString-cpu-arguments-intercept"]),
                        BigInt( costs["equalsByteString-cpu-arguments-slope"] ),
                        BigInt( costs["equalsByteString-cpu-arguments-constant"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["equalsByteString-memory-arguments"]) )
                });
            break;
            case UPLCBuiltinTag.lessThanByteString:
                return readonly({
                    cpu: new Linear2InMin(
                        BigInt( costs["lessThanByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["lessThanByteString-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["lessThanByteString-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.lessThanEqualsByteString:
                return readonly({
                    cpu: new Linear2InMin(
                        BigInt( costs["lessThanEqualsByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["lessThanEqualsByteString-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["lessThanEqualsByteString-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.sha2_256:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["sha2_256-cpu-arguments-intercept"] ) ,
                        BigInt( costs["sha2_256-cpu-arguments-slope"] ) 
                    ),
                    mem: new FixedCost( BigInt( costs["sha2_256-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.sha3_256:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["sha3_256-cpu-arguments-intercept"] ) ,
                        BigInt( costs["sha3_256-cpu-arguments-slope"] ) 
                    ),
                    mem: new FixedCost( BigInt( costs["sha3_256-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.blake2b_256:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["blake2b_256-cpu-arguments-intercept"]) ,
                        BigInt( costs["blake2b_256-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["blake2b_256-memory-arguments"]) )
                });
            break;
            case UPLCBuiltinTag.verifyEd25519Signature:
                return readonly({
                    cpu: new Linear3InZ(
                        BigInt( costs["verifyEd25519Signature-cpu-arguments-intercept"] ),
                        BigInt( costs["verifyEd25519Signature-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["verifyEd25519Signature-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.appendString:
                return readonly({
                    cpu: new Linear2InBothAdd(
                        BigInt( costs["appendString-cpu-arguments-intercept"]) ,
                        BigInt( costs["appendString-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InBothAdd(
                        BigInt( costs["appendString-memory-arguments-intercept"]) ,
                        BigInt( costs["appendString-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.equalsString:
                return readonly({
                    cpu: new LinearOnEqualXY(
                        BigInt( costs["equalsString-cpu-arguments-intercept"]),
                        BigInt( costs["equalsString-cpu-arguments-slope"] ),
                        BigInt( costs["equalsString-cpu-arguments-constant"] )
                    ),
                    mem: new FixedCost( BigInt( costs["equalsString-memory-arguments"]) )
                });
            break;
            case UPLCBuiltinTag.encodeUtf8:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["encodeUtf8-cpu-arguments-intercept"]) ,
                        BigInt( costs["encodeUtf8-cpu-arguments-slope"] )
                    ),
                    mem: new Linear1(
                        BigInt( costs["encodeUtf8-memory-arguments-intercept"]) ,
                        BigInt( costs["encodeUtf8-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.decodeUtf8:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["decodeUtf8-cpu-arguments-intercept"]) ,
                        BigInt( costs["decodeUtf8-cpu-arguments-slope"] )
                    ),
                    mem: new Linear1(
                        BigInt( costs["decodeUtf8-memory-arguments-intercept"]) ,
                        BigInt( costs["decodeUtf8-memory-arguments-slope"] )
                    )
                });
            break;
            case UPLCBuiltinTag.ifThenElse:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["ifThenElse-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["ifThenElse-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.chooseUnit:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["chooseUnit-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["chooseUnit-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.trace:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["trace-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["trace-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.fstPair:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["fstPair-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["fstPair-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.sndPair:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["sndPair-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["sndPair-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.chooseList:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["chooseList-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["chooseList-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.mkCons:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["mkCons-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["mkCons-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.headList:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["headList-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["headList-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.tailList:
                return readonly({
                    cpu: new FixedCost( BigInt(  costs["tailList-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt(  costs["tailList-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.nullList:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["nullList-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["nullList-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.chooseData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["chooseData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["chooseData-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.constrData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["constrData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["constrData-memory-arguments"] ) ),
                });
            break;
            case UPLCBuiltinTag.mapData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["mapData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["mapData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.listData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["listData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["listData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.iData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["iData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["iData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.unConstrData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["unConstrData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["unConstrData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.unMapData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["unMapData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["unMapData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.unListData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["unListData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["unListData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.unIData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["unIData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["unIData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.unBData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["unBData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["unBData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.equalsData:
                return readonly({
                    cpu: new Linear2InMin(
                        BigInt( costs["equalsData-cpu-arguments-intercept"]),
                        BigInt( costs["equalsData-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["equalsData-memory-arguments"]) )
                });
            break;
            case UPLCBuiltinTag.mkPairData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["mkPairData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["mkPairData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.mkNilData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["mkNilData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["mkNilData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.mkNilPairData:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["mkNilPairData-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["mkNilPairData-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.serialiseData:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["serialiseData-cpu-arguments-intercept"] ), 
                        BigInt( costs["serialiseData-cpu-arguments-slope"] ), 
                    ),
                    mem: new Linear1(
                        BigInt( costs["serialiseData-memory-arguments-intercept"] ), 
                        BigInt( costs["serialiseData-memory-arguments-slope"] ), 
                    )
                });
            break;
            case UPLCBuiltinTag.verifyEcdsaSecp256k1Signature:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["verifyEcdsaSecp256k1Signature-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["verifyEcdsaSecp256k1Signature-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.verifySchnorrSecp256k1Signature:
                return readonly({
                    cpu: new Linear3InY(
                        BigInt( costs["verifySchnorrSecp256k1Signature-cpu-arguments-intercept"] ),
                        BigInt( costs["verifySchnorrSecp256k1Signature-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["verifySchnorrSecp256k1Signature-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_add:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G1_add-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_add-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_neg:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G1_neg-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_neg-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_scalarMul:
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["bls12_381_G1_scalarMul-cpu-arguments-intercept"] ),
                        BigInt( costs["bls12_381_G1_scalarMul-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_scalarMul-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_equal:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G1_equal-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_equal-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_hashToGroup:
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["bls12_381_G1_hashToGroup-cpu-arguments-intercept"] ),
                        BigInt( costs["bls12_381_G1_hashToGroup-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_hashToGroup-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_compress:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G1_compress-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_compress-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G1_uncompress:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G1_uncompress-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G1_uncompress-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_add:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G2_add-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_add-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_neg:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G2_neg-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_neg-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_scalarMul:
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["bls12_381_G2_scalarMul-cpu-arguments-intercept"] ),
                        BigInt( costs["bls12_381_G2_scalarMul-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_scalarMul-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_equal:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G2_equal-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_equal-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_hashToGroup:
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["bls12_381_G2_hashToGroup-cpu-arguments-intercept"] ),
                        BigInt( costs["bls12_381_G2_hashToGroup-cpu-arguments-slope"] ),
                    ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_hashToGroup-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_compress:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G2_compress-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_compress-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_G2_uncompress:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_G2_uncompress-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_G2_uncompress-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_millerLoop:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_millerLoop-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_millerLoop-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_mulMlResult:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_mulMlResult-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_mulMlResult-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.bls12_381_finalVerify:
                return readonly({
                    cpu: new FixedCost( BigInt( costs["bls12_381_finalVerify-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["bls12_381_finalVerify-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.keccak_256:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["keccak_256-cpu-arguments-intercept"] ),
                        BigInt( costs["keccak_256-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["keccak_256-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.blake2b_224:
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["blake2b_224-cpu-arguments-intercept"] ),
                        BigInt( costs["blake2b_224-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["blake2b_224-memory-arguments"] ) )
                });
            break;
            case UPLCBuiltinTag.integerToByteString:
                return readonly({
                    cpu: new Quadratic3InZ(
                        BigInt( costs["integerToByteString-cpu-arguments-c0"] ),
                        BigInt( costs["integerToByteString-cpu-arguments-c1"] ),
                        BigInt( costs["integerToByteString-cpu-arguments-c2"] )
                    ),
                    mem: new ConstYOrLinearZ(
                        BigInt( costs["integerToByteString-memory-arguments-intercept"] ),
                        BigInt( costs["integerToByteString-memory-arguments-slope"] ),
                    ) 
                });
            break;
            case UPLCBuiltinTag.byteStringToInteger:
                return readonly({
                    cpu: new Quadratic2InY(
                        BigInt( costs["byteStringToInteger-cpu-arguments-c0"] ),
                        BigInt( costs["byteStringToInteger-cpu-arguments-c1"] ),
                        BigInt( costs["byteStringToInteger-cpu-arguments-c2"] )
                    ),
                    mem: new Linear2InY(
                        BigInt( costs["byteStringToInteger-memory-arguments-intercept"] ),
                        BigInt( costs["byteStringToInteger-memory-arguments-slope"] ),
                    )
                });
            break;
            case UPLCBuiltinTag.andByteString: {
                return readonly({
                    cpu: new Linear3InYAndZ(
                        BigInt( costs["andByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["andByteString-cpu-arguments-slope1"] ),
                        BigInt( costs["andByteString-cpu-arguments-slope2"] )
                    ),
                    mem: new Linear3InMaxYZ(
                        BigInt( costs["andByteString-memory-arguments-intercept"] ),
                        BigInt( costs["andByteString-memory-arguments-slope"] ),
                    ),
                });
            } break; 
            case UPLCBuiltinTag.orByteString: {
                return readonly({
                    cpu: new Linear3InYAndZ(
                        BigInt( costs["orByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["orByteString-cpu-arguments-slope1"] ),
                        BigInt( costs["orByteString-cpu-arguments-slope2"] )
                    ),
                    mem: new Linear3InMaxYZ(
                        BigInt( costs["orByteString-memory-arguments-intercept"] ),
                        BigInt( costs["orByteString-memory-arguments-slope"] ),
                    ),
                });
            } break;
            case UPLCBuiltinTag.xorByteString: {
                return readonly({
                    cpu: new Linear3InYAndZ(
                        BigInt( costs["xorByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["xorByteString-cpu-arguments-slope1"] ),
                        BigInt( costs["xorByteString-cpu-arguments-slope2"] )
                    ),
                    mem: new Linear3InMaxYZ(
                        BigInt( costs["xorByteString-memory-arguments-intercept"] ),
                        BigInt( costs["xorByteString-memory-arguments-slope"] ),
                    ),
                });
            } break;
            case UPLCBuiltinTag.complementByteString: {
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["complementByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["complementByteString-cpu-arguments-slope"] )
                    ),
                    mem: new Linear1(
                        BigInt( costs["complementByteString-memory-arguments-intercept"] ),
                        BigInt( costs["complementByteString-memory-arguments-slope"] )
                    ),
                });
            } break;
            case UPLCBuiltinTag.readBit: {
                return readonly({
                    cpu: new FixedCost( BigInt( costs["readBit-cpu-arguments"] ) ),
                    mem: new FixedCost( BigInt( costs["readBit-memory-arguments"] ) ),
                });
            } break;
            case UPLCBuiltinTag.writeBits: {
                return readonly({
                    cpu: new Linear3InY(
                        BigInt( costs["writeBits-cpu-arguments-intercept"] ),
                        BigInt( costs["writeBits-cpu-arguments-slope"] )
                    ),
                    mem: new Linear3InX(
                        BigInt( costs["writeBits-memory-arguments-intercept"] ),
                        BigInt( costs["writeBits-memory-arguments-slope"] )
                    ),
                });
            } break;
            case UPLCBuiltinTag.replicateByte: {
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["replicateByte-cpu-arguments-intercept"] ),
                        BigInt( costs["replicateByte-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InX(
                        BigInt( costs["replicateByte-memory-arguments-intercept"] ),
                        BigInt( costs["replicateByte-memory-arguments-slope"] )
                    ),
                });
            } break;
            case UPLCBuiltinTag.shiftByteString: {
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["shiftByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["shiftByteString-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InX(
                        BigInt( costs["shiftByteString-memory-arguments-intercept"] ),
                        BigInt( costs["shiftByteString-memory-arguments-slope"] )
                    ),
                });
            } break;
            case UPLCBuiltinTag.rotateByteString: {
                return readonly({
                    cpu: new Linear2InX(
                        BigInt( costs["rotateByteString-cpu-arguments-intercept"] ),
                        BigInt( costs["rotateByteString-cpu-arguments-slope"] )
                    ),
                    mem: new Linear2InX(
                        BigInt( costs["rotateByteString-memory-arguments-intercept"] ),
                        BigInt( costs["rotateByteString-memory-arguments-slope"] )
                    ),
                });
            } break;
            case UPLCBuiltinTag.countSetBits: {
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["countSetBits-cpu-arguments-intercept"] ),
                        BigInt( costs["countSetBits-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["countSetBits-memory-arguments"] ) ),
                });
            } break;
            case UPLCBuiltinTag.findFirstSetBit: {
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["findFirstSetBit-cpu-arguments-intercept"] ),
                        BigInt( costs["findFirstSetBit-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["findFirstSetBit-memory-arguments"] ) ),
                });
            } break;
            case UPLCBuiltinTag.ripemd_160: {
                return readonly({
                    cpu: new Linear1(
                        BigInt( costs["ripemd_160-cpu-arguments-intercept"] ),
                        BigInt( costs["ripemd_160-cpu-arguments-slope"] )
                    ),
                    mem: new FixedCost( BigInt( costs["ripemd_160-memory-arguments"] ) ),
                });
            } break;

            default:
                // tag; // check it is type "never"
                throw new Error("unmatched builtin cost")
        }
    
        throw new Error("unmatched builtin cost")

    }) as <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag>;
}