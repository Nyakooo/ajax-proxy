import { IRedirectHeader } from './types';
type Req = {
    url: string;
    method: string;
};
type Next = {
    url: string;
    headers?: {
        [key: IRedirectHeader['key']]: IRedirectHeader['value'];
    };
};
export declare function execSetup(req: Req, funcText: string): Promise<Next>;
export {};
