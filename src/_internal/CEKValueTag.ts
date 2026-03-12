
// const enums are inlined at compile time,
// so they don't exist at runtime and can't be imported from other dependees
export const enum CEKValueTag {
    Const = 0,
    Delay = 1,
    Lambda = 2,
    Constr = 3,
    PartialBuiltin = 4,
    Error = 5
}