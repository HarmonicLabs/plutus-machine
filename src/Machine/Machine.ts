import { AnyV1CostModel, AnyV2CostModel, AnyV3CostModel, AnyV4CostModel, CostModelPlutusV4, costModelV1ToFakeV3, costModelV2ToFakeV3, costModelV3ToFakeV4, defaultV4Costs, isCostModelsV1, isCostModelsV2, isCostModelsV3, isCostModelsV4, toCostModelV4 } from "@harmoniclabs/cardano-costmodels-ts";
import { ExBudget, IExBudget } from "./ExBudget";
import { getNRequiredForces, isUPLCTerm, ToUPLC, UPLCBuiltinTag, UPLCTerm, UPLCTermObj } from "@harmoniclabs/uplc";
import { CEKConst, CEKConstr, CEKDelay, CEKError, CEKLambda, CEKValue, CEKValueObj, ICEKConst, ICEKConstr, ICEKLambda, ICEKValue, TypedCEKConst } from "../CEKValue";
import { MachineState, MachineStateCompute, MachineStateDone, MachineStateReturn } from "./MachineState";
import { MachineStateTag } from "../_internal/MachineStateTag";
import { MachineContextTag } from "../_internal/MachineContextTag";
import { CEKEnv, extendEnv, lookupEnv } from "../CEKEnv";
import { costModelToMachineCosts, MachineCosts } from "./MachineCosts";
import { costModelV4ToBuiltinCosts } from "./BuiltinCosts";
import { UPLCTermTag } from "@harmoniclabs/uplc/dist/UPLCTerm/UPLCTermTag";
import { FrameAwaitArg, FrameAwaitFunTerm, FrameAwaitFunValue, FrameCases, FrameConstr, MachineContext } from "./MachineContext";
import { BnCEK, PartialBuiltin } from "../BnCEK";
import { CEKValueTag, cekValueTagToString } from "../_internal/CEKValueTag";
import { constantToUntaggedConstr } from "./constantToUntaggedConstr";

const STEP_COUNT = (
    Object.keys(UPLCTermTag)
        .filter(k => typeof UPLCTermTag[k as keyof typeof UPLCTermTag] === "number")
        .length + 1 // 1 extra for the total count of steps, used to trigger budget spending
);
const SLIPPAGE = 0x7f_ff_ff_ff; // max i32

const n0 = BigInt(0);
const n1 = BigInt(1);
const n2 = BigInt(2);

export class Machine {

    // private static readonly I64_MIN = BigInt("-9223372036854775808");

    private initialBudget: ExBudget;
    private budget: ExBudget;
    private restricting: boolean;
    private unbudgetedSteps: Uint32Array;
    private builtinCosts: CostModelPlutusV4;
    /**
     * If true the machine refuses V4-only constructs (Case-over-Const and
     * builtins 87..100), matching strict V3 (UPLC 1.1.0) semantics.
     * Default `false` — i.e. lenient V4 behaviour, the default since the
     * UPLC default version is 1.2.0.
     */
    private strictV3: boolean;

    /** Toggle strict-V3 conformance gating. */
    setStrictV3( strict: boolean ): void { this.strictV3 = strict; }

    private spendBudget(cost: IExBudget): CEKError | undefined {
        this.budget.sub(cost);
        const { cpu, mem } = this.budget;
        if (this.restricting && (cpu < n0 || mem < n0)) {
            return new CEKError("out of budget");
        }
    }

    private machineCosts: MachineCosts;

    private builtinEvaluator: BnCEK;
    private logs: string[] = [];

