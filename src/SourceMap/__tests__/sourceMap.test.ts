import { Application, Builtin, Case, constT, Constr, ErrorUPLC, Force, Lambda, UPLCBuiltinTag, UPLCConst, UPLCTerm, UPLCVar } from "@harmoniclabs/uplc";
import { Machine } from "../../Machine/Machine";
import { MachineStateTag } from "../../_internal/MachineStateTag";
import { indexProgram } from "../ProgramIndex";
import { findMappedProgram, programHashOf } from "../findMappedProgram";
import { locateFailure } from "../locateFailure";
import { parseSourceMap, UPLCSourceMap, UPLCSourceMapError, UPLCSourceMapping } from "../UPLCSourceMap";
import { formatFailure, formatFailureStack } from "../formatFailure";

const VERSION = "1.1.0";

const app = ( f: UPLCTerm, ...args: UPLCTerm[] ): UPLCTerm => args.reduce( ( acc, a ) => new Application( acc, a ), f );
const int = ( n: number ) => UPLCConst.int( n );
const v = ( dbn: number ) => new UPLCVar( dbn );
const lt = () => new Builtin( UPLCBuiltinTag.lessThanInteger );
const mul = () => new Builtin( UPLCBuiltinTag.multiplyInteger );
const headList = () => new Force( new Builtin( UPLCBuiltinTag.headList ) );
const emptyList = () => UPLCConst.listOf( constT.int )( [] );

interface Marks {
    /** term, line, column */
    mappings?: [ UPLCTerm, number, number? ][];
    /** body root, name, line */
    functions?: [ UPLCTerm, string, number ][];
    /** condition root, line, whether the term computes the condition negated */
    asserts?: [ UPLCTerm, number, boolean? ][];
    sourcesContent?: string;
}

function mapFor( program: UPLCTerm, marks: Marks ): UPLCSourceMap
{
    const index = indexProgram( program );
    const idx = ( t: UPLCTerm ) => {
        const i = index.indexOf( t );
        if( i === undefined ) throw new Error( "term not in the program" );
        return i;
    };
    const names: string[] = [];
    const map: UPLCSourceMap = {
        version: 1,
        compiler: "test",
        programHash: programHashOf( program, VERSION ),
        programVersion: VERSION,
        termCount: index.terms.length,
        sources: [ "src/index.pebble" ],
        names,
        mappings: ( marks.mappings ?? [] )
            .map( ([ t, line, col = 1 ]) => [ idx( t ), 0, line, col, line, col + 1 ] as UPLCSourceMapping )
            .sort( ( a, b ) => a[0] - b[0] ),
        functions: ( marks.functions ?? [] ).map( ([ t, name, line ]) => [ idx( t ), names.push( name ) - 1, 0, line, 1 ] ),
        asserts: ( marks.asserts ?? [] ).map( ([ t, line, negated ]) => negated
            ? [ idx( t ), 0, line, 5, line, 20, 1 ]
            : [ idx( t ), 0, line, 5, line, 20 ]
        ),
    };
    if( marks.sourcesContent !== undefined ) map.sourcesContent = [ marks.sourcesContent ];
    // whatever the test builds must also be a valid map
    return parseSourceMap( JSON.stringify( map ) );
}

/**
 * Fixture F2 of the sourcemaps plan, as the 0.5.0 compiler lowers it: `isBig` inlined in
 * `check`, the two asserts sharing one `error`.
 *
 * ```
 * 1  function isBig( a: int ): boolean {
 * 2      const doubled = a * 2;
 * 3      return doubled > 20;
 * 4  }
 * 5  function check( a: int ): int {
 * 6      assert isBig( a );
 * 7      assert a < 100;
 * 8      return a;
 * 9  }
 * ```
 */
function mergedAsserts( arg: number )
{
    const two = int( 2 );
    const helperBody = app( lt(), int( 20 ), app( mul(), v( 0 ), two ) );
    const cond2 = app( lt(), v( 0 ), int( 100 ) );
    const cond1 = app( v( 1 ), v( 0 ) );
    const err = new ErrorUPLC();
    const checkBody = new Case( new Case( cond2, [ UPLCConst.bool( false ), cond1 ] ), [ err, v( 0 ) ] );
    const prog = app( new Lambda( app( new Lambda( checkBody ), int( arg ) ) ), new Lambda( helperBody ) );
    const map = mapFor( prog, {
        mappings: [ [ two, 2, 23 ], [ helperBody, 3, 12 ], [ cond2, 7, 12 ], [ cond1, 6, 12 ] ],
        functions: [ [ helperBody, "isBig", 1 ], [ checkBody, "check", 5 ] ],
        asserts: [ [ cond1, 6 ], [ cond2, 7 ] ],
    });
    return { prog, map };
}

