import { Machine } from "./Machine/Machine";
import { ToUPLC, UPLCTerm } from "@harmoniclabs/uplc"

/**
 * @deprecated use `Machine.evalSimple` static method instead
 */
export function evalScript( term: UPLCTerm | ToUPLC ): UPLCTerm
{
    return Machine.evalSimple( term );
}