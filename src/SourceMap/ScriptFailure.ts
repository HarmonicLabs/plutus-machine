
/** Lines and columns start at 1; columns count UTF-16 code units; the end is exclusive. */
export interface SourceLocation {
    source: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}

export interface ScriptFailureFrame {
    functionName?: string;
    location?: SourceLocation;
}

/** Where a failing evaluation failed, in terms of the source the program was compiled from. */
export interface ScriptFailure {
    /** the machine's error message */
    message: string;
    /** innermost location in user code; missing when nothing evaluated has a location */
    location?: SourceLocation;
    /** function calls open at the failure, innermost first */
    stack: ScriptFailureFrame[];
}
