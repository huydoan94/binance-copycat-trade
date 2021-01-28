import 'core-js/stable';
import 'regenerator-runtime/runtime';

import express from 'express';
import path from 'path';
import axios from 'axios';
import WebSocket from 'ws';
import { noop } from 'lodash';

import { getHash } from './utils/hash-helper';

const targetAccount = {
  key: '4NP3ezz2wuZQ3ahxSm3xZL6x033yh9w48metnjFZy8MOsDWodbIvcpn5hTLpXrKO',
  secret: 'JeQlMzCpiikXUWwzFl9AX0gy9iwD024pM1PIFwt4ndFPUlMNGM96jcIqW11vkGK2'
};

const copyCatBot = {
  key: 'SsRQCKESUC3u33t9TscK8HUqdaYJekm5PxNAmT4WPYOYIt7qXLQVymKOTf3lyaKA',
  secret: '3W6lPdnbs3zPPVh4D1b9bqAOdTjt8xIqyfYaH4mllUwwZXdzqntabVKdYWUcZi7k'
};

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
    try {
      const { data = {} } = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
      this.symbols = (data.symbols || []);
      console.log(`Symbol def count: ${this.symbols.length}`);
    } catch (e) {
      console.log(e.response.data);
    }
  }

  getSymbolData = (symbol) => {
    return this.symbols.find(s => s.symbol === symbol);
  }
}

class AccountBalance {
  balances = []
  accountKey = null
  accountSecret = null

  constructor (key, secret) {
    this.accountKey = key;
    this.accountSecret = secret;
  }

  fetchBalances = async () => {
    const params = `timestamp=${binanceTime.getToday()}`;
    const sig = getHash(params, this.accountSecret);
    try {
      const { data = {} } = await axios.get(
        `https://api.binance.com/api/v3/account?${params}&signature=${sig}`,
        { headers: { 'X-MBX-APIKEY': this.accountKey } }
      );
      this.balances = (data.balances || [])
        .map(b => ({ ...b, free: Number(b.free), locked: Number(b.locked) }))
        .filter(b => b.free > 0 || b.locked > 0);
      console.log(this.balances);
    } catch (e) {
      console.log(e.response.data);
    }
  }

  adjustAccountBalanceFromEvent = (event = []) => {
    event.forEach(e => {
      const convertedEvent = { asset: e.a, free: Number(e.f), locked: Number(e.l) };
      const index = this.balances.findIndex(b => b.asset === e.a);
      if (index === -1) this.balances.push(convertedEvent);
      else this.balances[index] = convertedEvent;

      this.balances = this.balances.filter(b => b.free > 0 || b.locked > 0);
    });
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
    this.createSocketClient();
  }

  createSocketClient = async () => {
    const targetListenKey = await getAccountListenKey(this.key);
    this.id = targetListenKey;

    this.socketClient = new WebSocket(`wss://stream.binance.com:9443/ws/${targetListenKey}`);
    this.socketClient.on('open', this.openHandler);
    this.socketClient.on('message', this.messageHandler);
    this.socketClient.on('error', this.errorHandler);
    this.socketClient.on('close', this.closeHandler);
    this.socketClient.on('ping', this.pingPongHandler);
    this.socketClient.on('pong', this.pingPongHandler);
  }

  openHandler = () => {
    console.log(`Socket ${this.id} opened`);
    this.setPingTimeout();
  }

  errorHandler = (err) => {
    console.error(`Socket ${this.id} encountered error: `, err.message, 'Closing socket');
    this.socketClient.close();
  }

