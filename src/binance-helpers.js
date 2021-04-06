import axios from 'axios';
import { keyBy, forEach, isEmpty } from 'lodash';

import BinanceSocket from './binance-socket';
import AccountBalance from './binance-account-balance';

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

const accountBalanceMap = {};
const accountBalanceSocketHandler = apiKey => msg => {
  const data = JSON.parse(msg);
  if (data.e === 'outboundAccountPosition' && accountBalanceMap[apiKey]) {
    accountBalanceMap[apiKey].storeData.adjustAccountBalanceFromEvent(data.B, true);
  }
};
const accountBalanceDataTimeout = apiKey => () => {
  if (accountBalanceMap[apiKey]) {
    accountBalanceMap[apiKey].socket.socketClient.close(4991);
    clearTimeout(accountBalanceMap[apiKey].dataTimeout);
    delete accountBalanceMap[apiKey];
  }
};
export const getBinanceAccounHandler = async (req, res) => {
  const apiKey = req.get('X-MBX-APIKEY');
  if (isEmpty(apiKey)) return res.json([]);

  if (accountBalanceMap[apiKey]) {
    clearTimeout(accountBalanceMap[apiKey].dataTimeout);
    accountBalanceMap[apiKey].dataTimeout = setTimeout(accountBalanceDataTimeout(apiKey), 5 * 60 * 1000);
    return res.json(accountBalanceMap[apiKey].storeData.balances);
  }

  try {
    const queryString = req.url.replace(/[^?]*/, '');
    const { data } = await axios.get(
      `https://api.binance.com/api/v3/account${queryString}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    const storeData = new AccountBalance('');
    storeData.saveBalances((data.balances || []));

    const socket = new BinanceSocket(apiKey, accountBalanceSocketHandler(apiKey));
    const dataTimeout = setTimeout(accountBalanceDataTimeout(apiKey), 5 * 60 * 1000);
    accountBalanceMap[apiKey] = { storeData, socket, dataTimeout };
    res.json(storeData.balances);
  } catch (e) {
    res.json([]);
  }
};

export default run;
