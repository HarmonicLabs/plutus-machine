import { Application, Builtin, Case, compileUPLC, Constr, Delay, ErrorUPLC, Force, Lambda, UPLCBuiltinTag, UPLCConst, UPLCProgram, UPLCTerm, UPLCVar } from "@harmoniclabs/uplc";
import { toHex } from "@harmoniclabs/uint8array-utils";
import { CEKConst, CEKError } from "../../CEKValue";
import { indexProgram } from "../ProgramIndex";
import { programHashOf } from "../findMappedProgram";
import { evaluateWithSourceMap } from "../evaluateWithSourceMap";
import { parseSourceMap, UPLCSourceMap, UPLCSourceMapError, UPLCSourceMapTrace } from "../UPLCSourceMap";

/**
 * Traces the compiler removed, put back from the map: where and when each would have run.
 */

const VERSION = "1.1.0";

const app = ( f: UPLCTerm, ...args: UPLCTerm[] ): UPLCTerm => args.reduce( ( acc, a ) => new Application( acc, a ), f );
const int = ( n: number ) => UPLCConst.int( n );
const str = ( s: string ) => UPLCConst.str( s );
const v = ( dbn: number ) => new UPLCVar( dbn );
const builtin = ( tag: UPLCBuiltinTag ) => new Builtin( tag );
const ifThenElse = ( c: UPLCTerm, t: UPLCTerm, e: UPLCTerm ) => new Force( app( new Force( builtin( UPLCBuiltinTag.ifThenElse ) ), c, new Delay( t ), new Delay( e ) ) );
const flatHex = ( t: UPLCTerm ) => toHex( compileUPLC( new UPLCProgram( [ 1, 1, 0 ], t ) ) );

interface Point {
    term: UPLCTerm;
    trace: UPLCSourceMapTrace;
    when?: 0 | 1 | 2 | 4;
    branch?: number;
    args?: number[];
}

function mapFor( program: UPLCTerm, points: Point[] ): UPLCSourceMap
{
    const index = indexProgram( program );
    const traces: UPLCSourceMapTrace[] = [];
    const tracePoints = points.map( p => {
        const i = index.indexOf( p.term );
        if( i === undefined ) throw new Error( "term not in the program" );
        return [ i, traces.push( p.trace ) - 1, p.when ?? 0, p.branch ?? -1, ...( p.args ?? [] ) ];
    }).sort( ( a, b ) => a[0] - b[0] );
    const map = {
        version: 1,
        programHash: programHashOf( program, VERSION ),
        programVersion: VERSION,
        termCount: index.terms.length,
        sources: [ "src/index.pebble" ],
        names: [],
        mappings: [],
        functions: [],
        asserts: [],
        traces,
        tracePoints,
    };
    return parseSourceMap( JSON.stringify( map ) );
}

const run = ( program: UPLCTerm, map: UPLCSourceMap, ...args: UPLCTerm[] ) =>
    evaluateWithSourceMap({ term: app( program, ...args ), map, program });

