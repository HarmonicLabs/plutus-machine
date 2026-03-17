import { fromHex, toHex } from "@harmoniclabs/uint8array-utils"
import { parseUPLC, Application, UPLCConst, constT, compileUPLC, UPLCProgram, UPLCVersion } from "@harmoniclabs/uplc";
import { DataMap, DataPair, DataB, DataI } from "@harmoniclabs/plutus-data";
import { Machine } from "../Machine/Machine";
import { CEKValueTag } from "../_internal/CEKValueTag";


describe("amtOf", () => {

    test("amtOf", () => {

        const script = fromHex(
            "010100323232232533357340022930b19b8733322233300521480008894ccd5cd19b8f32375c6aae740040080144ccc0208520002225333573466e3cdd71aab9d0020071375a6aae780084c00c004dd59aab9e002130030010030014891c000000000000000000000000000000000000000000000000000000000048812000000000000000000000000000000000000000000000000000000000000000000048150c0088888c8ccc018c010004c00c004008cc01000c0088894ccd55cf8008018998011aba100135744002464600446600400400246004466004004003"
        );
        const scriptBody = parseUPLC( script ).body;

        // The script expects a list (pair data data) argument:
        // a Value map of [ (B currencySymbol, Map [ (B tokenName, I amount) ]) ]
        const valueArg = new UPLCConst(
            constT.listOf( constT.pairOf( constT.data, constT.data ) ),
            [
                {
                    fst: new DataB( new Uint8Array(28) ),
                    snd: new DataMap([
                        new DataPair(
                            new DataB( new Uint8Array(32) ),
                            new DataI( 42 )
                        )
                    ])
                }
            ]
        );

        const fullyApplied = new Application( scriptBody, valueArg );
        const fullyAppliedSerialized = compileUPLC(
            new UPLCProgram(
                new UPLCVersion( 1, 1, 0 ),
                fullyApplied
            )
        );
        console.log( toHex( fullyAppliedSerialized ) );
        const result = Machine.evalSimple( fullyApplied );
        expect( result.tag ).toEqual( CEKValueTag.Const );
    });

});