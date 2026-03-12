import { CEKValueObj } from "./CEKValue/CEKValue";

// Persistent linked list — O(1) extend, O(n) lookup where n is the de Bruijn index.
export type CEKEnv = { value: CEKValueObj; next: CEKEnv } | undefined;

export function extendEnv(env: CEKEnv, value: CEKValueObj): CEKEnv {
    return { value, next: env };
}

export function lookupEnv(env: CEKEnv, dbn: number): CEKValueObj | undefined {
    let current = env;
    let i = dbn;
    while (current !== undefined) {
        if (i === 0) return current.value;
        i--;
        current = current.next;
    }
    return undefined;
}
