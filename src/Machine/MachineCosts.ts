import { forceBigUInt } from "@harmoniclabs/biguint";
import { AnyV2CostModel, toCostModelV2, CostModelPlutusV2, AnyV1CostModel, AnyV3CostModel, toCostModelV3, isCostModelsV1, costModelV1ToFakeV3, costModelV2ToFakeV3, isCostModelsV2, CostModelPlutusV3, isCostModelsV3 } from "@harmoniclabs/cardano-costmodels-ts";
import { ExBudget } from "./ExBudget";
import { definePropertyIfNotPresent } from "@harmoniclabs/obj-utils";

export interface MachineCosts {
    startup: ExBudget,
    var: ExBudget,
    constant: ExBudget,
    lam: ExBudget,
    delay: ExBudget,
    force: ExBudget,
    apply: ExBudget,
    builtinNode: ExBudget,
    constr: ExBudget,
    case: ExBudget
};

export const defaultV1MachineCosts: MachineCosts = Object.freeze({
    startup:        new ExBudget({ mem: 100, cpu: 100 }),
    var:            new ExBudget({ mem: 100, cpu: 23000 }),
    constant:       new ExBudget({ mem: 100, cpu: 23000 }),
    lam:            new ExBudget({ mem: 100, cpu: 23000 }),
    delay:          new ExBudget({ mem: 100, cpu: 23000 }),
    force:          new ExBudget({ mem: 100, cpu: 23000 }),
    apply:          new ExBudget({ mem: 100, cpu: 23000 }),
    builtinNode:    new ExBudget({ mem: 100, cpu: 23000 }),
    constr:         new ExBudget({ mem: 100, cpu: 23000 }),
    case:           new ExBudget({ mem: 100, cpu: 23000 }),
});

export const defaultV2MachineCosts: MachineCosts = Object.freeze({
    startup:        new ExBudget({ mem: 100, cpu: 100 }),
    var:            new ExBudget({ mem: 100, cpu: 23000 }),
    constant:       new ExBudget({ mem: 100, cpu: 23000 }),
    lam:            new ExBudget({ mem: 100, cpu: 23000 }),
    delay:          new ExBudget({ mem: 100, cpu: 23000 }),
    force:          new ExBudget({ mem: 100, cpu: 23000 }),
    apply:          new ExBudget({ mem: 100, cpu: 23000 }),
    builtinNode:    new ExBudget({ mem: 100, cpu: 23000 }),
    constr:         new ExBudget({ mem: 100, cpu: 23000 }),
    case:           new ExBudget({ mem: 100, cpu: 23000 }),
});

export const defaultV3MachineCosts: MachineCosts = Object.freeze({
    startup:        new ExBudget({ mem: 100, cpu: 100 }),
    var:            new ExBudget({ mem: 100, cpu: 23000 }),
    constant:       new ExBudget({ mem: 100, cpu: 23000 }),
    lam:            new ExBudget({ mem: 100, cpu: 23000 }),
    delay:          new ExBudget({ mem: 100, cpu: 23000 }),
    force:          new ExBudget({ mem: 100, cpu: 23000 }),
    apply:          new ExBudget({ mem: 100, cpu: 23000 }),
    builtinNode:    new ExBudget({ mem: 100, cpu: 23000 }),
    constr:         new ExBudget({ mem: 100, cpu: 23000 }),
    case:           new ExBudget({ mem: 100, cpu: 23000 }),
});

export function costModelToMachineCosts( costMdls: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel ): MachineCosts
{
    const costs =
    // always check latest version first
    isCostModelsV3( costMdls ) ? toCostModelV3({ ...costMdls }) :
    isCostModelsV2( costMdls ) ? costModelV2ToFakeV3({ ...costMdls }) :
    costModelV1ToFakeV3({ ...costMdls });
    
    const result = {};

    type CekCostKey = keyof CostModelPlutusV3 & `cek${string}`;
    type CekCpuCostKey = CekCostKey & `${string}-exBudgetCPU`;
    type CekMemCostKey = CekCostKey & `${string}-exBudgetMemory`;

    function add( k: keyof MachineCosts, cpuKey: CekCpuCostKey, memKey: CekMemCostKey ): void
    {
        const val = new ExBudget({
            mem: forceBigUInt( costs[memKey] ),
            cpu: forceBigUInt( costs[cpuKey] )
        });

        definePropertyIfNotPresent(
            result, k,
            {
                get: () => val.clone(),
                set: () => {},
                enumerable: true,
                configurable: false
            }
        );
    }

    add("startup",      "cekStartupCost-exBudgetCPU",   "cekStartupCost-exBudgetMemory" );
    add("var",          "cekVarCost-exBudgetCPU",       "cekVarCost-exBudgetMemory")
    add("constant",     "cekConstCost-exBudgetCPU",     "cekConstCost-exBudgetMemory" );
    add("lam",          "cekLamCost-exBudgetCPU",       "cekLamCost-exBudgetMemory" );
    add("delay",        "cekDelayCost-exBudgetCPU",     "cekDelayCost-exBudgetMemory" );
    add("force",        "cekForceCost-exBudgetCPU",     "cekForceCost-exBudgetMemory" );
    add("apply",        "cekApplyCost-exBudgetCPU",     "cekApplyCost-exBudgetMemory"   );
    add("builtinNode",  "cekBuiltinCost-exBudgetCPU",   "cekBuiltinCost-exBudgetMemory" );
    add("constr",       "cekConstrCost-exBudgetCPU",    "cekConstrCost-exBudgetMemory" );
    add("case",         "cekCaseCost-exBudgetCPU",      "cekCaseCost-exBudgetMemory" );

    return result as any;
}