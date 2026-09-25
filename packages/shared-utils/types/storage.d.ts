import { StorageKey } from './consts';
export declare function initStorage(): Promise<void>;
export declare function getStorage(key: string, defaultValue?: any): any;
/**不走缓存获取数据 */
export declare function getRealStorage(key: StorageKey, defaultValue?: any): Promise<any>;
export declare function setStorage(key: string, val: any): Promise<void>;
export declare function removeStorage(keys: string | string[]): Promise<void>;
export declare function clearStorage(): Promise<void>;
/**获取全部数据 */
export declare function getStorageAll(): Promise<{
    [key: string]: any;
}>;
