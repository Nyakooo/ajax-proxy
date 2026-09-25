import { RefGlobalState } from "./types";
export declare const initRedirectXHRState: (state: RefGlobalState) => RefGlobalState;
export default class CustomRedirectXHR extends XMLHttpRequest {
    method: string;
    constructor();
    private watchAndRedirect;
}