describe("indexProgram", () => {

    test("pre-order, children in flat order", () => {
        const body = v( 0 );
        const lam = new Lambda( body );
        const one = int( 1 );
        const prog = new Application( lam, one );
        const index = indexProgram( prog );
        expect( index.terms ).toEqual([ prog, lam, body, one ]);
        expect( Array.from( index.parents ) ).toEqual([ -1, 0, 1, 0 ]);
        expect( index.indexOf( one ) ).toBe( 3 );
        expect( index.indexOf( int( 1 ) ) ).toBe( undefined );
    });

    test("case: scrutinee before branches", () => {
        const scrut = new Constr( 0, [ int( 1 ) ] );
        const b0 = int( 2 );
        const b1 = int( 3 );
        const index = indexProgram( new Case( scrut, [ b0, b1 ] ) );
        expect( index.indexOf( scrut ) ).toBe( 1 );
        expect( index.indexOf( b0 ) ).toBe( 3 );
        expect( index.indexOf( b1 ) ).toBe( 4 );
    });

    test("an object at two positions has no index", () => {
        const shared = int( 1 );
        const index = indexProgram( new Application( new Lambda( shared ), shared ) );
        expect( index.terms.length ).toBe( 4 );
        expect( index.indexOf( shared ) ).toBe( undefined );
    });
});

describe("parseSourceMap", () => {

    const valid = () => ({
        version: 1,
        programHash: "ab".repeat( 32 ),
        termCount: 3,
        sources: [ "src/a.pebble" ],
        names: [ "f" ],
        mappings: [ [ 0, 0, 1, 1, 1, 5 ], [ 2, 0, 2, 3, 2, 4 ] ],
        functions: [ [ 1, 0, 0, 1, 1 ] ],
        asserts: [],
    });

    test("accepts a valid map, as object or string", () => {
        expect( parseSourceMap( valid() ).termCount ).toBe( 3 );
        expect( parseSourceMap( JSON.stringify( valid() ) ).mappings.length ).toBe( 2 );
    });

    test("defaults the optional tables", () => {
        const m: any = valid();
        delete m.names; delete m.functions; delete m.asserts;
        m.mappings = [];
        const parsed = parseSourceMap( m );
        expect( parsed.names ).toEqual( [] );
        expect( parsed.functions ).toEqual( [] );
        expect( parsed.asserts ).toEqual( [] );
    });

    test.each([
        [ "another version", ( m: any ) => { m.version = 2; } ],
        [ "a short hash", ( m: any ) => { m.programHash = "ab"; } ],
        [ "unsorted mappings", ( m: any ) => { m.mappings.reverse(); } ],
        [ "a term beyond termCount", ( m: any ) => { m.mappings[1][0] = 3; } ],
        [ "a missing source", ( m: any ) => { m.mappings[0][1] = 1; } ],
        [ "line 0", ( m: any ) => { m.mappings[0][2] = 0; } ],
        [ "an end before the start", ( m: any ) => { m.mappings[0][5] = 0; } ],
        [ "a missing name", ( m: any ) => { m.functions[0][1] = 4; } ],
        [ "sourcesContent of another length", ( m: any ) => { m.sourcesContent = []; } ],
        [ "an assert negated with 2", ( m: any ) => { m.asserts = [ [ 2, 0, 2, 3, 2, 4, 2 ] ]; } ],
        [ "an assert with 8 fields", ( m: any ) => { m.asserts = [ [ 2, 0, 2, 3, 2, 4, 1, 0 ] ]; } ],
    ])( "rejects %s", ( _, change ) => {
        const m = valid();
        change( m );
        expect( () => parseSourceMap( m ) ).toThrow( UPLCSourceMapError );
    });

    test("accepts asserts with and without `negated`", () => {
        const m: any = valid();
        m.asserts = [ [ 0, 0, 1, 1, 1, 5 ], [ 2, 0, 2, 3, 2, 4, 1 ] ];
        expect( parseSourceMap( m ).asserts ).toEqual([ [ 0, 0, 1, 1, 1, 5 ], [ 2, 0, 2, 3, 2, 4, 1 ] ]);
    });

    test("accepts functions without a name", () => {
        const m = valid();
        m.functions = [ [ 1, -1, 0, 1, 1 ] ];
        expect( parseSourceMap( m ).functions[0][1] ).toBe( -1 );
    });
});

