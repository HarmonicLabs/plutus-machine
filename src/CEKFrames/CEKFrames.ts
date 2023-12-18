import { showUPLC } from "@harmoniclabs/uplc";
import { ForceFrame } from "./ForceFrame";
import { LApp } from "./LApp";
import { RApp } from "./RApp";

export type Frame = ForceFrame | LApp | RApp ;

export function isFrame( stuff: any ): stuff is Frame
{
    return (
        stuff instanceof ForceFrame ||
        stuff instanceof LApp ||
        stuff instanceof RApp
    );
}

export class CEKFrames
{
    private _frames: Frame[];
    constructor( init: Frame[] = [] )
    {
        this._frames = init
    }

    get isEmpty(): boolean { return this._frames.length === 0; }

    callStack(): string[]
    {
        /*
        Essentially
        ```
        return this._frames
            .map( f => f.src )
            .filter( s => typeof s === "string" );
        ```
        but avoids 1 extra array allocation 
        */
        const framesLen = this._frames.length;
        const result: string[] = new Array( framesLen );
        let actualLen = 0;
        for( let i = 0; i < framesLen; i++ )
        {
            const src = this._frames[i].src;
            if( typeof src === "string" )
            {
                result[actualLen++] = src;
            }
        }
        // drop extra slots
        result.length = actualLen;
        return result;
    }

    push( f: Frame ): void
    {
        this._frames.push( f );
    }

    pop(): Frame
    {
        const f = this._frames.pop();
        if( f === undefined )
        {
            throw new Error("frames stack was empty while trying to pop a frame");
        }
        return f;
    }

    clone(): CEKFrames
    {
        return new CEKFrames( this._frames.map( frame => frame.clone() ) );
    }

    _unsafe_clear(): void
    {
        this._frames.length = 0;
    }
}

export function showFrames( frames: Readonly<CEKFrames> ): string
{
    // const frames = frames_.clone();

    let res = "_";
    let topFrame: Frame;
    while( !frames.isEmpty )
    {
        topFrame = frames.pop();

        if( topFrame instanceof ForceFrame )
        {
            res = `( force ${res} )`;
        }
        else if( topFrame instanceof LApp )
        {
            res = `[ ${showUPLC(topFrame.func)} ${res} ]`
        }
        else
        {
            res = `[ ${res} ${showUPLC(topFrame.arg)} ]`
        }
    }

    return res;
}