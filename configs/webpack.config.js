const ESLintPlugin = require('eslint-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');

module.exports = (env, buildPath) => {
  return {
    mode: env,
    entry: './src/index.js',
    output: {
      path: buildPath,
      filename: 'index.js'
    },
    target: 'node',
    node: {
      __dirname: false,
      __filename: false
    },
    plugins: [
      new ESLintPlugin(),
      new CaseSensitivePathsPlugin()
    ],
    module: {
      rules: [
        {
          test: /.*\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader'
          }
        }
      ]
    },
    watch: env !== 'production',
    watchOptions: env !== 'production'
      ? {
          aggregateTimeout: 300,
          ignored: ['node_modules', 'scripts/**', 'configs/**', 'build/**']
        }
      : undefined
  };
};
