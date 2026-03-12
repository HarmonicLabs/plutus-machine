
export const enum MachineContextTag {
    NoFrame = 0,
    FrameAwaitArg = 1,
    FrameAwaitFunTerm = 2,
    FrameAwaitFunValue = 3,
    FrameForce = 4,
    FrameConstr = 5,
    FrameCases = 6
}