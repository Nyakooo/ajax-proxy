
const isProduction = process.env.NODE_ENV === "production";

module.exports = {
    publicPath: './',
    runtimeCompiler: true,
    // 修改 src 为 examples
    pages: {
        index: {
            entry: "examples/main.js",
            template: "public/index.html",
            filename: "index.html",
        },
    },
    productionSourceMap: false,
    configureWebpack: (config) => {
        if (isProduction) {
            config.module.rules.push({
                test: /\.mjs$/,
                include: /node_modules/,
                type: "javascript/auto"
            });
            // 取消webpack警告的性能提示
            config.performance = {
                hints: "warning",
                //入口起点的最大体积
                maxEntrypointSize: 50000000,
                //生成文件的最大体积
                maxAssetSize: 30000000,
            };
        }
    },
}