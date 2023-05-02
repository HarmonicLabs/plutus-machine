import { Application, Lambda, Builtin, UPLCConst, UPLCVar } from "@harmoniclabs/uplc";
import { Machine } from "../Machine/Machine";

describe(" CEK :: Machine.evalSimple ", () => {
    
    test("env.pop", () => {
        
        expect(
            Machine.evalSimple(
                new Application(
                    new Application(
                        new Lambda(
                            new Lambda(
                                new Application(
                                    new Application(
                                        new Application(
                                            Builtin.ifThenElse,
                                            UPLCConst.bool( true )
                                        ),
                                        new UPLCVar( 1 ),
                                    ),
                                    new UPLCVar( 0 )
                                )
                            )
                        ),
                        UPLCConst.int( 42 )
                    ),
                    new Application(
                        new Lambda(
                            new Application(
                                new Application(
                                    Builtin.addInteger,
                                    UPLCConst.int( 2 )
                                ),
                                new UPLCVar( 0 )
                            )
                        ),
                        UPLCConst.int( 67 )
                    )
                )
            )
        ).toEqual(
            UPLCConst.int( 42 )
        );

    });

})