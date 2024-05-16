import { Application, Builtin, UPLCConst, constT } from "@harmoniclabs/uplc"
import { Machine } from "../Machine";
import { CEKConst } from "../../CEKValue/CEKConst";
import { DataConstr } from "@harmoniclabs/plutus-data";

describe("constrData execution", () => {
    
    test("unit", () => {

        const term = new Application(
            new Application(
                Builtin.constrData,
                UPLCConst.int( 0 )
            ),
            UPLCConst.listOf( constT.data )([])
        );

        const res = Machine.eval( term );

        expect( res.result ).toEqual( CEKConst.data( new DataConstr(0,[]) ) );
        console.log( res.budgetSpent.toJson() )
    })
})