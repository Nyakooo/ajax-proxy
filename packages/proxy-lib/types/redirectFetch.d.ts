import { RefGlobalState } from "./types";
export declare const initRedirectFetchState: (state: RefGlobalState) => RefGlobalState;
export default function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