describe("findMappedProgram", () => {

    const program = () => new Lambda( new Lambda( app( new Builtin( UPLCBuiltinTag.addInteger ), v( 1 ), v( 0 ) ) ) );

    test("peels applied parameters and script arguments", () => {
        const prog = program();
        const map = mapFor( prog, {} );
        const evaluated = app( app( prog, int( 1 ) ), int( 2 ) );
        expect( findMappedProgram( evaluated, map ) ).toBe( prog );
    });

    test("finds a decoded copy of the program", () => {
        const map = mapFor( program(), {} );
        const evaluated = app( program(), int( 1 ) );
        expect( findMappedProgram( evaluated, map ) ).toBe( ( evaluated as Application ).func );
    });

    test("ignores another program with the same shape", () => {
        const map = mapFor( program(), {} );
        const other = new Lambda( new Lambda( app( new Builtin( UPLCBuiltinTag.subtractInteger ), v( 1 ), v( 0 ) ) ) );
        expect( findMappedProgram( app( other, int( 1 ) ), map ) ).toBe( undefined );
    });

    test("uses the given version when the map has none", () => {
        const prog = program();
        const map = mapFor( prog, {} );
        delete map.programVersion;
        expect( findMappedProgram( prog, map ) ).toBe( undefined );
        expect( findMappedProgram( prog, map, VERSION ) ).toBe( prog );
    });
});

