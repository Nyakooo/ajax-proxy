import { IRedirectHeader } from './types';
declare type Req = {
    url: string;
    method: string;
};
declare type Next = {
    url: string;
    headers?: {
        [key: IRedirectHeader['key']]: IRedirectHeader['value'];
    };
};
export declare function execSetup(req: Req, funcText: string): Promise<Next>;
export {};
