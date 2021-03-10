import axios from 'axios';
import { keyBy, forEach } from 'lodash';

import BinanceSocket from './binance-socket';

let aggTickerPrice = {};
const run = async () => {
  const { data: symbolPrices } = await axios.get('/ticker/price');
  aggTickerPrice = keyBy(symbolPrices, 'symbol');

  new BinanceSocket(null, (msg) => {
    const data = JSON.parse(msg);
    forEach(data, d => {
      aggTickerPrice[d.s] = { symbol: d.s, price: d.c };
    });
  }, '!miniTicker@arr');
};

export const getTickerHandler = (req, res) => {
  const ticker = aggTickerPrice[req.params.ticker];
  res.json(ticker || {});
};

export const getAllTickersHandler = (req, res) => {
  res.json(Object.values(aggTickerPrice));
};

export default run;