describe("locateFailure", () => {

    test("an error with a location", () => {
        const err = new ErrorUPLC();
        const prog = app( new Lambda( new Case( v( 0 ), [ err, int( 1 ) ] ) ), UPLCConst.bool( false ) );
        const map = mapFor( prog, { mappings: [ [ err, 3, 5 ] ] } );
        const failure = locateFailure({ term: prog, map })!;
        expect( failure.message ).toBe( "explicit error from uplc" );
        expect( failure.location ).toMatchObject({ source: "src/index.pebble", line: 3, column: 5 });
    });

    test("a builtin error is located at its application, not at the last argument", () => {
        const list = emptyList();
        const call = app( headList(), list );
        const map = mapFor( call, { mappings: [ [ call, 5 ], [ list, 6 ] ] } );
        const failure = locateFailure({ term: call, map })!;
        expect( failure.message ).toContain( "empty list" );
        expect( failure.location?.line ).toBe( 5 );
    });

    test("a case with no matching branch is located at the case", () => {
        const scrut = new Constr( 1, [] );
        const cs = new Case( scrut, [ int( 0 ) ] );
        const map = mapFor( cs, { mappings: [ [ cs, 7 ], [ scrut, 8 ] ] } );
        expect( locateFailure({ term: cs, map })?.location?.line ).toBe( 7 );
    });

    test("merged asserts: the assert whose condition was false, not the inlined helper", () => {
        // `isBig( a )` false: the newest mapped term is the `2` of `a * 2`, line 2
        const small = mergedAsserts( 5 );
        const f5 = locateFailure({ term: small.prog, map: small.map })!;
        expect( f5.location?.line ).toBe( 6 );
        expect( f5.stack ).toEqual([ { functionName: "check", location: f5.location } ]);

        // `a < 100` false
        const big = mergedAsserts( 500 );
        expect( locateFailure({ term: big.prog, map: big.map })?.location?.line ).toBe( 7 );
    });

    test.each([
        [ "marked as a function", true ],
        [ "without a function marker", false ],
    ])( "merged asserts with the helper's body copied into the condition, %s", ( _, marked ) => {
        // check = (lam a (case (case [[lt a] 100] [False, [[lt 20] [[mul a] 2]]]) [error, a]))
        // which is how 0.5.0 compiles F2: the last mapped terms before the error are the
        // copied body's (line 2) or, inside a marked copy, the other assert's (line 7)
        const two = int( 2 );
        const cond1 = app( lt(), int( 20 ), app( mul(), v( 0 ), two ) );
        const cond2 = app( lt(), v( 0 ), int( 100 ) );
        const err = new ErrorUPLC();
        const checkBody = new Case( new Case( cond2, [ UPLCConst.bool( false ), cond1 ] ), [ err, v( 0 ) ] );
        const prog = app( new Lambda( checkBody ), int( 5 ) );
        const map = mapFor( prog, {
            mappings: [ [ two, 2, 23 ], [ cond1, 3, 12 ], [ cond2, 7, 12 ] ],
            functions: marked
                ? [ [ cond1, "isBig", 1 ], [ checkBody, "check", 5 ] ]
                : [ [ checkBody, "check", 5 ] ],
            asserts: [ [ cond1, 6 ], [ cond2, 7 ] ],
        });
        const failure = locateFailure({ term: prog, map })!;
        expect( failure.location?.line ).toBe( 6 );
        expect( failure.stack.map( f => f.functionName ) ).toEqual([ "check" ]);
    });

    test("a negated assert condition: the assert fails when it is true", () => {
        // `assert a < 100` checked as `100 <= a`, its `error` branch dropped: the case has no
        // location, its condition's mapping is somewhere else (line 2)
        const negated = app( new Builtin( UPLCBuiltinTag.lessThanEqualInteger ), int( 100 ), v( 0 ) );
        const cs = new Case( negated, [ v( 0 ) ] );
        const mapped = ( assertNegated: boolean ) => {
            const prog = app( new Lambda( cs ), int( 500 ) );
            return { prog, map: mapFor( prog, { mappings: [ [ negated, 2 ] ], asserts: [ [ negated, 7, assertNegated ] ] } ) };
        };
        const { prog, map } = mapped( true );
        expect( map.asserts[0] ).toHaveLength( 7 );
        expect( locateFailure({ term: prog, map })?.location?.line ).toBe( 7 );
        // the same term as the condition itself: true is the assert holding, the failure is the case's
        const plain = mapped( false );
        expect( locateFailure({ term: plain.prog, map: plain.map })?.location?.line ).toBe( 2 );
    });

    test("a passing evaluation has no failure", () => {
        const ok = mergedAsserts( 95 );
        expect( locateFailure({ term: ok.prog, map: ok.map }) ).toBe( undefined );
    });

    test("`if( isBig( b ) ) fail;` with the fail branch pruned: the case, not the helper", () => {
        const two = int( 2 );
        const helperBody = app( lt(), int( 20 ), app( mul(), v( 0 ), two ) );
        const isBigB = app( v( 1 ), v( 0 ) );
        const ifCase = new Case( isBigB, [ int( 1 ) ] );
        const prog = app( new Lambda( app( new Lambda( ifCase ), int( 55 ) ) ), new Lambda( helperBody ) );
        const map = mapFor( prog, {
            mappings: [ [ two, 2, 23 ], [ helperBody, 3, 12 ], [ ifCase, 12, 5 ], [ isBigB, 12, 9 ] ],
            functions: [ [ helperBody, "isBig", 1 ], [ ifCase, "entry", 10 ] ],
        });
        const failure = locateFailure({ term: prog, map })!;
        expect( failure.message ).toContain( "out of range" );
        expect( failure.location ).toMatchObject({ line: 12, column: 5 });
        expect( failure.stack.map( f => f.functionName ) ).toEqual([ "entry" ]);
    });

    test("a failure in unmapped (library) code is located at the user code that called it", () => {
        const libBody = app( headList(), v( 0 ) );
        const xs = v( 0 );
        const callLib = app( v( 1 ), xs );
        const prog = app( new Lambda( app( new Lambda( callLib ), emptyList() ) ), new Lambda( libBody ) );
        const map = mapFor( prog, {
            mappings: [ [ callLib, 21, 15 ], [ xs, 21, 20 ] ],
            functions: [ [ callLib, "f", 20 ] ],
        });
        const failure = locateFailure({ term: prog, map })!;
        expect( failure.location ).toMatchObject({ line: 21, column: 20 });
        expect( failure.stack ).toEqual([ { functionName: "f", location: failure.location } ]);
    });

    test("the stack names each call site", () => {
        const err = new ErrorUPLC();
        const checkBody = new Case( UPLCConst.bool( false ), [ err, v( 0 ) ] );
        const callCheck = app( v( 1 ), v( 0 ) );
        const entry = new Lambda( callCheck );
        const prog = app( new Lambda( app( entry, int( 5 ) ) ), new Lambda( checkBody ) );
        const map = mapFor( prog, {
            mappings: [ [ err, 6, 5 ], [ callCheck, 11, 15 ] ],
            functions: [ [ checkBody, "check", 5 ], [ callCheck, "entry", 10 ] ],
        });
        const failure = locateFailure({ term: prog, map })!;
        expect( failure.stack.map( f => [ f.functionName, f.location?.line, f.location?.column ] ) ).toEqual([
            [ "check", 6, 5 ],
            [ "entry", 11, 15 ],
        ]);
    });

    test("a body copied in place of its call: the caller's frame points at the call", () => {
        const err = new ErrorUPLC();
        const checkBody = new Case( UPLCConst.bool( false ), [ err, int( 1 ) ] );
        // entry's body: [ (lam x x) <check's body, copied in> ]
        const entryBody = app( new Lambda( v( 0 ) ), checkBody );
        const one = int( 7 );
        const prog = app( new Lambda( entryBody ), one );
        const index = indexProgram( prog );
        const map = mapFor( prog, {
            mappings: [ [ err, 6, 5 ], [ one, 20, 9 ] ],
            functions: [ [ checkBody, "check", 5 ], [ entryBody, "entry", 10 ] ],
        });
        map.inlinedCalls = [ [ index.indexOf( checkBody )!, 0, 11, 15, 11, 25 ] ];
        const failure = locateFailure({ term: prog, map: parseSourceMap( map ) })!;
        expect( failure.stack.map( f => [ f.functionName, f.location?.line, f.location?.column ] ) ).toEqual([
            [ "check", 6, 5 ],
            [ "entry", 11, 15 ],
        ]);
    });

    test("finds the program under applied parameters", () => {
        const err = new ErrorUPLC();
        // (lam param (lam x (case x [error, param])))
        const prog = new Lambda( new Lambda( new Case( v( 0 ), [ err, v( 1 ) ] ) ) );
        const map = mapFor( prog, { mappings: [ [ err, 4 ] ] } );
        const evaluated = app( app( prog, int( 7 ) ), UPLCConst.bool( false ) );
        expect( locateFailure({ term: evaluated, map })?.location?.line ).toBe( 4 );
    });

    test("a map for another program gives nothing", () => {
        const { map } = mergedAsserts( 5 );
        const other = app( headList(), emptyList() );
        expect( locateFailure({ term: other, map }) ).toBe( undefined );
    });

    test("the failure reproduces under the original budget", () => {
        const { prog, map } = mergedAsserts( 5 );
        const machine = new Machine();
        const { budgetSpent } = machine.eval( prog );
        // the same budget fails at the same place
        expect( locateFailure({ term: prog, map, budget: budgetSpent })?.location?.line ).toBe( 6 );
    });
});

