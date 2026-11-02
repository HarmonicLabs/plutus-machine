import { UPLCTerm } from "@harmoniclabs/uplc";
import { UPLCTermTag } from "@harmoniclabs/uplc/dist/UPLCTerm/UPLCTermTag";

/**
 * Terms of a program in pre-order, children in flat order:
 * `Application` function then argument; `Lambda`, `Delay` and `Force` their child;
 * `Constr` fields in order; `Case` scrutinee, then branches in order.
 */
export interface ProgramIndex {
    readonly root: UPLCTerm;
    readonly terms: readonly UPLCTerm[];
    /** index of each term's parent; `-1` for the root */
    readonly parents: Int32Array;
    /**
     * index of `term`, or `undefined` when the term is not part of the program
     * or when the same object sits at two positions (its index would be ambiguous)
     */
    indexOf( term: object ): number | undefined;
}

const AMBIGUOUS = -1;

export function indexProgram( root: UPLCTerm ): ProgramIndex
{
    const terms: UPLCTerm[] = [];
    const parentsArr: number[] = [];
    const indices = new Map<UPLCTerm, number>();

    const stack: UPLCTerm[] = [ root ];
    const stackParents: number[] = [ -1 ];
    while( stack.length > 0 )
    {
        const t = stack.pop()!;
        const parent = stackParents.pop()!;
        const idx = terms.length;
        terms.push( t );
        parentsArr.push( parent );
        indices.set( t, indices.has( t ) ? AMBIGUOUS : idx );

        const children = childrenOf( t );
        for( let i = children.length - 1; i >= 0; i-- )
        {
            stack.push( children[i] );
            stackParents.push( idx );
        }
    }

    return {
        root,
        terms,
        parents: Int32Array.from( parentsArr ),
        indexOf( term: object ): number | undefined {
            const idx = indices.get( term as UPLCTerm );
            return idx === AMBIGUOUS ? undefined : idx;
        }
    };
}

/** number of terms of `root`, counting at most up to `limit + 1` */
export function countTerms( root: UPLCTerm, limit: number = Number.MAX_SAFE_INTEGER ): number
{
    let n = 0;
    const stack: UPLCTerm[] = [ root ];
    while( stack.length > 0 && n <= limit )
    {
        const t = stack.pop()!;
        n++;
        const children = childrenOf( t );
        for( let i = 0; i < children.length; i++ ) stack.push( children[i] );
    }
    return n;
}

export function childrenOf( t: UPLCTerm ): readonly UPLCTerm[]
{
    switch( t.tag )
    {
        case UPLCTermTag.Application: return [ t.func, t.arg ];
        case UPLCTermTag.Lambda: return [ t.body ];
        case UPLCTermTag.Delay: return [ t.delayedTerm ];
        case UPLCTermTag.Force: return [ t.forced ];
        case UPLCTermTag.Constr: return t.terms;
        case UPLCTermTag.Case: return [ t.constrTerm, ...t.continuations ];
        default: return [];
    }
}