  closeHandler = (e) => {
    console.log(`Socket ${this.id} is closed. Reconnect will be attempted in 1 second.`, e.reason);

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

const limitOrderPair = [];

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

  const quoteQuantity = Number(event.Q).toFixed(quoteAssetPrecision);
  let quantity = Number(event.q);
  if (lotSize) {
    const { stepSize } = lotSize;
    const quantityPrecision = `${Number(stepSize)}`.split('.')[1].length;
    quantity = quantity.toFixed(quantityPrecision);
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

  console.log('Create Order');
  console.log(params);
  const sig = getHash(params, copyCatBot.secret);
  let result = {};
  try {
    result = await axios.post(
      `https://api.binance.com/api/v3/order?${params}&signature=${sig}`,
      undefined,
      { headers: { 'X-MBX-APIKEY': copyCatBot.key } }
    );
  } catch (e) {
    console.log('Create Order Failed');
    console.log(e.response.data);
  }

  return result;
};

const cancelOrderFromEvent = async (event) => {
  const today = binanceTime.getToday();
  const params = `symbol=${event.s}&orderId=${event.i}` +
    `&timestamp=${today}`;
  console.log('Cancel Order');
  console.log(params);
  const sig = getHash(params, copyCatBot.secret);
  let result = {};
  try {
    result = await axios.delete(
      `https://api.binance.com/api/v3/order?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': copyCatBot.key } }
    );
  } catch (e) {
    console.log('Delete Order Failed');
    console.log(e.response.data);
  }

  return result;
};

const onTargetAccountMessage = (msg) => {
  const data = JSON.parse(msg);
  console.log('target action');
  console.log(msg);

  switch (data.e) {
    case 'executionReport': {
      if (!['NEW', 'TRADE', 'CANCELED'].includes(data.x)) break;

      const { baseAsset, quoteAsset } = binanceSymbol.getSymbolData(data.s);

      if (data.o === 'LIMIT' && data.S === 'BUY' && data.x === 'NEW') {
        const targetAsset = targetAccountBalance.getAsset(quoteAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = (Number(data.q) * Number(data.p)) / targetAsset.free;
        const orderQuantity = copyCatAsset.free * percentage;
        createOrderFromEvent({ ...data, q: orderQuantity }).then(({ data: orderResp }) => {
          if (!orderResp) return;
          limitOrderPair.push([
            { orderId: data.i, symbol: data.s },
            { orderId: orderResp.orderId, symbol: orderResp.symbol }
          ]);

          console.log('Limit Order Pair');
          console.log(limitOrderPair);
          console.log(' ');
        });
        break;
      }

      if (data.o === 'LIMIT' && data.S === 'SELL' && data.x === 'NEW') {
        const targetAsset = targetAccountBalance.getAsset(baseAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.q) / targetAsset.free;
        const orderQuantity = copyCatAsset.free * percentage;
        createOrderFromEvent({ ...data, q: orderQuantity }).then(({ data: orderResp }) => {
          if (!orderResp) return;
          limitOrderPair.push([
            { orderId: data.i, symbol: data.s },
            { orderId: orderResp.orderId, symbol: orderResp.symbol }
          ]);

          console.log('Limit Order Pair');
          console.log(limitOrderPair);
          console.log(' ');
        });
        break;
      }

      if (data.o === 'LIMIT' && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        const pairIndex = limitOrderPair.findIndex(([targetOrder]) => targetOrder.orderId === data.i);
        if (pairIndex === -1) break;

        const [[, copycatOrder]] = limitOrderPair.splice(pairIndex, 1);
        console.log(`Order ${data.X}`);
        console.log('Limit Order Pair');
        console.log(limitOrderPair);
        console.log(' ');

        if (data.x === 'CANCELED') cancelOrderFromEvent({ s: copycatOrder.symbol, i: copycatOrder.orderId });
        break;
      }

      if (data.o === 'MARKET' && data.S === 'BUY' && data.X === 'FILLED') {
        const targetAsset = targetAccountBalance.getAsset(quoteAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.Z) / targetAsset.free;
        const orderQuantity = copyCatAsset.free * percentage;
        createOrderFromEvent({ ...data, Q: orderQuantity });
        break;
      }

      if (data.o === 'MARKET' && data.S === 'SELL' && data.X === 'FILLED') {
        const targetAsset = targetAccountBalance.getAsset(baseAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.q) / targetAsset.free;
        const orderQuantity = copyCatAsset.free * percentage;
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
  console.log('copycat action');
  console.log(msg);

  switch (data.e) {
    case 'executionReport':
      if (data.o === 'LIMIT' && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        const pairIndex = limitOrderPair.findIndex(([, copycatOrder]) => copycatOrder.orderId === data.i);
        if (pairIndex === -1) break;

        limitOrderPair.splice(pairIndex, 1);
        console.log(`Order ${data.X}`);
        console.log('Limit Order Pair');
        console.log(limitOrderPair);
        console.log(' ');
      }

      break;
    case 'outboundAccountPosition':
      copycatAccountBalance.adjustAccountBalanceFromEvent(data.B);
      break;
    default:
      break;
  }
};

const run = async () => {
  const { data: { serverTime } } = await axios.get('https://api.binance.com/api/v3/time');
  binanceTime.adjustTimeDiff(serverTime);

  await Promise.all([
    binanceSymbol.fetchSymbols(),
    targetAccountBalance.fetchBalances(),
    copycatAccountBalance.fetchBalances()
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
