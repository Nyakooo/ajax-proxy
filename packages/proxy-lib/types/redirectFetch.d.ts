import { RefGlobalState } from "./types";
export declare const initRedirectFetchState: (state: RefGlobalState) => RefGlobalState<import("./types").IGlobalState>;
export default function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
