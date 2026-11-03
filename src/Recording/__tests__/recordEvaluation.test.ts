import { Application, Builtin, Delay, ErrorUPLC, Force, Lambda, UPLCBuiltinTag, UPLCConst, UPLCProgram, UPLCTerm, UPLCVar, UPLCVersion } from "@harmoniclabs/uplc";
import { DataI } from "@harmoniclabs/plutus-data";
import { defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { Machine } from "../../Machine/Machine";
import { ExBudget } from "../../Machine/ExBudget";
import { CEKConst, CEKError } from "../../CEKValue";
import { envDepth, envExtends, extendEnv } from "../../CEKEnv";
import { recordEvaluation } from "../recordEvaluation";
import { parseSavedEvaluation, savedEvaluationTerm, savedEvaluationToJson, SavedEvaluationError } from "../SavedEvaluation";

const app = ( f: UPLCTerm, ...args: UPLCTerm[] ): UPLCTerm => args.reduce( ( acc, a ) => new Application( acc, a ), f );
const int = ( n: number ) => UPLCConst.int( n );
const v = ( dbn: number ) => new UPLCVar( dbn );
const add = () => new Builtin( UPLCBuiltinTag.addInteger );
const trace = () => new Force( new Builtin( UPLCBuiltinTag.trace ) );

describe("recordEvaluation", () => {

    test("records every state and the value of each computed term", () => {
        // (\x -> x + 1) 41
        const body = app( add(), v(0), int(1) );
        const term = app( new Lambda( body ), int(41) );
        const rec = recordEvaluation( term );

        expect( rec.complete ).toBe( true );
        expect( rec.failed ).toBe( false );
        expect( rec.result ).toBeInstanceOf( CEKConst );
        expect( ( rec.result as CEKConst ).value ).toBe( BigInt( 42 ) );
        expect( rec.isDone( rec.length - 1 ) ).toBe( true );

        // the whole term, then the body, evaluate to 42
        expect( rec.isCompute( 0 ) ).toBe( true );
        expect( ( rec.valueOf( 0 ) as CEKConst ).value ).toBe( BigInt( 42 ) );
        const bodyStep = rec.states.findIndex( s => s.term === body );
        expect( bodyStep ).toBeGreaterThan( 0 );
        expect( ( rec.valueOf( bodyStep ) as CEKConst ).value ).toBe( BigInt( 42 ) );

        // the argument evaluates to itself
        const argStep = rec.states.findIndex( s => ( s.term as any ) === ( term as Application ).arg );
        expect( ( rec.valueOf( argStep ) as CEKConst ).value ).toBe( BigInt( 41 ) );
        // a return state has no value of its own
        expect( rec.returnOf( argStep + 1 ) ).toBe( -1 );
    });

    test("costs each state the way the machine charges the whole evaluation", () => {
        const term = app( new Lambda( app( add(), v(0), v(0) ) ), app( add(), int(1), int(2) ) );
        const rec = recordEvaluation( term );
        const plain = Machine.eval( term );

        expect( rec.budgetSpent.cpu ).toBe( plain.budgetSpent.cpu );
        expect( rec.budgetSpent.mem ).toBe( plain.budgetSpent.mem );
        // startup cost before the first state, everything by the last
        expect( rec.cpu[0] ).toBe( 100 );
        expect( rec.mem[0] ).toBe( 100 );
        expect( rec.cpu[ rec.length - 1 ] ).toBe( Number( plain.budgetSpent.cpu ) );
        expect( rec.mem[ rec.length - 1 ] ).toBe( Number( plain.budgetSpent.mem ) );
        for( let i = 1; i < rec.length; i++ )
        {
            expect( rec.cpu[i] ).toBeGreaterThanOrEqual( rec.cpu[ i - 1 ] );
            expect( rec.mem[i] ).toBeGreaterThanOrEqual( rec.mem[ i - 1 ] );
        }
    });

    test("a failing evaluation records up to the failure; the failed term returns nothing", () => {
        const failing = new ErrorUPLC();
        const term = app( new Lambda( failing ), int(1) );
        const rec = recordEvaluation( term );

        expect( rec.failed ).toBe( true );
        expect( rec.result ).toBeInstanceOf( CEKError );
        const errStep = rec.states.findIndex( s => s.term === failing );
        expect( errStep ).toBeGreaterThan( 0 );
        expect( rec.returnOf( errStep ) ).toBe( -1 );
        expect( rec.returnOf( 0 ) ).toBe( -1 );
    });

    test("counts the lines logged before each state", () => {
        // trace "hi" (delay 7) -- forced
        const term = new Force( app( trace(), UPLCConst.str( "hi" ), new Delay( int(7) ) ) );
        const rec = recordEvaluation( term );

        expect( rec.logs ).toEqual([ "hi" ]);
        expect( rec.logCount[0] ).toBe( 0 );
        expect( rec.logCount[ rec.length - 1 ] ).toBe( 1 );
    });

    test("a restricted budget fails at the same point as without recording", () => {
        // loops forever: (\f -> f f) (\f -> f f)
        const omega = new Lambda( app( v(0), v(0) ) );
        const term = app( omega, omega );
        const budget = new ExBudget({ cpu: 1_000_000, mem: 10_000 });

        const machine = new Machine( defaultV4Costs, budget );
        const plain = machine.eval( term );
        const rec = recordEvaluation( term, { budget } );

        expect( plain.result ).toBeInstanceOf( CEKError );
        expect( rec.result ).toBeInstanceOf( CEKError );
        expect( rec.budgetSpent.cpu ).toBe( plain.budgetSpent.cpu );
        expect( rec.budgetSpent.mem ).toBe( plain.budgetSpent.mem );
    });

    test("maxStates cuts the recording, not the evaluation", () => {
        const term = app( new Lambda( app( add(), v(0), int(1) ) ), int(41) );
        const rec = recordEvaluation( term, { maxStates: 3 } );

        expect( rec.complete ).toBe( false );
        expect( rec.length ).toBe( 3 );
        expect( ( rec.result as CEKConst ).value ).toBe( BigInt( 42 ) );
    });
});

describe("saved evaluations", () => {

    test("round trip: the saved evaluation runs again the same way", () => {
        // (\datum -> unIData datum + 1) applied to I 41
        const script = new UPLCProgram(
            new UPLCVersion( 1, 1, 0 ),
            new Lambda( app( add(), app( new Builtin( UPLCBuiltinTag.unIData ), v(0) ), int(1) ) )
        );
        const ev = {
            program: script,
            args: [ new DataI( 41 ) ],
            budget: new ExBudget({ cpu: 1_000_000, mem: 10_000 }),
            costModel: { some: BigInt( 7 ) },
            purpose: "spend",
            index: 0,
            error: "nope",
        };
        const json = JSON.parse( JSON.stringify( savedEvaluationToJson( ev ) ) );
        expect( json.type ).toBe( "plutus-script-evaluation" );
        expect( json.costModel ).toEqual({ some: 7 });

        const back = parseSavedEvaluation( json );
        expect( back.budget?.cpu ).toBe( BigInt( 1_000_000 ) );
        expect( back.purpose ).toBe( "spend" );
        expect( back.index ).toBe( 0 );
        expect( back.error ).toBe( "nope" );
        const rec = recordEvaluation( savedEvaluationTerm( back ), { budget: back.budget } );
        expect( ( rec.result as CEKConst ).value ).toBe( BigInt( 42 ) );
    });

    test("rejects what is not a saved evaluation", () => {
        expect( () => parseSavedEvaluation( "{}" ) ).toThrow( SavedEvaluationError );
        expect( () => parseSavedEvaluation( "not json" ) ).toThrow( SavedEvaluationError );
        expect( () => parseSavedEvaluation({ type: "plutus-script-evaluation", version: 2, program: "", args: [] }) ).toThrow( /version/ );
    });
});

describe("env helpers", () => {

    test("envDepth counts the values; envExtends follows the list", () => {
        const one = UPLCConst.int( 1 ) as any;
        const base = extendEnv( extendEnv( undefined, one ), one );
        const left = extendEnv( base, one );
        const right = extendEnv( base, one );
        const deep = extendEnv( left, one );

        expect( envDepth( undefined ) ).toBe( 0 );
        expect( envDepth( base ) ).toBe( 2 );
        expect( envDepth( deep ) ).toBe( 4 );

        expect( envExtends( deep, left ) ).toBe( true );
        expect( envExtends( deep, base ) ).toBe( true );
        expect( envExtends( deep, deep ) ).toBe( true );
        expect( envExtends( deep, undefined ) ).toBe( true );
        expect( envExtends( deep, right ) ).toBe( false );
        expect( envExtends( base, left ) ).toBe( false );
    });
});
