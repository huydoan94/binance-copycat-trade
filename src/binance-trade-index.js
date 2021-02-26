
import BinanceSocket from './binance-socket';
import BinanceAccountBalance from './binance-account-balance';
import EventMessageManager from './event-message-manager';

import binanceTime from './binance-time';
import binanceSymbol from './binance-symbol';
import dbClient from './postgres-db-client';

import { deleteOrderPair } from './binance-order-execs/order-pairs-execs';
import { onLimitOrderAction } from './target-account-actions/limit-order-actions';
import { onMarketOrderAction } from './target-account-actions/market-order-actions';
import { onStopLimitOrderAction } from './target-account-actions/stop-limit-order-actions';
import { onOcoOrderAction } from './target-account-actions/oco-order-actions';

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
      const { baseAsset, quoteAsset } = binanceSymbol.getSymbolData(data.s);

      if (data.g !== -1) {
        return await onOcoOrderAction({
          data,
          quoteAsset,
          baseAsset,
          targetAccountBalance,
          copycatAccountBalance,
          copyCatBot
        });
      }

      if (['TAKE_PROFIT_LIMIT', 'STOP_LOSS_LIMIT'].includes(data.o)) {
        await onStopLimitOrderAction({
          data,
          quoteAsset,
          baseAsset,
          targetAccountBalance,
          copycatAccountBalance,
          copyCatBot
        });
      }

      if (data.o === 'LIMIT') {
        await onLimitOrderAction({
          data,
          quoteAsset,
          baseAsset,
          targetAccountBalance,
          copycatAccountBalance,
          copyCatBot
        });
      }

      if (data.o === 'MARKET') {
        await onMarketOrderAction({
          data,
          quoteAsset,
          baseAsset,
          targetAccountBalance,
          copycatAccountBalance,
          copyCatBot
        });
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
        await deleteOrderPair({ symbol: data.s, copyOrderId: data.i });
      }

      if (data.g !== -1 && (data.x === 'CANCELED' || data.X === 'FILLED')) {
        await deleteOrderPair({ symbol: data.s, copyOrderId: data.g, isOco: true });
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
  const queryPromise = ['limit_order_pairs', 'oco_order_pairs'].map(table =>
    dbClient.query(`CREATE TABLE IF NOT EXISTS ${table} (
      id varchar(10) NOT NULL,
      target_order_id integer NOT NULL,
      copy_order_id integer NOT NULL,
      symbol varchar(20) NOT NULL,
      PRIMARY KEY (id)
    )`)
  );
  await Promise.all(queryPromise);
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
