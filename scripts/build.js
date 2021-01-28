const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const get = require('lodash/get');

process.env.NODE_ENV = get(process.env, 'NODE_ENV', 'production');
require('./compile').then(({ path: buildPath, filename }) => {
  const buildFile = path.join(buildPath, filename);
  const stats = fs.statSync(buildFile);
  console.log(chalk.green(`App file size ${Math.round(stats.size / 1024)} KiB`));
  process.exit();
});