    constructor(
        costmodel: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel | AnyV4CostModel = defaultV4Costs,
        initialBudget?: ExBudget
    ) {
        const unlimitedBudget = ExBudget.unlimited();
        const initial = initialBudget ?? unlimitedBudget;

        this.initialBudget = initial.clone();
        this.budget = new ExBudget({ cpu: initial.cpu, mem: initial.mem });

        this.restricting = initial.cpu !== unlimitedBudget.cpu || initial.mem !== unlimitedBudget.mem;
        this.unbudgetedSteps = new Uint32Array(STEP_COUNT + 1);

        const isV4 = isCostModelsV4(costmodel);
        const isV3 = isCostModelsV3(costmodel);
        const isV2 = isCostModelsV2(costmodel);
        const isV1 = isCostModelsV1(costmodel);
        if (!(isV4 || isV3 || isV2 || isV1)) throw new Error("invalid machine costs");

        // ALWAYS CHECK LATEST VERSION FIRST
        this.builtinCosts = isV4 ? toCostModelV4(costmodel as AnyV4CostModel) :
            isV3 ? costModelV3ToFakeV4(costmodel as AnyV3CostModel) :
            isV2 ? costModelV3ToFakeV4(costModelV2ToFakeV3(costmodel as AnyV2CostModel)) :
                   costModelV3ToFakeV4(costModelV1ToFakeV3(costmodel as AnyV1CostModel));

        this.machineCosts = costModelToMachineCosts(this.builtinCosts);
        this.logs = [];

        this.builtinEvaluator = new BnCEK(
            costModelV4ToBuiltinCosts(this.builtinCosts),
            this.budget,
            this.logs
        );

        this.strictV3 = false;
    }

    resetBudget( newBudget: ExBudget = this.initialBudget ): void
    {
        this.budget = newBudget.clone();
        this.builtinEvaluator.resetBudget( this.budget );
    }

    resetLogs(): void
    {
        this.logs = [];
        this.builtinEvaluator.resetLogs( this.logs );
    }

    static evalSimple(
        _term: UPLCTerm | ToUPLC,
        // srcmap: SrcMap | undefined = undefined
    ): CEKValueObj
    {
        _term = isUPLCTerm( _term ) ? _term : _term.toUPLC(0);
        defaultMachine.resetBudget( defaultMachine.initialBudget );
        defaultMachine.resetLogs();
        return defaultMachine.eval( _term ).result;
    }
    static eval(
        term: UPLCTerm | ToUPLC,
        // srcmap: SrcMap | undefined = undefined
    ): {
        result: CEKValueObj;
        budgetSpent: ExBudget;
        logs: string[];
    } {
        term = isUPLCTerm( term ) ? term : term.toUPLC(0);
        defaultMachine.resetBudget( defaultMachine.initialBudget );
        defaultMachine.resetLogs();
        return defaultMachine.eval( term );
    }

    get remainingBudget(): ExBudget {
        this.spendUnbudgetedSteps();
        return this.budget;
    }

    eval( term: UPLCTermObj ): {
        result: CEKValueObj;
        budgetSpent: ExBudget;
        logs: string[];
    } {
        this.resetLogs();
        const budgetBefore = this.budget.clone();
        const result = this.run( term );
        const budgetSpent = ExBudget.sub( budgetBefore, this.budget );
        return { result, budgetSpent, logs: this.logs };
    }
    run(term: UPLCTermObj): CEKValueObj {
        this.spendBudget({ cpu: 100, mem: 100 }); // startup cost
        let state: MachineState = {
            tag: MachineStateTag.Compute,
            ctx: {
                tag: MachineContextTag.NoFrame,
                value: undefined,
                env: undefined,
                ctx: undefined,
                index: undefined,
                branches: undefined,
                resolved: undefined,
            },
            env: undefined,
            term,
        };

        while (true) {
            switch (state.tag) {
                case MachineStateTag.Compute: {
                    state = this.compute(state.ctx, state.env, state.term);
                    break;
                }
                case MachineStateTag.Return: {
                    state = this.returnCompute(state.ctx, state.term);
                    break;
                }
                case MachineStateTag.Done: {
                    this.spendUnbudgetedSteps();
                    return state.term;
                }
            }
        }
    }

    private stepAndMaybeSpend(step: UPLCTermTag): void {
        this.unbudgetedSteps[step]! += 1;
        this.unbudgetedSteps[STEP_COUNT]! += 1;
        if (this.unbudgetedSteps[STEP_COUNT]! >= SLIPPAGE) {
            this.spendUnbudgetedSteps();
        }
    }

