import { keyBy, forEach, isEmpty } from 'lodash';

import BinanceSocket from './binance-socket';
import AccountBalance from './binance-account-balance';

let aggTickerPrice = {};
const run = async () => {
  const { data: symbolPrices } = await global.spotApi.get('/ticker/price');
  aggTickerPrice = keyBy(symbolPrices, 'symbol');

  const updateAggTickerPrice = d => { aggTickerPrice[d.s] = { symbol: d.s, price: d.c }; };
  new BinanceSocket({
    socketUrl: '!miniTicker@arr',
    messageHandler: (msg) => forEach(JSON.parse(msg), updateAggTickerPrice)
  });
};

export const getTickerHandler = (req, res) => {
  const pair = (req.params.ticker || '').replace(/[\W_]+/g, '').toUpperCase();
  const ticker = aggTickerPrice[pair];
  res.json(ticker || {});
};

export const getAllTickersHandler = (_, res) => {
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
const setAccountBalanceDataTimeout = apiKey => setTimeout(accountBalanceDataTimeout(apiKey), 5 * 60 * 1000);
export const getBinanceAccounHandler = async (req, res) => {
  const apiKey = req.get('X-MBX-APIKEY');
  if (isEmpty(apiKey)) return res.json([]);

  if (accountBalanceMap[apiKey]) {
    clearTimeout(accountBalanceMap[apiKey].dataTimeout);
    accountBalanceMap[apiKey].dataTimeout = setAccountBalanceDataTimeout(apiKey);
    return res.json(accountBalanceMap[apiKey].storeData.balances);
  }

  try {
    const queryString = req.url.replace(/[^?]*/, '');
    const { data } = await global.spotApi.get(
      `https://api.binance.com/api/v3/account${queryString}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    const storeData = new AccountBalance('');
    storeData.saveBalances((data.balances || []));

    const socket = new BinanceSocket({
      key: apiKey,
      messageHandler: accountBalanceSocketHandler(apiKey)
    });
    socket.logging = false;

    const dataTimeout = setAccountBalanceDataTimeout(apiKey);
    accountBalanceMap[apiKey] = { storeData, socket, dataTimeout };
    res.json(storeData.balances);
  } catch (e) {
    res.json([]);
  }
};

export default run;
