import { AnyV2CostModel, AnyV1CostModel, AnyV3CostModel, toCostModelV3, costModelV1ToFakeV3, costModelV2ToFakeV3, isCostModelsV2, CostModelPlutusV3, isCostModelsV3 } from "@harmoniclabs/cardano-costmodels-ts";
import { ExBudget } from "./ExBudget";
import { definePropertyIfNotPresent } from "@harmoniclabs/obj-utils";
import { UPLCTermTag } from "@harmoniclabs/uplc/dist/UPLCTerm/UPLCTermTag";

export interface MachineCosts {
    startup: ExBudget,
    [UPLCTermTag.Var]: ExBudget,
    [UPLCTermTag.Const]: ExBudget,
    [UPLCTermTag.Lambda]: ExBudget,
    [UPLCTermTag.Delay]: ExBudget,
    [UPLCTermTag.Force]: ExBudget,
    [UPLCTermTag.Application]: ExBudget,
    [UPLCTermTag.Builtin]: ExBudget,
    [UPLCTermTag.Constr]: ExBudget,
    [UPLCTermTag.Case]: ExBudget
    [UPLCTermTag.Error]: ExBudget
};

export const defaultV1MachineCosts: MachineCosts = Object.freeze({
    startup:        new ExBudget({ mem: 100, cpu: 100 }),
    [UPLCTermTag.Var]:            new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Const]:       new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Lambda]:            new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Delay]:          new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Force]:          new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Application]:          new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Builtin]:    new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Constr]:         new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Case]:           new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Error]:           new ExBudget({ mem: 100, cpu: 23000 }),
});

export const defaultV2MachineCosts: MachineCosts = Object.freeze({
    startup:        new ExBudget({ mem: 100, cpu: 100 }),
    [UPLCTermTag.Var]:            new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Const]:       new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Lambda]:            new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Delay]:          new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Force]:          new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Application]:          new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Builtin]:    new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Constr]:         new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Case]:           new ExBudget({ mem: 100, cpu: 23000 }),
    [UPLCTermTag.Error]:           new ExBudget({ mem: 100, cpu: 23000 }),
});

export const defaultV3MachineCosts: MachineCosts = Object.freeze({
    startup:        new ExBudget({ mem: 100, cpu: 100 }),
    [UPLCTermTag.Var]:            new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Const]:       new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Lambda]:            new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Delay]:          new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Force]:          new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Application]:          new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Builtin]:    new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Constr]:         new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Case]:           new ExBudget({ mem: 100, cpu: 16000 }),
    [UPLCTermTag.Error]:           new ExBudget({ mem: 100, cpu: 16000 }),
});

export function costModelToMachineCosts( costMdls: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel ): MachineCosts
{
    const costs =
    // always check latest version first
    isCostModelsV3( costMdls ) ? toCostModelV3({ ...costMdls }) :
    isCostModelsV2( costMdls ) ? costModelV2ToFakeV3({ ...costMdls }) :
    costModelV1ToFakeV3({ ...costMdls });
    
    const result: any = {};

    type CekCostKey = keyof CostModelPlutusV3 & `cek${string}`;
    type CekCpuCostKey = CekCostKey & `${string}-exBudgetCPU`;
    type CekMemCostKey = CekCostKey & `${string}-exBudgetMemory`;

    function add( k: keyof MachineCosts, cpuKey: CekCpuCostKey, memKey: CekMemCostKey ): void
    {
        result[k] = new ExBudget({
            mem: BigInt( costs[memKey] ),
            cpu: BigInt( costs[cpuKey] )
        })
    }

    add("startup",      "cekStartupCost-exBudgetCPU",   "cekStartupCost-exBudgetMemory" );
    add(UPLCTermTag.Var,          "cekVarCost-exBudgetCPU",       "cekVarCost-exBudgetMemory")
    add(UPLCTermTag.Const,     "cekConstCost-exBudgetCPU",     "cekConstCost-exBudgetMemory" );
    add(UPLCTermTag.Lambda,          "cekLamCost-exBudgetCPU",       "cekLamCost-exBudgetMemory" );
    add(UPLCTermTag.Delay,        "cekDelayCost-exBudgetCPU",     "cekDelayCost-exBudgetMemory" );
    add(UPLCTermTag.Force,        "cekForceCost-exBudgetCPU",     "cekForceCost-exBudgetMemory" );
    add(UPLCTermTag.Application,        "cekApplyCost-exBudgetCPU",     "cekApplyCost-exBudgetMemory"   );
    add(UPLCTermTag.Builtin,  "cekBuiltinCost-exBudgetCPU",   "cekBuiltinCost-exBudgetMemory" );
    add(UPLCTermTag.Constr,       "cekConstrCost-exBudgetCPU",    "cekConstrCost-exBudgetMemory" );
    add(UPLCTermTag.Case,         "cekCaseCost-exBudgetCPU",      "cekCaseCost-exBudgetMemory" );

    add(UPLCTermTag.Error,         "cekCaseCost-exBudgetCPU",      "cekCaseCost-exBudgetMemory" );

    return result as any;
}