    private spendUnbudgetedSteps(): void {
        let cpu = n0;
        let mem = n0;
        const machineCosts = this.machineCosts;
        for (let i = 0; i < STEP_COUNT; i++) {
            const count = this.unbudgetedSteps[i]!;
            if (count === 0) continue;

            const cost = machineCosts[i as UPLCTermTag];
            cpu += BigInt(count) * cost.cpu;
            mem += BigInt(count) * cost.mem;

            this.unbudgetedSteps[i] = 0;
        }

        this.unbudgetedSteps[STEP_COUNT] = 0;
        this.spendBudget({ cpu, mem });
    }

    private compute(ctx: MachineContext, env: CEKEnv, term: UPLCTermObj): MachineState {
        this.stepAndMaybeSpend(term.tag);
        switch (term.tag) {
            case UPLCTermTag.Var: {
                const val = lookupEnv(env, term.deBruijn);
                if (val === undefined) {
                    return {
                        tag: MachineStateTag.Done,
                        ctx: undefined,
                        env: undefined,
                        term: new CEKError("unbound uplc variable")
                    } as MachineStateDone;
                }
                return {
                    tag: MachineStateTag.Return,
                    ctx: ctx,
                    env: undefined,
                    term: val
                } as MachineStateReturn;
                break;
            }

            case UPLCTermTag.Const: {
                return {
                    tag: MachineStateTag.Return,
                    ctx: ctx,
                    env: undefined,
                    term: CEKConst.fromUplc(term)
                } as MachineStateReturn;
                break;
            }

            case UPLCTermTag.Lambda: {
                return {
                    tag: MachineStateTag.Return,
                    ctx: ctx,
                    env: undefined,
                    term: new CEKLambda(term.body, env)
                } as MachineStateReturn;
                break;
            }

            case UPLCTermTag.Delay: {
                return {
                    tag: MachineStateTag.Return,
                    ctx: ctx,
                    env: undefined,
                    term: new CEKDelay(term.delayedTerm, env)
                } as MachineStateReturn
            }

            case UPLCTermTag.Force: {
                return {
                    tag: MachineStateTag.Compute,
                    ctx: {
                        tag: MachineContextTag.FrameForce,
                        // V8 object shape optimization
                        value: undefined,
                        env: undefined,
                        ctx,
                        // V8 object shape optimization
                        index: undefined,
                        branches: undefined,
                        resolved: undefined,
                    },
                    env,
                    term: term.forced
                } as MachineStateCompute
            }

            case UPLCTermTag.Application: {
                return {
                    tag: MachineStateTag.Compute,
                    ctx: {
                        tag: MachineContextTag.FrameAwaitFunTerm,
                        // V8 object shape optimization
                        value: term.arg,
                        env,
                        ctx,
                        // V8 object shape optimization
                        index: undefined,
                        branches: undefined,
                        resolved: undefined,
                    } as FrameAwaitFunTerm,
                    env, // env: env.child(),
                    term: term.func
                } as MachineStateCompute;
            }

            case UPLCTermTag.Builtin: {
                return {
                    tag: MachineStateTag.Return,
                    ctx: ctx,
                    env: undefined,
                    term: new PartialBuiltin(
                        term.builtinTag,
                        [] // args
                    )
                } as MachineStateReturn;
            }

            case UPLCTermTag.Constr: {
                if (term.terms.length === 0) {
                    return {
                        tag: MachineStateTag.Return,
                        ctx: ctx,
                        env: undefined,
                        term: new CEKConstr(
                            term.index,
                            []
                        )
                    } as MachineStateReturn;
                }
                return {
                    tag: MachineStateTag.Compute,
                    ctx: {
                        tag: MachineContextTag.FrameConstr,
                        // V8 object shape optimization
                        value: undefined,
                        env,
                        ctx,
                        index: term.index,
                        /** fields */
                        branches: term.terms.slice(1),
                        resolved: [], // CEKValueObj[];
                    } as FrameConstr,
                    env,
                    term: term.terms[0]
                } as MachineStateCompute;
            }

            case UPLCTermTag.Case: {
                return {
                    tag: MachineStateTag.Compute,
                    ctx: {
                        tag: MachineContextTag.FrameCases,
                        // V8 object shape optimization
                        value: undefined,
                        env,
                        ctx,
                        index: undefined,
                        branches: term.continuations,
                        resolved: undefined,
                    } as FrameCases,
                    env,
                    term: term.constrTerm
                } as MachineStateCompute;
            }

            case UPLCTermTag.Error: {
                return {
                    tag: MachineStateTag.Done,
                    ctx: undefined,
                    env: undefined,
                    term: CEKError.fromUplc(term)
                } as MachineStateDone;
            }
        }
    }