describe("evaluateWithSourceMap: traces the compiler removed", () => {

    test("a trace statement logs where it would have run, in the branch taken only", () => {
        const yes = int( 1 );
        const no = int( 2 );
        // \c -> if c then 1 else 2
        const program = new Lambda( ifThenElse( v( 0 ), yes, no ) );
        const map = mapFor( program, [
            { term: yes, trace: { kind: "trace", message: "then" } },
            { term: no, trace: { kind: "trace", message: "else" } },
        ]);
        expect( run( program, map, UPLCConst.bool( true ) ).logs ).toEqual([ "then" ]);
        expect( run( program, map, UPLCConst.bool( false ) ).logs ).toEqual([ "else" ]);
    });

    test("an assert's message logs when its condition is false, then the failure", () => {
        const cond = app( builtin( UPLCBuiltinTag.lessThanInteger ), v( 0 ), int( 10 ) );
        // \x -> if x < 10 then x else error
        const program = new Lambda( ifThenElse( cond, v( 0 ), new ErrorUPLC() ) );
        const map = mapFor( program, [ { term: cond, trace: { kind: "assert", message: "x too big" }, when: 1 } ]);

        const ok = run( program, map, int( 5 ) );
        expect( ok.result ).toBeInstanceOf( CEKConst );
        expect( ok.logs ).toEqual([]);

        const bad = run( program, map, int( 50 ) );
        expect( bad.result ).toBeInstanceOf( CEKError );
        expect( bad.logs ).toEqual([ "x too big" ]);
    });

    test("a negated assert condition (when 4): the message logs when it is true", () => {
        // `x < 10` checked as `10 <= x`, the branches swapped: true when the assert fails
        const negated = app( builtin( UPLCBuiltinTag.lessThanEqualInteger ), int( 10 ), v( 0 ) );
        const program = new Lambda( ifThenElse( negated, new ErrorUPLC(), v( 0 ) ) );
        const map = mapFor( program, [ { term: negated, trace: { kind: "assert", message: "x too big" }, when: 4 } ]);

        const ok = run( program, map, int( 5 ) );
        expect( ok.result ).toBeInstanceOf( CEKConst );
        expect( ok.logs ).toEqual([]);

        const bad = run( program, map, int( 50 ) );
        expect( bad.result ).toBeInstanceOf( CEKError );
        expect( bad.logs ).toEqual([ "x too big" ]);
    });

    test("a failure's message logs when it fails there", () => {
        const err = new ErrorUPLC();
        const program = new Lambda( ifThenElse( v( 0 ), int( 1 ), err ) );
        const map = mapFor( program, [ { term: err, trace: { kind: "fail", message: "boom" }, when: 2 } ]);
        expect( run( program, map, UPLCConst.bool( true ) ).logs ).toEqual([]);
        expect( run( program, map, UPLCConst.bool( false ) ).logs ).toEqual([ "boom" ]);
    });

    test("a case without the branch that failed logs that branch's message", () => {
        // \c -> case c [ \_ -> 0 ]: constructors 1 and 2 had failing branches the compiler dropped
        const cases = new Case( v( 0 ), [ new Lambda( int( 0 ) ) ] );
        const program = new Lambda( cases );
        const map = mapFor( program, [
            { term: cases, trace: { kind: "fail", message: "one" }, when: 2, branch: 1 },
            { term: cases, trace: { kind: "fail", message: "two" }, when: 2, branch: 2 },
        ]);
        expect( run( program, map, new Constr( 0, [ int( 7 ) ] ) ).logs ).toEqual([]);
        expect( run( program, map, new Constr( 1, [] ) ).logs ).toEqual([ "one" ]);
        expect( run( program, map, new Constr( 2, [] ) ).logs ).toEqual([ "two" ]);
    });

    test("a computed message is computed from the values the program has there", () => {
        // \s -> s, with a trace of `s + "!"` at the body
        const body = v( 0 );
        const program = new Lambda( body );
        const message = new Lambda( app( builtin( UPLCBuiltinTag.appendString ), v( 0 ), str( "!" ) ) );
        const map = mapFor( program, [
            { term: body, trace: { kind: "trace", expression: "s + \"!\"", program: flatHex( message ) }, args: [ 0 ] },
            { term: body, trace: { kind: "trace", expression: "gone", program: flatHex( message ) }, args: [ -1 ] },
        ]);
        expect( run( program, map, str( "hi" ) ).logs ).toEqual([
            "hi!",
            "<gone: not computed by the stripped script>",
        ]);
    });

    test("a computed message that fails is reported, and the evaluation goes on", () => {
        const body = int( 3 );
        const program = new Lambda( body );
        // takes nothing: delayed
        const failing = new Delay( new ErrorUPLC() );
        const map = mapFor( program, [ { term: body, trace: { kind: "trace", expression: "bad()", program: flatHex( failing ) } } ]);
        const r = run( program, map, int( 1 ) );
        expect( r.result ).toBeInstanceOf( CEKConst );
        expect( r.logs ).toEqual([ "<bad(): failed: explicit error from uplc>" ]);
    });

    test("a trace of a value prints it when the term computing it returns", () => {
        // \x -> (x * 2) + 1, a trace of the product: after it is computed
        const product = app( builtin( UPLCBuiltinTag.multiplyInteger ), v( 0 ), int( 2 ) );
        const program = new Lambda( app( new Force( builtin( UPLCBuiltinTag.trace ) ), str( "kept" ), app( builtin( UPLCBuiltinTag.addInteger ), product, int( 1 ) ) ) );
        // the message's program: a function of the value (here: always "computed")
        const message = new Lambda( str( "computed" ) );
        const map = mapFor( program, [ { term: product, trace: { kind: "trace", expression: "p", program: flatHex( message ) }, when: 3 } ]);
        expect( run( program, map, int( 3 ) ).logs ).toEqual([ "computed", "kept" ]);
    });

    test("an assert's message prints once, from its false condition or else from its failure", () => {
        const cond = app( builtin( UPLCBuiltinTag.lessThanInteger ), v( 0 ), int( 10 ) );
        const err = new ErrorUPLC();
        const program = new Lambda( ifThenElse( cond, v( 0 ), err ) );
        const trace: UPLCSourceMapTrace = { kind: "assert", message: "x too big" };
        const both = mapFor( program, [ { term: cond, trace, when: 1 }, { term: err, trace, when: 2 } ]);
        // the same trace at both points
        both.tracePoints!.forEach( p => p[1] = 0 );
        expect( run( program, both, int( 50 ) ).logs ).toEqual([ "x too big" ]);
        // the condition rewritten by the optimizer: only the failure is left
        const failureOnly = mapFor( program, [ { term: err, trace, when: 2 } ]);
        expect( run( program, failureOnly, int( 50 ) ).logs ).toEqual([ "x too big" ]);
    });

    test("in order with the traces the program kept", () => {
        // \x -> trace "kept" (x + 1): the argument is computed before the trace runs
        const arg = app( builtin( UPLCBuiltinTag.addInteger ), v( 0 ), int( 1 ) );
        const program = new Lambda( app( new Force( builtin( UPLCBuiltinTag.trace ) ), str( "kept" ), arg ) );
        const map = mapFor( program, [ { term: arg, trace: { kind: "trace", message: "put back" } } ]);
        expect( run( program, map, int( 1 ) ).logs ).toEqual([ "put back", "kept" ]);
    });

    test("a map without traces, or for another program: the machine's logs", () => {
        const program = new Lambda( app( new Force( builtin( UPLCBuiltinTag.trace ) ), str( "kept" ), v( 0 ) ) );
        const plain = mapFor( program, [] );
        expect( run( program, plain, int( 1 ) ).logs ).toEqual([ "kept" ]);
        const other = mapFor( new Lambda( int( 0 ) ), [] );
        const r = evaluateWithSourceMap({ term: app( program, int( 1 ) ), map: other });
        expect( r.mapped ).toBe( false );
        expect( r.logs ).toEqual([ "kept" ]);
    });
});

