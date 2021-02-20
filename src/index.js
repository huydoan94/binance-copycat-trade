import 'core-js/stable';
import 'regenerator-runtime/runtime';

import path from 'path';
import express from 'express';
import Logger from 'logdna';
import axios from 'axios';

import binnaceTradeRunner from './binance-trade-index';
import binanceHelperRunner, { getTickerHandler } from './binance-helpers';

axios.defaults.baseURL = 'https://api.binance.com/api/v3';
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

app.get('/ticker-price/:ticker', getTickerHandler);
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(process.env.PORT || 3000);