    private returnCompute(
        ctx: MachineContext,
        value: CEKValueObj
    ): MachineState {
        switch (ctx.tag) {
            case MachineContextTag.NoFrame: {
                return {
                    tag: MachineStateTag.Done,
                    ctx: undefined,
                    env: undefined,
                    term: value
                } as MachineStateDone;
            }

            case MachineContextTag.FrameAwaitFunTerm: {
                return {
                    tag: MachineStateTag.Compute,
                    ctx: {
                        tag: MachineContextTag.FrameAwaitArg,
                        // V8 object shape optimization
                        value,
                        env: undefined,
                        ctx: ctx.ctx,
                        // V8 object shape optimization
                        index: undefined,
                        branches: undefined,
                        resolved: undefined,
                    } as FrameAwaitArg,
                    env: ctx.env,
                    term: ctx.value
                } as MachineStateCompute;
            }

            case MachineContextTag.FrameAwaitArg: return this.applyEvaluate(ctx.ctx, ctx.value, value);
            case MachineContextTag.FrameAwaitFunValue: return this.applyEvaluate(ctx.ctx, value, ctx.value);
            case MachineContextTag.FrameForce: return this.forceEvaluate(ctx.ctx, value);

            case MachineContextTag.FrameConstr: {
                const resolved = ctx.resolved.slice();
                resolved.push(value);
                if (ctx.branches.length === 0) {
                    return {
                        tag: MachineStateTag.Return,
                        ctx: ctx.ctx,
                        env: undefined,
                        term: new CEKConstr(
                            ctx.index,
                            resolved
                        )
                    }
                }
                const next = ctx.branches[0]!;
                const rest = ctx.branches.slice(1);
                return {
                    tag: MachineStateTag.Compute,
                    ctx: {
                        tag: MachineContextTag.FrameConstr,
                        // V8 object shape optimization
                        value: undefined,
                        env: ctx.env,
                        ctx: ctx.ctx,
                        index: ctx.index,
                        branches: rest,
                        resolved,
                    },
                    env: ctx.env,
                    term: next
                } as MachineStateCompute;
                break;
            }

            case MachineContextTag.FrameCases: {
                let index: bigint;
                let fileds: CEKValueObj[];
                switch (value.tag) {
                    case CEKValueTag.Constr: {
                        index = (value as ICEKConstr).index;
                        fileds = (value as ICEKConstr).values;
                        break;
                    }
                    case CEKValueTag.Const: {
                        if( this.strictV3 ) {
                            return {
                                tag: MachineStateTag.Done,
                                ctx: undefined,
                                env: undefined,
                                term: new CEKError(
                                    "case-over-constant requires UPLC v1.2.0 (Plutus V4)"
                                )
                            } as MachineStateDone;
                        }
                        const result = constantToUntaggedConstr(value as TypedCEKConst, ctx.branches.length);
                        if (result.tag === CEKValueTag.Error) {
                            return {
                                tag: MachineStateTag.Done,
                                ctx: undefined,
                                env: undefined,
                                term: result as CEKError
                            } as MachineStateDone;
                        }
                        index = (result as ICEKConstr).index;
                        fileds = (result as ICEKConstr).values;
                        break;
                    }
                    default: {
                        return {
                            tag: MachineStateTag.Done,
                            ctx: undefined,
                            env: undefined,
                            term: new CEKError(
                                `case: expected constr or constant value, got ${value.tag}`,
                            )
                        } as MachineStateDone;
                    }
                }
                const indexNum = Number( index );
                if (indexNum < 0 || indexNum >= ctx.branches.length) {
                    return {
                        tag: MachineStateTag.Done,
                        ctx: undefined,
                        env: undefined,
                        term: new CEKError(
                            `case: constructor tag ${index} out of range (${ctx.branches.length} branches)`,
                        )
                    } as MachineStateDone;
                }

                return {
                    tag: MachineStateTag.Compute,
                    ctx: transferArgStack(fileds, ctx.ctx),
                    env: ctx.env,
                    term: ctx.branches[indexNum]!
                };
            }

            default: return {
                tag: MachineStateTag.Done,
                ctx: undefined,
                env: undefined,
                term: new CEKError( `Unknown context in returnCompute: ${(ctx as any).tag}` )
            };
        }
    }

