
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

export function cekValueTagToString(tag: CEKValueTag): string {
    switch (tag) {
        case CEKValueTag.Const: return "Const";
        case CEKValueTag.Delay: return "Delay";
        case CEKValueTag.Lambda: return "Lambda";
        case CEKValueTag.Constr: return "Constr";
        case CEKValueTag.PartialBuiltin: return "PartialBuiltin";
        case CEKValueTag.Error: return "Error";
        default: return "Unknown";
    }
}