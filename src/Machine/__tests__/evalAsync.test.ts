import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parseUPLCText, showUPLC, UPLCTermObj } from "@harmoniclabs/uplc";
import { defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { Machine, EvalResult } from "../Machine";
import { ExBudget } from "../ExBudget";
import { SubtleCryptoLike, webCryptoSupport } from "../webCrypto";
import { CEKError, dischargeCEKValue, isPendingConst } from "../../CEKValue";

jest.setTimeout( 60_000 );

const realSubtle = ( globalThis as any ).crypto.subtle as SubtleCryptoLike;

/** a subtle that answers as WebCrypto, counts the calls, and can hold the answers back */
function controlledSubtle()
{
    const held: ( () => void )[] = [];
    let holding = false;
    const calls = { digest: 0, verify: 0 };
    const answer = <T>( result: Promise<T> ): Promise<T> =>
        holding ? new Promise<T>( resolve => { held.push( () => resolve( result ) ); }) : result;
    const subtle: SubtleCryptoLike = {
        digest: ( algorithm, data ) => { calls.digest++; return answer( realSubtle.digest( algorithm, data ) ); },
        importKey: ( ...args ) => realSubtle.importKey( ...args ),
        verify: ( algorithm, key, signature, data ) => { calls.verify++; return answer( realSubtle.verify( algorithm, key, signature, data ) ); },
    };
    return {
        subtle,
        calls,
        /** detection done: count and hold from now on */
        async ready( hold: boolean ) {
            await webCryptoSupport( subtle );
            calls.digest = 0;
            calls.verify = 0;
            holding = hold;
        },
        get heldCount() { return held.length; },
        release() { holding = false; held.splice( 0 ).forEach( resolve => resolve() ); },
    };
}

/** lets the machine run up to its next wait */
async function settle(): Promise<void>
{
    for( let i = 0; i < 20; i++ ) await new Promise( resolve => setImmediate( resolve ) );
}

function show( { result }: EvalResult ): string
{
    return result instanceof CEKError ? "error" : showUPLC( dischargeCEKValue( result ) );
}

function expectSameEvaluation( asynchronous: EvalResult, synchronous: EvalResult ): void
{
    expect( show( asynchronous ) ).toEqual( show( synchronous ) );
    expect( asynchronous.budgetSpent.cpu ).toBe( synchronous.budgetSpent.cpu );
    expect( asynchronous.budgetSpent.mem ).toBe( synchronous.budgetSpent.mem );
    expect( asynchronous.logs ).toEqual( synchronous.logs );
}

// libsodium answers: valid, and a key with a small-order component (false)
const VALID = {
    pk: "4601c4895988d9ff948f05e78b372594032ad2ade5fb475e5348f0ae77d09a8c",
    msg: "b960b8",
    sig: "07c0637b4c0e95fff9e734aa51d4840e2ced028226c1ae974318ed9358e08231b051362ec40b71485801d8e1f1d41ec259a28065d7e0b67823466403643e5f03",
};
const MIXED_ORDER_KEY = {
    pk: "e4b51745bb648a29aa664dc18dbced682bf1b652ce54be8b7123e6be2605dd61",
    msg: "",
    sig: "e74538371e9e195a62a26446a12157833d4a2678b45a739e5bd7dbec45e01c1bd0ef4b666ddcee7d2259d4d255fa2eefce776a74a44708172dd6714baaad7b03",
};
const verify = ( v: typeof VALID ) =>
    `[ [ [ (builtin verifyEd25519Signature) (con bytestring #${v.pk}) ] (con bytestring #${v.msg}) ] (con bytestring #${v.sig}) ]`;
const sha2_256 = ( hex: string ) => `[ (builtin sha2_256) (con bytestring #${hex}) ]`;
const trace = ( msg: string ) => `[ [ (force (builtin trace)) (con string "${msg}") ] (con unit ()) ]`;

function conformancePrograms(): [ string, string ][]
{
    const programs: [ string, string ][] = [];
    const walk = ( dir: string ) => {
        for( const entry of readdirSync( dir, { withFileTypes: true } ) )
        {
            const path = join( dir, entry.name );
            if( entry.isDirectory() ) walk( path );
            else if( entry.name.endsWith( ".uplc" ) )
            {
                if( readFileSync( `${path}.expected`, "utf8" ).startsWith( "parse error" ) ) continue;
                const src = readFileSync( path, "utf8" ).split( "\n" ).map( line => line.replace( /--.*$/, "" ) ).join( "\n" );
                programs.push([ path, src ]);
            }
        }
    };
    walk( join( __dirname, "../../__tests__/plutus_conformance" ) );
    return programs;
}

describe("evalAsync", () => {

    test("gives the result, budget and logs of eval on every conformance program", async () => {
        const c = controlledSubtle();
        await c.ready( false );
        let compared = 0;
        for( const [ path, src ] of conformancePrograms() )
        {
            let term: UPLCTermObj;
            try { term = parseUPLCText( src ) as UPLCTermObj; }
            catch { continue; }
            const synchronous = new Machine( defaultV4Costs ).eval( term );
            // every sha2_256 goes to WebCrypto
            const asynchronous = await new Machine( defaultV4Costs ).evalAsync( term, { subtle: c.subtle, sha2_256MinBytes: 0 } );
            try { expectSameEvaluation( asynchronous, synchronous ); }
            catch( e ) { throw new Error( `${path}: ${( e as Error ).message}` ); }
            compared++;
        }
        expect( compared ).toBeGreaterThan( 400 );
        expect( c.calls.digest ).toBeGreaterThan( 0 );
        expect( c.calls.verify ).toBeGreaterThan( 0 );
    });

    test("steps on while a hash is computed, and waits where its result is read", async () => {
        const program = `[ (lam h [ (lam u [ [ (builtin equalsByteString) h ] h ]) ${trace( "stepping" )} ]) ${sha2_256( "00010203" )} ]`;
        const c = controlledSubtle();
        await c.ready( true );
        const machine = new Machine( defaultV4Costs );
        const done = machine.evalAsync( parseUPLCText( program ) as UPLCTermObj, { subtle: c.subtle, sha2_256MinBytes: 0 } );
        await settle();
        // the trace after the hash ran before the hash existed
        expect( c.heldCount ).toBe( 1 );
        expect( machine.currentLogs ).toEqual([ "stepping" ]);
        c.release();
        expectSameEvaluation( await done, new Machine( defaultV4Costs ).eval( parseUPLCText( program ) as UPLCTermObj ) );
    });

    test("starts several verifications before reading any", async () => {
        const program = `[ (lam a [ (lam b [ [ [ (force (builtin ifThenElse)) a ] b ] (con bool False) ]) ${verify( VALID )} ]) ${verify( VALID )} ]`;
        const c = controlledSubtle();
        await c.ready( true );
        const done = Machine.evalAsync( parseUPLCText( program ), { subtle: c.subtle } );
        await settle();
        expect( c.heldCount ).toBe( 2 );
        c.release();
        expectSameEvaluation( await done, Machine.eval( parseUPLCText( program ) ) );
        expect( show( await done ) ).toBe( "(con boolean True)" );
    });

    test.each([
        [ "True", VALID, "(con integer 11)" ],
        [ "False", MIXED_ORDER_KEY, "(con integer 10)" ],
    ])("waits where a case reads a boolean still being computed (%s)", async ( _, signature, branch ) => {
        const program = `(case ${verify( signature )} (con integer 10) (con integer 11))`;
        const c = controlledSubtle();
        await c.ready( true );
        let finished = false;
        const done = Machine.evalAsync( parseUPLCText( program ), { subtle: c.subtle } ).then( r => { finished = true; return r; });
        await settle();
        expect( c.heldCount ).toBe( 1 );
        expect( finished ).toBe( false );
        c.release();
        expectSameEvaluation( await done, Machine.eval( parseUPLCText( program ) ) );
        expect( show( await done ) ).toBe( branch );
    });

    test("a result in a constr field is there when the evaluation returns", async () => {
        const program = `(constr 0 ${sha2_256( "aa" )} ${verify( VALID )})`;
        const c = controlledSubtle();
        await c.ready( true );
        let finished = false;
        const done = Machine.evalAsync( parseUPLCText( program ), { subtle: c.subtle, sha2_256MinBytes: 0 } ).then( r => { finished = true; return r; });
        await settle();
        // the machine is done, the results are not
        expect( c.heldCount ).toBe( 2 );
        expect( finished ).toBe( false );
        c.release();
        const { result } = await done;
        expect( ( result as any ).values.some( isPendingConst ) ).toBe( false );
        expectSameEvaluation( await done, Machine.eval( parseUPLCText( program ) ) );
    });

    test("does not use an engine that answers differently from the node", async () => {
        // a cofactored verifier accepts the key with a small-order component
        const lying: SubtleCryptoLike = {
            digest: async () => new ArrayBuffer( 32 ),
            importKey: async () => ({}),
            verify: async () => true,
        };
        expect( await webCryptoSupport( lying ) ).toMatchObject({ sha2_256: false, ed25519: false });
        const program = `[ [ (builtin equalsByteString) ${sha2_256( "01" )} ] ${sha2_256( "01" )} ]`;
        for( const src of [ verify( MIXED_ORDER_KEY ), program ] )
        {
            const asynchronous = await Machine.evalAsync( parseUPLCText( src ), { subtle: lying, sha2_256MinBytes: 0 } );
            expectSameEvaluation( asynchronous, Machine.eval( parseUPLCText( src ) ) );
        }
        expect( show( await Machine.evalAsync( parseUPLCText( verify( MIXED_ORDER_KEY ) ), { subtle: lying } ) ) ).toBe( "(con boolean False)" );
    });

    test("computes everything in JavaScript with subtle: null", async () => {
        const c = controlledSubtle();
        await c.ready( false );
        const src = `[ (lam h ${verify( VALID )}) ${sha2_256( "00" )} ]`;
        const asynchronous = await Machine.evalAsync( parseUPLCText( src ), { subtle: null, sha2_256MinBytes: 0 } );
        expectSameEvaluation( asynchronous, Machine.eval( parseUPLCText( src ) ) );
        expect( c.calls ).toEqual({ digest: 0, verify: 0 });
    });

    test("hashes inputs shorter than sha2_256MinBytes in JavaScript", async () => {
        const c = controlledSubtle();
        await c.ready( false );
        const short = sha2_256( "00".repeat( 100 ) );
        const long = sha2_256( "00".repeat( 3000 ) );
        await Machine.evalAsync( parseUPLCText( short ), { subtle: c.subtle } );
        expect( c.calls.digest ).toBe( 0 );
        expectSameEvaluation(
            await Machine.evalAsync( parseUPLCText( long ), { subtle: c.subtle } ),
            Machine.eval( parseUPLCText( long ) )
        );
        expect( c.calls.digest ).toBe( 1 );
    });

    test("an error returns at once, with results still being computed", async () => {
        const c = controlledSubtle();
        await c.ready( true );
        const { result } = await Machine.evalAsync( parseUPLCText( `[ (lam h (error)) ${sha2_256( "00" )} ]` ), { subtle: c.subtle, sha2_256MinBytes: 0 } );
        expect( result ).toBeInstanceOf( CEKError );
        expect( c.heldCount ).toBe( 1 );
        c.release();
    });

    test("runs out of budget as eval does", async () => {
        const omegaAfterHash = `[ (lam h [ (lam x [ x x ]) (lam x [ x x ]) ]) ${sha2_256( "00" )} ]`;
        const budget = () => new ExBudget({ cpu: 10_000_000, mem: 100_000 });
        const c = controlledSubtle();
        await c.ready( true );
        const done = new Machine( defaultV4Costs, budget() ).evalAsync( parseUPLCText( omegaAfterHash ) as UPLCTermObj, { subtle: c.subtle, sha2_256MinBytes: 0 } );
        const asynchronous = await done;
        const synchronous = new Machine( defaultV4Costs, budget() ).eval( parseUPLCText( omegaAfterHash ) as UPLCTermObj );
        expect( ( asynchronous.result as CEKError ).msg ).toBe( "out of budget" );
        expectSameEvaluation( asynchronous, synchronous );
        c.release();
    });

    test("the step hook receives each state once, as with eval", async () => {
        const program = `[ (lam h [ (lam u [ [ (builtin equalsByteString) h ] h ]) ${trace( "x" )} ]) ${sha2_256( "00" )} ]`;
        const c = controlledSubtle();
        await c.ready( true );
        const hooked = () => {
            const machine = new Machine( defaultV4Costs );
            const states: string[] = [];
            machine.setStepHook( state => { states.push( `${state.tag}:${( state.term as any )?.tag}` ); });
            return { machine, states };
        };
        const synchronous = hooked();
        synchronous.machine.eval( parseUPLCText( program ) as UPLCTermObj );
        const asynchronous = hooked();
        const done = asynchronous.machine.evalAsync( parseUPLCText( program ) as UPLCTermObj, { subtle: c.subtle, sha2_256MinBytes: 0 } );
        await settle();
        c.release();
        await done;
        expect( asynchronous.states ).toEqual( synchronous.states );
    });

    test("one evaluation at a time per machine; concurrent ones on Machine.evalAsync", async () => {
        const c = controlledSubtle();
        await c.ready( true );
        const machine = new Machine( defaultV4Costs );
        const term = parseUPLCText( `[ [ (builtin equalsByteString) ${sha2_256( "01" )} ] (con bytestring #) ]` ) as UPLCTermObj;
        const first = machine.evalAsync( term, { subtle: c.subtle, sha2_256MinBytes: 0 } );
        await settle();
        expect( () => machine.eval( term ) ).toThrow( /evalAsync/ );
        await expect( machine.evalAsync( term ) ).rejects.toThrow( /evalAsync/ );

        const programs = [ verify( VALID ), verify( MIXED_ORDER_KEY ), sha2_256( "02" ), "(con integer 7)" ];
        const concurrent = Promise.all( programs.map( src => Machine.evalAsync( parseUPLCText( src ), { subtle: c.subtle, sha2_256MinBytes: 0 } ) ) );
        await settle();
        c.release();
        const results = await concurrent;
        programs.forEach( ( src, i ) => expectSameEvaluation( results[i], Machine.eval( parseUPLCText( src ) ) ) );
        expectSameEvaluation( await first, new Machine( defaultV4Costs ).eval( term ) );
        expect( () => machine.eval( term ) ).not.toThrow();
    });
});