    private applyEvaluate( ctx: MachineContext, fun: CEKValueObj, arg: CEKValueObj ): MachineState {
        switch( fun.tag ) {
            case CEKValueTag.Lambda: {
                
                return {
                    tag: MachineStateTag.Compute,
                    ctx,
                    env: extendEnv(fun.env, arg),
                    term: fun.body
                } as MachineStateCompute;
            }

            case CEKValueTag.PartialBuiltin: {
                const expectedForces = getNRequiredForces( fun.builtinTag );
                const expectedArity = fun.nRequiredArgs;
                if( fun.forces < expectedForces ) {
                    return {
                        tag: MachineStateTag.Done,
                        ctx: undefined,
                        env: undefined,
                        term: new CEKError(
                            `builtin ${UPLCBuiltinTag[fun.builtinTag]} expected at least ${expectedForces} forces, got ${fun.forces}`
                        )
                    } as MachineStateDone
                }

                const newArgs = fun.args.concat( arg );
                if( newArgs.length === expectedArity ) {
                    const result = this.callBuiltin( fun.builtinTag, newArgs );
                    return {
                        tag: MachineStateTag.Return,
                        ctx,
                        env: undefined,
                        term: result
                    } as MachineStateReturn
                }

                return {
                    tag: MachineStateTag.Return,
                    ctx,
                    env: undefined,
                    term: new PartialBuiltin(
                        fun.builtinTag,
                        newArgs,
                        fun.forces
                    )
                } as MachineStateReturn;
            }

            default: return {
                tag: MachineStateTag.Done,
                ctx: undefined,
                env: undefined,
                term: new CEKError(
                    `attempting to apply non-function value of type ${cekValueTagToString(fun.tag)}`,
                    { fun, arg }
                )
            } as MachineStateDone;
        }
    }

    private forceEvaluate( ctx: MachineContext, value: CEKValueObj ): MachineState {
        switch( value.tag ) {
            case CEKValueTag.Delay: {
                return {
                    tag: MachineStateTag.Compute,
                    ctx,
                    env: value.env,
                    term: value.delayedTerm
                } as MachineStateCompute;
            }

            case CEKValueTag.PartialBuiltin: {
                const expectedForces = getNRequiredForces( value.builtinTag );
                if( value.forces >= expectedForces ) {
                    // const result = this.callBuiltin( value.builtinTag, value.args );
                    return {
                        tag: MachineStateTag.Done,
                        ctx: undefined,
                        env: undefined,
                        term: new CEKError(
                            `cannot force builtin ${UPLCBuiltinTag[value.builtinTag]} that has already received all its arguments`
                        )
                    } as MachineStateDone;
                }

                const newForces = value.forces + 1;
                return {
                    tag: MachineStateTag.Return,
                    ctx,
                    env: undefined,
                    term: new PartialBuiltin(
                        value.builtinTag,
                        value.args,
                        newForces
                    )
                } as MachineStateReturn;
            }

            default: return {
                tag: MachineStateTag.Done,
                ctx: undefined,
                env: undefined,
                term: new CEKError(
                    `NonPolymorphicInstantiation: cannot force ${cekValueTagToString(value.tag)}`
                )
            } as MachineStateDone;
        }
    }

    private callBuiltin<Tag extends UPLCBuiltinTag>( tag: Tag, args: CEKValueObj[] ): CEKValueObj {
        return this.builtinEvaluator.eval( tag, args as any );
    }
}

export function transferArgStack(fields: CEKValueObj[], ctx: MachineContext): MachineContext {
    let c = ctx;
    for (let i = fields.length - 1; i >= 0; i--) {
        c = {
            tag: MachineContextTag.FrameAwaitFunValue, // "frame_await_fun_value",
            value: fields[i],
            env: undefined,
            ctx: c,
            index: undefined,
            branches: undefined,
            resolved: undefined,
        } as FrameAwaitFunValue;
    }
    return c;
}

const defaultMachine = new Machine( defaultV4Costs );