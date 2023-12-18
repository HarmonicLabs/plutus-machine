import { UPLCTerm, ToUPLC, UPLCBuiltinTag, Builtin, getNRequiredForces, isUPLCTerm, ErrorUPLC, UPLCVar, UPLCConst, Lambda, Delay, Force, Application } from "@harmoniclabs/uplc";
import { BnCEK } from "../BnCEK/BnCEK";
import { PartialBuiltin } from "../BnCEK/PartialBuiltin";
import { CEKEnv } from "../CEKEnv";
import { CEKFrames, Frame, isFrame } from "../CEKFrames/CEKFrames";
import { ForceFrame } from "../CEKFrames/ForceFrame";
import { LApp } from "../CEKFrames/LApp";
import { RApp } from "../CEKFrames/RApp";
import { CEKHeap } from "../CEKHeap";
import { CEKSteps, ComputeStep, ReturnStep } from "../CEKSteps";
import { DelayCEK } from "../DelayCEK";
import { LambdaCEK } from "../LambdaCEK";
import { ScriptType } from "../utils/ScriptType";
import { costModelV2ToBuiltinCosts, BuiltinCostsOf } from "./BuiltinCosts/BuiltinCosts";
import { ExBudget } from "./ExBudget";
import { MachineCosts, costModelV2ToMachineCosts } from "./MachineCosts";
import { defineReadOnlyHiddenProperty, defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { AnyV1CostModel, AnyV2CostModel, costModelV1ToFakeV2, defaultV2Costs, isCostModelsV1, isCostModelsV2, toCostModelV2 } from "@harmoniclabs/cardano-costmodels-ts";

export type MachineVersionV1 = ScriptType.PlutusV1;
export type MachineVersionV2 = ScriptType.PlutusV2;

export const machineVersionV1 = ScriptType.PlutusV1 as const;
export const machineVersionV2 = ScriptType.PlutusV2 as const;

export type MachineVersion = MachineVersionV1 | MachineVersionV2

function isMachineVersion( something: any ): something is MachineVersion
{
    return something === ScriptType.PlutusV1 || something === ScriptType.PlutusV2;
}

type CostModelOf<V extends MachineVersion> =
    V extends ScriptType.PlutusV1 ? AnyV1CostModel :    
    V extends ScriptType.PlutusV2 ? AnyV2CostModel :
    never;

export type SrcMap = { [node_index: number]: string };

export class Machine<V extends MachineVersion = MachineVersion>
{
    readonly version!: V;

    constructor(
        version: V,
        costmodel: CostModelOf<V>
    )
    {
        if( !isMachineVersion( version ) ) throw new Error("invalid MachineVersion");
        defineReadOnlyProperty( this, "version", version );

        const isV1 = isCostModelsV1( costmodel );
        if( !isV1 && !isCostModelsV2( costmodel ) ) throw new Error("invalid machine costs");
        
        const costs = isV1 ? costModelV1ToFakeV2( costmodel ) : toCostModelV2( costmodel );
        defineReadOnlyHiddenProperty( this, "getBuiltinCostFuction", costModelV2ToBuiltinCosts( costs ) );
        defineReadOnlyHiddenProperty( this, "machineCosts", costModelV2ToMachineCosts( costs ) );
    }

    static evalSimple(
        _term: UPLCTerm | ToUPLC,
        srcmap: SrcMap | undefined = undefined
    ): UPLCTerm
    {
        return (
            new Machine(
                ScriptType.PlutusV2,
                defaultV2Costs
            )
        ).eval( _term, srcmap ).result;
    }

    static eval(
        _term: UPLCTerm | ToUPLC,
        srcmap: SrcMap | undefined = undefined
    ): { result: UPLCTerm, budgetSpent: ExBudget, logs: string[] }
    {
        return (
            new Machine(
                ScriptType.PlutusV2,
                defaultV2Costs
            )
        ).eval( _term, srcmap );
    }

    eval(
        _term: UPLCTerm | ToUPLC,
        srcmap: SrcMap | undefined = undefined
    )
    :{ 
        result: UPLCTerm,
        budgetSpent: ExBudget,
        logs: string[]
    }
    {
        const has_src = typeof srcmap === "object" && srcmap !== null; 

        // new budget for each call
        const budget = new ExBudget({ mem: 0, cpu: 0 });
        const spend = budget.add;

        const logs: string[] = [];

        const machineCosts: MachineCosts = (this as any).machineCosts;
        const getBuiltinCostFuction: <Tag extends UPLCBuiltinTag>( tag: Tag ) => BuiltinCostsOf<Tag> = (this as any).getBuiltinCostFuction;

        function spendBuiltin( bn: Builtin ): void
        {
            const nForces = BigInt( getNRequiredForces( bn.tag ) );

            if( nForces === BigInt(0) )
            {
                budget.add( machineCosts.builtinNode );
                return;
            }

            budget.add({
                mem: machineCosts.builtinNode.mem + ( machineCosts.force.mem * nForces ),
                cpu: machineCosts.builtinNode.cpu + ( machineCosts.force.cpu * nForces )
            });
        }

        const bnCEK = new BnCEK( getBuiltinCostFuction, budget, logs );
        
        const frames = new CEKFrames();
        const steps = new CEKSteps();
        const heap = new CEKHeap();

        let _poppedFrame: Frame = undefined as any;
        function popTopFrame(): Frame
        {
            return _poppedFrame = frames.pop();
        }

        function defineCallStack( thing: any )
        {
            if( !Array.isArray( thing.__call_stack__ ) )
            {
                const hasPoppedFrame = isFrame( _poppedFrame );

                // re insert top frame for call stack to include it.
                if( hasPoppedFrame ) frames.push( _poppedFrame );
                
                Object.defineProperty(
                    thing, "__call_stack__", {
                        value: Object.freeze( frames.callStack() ),
                        enumerable: true,
                        writable: false,
                        configurable: false
                    }
                );

                // re-remove the top frame
                if( hasPoppedFrame ) frames.pop();
            }
        }
    
        const uplc = isUPLCTerm( _term ) ? _term : _term.toUPLC(0);

        if( has_src )
        {
            indexNodes( uplc );
        }

        spend( machineCosts.startup );
        compute( uplc, new CEKEnv( heap ) );
    
        while( !frames.isEmpty || steps.topIsCompute )
        {
            const nextStep = steps.pop();
    
            if( nextStep === undefined )
            {
                throw new Error("step stack was empty; don't know how to proceed");
            }
            if( nextStep instanceof ComputeStep )
            {
                compute( nextStep.term, nextStep.env );
            }
            else if( nextStep instanceof ReturnStep )
            {
                returnCEK( nextStep.value );
            }
            else throw new Error( "unknown step" );
        }
    
        function compute( term: UPLCTerm, env: CEKEnv ): void
        {
            // n_compute++;
    
            if( term instanceof ErrorUPLC )
            {
                defineCallStack( term );
                steps.push( new ReturnStep( term ) );
                return;
            }
    
            if( term instanceof UPLCVar )
            {
                const varValue = env.get( term.deBruijn );
                if( varValue === undefined ) throw new Error();
                
                budget.add( machineCosts.var );
                steps.push( new ReturnStep( varValue ) );
                return;
            }
    
            if( term instanceof UPLCConst )
            {
                budget.add( machineCosts.constant );
                steps.push( new ReturnStep( term ) );
                return;
            }
    
            if( term instanceof Lambda )
            {
                budget.add( machineCosts.lam );
                steps.push(
                    new ReturnStep(
                        new LambdaCEK( term.body, env.clone() )
                    )
                );
    
                return;
            }
    
            if( term instanceof Delay )
            {
                budget.add( machineCosts.delay );
                steps.push(
                    new ReturnStep(
                        new DelayCEK(
                            term.delayedTerm,
                            env
                        )
                    )
                );
                return;
            }
    
            if( term instanceof Force )
            {
                budget.add( machineCosts.force );
                frames.push( new ForceFrame() );
                steps.push( new ComputeStep( term.termToForce, env ) );
                return;
            }
    
            if( term instanceof Application )
            {
                budget.add( machineCosts.apply );
                const rapp = new RApp( term.argTerm, env );

                if( has_src && typeof( (term as any).__node_index__ ) === "number" )
                {
                    rapp.src = srcmap[(term as any).__node_index__]
                }

                frames.push( rapp );
                steps.push( new ComputeStep( term.funcTerm, env ) );
                return;
            }
    
            if(
                term instanceof Builtin ||
                (term as any) instanceof PartialBuiltin
            )
            {
                if( term instanceof Builtin )
                {
                    spendBuiltin( term );
                }
                steps.push(
                    new ReturnStep(
                        term instanceof PartialBuiltin? term : new PartialBuiltin( term.tag )
                    )
                );
                return;
            }
    
            const err = new ErrorUPLC("ComputeStep/no match", { term } );
            defineCallStack( err );
            steps.push( new ReturnStep( err ) )
            return;
        }
    
        function returnCEK( v: UPLCTerm ): void
        {
            // n_returns++;
            if(
                v instanceof ErrorUPLC && (
                    !Array.isArray( (v as any).__call_stack__ ) ||
                    (v as any).__call_stack__.length === 0
                )
            )
            {
                defineCallStack( v );
            }
    
            if( v instanceof PartialBuiltin )
            {
                if( v.nMissingArgs === 0 )
                {
                    const evalResult = bnCEK.eval( v );
                    if( evalResult instanceof ErrorUPLC )
                    {
                        defineCallStack( evalResult );
                    }
                    steps.push( new ReturnStep( evalResult ) );
                    return;
                }
                if( frames.isEmpty )
                {
                    const err = new ErrorUPLC("ReturnStep/PartialBuiltin/empty frames");
                    defineCallStack( err );
                    steps.push( new ReturnStep( err ) );
                    return;
                }
            }
    
            if( frames.isEmpty )
            {
                // ends while loop
                steps.push( new ReturnStep( v ) );
                return;    
            }
    
            const topFrame = popTopFrame();
    
            if( v instanceof ErrorUPLC )
            {
                defineCallStack( v );
                steps.push( new ReturnStep( v ) );
                return;
            }
    
            if( topFrame instanceof ForceFrame )
            {
                if(
                    v instanceof Delay      ||
                    v instanceof DelayCEK
                )
                {
                    steps.push(
                        new ComputeStep(
                            v.delayedTerm,
                            v instanceof DelayCEK ? v.env : new CEKEnv( heap )
                        )
                    );
                    return;
                }
    
                // not sure about the env...
                steps.push(
                    new ComputeStep(
                        v,
                        new CEKEnv( heap )
                    )
                );
                return;
            }
            // builtin forces are added only at compile time
            // ence not present in plu-ts UPLCTerm
    
            if( topFrame instanceof RApp )
            {
                frames.push( new LApp( v, topFrame.src ) );
                steps.push( new ComputeStep( topFrame.arg, topFrame.env ) );
                return;
            }
    
            if( topFrame instanceof LApp )
            {
                if(
                    topFrame.func instanceof Lambda     ||
                    topFrame.func instanceof LambdaCEK
                )
                {
                    const _env = topFrame.func instanceof LambdaCEK ?
                        topFrame.func.env :
                        new CEKEnv( heap );
    
                    _env.push( v );
    
                    steps.push(
                        new ComputeStep(
                            topFrame.func.body,
                            _env
                        )
                    );
                    return;
                }
                
                if(
                    topFrame.func instanceof Builtin || 
                    topFrame.func instanceof PartialBuiltin 
                )
                {
                    let bn = topFrame.func.clone();
                    if( bn instanceof Builtin )
                    {
                        spendBuiltin( bn );
                        bn = new PartialBuiltin( bn.tag );
                    }
    
                    if( bn.nMissingArgs === 0 ) {
                        const evalResult = bnCEK.eval( bn );
                        if( evalResult instanceof ErrorUPLC )
                        {
                            defineCallStack( evalResult );
                        }
                        return returnCEK( evalResult );
                    }
    
                    bn.apply( v )
    
                    // choose what to do based on the frames
                    return returnCEK( bn );
                }
            }
    
            const err = new ErrorUPLC("ReturnStep/LApp", { topFrame: topFrame } );
            defineCallStack( err );
            steps.push( new ReturnStep( err ) )
            return;
        }
    
        // Debug.timeEnd(timeTag);

        return {
            result: (steps.pop() as ReturnStep)?.value ?? new ErrorUPLC("steps.pop() was not a ReturnStep"),
            budgetSpent: budget,
            logs: logs
        };
    }

    
}

// export interface EvalDebugOptions {
//     onComputeStep: () => void
//     onReturnStep: () => void
// }

function indexNodes( uplc: UPLCTerm, idx: number = 0 ): number
{
    Object.defineProperty(
        uplc, "__node_index__", {
            value: Number( idx ),
            writable: false,
            enumerable: true,
            configurable: false
        }
    );

    if( uplc instanceof Application )
    {
        const max_fn = indexNodes( uplc.funcTerm, idx + 1 );
        return indexNodes( uplc.argTerm, max_fn + 1 );
    }

    if( uplc instanceof Force ) return indexNodes( uplc.termToForce, idx );
    if( uplc instanceof Delay ) return indexNodes( uplc.delayedTerm, idx );
    if( uplc instanceof Lambda ) return indexNodes( uplc.body, idx );

    // UPLCVar | UPLCConst | ErrorUPLC | Builtin
    // have no childs
    return idx;
}