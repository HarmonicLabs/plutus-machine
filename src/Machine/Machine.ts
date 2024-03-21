import { UPLCTerm, ToUPLC, UPLCBuiltinTag, Builtin, getNRequiredForces, isUPLCTerm, ErrorUPLC, UPLCVar, UPLCConst, Lambda, Delay, Force, Application, Constr, Case } from "@harmoniclabs/uplc";
import { BnCEK } from "../BnCEK/BnCEK";
import { PartialBuiltin } from "../BnCEK/PartialBuiltin";
import { CEKEnv } from "../CEKEnv";
import { CEKFrames, Frame, isFrame } from "../CEKFrames/CEKFrames";
import { ForceFrame } from "../CEKFrames/ForceFrame";
import { LApp } from "../CEKFrames/LApp";
import { RApp } from "../CEKFrames/RApp";
import { CEKHeap } from "../CEKHeap";
import { CEKSteps, ComputeStep, ReturnStep } from "../CEKSteps";
import { CEKDelay } from "../CEKValue/CEKDelay";
import { CEKLambda } from "../CEKValue/CEKLambda";
import { BuiltinCostsOf, costModelV3ToBuiltinCosts } from "./BuiltinCosts/BuiltinCosts";
import { ExBudget } from "./ExBudget";
import { MachineCosts, costModelToMachineCosts } from "./MachineCosts";
import { defineReadOnlyHiddenProperty } from "@harmoniclabs/obj-utils";
import { AnyV1CostModel, AnyV2CostModel, AnyV3CostModel, costModelV1ToFakeV3, costModelV2ToFakeV3, defaultV3Costs, isCostModelsV1, isCostModelsV2, isCostModelsV3, toCostModelV3 } from "@harmoniclabs/cardano-costmodels-ts";
import { ConstrFrame } from "../CEKFrames/ConstrFrame";
import { CEKValue, isCEKValue } from "../CEKValue";
import { CaseFrame } from "../CEKFrames/CaseFrame";
import { CEKError } from "../CEKValue/CEKError";
import { CEKConst } from "../CEKValue/CEKConst";
import { CEKConstr } from "../CEKValue/CEKConstr";

export type SrcMap = { [node_index: number]: string };

export class Machine
{
    constructor( costmodel: AnyV1CostModel | AnyV2CostModel | AnyV3CostModel )
    {
        const isV1 = isCostModelsV1( costmodel );
        const isV2 = isCostModelsV2( costmodel );
        const isV3 = isCostModelsV3( costmodel );
        if(!( isV1 || isV2 || isV3 )) throw new Error("invalid machine costs");
        
        const costs = isV1 ? costModelV1ToFakeV3( costmodel ) :
            isV2 ? costModelV2ToFakeV3( costmodel ) :
            toCostModelV3( costmodel );

        defineReadOnlyHiddenProperty( this, "getBuiltinCostFuction", costModelV3ToBuiltinCosts( costs ) );
        defineReadOnlyHiddenProperty( this, "machineCosts", costModelToMachineCosts( costs ) );
    }

    static evalSimple(
        _term: UPLCTerm | ToUPLC,
        srcmap: SrcMap | undefined = undefined
    ): CEKValue
    {
        return new Machine( defaultV3Costs ).eval( _term, srcmap ).result;
    }

    static eval(
        _term: UPLCTerm | ToUPLC,
        srcmap: SrcMap | undefined = undefined
    ): { result: CEKValue, budgetSpent: ExBudget, logs: string[] }
    {
        return new Machine( defaultV3Costs ).eval( _term, srcmap );
    }

