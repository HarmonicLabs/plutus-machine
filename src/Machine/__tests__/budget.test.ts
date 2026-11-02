import { parseUPLCText } from "@harmoniclabs/uplc";
import { defaultV4Costs } from "@harmoniclabs/cardano-costmodels-ts";
import { Machine } from "../Machine";
import { ExBudget } from "../ExBudget";
import { CEKError } from "../../CEKValue";

/**
 * A restricted budget stops the evaluation: the machine used to compute the "out of budget"
 * error and drop it, so scripts over budget succeeded and infinite loops never returned.
 */
describe("budget", () => {

    // [(lam x [x x]) (lam x [x x])]
    const omega = () => parseUPLCText( "[ (lam x [ x x ]) (lam x [ x x ]) ]" );
    // sha2_256 applied 30 times: mostly builtin costs
    const hashes = () => {
        let src = "(con bytestring #00)";
        for( let i = 0; i < 30; i++ ) src = `[ (builtin sha2_256) ${src} ]`;
        return parseUPLCText( src );
    };

    test("an infinite loop runs out of budget", () => {
        const machine = new Machine( defaultV4Costs, new ExBudget({ cpu: 10_000_000, mem: 100_000 }) );
        const { result } = machine.eval( omega() );
        expect( result ).toBeInstanceOf( CEKError );
        expect( ( result as CEKError ).msg ).toBe( "out of budget" );
    });

    test("within budget: the same result and costs as without a limit", () => {
        const unlimited = new Machine( defaultV4Costs ).eval( hashes() );
        const limited = new Machine( defaultV4Costs, new ExBudget({ cpu: 10_000_000_000, mem: 14_000_000 }) ).eval( hashes() );
        expect( limited.result ).toEqual( unlimited.result );
        expect( limited.budgetSpent.cpu ).toBe( unlimited.budgetSpent.cpu );
        expect( limited.budgetSpent.mem ).toBe( unlimited.budgetSpent.mem );
    });

    test("a budget smaller than the cost fails, builtin costs included", () => {
        const { budgetSpent } = new Machine( defaultV4Costs ).eval( hashes() );
        const tight = new ExBudget({ cpu: budgetSpent.cpu - BigInt( 1 ), mem: budgetSpent.mem });
        const { result } = new Machine( defaultV4Costs, tight ).eval( hashes() );
        expect( ( result as CEKError ).msg ).toBe( "out of budget" );

        const exact = new ExBudget({ cpu: budgetSpent.cpu, mem: budgetSpent.mem });
        expect( new Machine( defaultV4Costs, exact ).eval( hashes() ).result ).not.toBeInstanceOf( CEKError );
    });

    test("resetBudget restricts a machine created without a budget, and back", () => {
        const machine = new Machine( defaultV4Costs );
        machine.resetBudget( new ExBudget({ cpu: 10_000_000, mem: 100_000 }) );
        expect( ( machine.eval( omega() ).result as CEKError ).msg ).toBe( "out of budget" );

        machine.resetBudget( ExBudget.unlimited() );
        expect( machine.eval( hashes() ).result ).not.toBeInstanceOf( CEKError );
    });
});
