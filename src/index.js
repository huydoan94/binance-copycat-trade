import 'core-js/stable';
import 'regenerator-runtime/runtime';

import express from 'express';
import path from 'path';
import axios from 'axios';
import WebSocket from 'ws';
import { noop, memoize } from 'lodash';
import Logger from 'logdna';
import { Client as DbClient } from 'pg';
import shortid from 'shortid';

import { getHash } from './utils/hash-helper';
import { floorWithPrecision } from './utils/math';

const envTargetAccount = process.env.TARGET_ACCOUNT;
const envCopycatAccount = process.env.COPYCAT_ACCOUNT;
const logdnaKey = process.env.LOGDNA_KEY;
const dbUrl = process.env.DATABASE_URL;

const targetAccount = JSON.parse(envTargetAccount);
const copyCatBot = JSON.parse(envCopycatAccount);
const dbClient = new DbClient({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

if (logdnaKey) {
  const logger = Logger.createLogger(logdnaKey, {
    hostname: 'binance-copycat-trade',
    app: 'binance-copycat-trade',
    env: process.env.NODE_ENV
  });

  const origConsoleLog = console.log;
  const origConsoleError = console.error;

  console.log = (msg) => {
    logger.log(msg);
    origConsoleLog(msg);
  };

  console.error = (msg) => {
    logger.error(msg);
    origConsoleError(msg);
  };
}

class BinanceTime {
  timeDiff = 0;

  adjustTimeDiff = (serverTime) => {
    const today = new Date().valueOf();
    this.timeDiff = serverTime - today;
  }

  getToday = () => {
    return new Date().valueOf() + this.timeDiff;
  }
}

class BinanceSymbol {
  symbols = []

  fetchSymbols = async () => {
    console.log('Get symbols');
    try {
      const { data = {} } = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
      this.symbols = (data.symbols || []);
      console.log(`Symbol def count: ${this.symbols.length}`);
    } catch (e) {
      console.error(`Symbols get fail: ${JSON.stringify(e.response.data)}`);
    }
  }

  getSymbolData = memoize((symbol) => {
    return this.symbols.find(s => s.symbol === symbol);
  })
}

class AccountBalance {
  balances = []
  accountKey = null
  accountSecret = null
  id = null

  constructor (key, secret) {
    this.accountKey = key;
    this.accountSecret = secret;
    this.id = key.slice(-5);
  }

  fetchBalances = async () => {
    const params = `timestamp=${binanceTime.getToday()}`;
    const sig = getHash(params, this.accountSecret);
    try {
      console.log(`[${this.id}] Get balances`);
      const { data = {} } = await axios.get(
        `https://api.binance.com/api/v3/account?${params}&signature=${sig}`,
        { headers: { 'X-MBX-APIKEY': this.accountKey } }
      );
      this.balances = (data.balances || [])
        .map(b => ({ ...b, free: Number(b.free), locked: Number(b.locked) }))
        .filter(b => b.free > 0 || b.locked > 0);
      console.log(`[${this.id}] Balances: ${JSON.stringify(this.balances)}`);
    } catch (e) {
      console.error(`[${this.id}] Balances get fail: ${JSON.stringify(e.response.data)}`);
    }
  }

  adjustAccountBalanceFromEvent = (event = []) => {
    console.log(`[${this.id}] Adjust Balances Start`);
    event.forEach(e => {
      const convertedEvent = { asset: e.a, free: Number(e.f), locked: Number(e.l) };
      const index = this.balances.findIndex(b => b.asset === e.a);
      if (index === -1) this.balances.push(convertedEvent);
      else this.balances[index] = convertedEvent;
    });

    this.balances = this.balances.filter(b => b.free > 0 || b.locked > 0);
    console.log(`[${this.id}] Adjust Balances: ${JSON.stringify(this.balances)}`);
  }

  getAsset = (coin) => {
    const asset = this.balances.find(b => b.asset === coin);
    if (!asset) return null;

    return { ...asset };
  }
}

class BinanceWebSocket {
  key = null
  messageHandler = noop
  socketClient = null
  pingTimeout = null
  pingWaitTimeout = null
  id = null

  constructor (key, messageHandler) {
    this.key = key;
    this.messageHandler = messageHandler;
    this.id = key.slice(-5);

    this.createSocketClient();
  }

  createSocketClient = async () => {
    const targetListenKey = await getAccountListenKey(this.key);
    this.socketClient = new WebSocket(`wss://stream.binance.com:9443/ws/${targetListenKey}`);
    this.socketClient.on('open', this.openHandler);
    this.socketClient.on('message', this.messageHandler);
    this.socketClient.on('error', this.errorHandler);
    this.socketClient.on('close', this.closeHandler);
    this.socketClient.on('ping', this.pingPongHandler);
    this.socketClient.on('pong', this.pingPongHandler);
  }

  openHandler = () => {
    console.log(`[${this.id}]Socket opened`);
    this.setPingTimeout();
  }

  errorHandler = (err) => {
    console.error(`[${this.id}]Socket error: ${err.message}`);
    this.socketClient.close();
  }

  closeHandler = (evt) => {
    console.log(`[${this.id}]Socket closed: ${JSON.stringify(evt)}`);

    clearTimeout(this.pingTimeout);
    clearTimeout(this.pingWaitTimeout);
    setTimeout(() => this.createSocketClient(), 1000);
  };

  pingPongHandler = () => {
    clearTimeout(this.pingTimeout);
    clearTimeout(this.pingWaitTimeout);

    this.setPingTimeout();
  }

  ping = () => {
    this.socketClient.ping();
    this.pingWaitTimeout = setTimeout(
      () => this.socketClient.close(),
      60 * 1000
    );
  }

  setPingTimeout = () => {
    this.pingTimeout = setTimeout(
      () => this.ping(),
      20 * 60 * 1000
    );
  }
}

const binanceTime = new BinanceTime();
const binanceSymbol = new BinanceSymbol();
const targetAccountBalance = new AccountBalance(targetAccount.key, targetAccount.secret);
const copycatAccountBalance = new AccountBalance(copyCatBot.key, copyCatBot.secret);

const findLimitOrderPair = async ({ symbol, targetOrderId, copyOrderId }) => {
  let orderParam;
  if (targetOrderId) orderParam = ' ' + `AND target_order_id=${targetOrderId}`;
  if (copyOrderId) orderParam = ' ' + `AND copy_order_id=${copyOrderId}`;
  if (!symbol || !orderParam) return [];

  const { rows } = await dbClient
    .query(`SELECT * from limit_order_pairs WHERE symbol='${symbol}'${orderParam}`)
    .catch(() => ({ rows: [] }));
  return rows;
};

const createLimitOrderPair = async ({ symbol, targetOrderId, copyOrderId }) => {
  if (!symbol || !targetOrderId || !copyOrderId) return;
  await dbClient
    .query(`INSERT INTO limit_order_pairs (id, target_order_id, copy_order_id, symbol)
            VALUES ('${shortid.generate()}', ${targetOrderId}, ${copyOrderId}, '${symbol}')`)
    .then(() => console.log(`Created limit order pair: ${JSON.stringify({ symbol, targetOrderId, copyOrderId })}`))
    .catch(() => null);
};

const deleteLimitOrderPair = async ({ symbol, targetOrderId, copyOrderId }) => {
  let orderParam;
  if (targetOrderId) orderParam = ' ' + `AND target_order_id=${targetOrderId}`;
  if (copyOrderId) orderParam = ' ' + `AND copy_order_id=${copyOrderId}`;
  if (!symbol || !orderParam) return;

  await dbClient
    .query(`DELETE FROM limit_order_pairs WHERE symbol='${symbol}'${orderParam}`)
    .then(({ rowCount }) => {
      if (!rowCount) return;
      console.log(`Deleted limit order pair: ${JSON.stringify({ symbol, targetOrderId, copyOrderId })}`);
    })
    .catch(() => null);
};

const calculateFromPercentage = (note, percentage) => {
  if (percentage > 0.94) return note;
  return note * percentage;
};

const getAccountListenKey = async (key) => {
  const { data: { listenKey: targetListenKey } } = await axios.post(
    'https://api.binance.com/api/v3/userDataStream',
    undefined,
    { headers: { 'X-MBX-APIKEY': key } }
  );
  return targetListenKey;
};

const createOrderFromEvent = async (event) => {
  const today = binanceTime.getToday();

  const { quoteAssetPrecision, filters } = binanceSymbol.getSymbolData(event.s);
  const lotSize = filters.find(f => f.filterType === 'LOT_SIZE');

  const quoteQuantity = floorWithPrecision(Number(event.Q), quoteAssetPrecision);
  let quantity = Number(event.q);
  if (lotSize) {
    const { stepSize } = lotSize;
    const [, decimal] = `${Number(stepSize)}`.split('.');
    const quantityPrecision = decimal ? decimal.length : 0;
    quantity = floorWithPrecision(quantity, quantityPrecision);
  }

  let params = `symbol=${event.s}&side=${event.S}&type=${event.o}` +
    `&timeInForce=${event.f}` +
    `&quantity=${quantity}&price=${event.p}` +
    `&timestamp=${today}`;
  if (event.o === 'MARKET') {
    params = `symbol=${event.s}&side=${event.S}&type=${event.o}` +
      (event.S === 'BUY' ? `&quoteOrderQty=${quoteQuantity}` : `&quantity=${quantity}`) +
      `&timestamp=${today}`;
  }

  console.log(`Create Order: ${params}`);
  const sig = getHash(params, copyCatBot.secret);
  let result = {};
  try {
    result = await axios.post(
      `https://api.binance.com/api/v3/order?${params}&signature=${sig}`,
      undefined,
      { headers: { 'X-MBX-APIKEY': copyCatBot.key } }
    );
    console.log(`Create Order Done: ${params}`);
  } catch (e) {
    console.error(`Create Order Failed: ${JSON.stringify(e.response.data)}`);
  }

  return result;
};

const cancelOrderFromEvent = async (event) => {
  const today = binanceTime.getToday();
  const params = `symbol=${event.s}&orderId=${event.i}` +
    `&timestamp=${today}`;
  console.log(`Cancel Order: ${params}`);
  const sig = getHash(params, copyCatBot.secret);
  let result = {};
  try {
    result = await axios.delete(
      `https://api.binance.com/api/v3/order?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': copyCatBot.key } }
    );
    console.log(`Cancel Order Done: ${params}`);
  } catch (e) {
    console.error(`Cancel Order Failed: ${JSON.stringify(e.response.data)}`);
  }

  return result;
};

const onTargetAccountMessage = (msg) => {
  const data = JSON.parse(msg);

  switch (data.e) {
    case 'executionReport': {
      if (!['NEW', 'TRADE', 'CANCELED'].includes(data.x)) break;

      const { baseAsset, quoteAsset } = binanceSymbol.getSymbolData(data.s);

      if (data.o === 'LIMIT' && data.S === 'BUY' && data.x === 'NEW') {
        const targetAsset = targetAccountBalance.getAsset(quoteAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = (Number(data.q) * Number(data.p)) / targetAsset.free;
        const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage) / Number(data.p);
        createOrderFromEvent({ ...data, q: orderQuantity })
          .then(({ data: orderResp }) => {
            if (!orderResp) return;
            return createLimitOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
          });
        break;
      }

      if (data.o === 'LIMIT' && data.S === 'SELL' && data.x === 'NEW') {
        const targetAsset = targetAccountBalance.getAsset(baseAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.q) / targetAsset.free;
        const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
        createOrderFromEvent({ ...data, q: orderQuantity }).then(({ data: orderResp }) => {
          if (!orderResp) return;
          return createLimitOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
        });
        break;
      }

      if (data.o === 'LIMIT' && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        findLimitOrderPair({ symbol: data.s, targetOrderId: data.i })
          .then(([pair]) => {
            if (!pair) return;

            deleteLimitOrderPair({ symbol: data.s, targetOrderId: data.i });
            if (data.x === 'CANCELED') cancelOrderFromEvent({ s: pair.symbol, i: pair.copy_order_id });
          });
        break;
      }

      if (data.o === 'MARKET' && data.S === 'BUY' && data.X === 'FILLED') {
        const targetAsset = targetAccountBalance.getAsset(quoteAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.Z) / targetAsset.free;
        const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
        createOrderFromEvent({ ...data, Q: orderQuantity });
        break;
      }

      if (data.o === 'MARKET' && data.S === 'SELL' && data.X === 'FILLED') {
        const targetAsset = targetAccountBalance.getAsset(baseAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.q) / targetAsset.free;
        const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
        createOrderFromEvent({ ...data, q: orderQuantity });
      }

      break;
    }
    case 'outboundAccountPosition':
      targetAccountBalance.adjustAccountBalanceFromEvent(data.B);
      break;
    default:
      break;
  }
};

const onCopycatAccountMessage = (msg) => {
  const data = JSON.parse(msg);

  switch (data.e) {
    case 'executionReport':
      if (data.o === 'LIMIT' && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        deleteLimitOrderPair({ symbol: data.s, copyOrderId: data.i });
      }

      break;
    case 'outboundAccountPosition':
      copycatAccountBalance.adjustAccountBalanceFromEvent(data.B);
      break;
    default:
      break;
  }
};

const initDb = async () => {
  await dbClient.connect();
  await dbClient.query(`CREATE TABLE IF NOT EXISTS limit_order_pairs (
    id varchar(10) NOT NULL,
    target_order_id integer NOT NULL,
    copy_order_id integer NOT NULL,
    symbol varchar(20) NOT NULL,
    PRIMARY KEY (id)
  )`);
};

const run = async () => {
  const { data: { serverTime } } = await axios.get('https://api.binance.com/api/v3/time');
  binanceTime.adjustTimeDiff(serverTime);

  await Promise.all([
    binanceSymbol.fetchSymbols(),
    targetAccountBalance.fetchBalances(),
    copycatAccountBalance.fetchBalances(),
    initDb()
  ]);

  // eslint-disable-next-line no-new
  new BinanceWebSocket(targetAccount.key, onTargetAccountMessage);
  // eslint-disable-next-line no-new
  new BinanceWebSocket(copyCatBot.key, onCopycatAccountMessage);
};

run();

const app = express();
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(process.env.PORT || 3000);