describe("parseSourceMap: traces", () => {
    const base = {
        version: 1,
        programHash: "00".repeat( 32 ),
        termCount: 4,
        sources: [ "a.pebble" ],
        names: [],
        mappings: [],
        functions: [],
        asserts: [],
    };
    const parse = ( extra: object ) => parseSourceMap( JSON.stringify({ ...base, ...extra }) );

    test("valid traces and points are kept", () => {
        const map = parse({
            traces: [ { kind: "assert", at: [ 0, 3, 5, 3, 30 ], message: "m" }, { kind: "trace", expression: "x", program: "0102" } ],
            tracePoints: [ [ 1, 0, 1, -1 ], [ 2, 1, 0, -1, 0, -1 ] ],
        });
        expect( map.traces ).toHaveLength( 2 );
        expect( map.tracePoints ).toEqual([ [ 1, 0, 1, -1 ], [ 2, 1, 0, -1, 0, -1 ] ]);
        // a negated assert condition's message
        expect( parse({ traces: [ { kind: "assert", message: "m" } ], tracePoints: [ [ 1, 0, 4, -1 ] ] }).tracePoints ).toEqual([ [ 1, 0, 4, -1 ] ]);
    });

    test("invalid ones are rejected", () => {
        expect( () => parse({ traces: [ { kind: "log" } ] }) ).toThrow( UPLCSourceMapError );
        expect( () => parse({ traces: [ { kind: "trace", at: [ 1, 1, 1, 1, 2 ] } ] }) ).toThrow( /source 1/ );
        expect( () => parse({ traces: [ { kind: "trace", program: "xyz" } ] }) ).toThrow( /hex/ );
        expect( () => parse({ traces: [ { kind: "trace" } ], tracePoints: [ [ 9, 0, 0, -1 ] ] }) ).toThrow( /beyond/ );
        expect( () => parse({ traces: [ { kind: "trace" } ], tracePoints: [ [ 1, 1, 0, -1 ] ] }) ).toThrow( /does not exist/ );
        expect( () => parse({ traces: [ { kind: "trace" } ], tracePoints: [ [ 1, 0, 5, -1 ] ] }) ).toThrow( /when/ );
        expect( () => parse({ traces: [ { kind: "trace" } ], tracePoints: [ [ 2, 0, 0, -1 ], [ 1, 0, 0, -1 ] ] }) ).toThrow( /sorted/ );
    });
});
