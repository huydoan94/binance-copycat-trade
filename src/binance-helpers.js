import { keyBy, forEach, isEmpty } from 'lodash';

import BinanceSocket from './binance-socket';
import AccountBalance from './binance-account-balance';

import { getHash } from './utils/hash';

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

/**
 * Account Balances Helper Functions
 *
 *
 *
 *
 *
 */

const accountBalanceMap = {};
const fetchFutureBalance = (() => {
  const cache = {};
  return ({ key, params, sig }) => {
    const cacheValue = cache[key];
    if (cacheValue && Date.now() - cacheValue.time < (60 * 1000)) return cacheValue.value;

    const value = global.futureApi.get(
      `/balance?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    cache[key] = { value, time: Date.now() };
    return value;
  };
})();
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
const appendFuturesAccountBalance = async (key, balances) => {
  let futureApiKeys = process.env.FUTURE_APIS || '[]';
  futureApiKeys = JSON.parse(futureApiKeys);

  const futureApiKey = futureApiKeys.find(pair => pair.spotKeys.some(k => k === key));
  if (!futureApiKey) return balances;

  const params = `timestamp=${Date.now()}`;
  const sig = getHash(params, futureApiKey.secret);
  const { data } = await fetchFutureBalance({ key: futureApiKey.key, sig, params });

  return data.reduce((balancesAcc, asset) => {
    const assetBalance = Number(asset.balance);
    if (assetBalance === 0) return balancesAcc;

    const balanceIndex = balancesAcc.findIndex(a => a.asset === asset.asset);
    if (balanceIndex === -1) {
      return [...balancesAcc, { asset: asset.asset, free: 0, locked: assetBalance }];
    }

    balancesAcc[balanceIndex] = {
      ...balancesAcc[balanceIndex],
      locked: balancesAcc[balanceIndex].locked + assetBalance
    };
    return balancesAcc;
  }, [...balances]);
};
const setAccountBalanceDataTimeout = apiKey => setTimeout(accountBalanceDataTimeout(apiKey), 5 * 60 * 1000);
export const getBinanceAccounHandler = async (req, res) => {
  const apiKey = req.get('X-MBX-APIKEY');
  if (isEmpty(apiKey)) return res.json([]);

  if (accountBalanceMap[apiKey]) {
    clearTimeout(accountBalanceMap[apiKey].dataTimeout);
    accountBalanceMap[apiKey].dataTimeout = setAccountBalanceDataTimeout(apiKey);

    const balances = await appendFuturesAccountBalance(apiKey, accountBalanceMap[apiKey].storeData.balances);
    return res.json(balances);
  }

  try {
    const queryString = req.url.replace(/[^?]*/, '');
    const { data } = await global.spotApi.get(`/account${queryString}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    const storeData = new AccountBalance('');
    storeData.saveBalances((data.balances || []));

    const socket = new BinanceSocket({
      key: apiKey,
      messageHandler: accountBalanceSocketHandler(apiKey)
    });
    socket.logging = false;

    const dataTimeout = setAccountBalanceDataTimeout(apiKey);
    accountBalanceMap[apiKey] = { storeData, socket, dataTimeout };

    const balances = await appendFuturesAccountBalance(apiKey, storeData.balances);
    res.json(balances);
  } catch (e) {
    res.json([]);
  }
};

export default run;
