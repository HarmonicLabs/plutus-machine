import { UPLCTermObj } from "@harmoniclabs/uplc";
import { MachineStateTag } from "../_internal/MachineStateTag"
import { CEKEnv } from "../CEKEnv";
import { MachineContext } from "./MachineContext";
import { CEKValueObj } from "../CEKValue";

export type MachineState
    = MachineStateCompute
    | MachineStateReturn
    | MachineStateDone
    ;


export interface MachineStateCompute {
    tag: MachineStateTag.Compute,
    ctx: MachineContext, 
    env: CEKEnv,
    term: UPLCTermObj
}

export interface MachineStateReturn {
    tag: MachineStateTag.Return,
    ctx: MachineContext, 
    // V8 object shape optimization
    env: undefined
    term: CEKValueObj
}

export interface MachineStateDone {
    tag: MachineStateTag.Done,
    // V8 object shape optimization
    ctx: undefined,
    // V8 object shape optimization
    env: undefined,
    term: CEKValueObj// UPLCTermObj
}
