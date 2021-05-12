import { keyBy, forEach, isEmpty, map, cloneDeep } from 'lodash';

import BinanceSocket from './binance-socket';
import AccountBalance from './binance-account-balance';

import { getHash } from './utils/hash';

let aggTickerPrice = {};
const run = async () => {
  const { data: symbolPrices } = await global.spotApi.get('/ticker/price');
  aggTickerPrice = keyBy(symbolPrices.map(s => ({ ...s, price: Number(s.price) })), 'symbol');

  const updateAggTickerPrice = d => { aggTickerPrice[d.s] = { symbol: d.s, price: Number(d.c) }; };
  new BinanceSocket({
    socketUrl: '!miniTicker@arr',
    messageHandler: msg => forEach(JSON.parse(msg), updateAggTickerPrice)
  });
};

export const getTickerHandler = (req, res) => {
  const pair = (req.params.ticker || '').replace(/[\W_]+/g, '').toUpperCase();
  const ticker = aggTickerPrice[pair] || {};
  res.json(ticker);
};

export const getAllTickersHandler = (_, res) => {
  res.json(map(aggTickerPrice, value => value));
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
    if (cacheValue) return cacheValue.value;

    const value = global.futureApi.get(
      `/account?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    cache[key] = { value, time: Date.now() };
    setTimeout(() => { delete cache[key]; }, 60 * 1000);
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
const setAccountBalanceDataTimeout = apiKey => setTimeout(accountBalanceDataTimeout(apiKey), 5 * 60 * 1000);
const appendFuturesAccountBalance = async (key, origBalances) => {
  const balances = cloneDeep(origBalances);

  let futureApiKeys = process.env.FUTURE_APIS || '[]';
  futureApiKeys = JSON.parse(futureApiKeys);

  const futureApiKey = futureApiKeys.find(pair => pair.spotKeys.some(k => k === key));
  if (!futureApiKey) return balances;

  const params = `timestamp=${Date.now()}`;
  const sig = getHash(params, futureApiKey.secret);
  const { data } = await fetchFutureBalance({ key: futureApiKey.key, sig, params });

  const totalMarginBalance = Number(data.totalMarginBalance);
  if (!totalMarginBalance) return balances;

  const usdtBalance = balances.find(a => a.asset === 'USDT');
  if (!usdtBalance) balances.push({ asset: 'USDT', free: 0, locked: totalMarginBalance });
  else usdtBalance.locked += totalMarginBalance;

  const futureBalances = data.positions.reduce((acc, pos) => {
    if (!Number(pos.maintMargin)) return acc;

    return acc.concat({
      asset: pos.symbol.replace(/(BNB|BUSD|USDT)$/i, ''),
      positionSide: pos.positionSide,
      leverage: Number(pos.leverage),
      positionAmt: Number(pos.positionAmt),
      entryPrice: Number(pos.entryPrice)
    });
  }, []);

  return balances.concat(futureBalances);
};
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
