import { ErrorUPLC, IErrorUPLC } from "@harmoniclabs/uplc";
import { ICEKValue } from ".";
import { CEKValueTag } from "../_internal/CEKValueTag";

export interface ICEKError extends ICEKValue {
    readonly tag: CEKValueTag.Error;
    msg?: string;
    addInfos?: any;
}

export class CEKError
    implements ICEKError
{
    readonly tag: CEKValueTag.Error = CEKValueTag.Error;
    public msg?: string;
    public addInfos?: any;
    
    constructor( msg?: string, addInfos?: object )
    {
        this.msg = msg;
        this.addInfos = addInfos;
    };

    clone(): CEKError
    {
        return new CEKError(this.msg, this.addInfos);
    }

    static fromUplc( uplc: IErrorUPLC, addInfos?: any ): CEKError
    {
        return new CEKError(
            uplc.msg ?? "explicit error from uplc",
            uplc.addInfos ?? addInfos
        );
    }
}