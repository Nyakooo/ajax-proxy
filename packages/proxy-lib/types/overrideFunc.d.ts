declare type Ctx = {
    req: {
        url: string;
        method: string;
        body?: any;
    };
    res: {
        status: string;
        customStatus: string;
        response: any;
    };
};
declare type Next = {
    override?: string;
    status?: string | number;
};
export declare function getCtx(url: string, method: string, status: string | number, customStatus: string, body?: any, response?: any): Ctx;
export declare function execSetup(ctx: Ctx, funcText: string): Promise<Next>;
export {};
