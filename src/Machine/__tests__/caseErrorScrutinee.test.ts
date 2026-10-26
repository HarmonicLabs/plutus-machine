import { Application, Builtin, Case, UPLCConst } from "@harmoniclabs/uplc";
import { Machine } from "../Machine";
import { CEKError } from "../../CEKValue/CEKError";

// masterpiece BUG 19: when a `case` scrutinee evaluates to an error, the
// frame handler reported "case: expected constr or constant value, got 5"
// instead of propagating the underlying error message.
describe("case over an errored scrutinee propagates the real error", () => {

    test("failing builtin scrutinee keeps its own error", () => {
        // (case (unConstrData (iData 42)) [ branches... ]) — unConstrData fails
        const scrutinee = new Application(
            Builtin.unConstrData,
            new Application( Builtin.iData, UPLCConst.int( 42 ) )
        );
        const term = new Case( scrutinee, [ UPLCConst.int( 0 ) ] );
        const res = Machine.evalSimple( term );
        expect( res instanceof CEKError ).toBe( true );
        const msg = ( res as CEKError ).msg ?? String( (res as any).message ?? "" );
        expect( String( msg ) ).not.toContain( "expected constr or constant" );
    });
});