    eval(
        _term: UPLCTerm | ToUPLC,
        srcmap: SrcMap | undefined = undefined
    )
    :{ 
        result: CEKValue,
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
            const nextStep = steps.top();
    
            if( nextStep === undefined )
            {
                throw new Error("step stack was empty; don't know how to proceed");
            }
            if( nextStep instanceof ComputeStep )
            {
                void steps.pop();
                compute( nextStep.term, nextStep.env );
            }
            else if( nextStep instanceof ReturnStep )
            {
                if( nextStep.value instanceof CEKError )
                {
                    steps._clear();
                    steps.push( nextStep ); // save error
                    break; // exit loop
                }
                void steps.pop();
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
                steps.push( new ReturnStep( CEKError.fromUplc( term ) ) );
                return;
            }
    
            if( term instanceof UPLCVar )
            {
                const varValue = env.get( term.deBruijn );
                if( varValue === undefined )
                {
                    steps.push(
                        new ReturnStep(
                            new CEKError("unbound uplc variable")
                        )
                    );
                    return;
                }
                
                budget.add( machineCosts.var );
                steps.push( new ReturnStep( varValue ) );
                return;
            }
    
            if( term instanceof UPLCConst )
            {
                budget.add( machineCosts.constant );
                steps.push( new ReturnStep( CEKConst.fromUplc( term ) ) );
                return;
            }
    
            if( term instanceof Lambda )
            {
                budget.add( machineCosts.lam );
                steps.push(
                    new ReturnStep(
                        new CEKLambda( term.body, env.clone() )
                    )
                );
    
                return;
            }
    
            if( term instanceof Delay )
            {
                budget.add( machineCosts.delay );
                steps.push(
                    new ReturnStep(
                        new CEKDelay(
                            term.delayedTerm,
                            env.clone()
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
    
            // 𝑠; 𝜌 ⊳ [𝑀 𝑁]↦ [_ (𝑁, 𝜌)]⋅𝑠; 𝜌 ⊳ 𝑀
            if( term instanceof Application )
            {
                budget.add( machineCosts.apply );
                const rapp = new RApp( term.argTerm, env.clone() );
                // [_ (𝑁, 𝜌)]⋅𝑠;
                frames.push( rapp );
                // 𝜌 ⊳ 𝑀
                steps.push( new ComputeStep( term.funcTerm, env ) );

                if( has_src && typeof( (term as any).__node_index__ ) === "number" )
                    rapp.src = srcmap[(term as any).__node_index__];
                return;
            }

            // 𝑠; 𝜌 ⊳ (constr 𝑖 𝑀⋅𝑀[])↦ (constr 𝑖 _ (𝑀[], 𝜌))⋅𝑠; 𝜌 ⊳ 𝑀
            // 𝑠; 𝜌 ⊳ (constr 𝑖 [])↦ 𝑠 ⊲ 〈constr 𝑖 []〉
            if( term instanceof Constr )
            {
                budget.add( machineCosts.constr );
                // 𝑠; 𝜌 ⊳ (constr 𝑖 𝑀⋅𝑀[])↦ (constr 𝑖 _ (𝑀[], 𝜌))⋅𝑠; 𝜌 ⊳ 𝑀
                if( term.terms.length > 0 )
                {
                    // (constr 𝑖 _ (𝑀[], 𝜌))⋅𝑠;
                    frames.push(new ConstrFrame(
                        term.index,
                        term.terms.slice( 1 ),
                        [],
                        env
                    ));
                    // 𝜌 ⊳ 𝑀
                    steps.push(new ComputeStep(term.terms[0], env))
                }
                // 𝑠; 𝜌 ⊳ (constr 𝑖 [])↦ 𝑠 ⊲ 〈constr 𝑖 []〉
                else
                {
                    steps.push(
                        new ReturnStep(
                            new CEKConstr(
                                term.index,
                                []
                            )
                        )
                    );
                }
                return;
            }

            // 𝑠; 𝜌 ⊳ (case 𝑁 𝑀[])↦ (case _ (𝑀[], 𝜌))⋅𝑠; 𝜌 ⊳ 𝑁
            if( term instanceof Case )
            {
                // (case _ (𝑀[], 𝜌))⋅𝑠;
                frames.push(
                    new CaseFrame(
                        term.continuations,
                        env.clone()
                    )
                );
                // 𝜌 ⊳ 𝑁
                steps.push(
                    new ComputeStep(
                        term.constrTerm,
                        env
                    )
                );
                return;
            }
    
            // 𝑠; 𝜌 ⊳ (builtin 𝑏)↦ 𝑠 ⊲ 〈builtin 𝑏 [] 𝛼(𝑏)〉
            if(
                term instanceof Builtin ||
                (term as PartialBuiltin) instanceof PartialBuiltin
            )
            {
                if( term instanceof Builtin ) spendBuiltin( term );
                // 𝑠 ⊲ 〈builtin 𝑏 [] 𝛼(𝑏)〉
                steps.push(
                    new ReturnStep(
                        term instanceof PartialBuiltin? term : new PartialBuiltin( term.tag )
                    )
                );
                return;
            }

            const err = new CEKError("ComputeStep/no match", { term } );
            defineCallStack( err );
            steps.push( new ReturnStep( err ) )
            return;
        }
    
        function returnCEK( v: CEKValue ): void
        {
            if( v instanceof ErrorUPLC )
            {
                defineCallStack( v );
                steps._clear();
                // terminates while loop
                steps.push( new ReturnStep( v ) );
                return;
            }
    
            if( v instanceof PartialBuiltin )
            {
                if( v.nMissingArgs === 0 )
                {
                    console.log( v );
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

            function applyBuiltin( bn: Builtin | PartialBuiltin, value: CEKValue ): void
            {
                if( bn instanceof Builtin )
                {
                    spendBuiltin( bn );
                    bn = new PartialBuiltin( bn.tag );
                }

                bn.apply( value );

                if( bn.nMissingArgs === 0 ) {
                    const evalResult = bnCEK.eval( bn );
                    if( evalResult instanceof CEKError ) defineCallStack( evalResult );
                    steps.push( new ReturnStep( evalResult ) );
                    return;
                }

                // choose what to do based on the frames
                steps.push( new ReturnStep( bn ) );
                return;
            }

            //[] ⊲ 𝑉 ↦ ◻𝑉
            if( frames.isEmpty )
            {
                // ends while loop
                steps.push( new ReturnStep( v ) );
                return;    
            }
    
            const topFrame = popTopFrame();
            
            if( topFrame instanceof RApp )
            {
                if( isCEKValue( topFrame.arg ) )
                {
                    // right application to value
                    // and value is lambda
                    // has the same result
                    // of left application to lambda
                    // [_ 𝑉 ]⋅𝑠 ⊲ 〈lam 𝑥 𝑀 𝜌〉↦ 𝑠; 𝜌[𝑥 ↦ 𝑉 ] ⊳ 𝑀
                    if( v instanceof CEKLambda )
                    {
                        const env = v.env.clone();
                        // 𝜌[𝑥 ↦ 𝑉 ]
                        env.push( topFrame.arg );
                        // ⊳ 𝑀
                        steps.push(
                            new ComputeStep(
                                v.body,
                                env
                            )
                        );
                        return;
                    }
                    // [_ 𝑉 ]⋅𝑠 ⊲ 〈builtin 𝑏 𝑉 (𝜄⋅𝜂)〉 ↦ 𝑠 ⊲ 〈builtin 𝑏 (𝑉 ⋅𝑉 ) 𝜂〉 if 𝜄 ∈ U# ∪ V∗
                    else if(
                        v instanceof PartialBuiltin ||
                        v instanceof Builtin
                    )
                    {
                        applyBuiltin( v.clone(), topFrame.arg );
                        return;
                    }
                    return;
                }
                // [_ (𝑀, 𝜌)]⋅𝑠 ⊲ 𝑉 ↦ [𝑉 _]⋅𝑠; 𝜌 ⊳ 𝑀
                else
                {
                    // [𝑉 _]⋅𝑠;
                    frames.push( new LApp( v, topFrame.src ) );
                    // 𝜌 ⊳ 𝑀
                    steps.push( new ComputeStep( topFrame.arg, topFrame.env ) );
                    return;
                }
                return;
            }
    
            if( topFrame instanceof LApp )
            {
                // [〈builtin 𝑏 𝑉 (𝜄⋅𝜂)〉 _]⋅𝑠 ⊲ 𝑉 ↦ 𝑠 ⊲ 〈builtin 𝑏 (𝑉 ⋅𝑉 ) 𝜂〉 if 𝜄 ∈ U# ∪ V∗
                // [〈builtin 𝑏 𝑉 [𝜄]〉 _]⋅𝑠 ⊲ 𝑉 ↦ 𝖤𝗏𝖺𝗅 𝖢𝖤𝖪 (𝑠, 𝑏, 𝑉 ⋅𝑉 ) if 𝜄 ∈ U# ∪ V∗
                if(
                    topFrame.func instanceof Builtin || 
                    topFrame.func instanceof PartialBuiltin 
                )
                {
                    applyBuiltin( topFrame.func.clone(), v );
                    return;
                }

                if(
                    topFrame.func instanceof Lambda     ||
                    topFrame.func instanceof CEKLambda
                )
                {
                    const _env = topFrame.func instanceof CEKLambda ?
                        (topFrame.func as CEKLambda).env :
                        new CEKEnv( heap );
    
                    _env.push( v );
    
                    steps.push(
                        new ComputeStep(
                            (topFrame.func as CEKLambda | Lambda).body,
                            _env
                        )
                    );
                    return;
                }
                return;
            }

            // builtin forces are added only at compile time
            // hence not present in plu-ts UPLCTerm
            if( topFrame instanceof ForceFrame )
            {
                if(
                    v instanceof Delay      ||
                    v instanceof CEKDelay
                )
                {
                    steps.push(
                        new ComputeStep(
                            (v as Delay | CEKDelay).delayedTerm,
                            v instanceof CEKDelay ? (v as CEKDelay).env : new CEKEnv( heap )
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

            if( topFrame instanceof ConstrFrame )
            {
                // (constr 𝑖 𝑉[] _ ([], 𝜌))⋅𝑠 ⊲ 𝑉 ↦ 𝑠 ⊲ 〈constr 𝑖 𝑉 ⋅𝑉[] 〉
                if( topFrame.terms.length === 0 )
                {
                    // 𝑠 ⊲ 〈constr 𝑖 𝑉 ⋅𝑉[] 〉
                    steps.push(
                        new ReturnStep(
                            new CEKConstr(
                                topFrame.tag,
                                // 𝑉 ⋅𝑉[]
                                [ v ].concat( topFrame.values )
                            )
                        )
                    );
                    return;
                }
                // (constr 𝑖 𝑉[] _ (𝑀⋅𝑀[], 𝜌))⋅𝑠 ⊲ 𝑉 ↦ (constr 𝑖 𝑉 ⋅𝑉[] _ (𝑀[], 𝜌))⋅𝑠; 𝜌 ⊳ 𝑀
                else
                {
                    // (constr 𝑖 𝑉 ⋅𝑉[] _ (𝑀[], 𝜌))⋅𝑠
                    frames.push(
                        new ConstrFrame(
                            // 𝑖
                            topFrame.tag,
                            // 𝑀[]
                            topFrame.terms.slice( 1 ),
                            // 𝑉 ⋅𝑉[]
                            [ v ].concat( topFrame.values ),
                            // 𝜌
                            topFrame.env.clone()
                        )
                    );
                    // 𝜌 ⊳ 𝑀
                    steps.push(
                        new ComputeStep(
                            topFrame.terms[0],
                            topFrame.env
                        )
                    )
                    return;
                }
                return;
            }

            // (case _ (𝑀0 … 𝑀𝑛 , 𝜌))⋅𝑠 ⊲ 〈constr 𝑖 𝑉0 … 𝑉𝑚 〉 ↦ [_ 𝑉𝑚 ]⋅⋯⋅[_ 𝑉0 ]⋅𝑠; 𝜌 ⊳ 𝑀𝑖 if 0 ≤ 𝑖 ≤ 𝑛
            if( topFrame instanceof CaseFrame )
            {
                if(!( v instanceof CEKConstr ))
                {
                    steps.push(
                        new ReturnStep(
                            new CEKError(
                                "case frame did not receive constr value",
                                { value: v }
                            )
                        )
                    );
                    return;
                }
                //[_ 𝑉𝑚 ]⋅⋯⋅[_ 𝑉0 ]⋅𝑠;
                frames.push(
                    ...v.values
                    .map( v => new RApp( v, topFrame.env.clone() ) )
                    // .reverse()
                );
                const n = topFrame.terms.length;
                const i = Number( v.tag );
                // if 0 ≤ 𝑖 ≤ 𝑛
                if(!( 0 <= i && i <= n ))
                {
                    steps._clear();
                    steps.push(
                        new ReturnStep(
                            new CEKError(
                                "case frame received constr with tag " + i +
                                "; but only ad aviable " + n + " term continuations"
                            )
                        )
                    );
                    return;
                }
                // 𝜌 ⊳ 𝑀𝑖
                steps.push(
                    new ComputeStep(
                        topFrame.terms[i],
                        topFrame.env
                    )
                );
                return;
            }
    
            const err = new CEKError("ReturnStep/LApp", { topFrame: topFrame } );
            defineCallStack( err );
            steps.push( new ReturnStep( err ) )
            return;
        }
    
        // Debug.timeEnd(timeTag);

        return {
            result: (steps.pop() as ReturnStep)?.value ?? new CEKError("steps.pop() was not a ReturnStep"),
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