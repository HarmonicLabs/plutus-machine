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

const envDepths = new WeakMap<object, number>();

/**
 * Number of values in `env`. Remembered per list node, so asking for the env of every
 * recorded state walks each node once.
 */
export function envDepth( env: CEKEnv ): number
{
    if( env === undefined ) return 0;
    const known = envDepths.get( env );
    if( known !== undefined ) return known;

    // walk to the first node whose depth is known, then number the nodes walked
    const walked: { value: CEKValueObj; next: CEKEnv }[] = [];
    let node: CEKEnv = env;
    let depth = 0;
    while( node !== undefined )
    {
        const d = envDepths.get( node );
        if( d !== undefined ) { depth = d; break; }
        walked.push( node );
        node = node.next;
    }
    for( let i = walked.length - 1; i >= 0; i-- ) envDepths.set( walked[i], ++depth );
    return depth;
}

/**
 * Whether `env` is `ancestor` or extends it: envs are persistent lists, so a term evaluated
 * under a lambda (or a closure created there) sees an env that extends the lambda's.
 * The empty env is an ancestor of every env.
 */
export function envExtends( env: CEKEnv, ancestor: CEKEnv ): boolean
{
    if( ancestor === undefined ) return true;
    let skip = envDepth( env ) - envDepth( ancestor );
    if( skip < 0 ) return false;
    let node = env;
    while( skip-- > 0 ) node = node!.next;
    return node === ancestor;
}
