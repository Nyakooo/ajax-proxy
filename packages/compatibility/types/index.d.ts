import { MappingOldKeys, NewGLobalStateStruct, NewUploadStruct, OldGLobalStateStruct, OldUploadStruct } from "./types";
/**
 * 数据转换
 * content-script 使用, 页面加载时
 * 由于 v2.1.0 版本 项目重构，数据属性有变动。
 * 需要将老数据预处理为新数据结构体
 */
export declare function onLoadForDataConversion<T extends NewGLobalStateStruct | OldGLobalStateStruct | {
    [key: string]: any;
}>(target: T): {
    changed: boolean;
    data: NewGLobalStateStruct;
    changeKeywords: MappingOldKeys;
} | {
    changed: boolean;
    data: T;
    changeKeywords: never[];
};
/**
 * 数据转换
 * panels 使用, 数据上传时
 * 由于 v2.1.0 版本 项目重构，数据属性有变动。
 * 需要将老数据预处理为新数据结构体
 * 原数据格式: { lang, proxy_routes, tags, mode, redirect }
 * 转义为: { language, mode, tags, interceptors, redirectors }
 */
export declare function onUploadForDataConversion(target: OldUploadStruct | NewUploadStruct): NewUploadStruct;
