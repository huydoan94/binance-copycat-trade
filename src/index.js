import 'core-js/stable';
import 'regenerator-runtime/runtime';

import path from 'path';
import express from 'express';
import Logger from 'logdna';
import axios from 'axios';
import axiosRetry from 'axios-retry';

import binnaceTradeRunner from './binance-trade-index';
import binanceHelperRunner, {
  getAllTickersHandler,
  getTickerHandler,
  getBinanceAccounHandler
} from './binance-helpers';

axiosRetry(axios, {
  shouldResetTimeout: true,
  retryDelay: (count, error) => {
    if (error.response && [418, 429].includes(error.response.status)) {
      return Number(error.response.headers['Retry-After']) * 1000;
    }
    return axiosRetry.exponentialDelay(count);
  }
});
axios.defaults.baseURL = 'https://api.binance.com/api/v3';
axios.defaults.timeout = 5 * 60 * 1000;

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
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(process.env.PORT || 3000);
