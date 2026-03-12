
// --- MachineContext / Continuation frames ---

import { UPLCTermObj } from "@harmoniclabs/uplc";
import { MachineContextTag } from "../_internal/MachineContextTag";
import { CEKValueObj } from "../CEKValue";
import { CEKEnv } from "../CEKEnv";

export type MachineContext =
    | NoFrame
    | FrameAwaitArg
    | FrameAwaitFunTerm
    | FrameAwaitFunValue
    | FrameForce
    | FrameConstr
    | FrameCases;

/*
tag
value
env
ctx
index
branches
resolved
*/

export interface NoFrame {
    readonly tag: MachineContextTag.NoFrame;
    // V8 object shape optimization
    readonly value: undefined;
    readonly env: undefined;
    readonly ctx: undefined;
    readonly index: undefined;
    readonly branches: undefined;
    readonly resolved: undefined;
}

export interface FrameAwaitArg {
    readonly tag: MachineContextTag.FrameAwaitArg;
    readonly value: CEKValueObj;
    // V8 object shape optimization
    readonly env: undefined;
    readonly ctx: MachineContext;
    // V8 object shape optimization
    readonly index: undefined;
    readonly branches: undefined;
    readonly resolved: undefined;
}

export interface FrameAwaitFunTerm {
    readonly tag: MachineContextTag.FrameAwaitFunTerm;
    readonly value: UPLCTermObj;
    readonly env: CEKEnv;
    readonly ctx: MachineContext;
    // V8 object shape optimization
    readonly index: undefined;
    readonly branches: undefined;
    readonly resolved: undefined;
}

export interface FrameAwaitFunValue {
    readonly tag: MachineContextTag.FrameAwaitFunValue;
    readonly value: CEKValueObj;
    readonly env: undefined;
    readonly ctx: MachineContext;
    // V8 object shape optimization
    readonly index: undefined;
    readonly branches: undefined;
    readonly resolved: undefined;
}

export interface FrameForce {
    readonly tag: MachineContextTag.FrameForce;
    readonly value: undefined;
    readonly env: undefined;
    readonly ctx: MachineContext;
    // V8 object shape optimization
    readonly index: undefined;
    readonly branches: undefined;
    readonly resolved: undefined;
}

export interface FrameConstr {
    readonly tag: MachineContextTag.FrameConstr;
    readonly value: undefined;
    readonly env: CEKEnv;
    readonly ctx: MachineContext;
    readonly index: bigint;
    /** fields */
    readonly branches: ReadonlyArray<UPLCTermObj>;
    readonly resolved: CEKValueObj[];
}

export interface FrameCases {
    readonly tag: MachineContextTag.FrameCases;
    readonly value: undefined;
    readonly env: CEKEnv;
    readonly ctx: MachineContext;
    readonly index: undefined;
    readonly branches: ReadonlyArray<UPLCTermObj>;
    readonly resolved: undefined;
}
