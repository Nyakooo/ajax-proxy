"use strict";
// npm install compression-webpack-plugin@5.0.0 -S -D
// const CompressionWebpackPlugin = require("compression-webpack-plugin");
const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  parallel: false,
  devServer: {
    host: "0.0.0.0",
    port: 8082,
    https: false,
    hot: true, // 开启热模块加载
    disableHostCheck: true, // 启用 host 访问
    // proxy: {},
  },
  publicPath: process.env.NODE_ENV === "production" ? "./" : "/",
  productionSourceMap: false,
  configureWebpack: (config) => {
    config.output.hashFunction = "xxhash64";
    // 开启gzip压缩
    if (isProduction) {
      // config.plugins.push(
      //   new CompressionWebpackPlugin({
      //     algorithm: "gzip",
      //     test: /\.js$|\.html$|\.json$|\.css/,
      //     threshold: 10240,
      //     minRatio: 0.8,
      //   })
      // );
      // 开启分离js
      config.optimization = {
        runtimeChunk: "single",
        splitChunks: {
          chunks: "all",
          maxInitialRequests: Infinity,
          minSize: 20000,
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name(module) {
                // Resolve the last node_modules segment so pnpm's nested store
                // paths do not collapse every dependency into `.pnpm`.
                const segments = (module.context || "")
                  .split(/node_modules[\\/]/)
                  .filter(Boolean);
                const packagePath = segments[segments.length - 1] || "runtime";
                const parts = packagePath.split(/[\\/]/);
                const packageName = parts[0].startsWith("@")
                  ? `${parts[0]}/${parts[1] || "unknown"}`
                  : parts[0];
                return `npm.${packageName.replace("@", "").replace("/", "-")}`;
              },
            },
          },
        },
      };
      // 取消webpack警告的性能提示
      config.performance = {
        hints: "warning",
        //入口起点的最大体积
        maxEntrypointSize: 50000000,
        //生成文件的最大体积
        maxAssetSize: 30000000,
        //只给出 js 文件的性能提示
        assetFilter: function(assetFilename) {
          return assetFilename.endsWith(".js");
        },
      };
    }
  },
};
