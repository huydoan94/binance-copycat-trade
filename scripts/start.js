const path = require('path');
const chalk = require('chalk');
const nodemon = require('nodemon');
const get = require('lodash/get');

process.env.NODE_ENV = get(process.env, 'NODE_ENV', 'development');
require('./compile').then(({ path: buildPath, filename }) => {
  console.log(chalk.cyan('Starting App'));

  let firstStart = true;
  nodemon({
    script: path.join(buildPath, filename),
    watch: buildPath
  }).on(
    'start', () => {
      if (!firstStart) return;
      console.log(chalk.cyan('App Started'));
      firstStart = false;
    }
  ).on(
    'restart', () => console.log(chalk.cyan('Reloaded App'))
  ).on(
    'crash', () => {
      console.error('App Crashed !!!');
      process.exit(1);
    }
  );
});
