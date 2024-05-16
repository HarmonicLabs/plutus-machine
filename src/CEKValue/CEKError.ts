import { ErrorUPLC } from "@harmoniclabs/uplc";

export class CEKError
{
    public msg?: string;
    public addInfos?: object
    
    constructor( msg?: string, addInfos?: object )
    {
        this.msg = msg;
        this.addInfos = addInfos;
    };

    clone(): CEKError
    {
        return new CEKError(this.msg, this.addInfos);
    }

    static fromUplc( uplc: ErrorUPLC, addInfos?: any ): CEKError
    {
        return new CEKError(
            uplc.msg ?? "explicit error from uplc",
            uplc.addInfos ?? addInfos
        );
    }
}