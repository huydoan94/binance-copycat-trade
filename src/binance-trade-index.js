
import BinanceSocket from './binance-socket';
import BinanceAccountBalance from './binance-account-balance';
import EventMessageManager from './event-message-manager';

import binanceTime from './binance-time';
import binanceSymbol from './binance-symbol';
import dbClient from './postgres-db-client';

import { deleteLimitOrderPair } from './binance-order-execs/limit-order-pairs-execs';
import { onLimitOrderAction } from './target-account-actions/limit-order-actions';
import { onMarketOrderAction } from './target-account-actions/market-order-actions';

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
