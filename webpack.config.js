// See https://webpack.js.org/configuration/ for more about configuration files.

const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    entry: {
        content: "./src/content.ts",
        serviceWorker: "./src/serviceWorker.ts",
        popup: "./src/popup.ts",
    },
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        clean: true,
    },
    mode: "development",
    devtool: "cheap-module-source-map",
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".js"],
        alias: {
            xmlhttprequest: false,
        },
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [{ from: "static" }],
        }),
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, "dist"),
        },
        compress: true,
        port: 3000,
        hot: true,
        devMiddleware: {
            writeToDisk: true,
        },
    },
};
