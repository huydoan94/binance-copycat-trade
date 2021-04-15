import 'core-js/stable';
import 'regenerator-runtime/runtime';

import path from 'path';
import express from 'express';
import Logger from 'logdna';

import { create } from './utils/axios';

import binnaceTradeRunner from './binance-trade-index';
import binanceHelperRunner, {
  getAllTickersHandler,
  getTickerHandler,
  getBinanceAccounHandler
} from './binance-helpers';

global.spotApi = create('https://api.binance.com/api/v3');
global.futureApi = create('https://fapi.binance.com/fapi/v1');

const app = express();
const logdnaKey = process.env.LOGDNA_KEY;

if (logdnaKey) {
  const [key] = JSON.parse(logdnaKey);
  const logger = Logger.createLogger(key, {
    hostname: 'binance-copycat-trade',
    app: 'binance-copycat-trade',
    env: process.env.NODE_ENV
  });

  console.log = msg => logger.info(msg);
  console.error = err => logger.error(err);
  console.warn = msg => logger.warn(msg);
}

binnaceTradeRunner();
binanceHelperRunner();

app.use('*', (req, res, next) => {
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
  res.redirect(`https://${req.hostname}${req.originalUrl}`);
});
app.get('/ticker-price/:ticker', getTickerHandler);
app.get('/ticker-prices', getAllTickersHandler);
app.get('/account-data', getBinanceAccounHandler);
app.get('/not-found', (_, res) => res.status(404).sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.redirect(`https://${req.hostname}/not-found`));
app.listen(process.env.PORT || 3000);
