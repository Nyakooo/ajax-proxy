const { resolve } = require('path')
const CopyPlugin = require("copy-webpack-plugin");

const staticFiles = ['manifest.json', 'icons/*'].map(file => {
  return {
    from: file,
    to: '.'
  }
});

module.exports = {
  mode: 'production',
  entry: {
    content: resolve(__dirname, "src/content.ts"),
    document: resolve(__dirname, "src/document.ts"),
    service_worker: resolve(__dirname, "src/service-worker/index.ts"),
  },
  output: {
    path: resolve(__dirname, 'build'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    // 需要打包的文件后缀
    extensions: [".ts", ".js"]
  },
  plugins: [
    new CopyPlugin(
      {
        patterns: staticFiles,
      }
    ),
  ],
  // devtool: process.env.NODE_ENV !== 'production'
  //   ? 'inline-source-map'
  //   : false,
}
