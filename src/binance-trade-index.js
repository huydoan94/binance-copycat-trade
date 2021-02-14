
import BinanceSocket from './binance-socket';
import BinanceAccountBalance from './binance-account-balance';
import EventMessageManager from './event-message-manager';

import binanceTime from './binance-time';
import binanceSymbol from './binance-symbol';
import dbClient from './postgres-db-client';

import calculateFromPercentage from './binance-order-execs/calc-from-percentage';
import { createOrderFromEvent, cancelOrderFromEvent } from './binance-order-execs/order-execs';
import {
  findLimitOrderPair,
  createLimitOrderPair,
  deleteLimitOrderPair
} from './binance-order-execs/limit-order-pairs-execs';

const envTargetAccount = process.env.TARGET_ACCOUNT;
const envCopycatAccount = process.env.COPYCAT_ACCOUNT;

const targetAccount = JSON.parse(envTargetAccount);
const copyCatBot = JSON.parse(envCopycatAccount);

const targetAccountBalance = new BinanceAccountBalance(targetAccount.key, targetAccount.secret);
const copycatAccountBalance = new BinanceAccountBalance(copyCatBot.key, copyCatBot.secret);

const onTargetAccountMessage = async (msg) => {
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
        await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot)
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
        await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot)
          .then(({ data: orderResp }) => {
            if (!orderResp) return;
            return createLimitOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
          });

        break;
      }

      if (data.o === 'LIMIT' && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        await findLimitOrderPair({ symbol: data.s, targetOrderId: data.i })
          .then(([pair]) => {
            if (!pair) return;

            const wait = [deleteLimitOrderPair({ symbol: data.s, targetOrderId: data.i })];
            if (data.x === 'CANCELED') wait.push(cancelOrderFromEvent({ ...data, i: pair.copy_order_id }, copyCatBot));
            return Promise.all(wait);
          });

        break;
      }

      if (data.o === 'MARKET' && data.S === 'BUY' && data.X === 'FILLED') {
        const targetAsset = targetAccountBalance.getAsset(quoteAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.Z) / targetAsset.free;
        const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
        await createOrderFromEvent({ ...data, Q: orderQuantity }, copyCatBot);

        break;
      }

      if (data.o === 'MARKET' && data.S === 'SELL' && data.X === 'FILLED') {
        const targetAsset = targetAccountBalance.getAsset(baseAsset);
        const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
        if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) break;

        const percentage = Number(data.q) / targetAsset.free;
        const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
        await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot);
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

const onCopycatAccountMessage = async (msg) => {
  const data = JSON.parse(msg);

  switch (data.e) {
    case 'executionReport':
      if (data.o === 'LIMIT' && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        await deleteLimitOrderPair({ symbol: data.s, copyOrderId: data.i });
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
  await dbClient.query(`CREATE TABLE IF NOT EXISTS limit_order_pairs (
    id varchar(10) NOT NULL,
    target_order_id integer NOT NULL,
    copy_order_id integer NOT NULL,
    symbol varchar(20) NOT NULL,
    PRIMARY KEY (id)
  )`);
};

const runner = async () => {
  await binanceTime.adjustTimeDiff();
  await Promise.all([
    binanceSymbol.fetchSymbols(),
    targetAccountBalance.fetchBalances(),
    copycatAccountBalance.fetchBalances(),
    initDb()
  ]);

  const targetMessageManager = new EventMessageManager(onTargetAccountMessage);
  const copycatMessageManager = new EventMessageManager(onCopycatAccountMessage);

  new BinanceSocket(targetAccount.key, targetMessageManager.onReceiveMessage);
  new BinanceSocket(copyCatBot.key, copycatMessageManager.onReceiveMessage);
};

export default runner;