describe("formatting", () => {

    test("formatFailure: location, code frame and stack", () => {
        const err = new ErrorUPLC();
        const body = new Case( v( 0 ), [ err, int( 1 ) ] );
        const prog = app( new Lambda( body ), UPLCConst.bool( false ) );
        const map = mapFor( prog, {
            mappings: [ [ err, 2, 5 ] ],
            functions: [ [ body, "main", 1 ] ],
            sourcesContent: "function main() {\n    fail;\n}\n",
        });
        const failure = locateFailure({ term: prog, map })!;
        expect( formatFailure( failure, map ) ).toBe(
            "error: explicit error from uplc\n" +
            "failed at src/index.pebble:2:5\n" +
            "        fail;\n" +
            "        ^\n" +
            "    at main (src/index.pebble:2:5)"
        );
    });

    test("repeated frames collapse", () => {
        const loc = { source: "a.pebble", line: 3, column: 9, endLine: 3, endColumn: 12 };
        const rec = { functionName: "fib", location: loc };
        expect( formatFailureStack({ message: "x", stack: [ rec, rec, rec, { functionName: "main", location: { ...loc, line: 9 } } ] }) ).toEqual([
            "at fib (a.pebble:3:9)",
            "... repeated 2 more times",
            "at main (a.pebble:9:9)",
        ]);
    });
});

describe("Machine.setStepHook", () => {

    test("sees every state, the final one included, and can be removed", () => {
        const { prog } = mergedAsserts( 95 );
        const machine = new Machine();
        const tags: number[] = [];
        machine.setStepHook( s => { tags.push( s.tag ); } );
        const withHook = machine.eval( prog );
        machine.setStepHook( undefined );
        const withoutHook = machine.eval( prog );

        expect( tags[ tags.length - 1 ] ).toBe( MachineStateTag.Done );
        expect( tags.length ).toBeGreaterThan( 20 );
        expect( withHook.result ).toEqual( withoutHook.result );
        expect( withHook.budgetSpent.cpu ).toBe( withoutHook.budgetSpent.cpu );
    });
});
