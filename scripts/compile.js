const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const chalk = require('chalk');
const rimraf = require('rimraf');
const webpack = require('webpack');
const config = require('../configs/webpack.config');

const buildFolderName = 'build';
const buildPath = path.join(__dirname, '..', buildFolderName);
const srcPath = path.join(__dirname, '..');
const nodeEnv = process.env.NODE_ENV;

const webpackConfig = config(nodeEnv, buildPath);
const copyFileAsync = promisify(fs.copyFile);
module.exports = promisify(rimraf)(buildPath)
  .then(() => promisify(fs.mkdir)(buildPath))
  .then(() => copyFileAsync(path.join(srcPath, 'index.html'), path.join(buildPath, 'index.html')))
  .then(() => new Promise((resolve, reject) => webpack(
    webpackConfig,
    (err, stat) => err || stat.hasErrors() ? reject(err || stat.toString()) : resolve(stat)
  )))
  .then(() => new Promise((resolve) => {
    console.log(chalk.cyan('Compiled App'));
    resolve(webpackConfig.output);
  }))
  .catch((err) => {
    console.log(`Compile App Failed\n${err}`);
    process.exit(1);
  });
