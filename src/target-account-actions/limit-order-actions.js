import { createOrderFromEvent, cancelOrderFromEvent } from '../binance-order-execs/order-execs';
import {
  findLimitOrderPair,
  createLimitOrderPair,
  deleteLimitOrderPair
} from '../binance-order-execs/limit-order-pairs-execs';
import calculateFromPercentage from '../binance-order-execs/calc-from-percentage';

import isAssetFundAvailable from './check-asset-balance';

export const onLimitOrderAction = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  if (data.S === 'BUY' && data.x === 'NEW') {
    const targetAsset = targetAccountBalance.getAsset(quoteAsset);
    const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
    if (isAssetFundAvailable(targetAsset) && isAssetFundAvailable(copyCatAsset)) {
      const percentage = (Number(data.q) * Number(data.p)) / targetAsset.free;
      const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage) / Number(data.p);
      await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot)
        .then(({ data: orderResp }) => {
          if (!orderResp) return;
          return createLimitOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
        });
    }
  }

  if (data.S === 'SELL' && data.x === 'NEW') {
    const targetAsset = targetAccountBalance.getAsset(baseAsset);
    const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
    if (isAssetFundAvailable(targetAsset) && isAssetFundAvailable(copyCatAsset)) {
      const percentage = Number(data.q) / targetAsset.free;
      const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
      await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot)
        .then(({ data: orderResp }) => {
          if (!orderResp) return;
          return createLimitOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
        });
    }
  }

  if (data.x === 'CANCELED' || data.X === 'FILLED') {
    await findLimitOrderPair({ symbol: data.s, targetOrderId: data.i })
      .then(([pair]) => {
        if (!pair) return;

        const wait = [deleteLimitOrderPair({ symbol: data.s, targetOrderId: data.i })];
        if (data.x === 'CANCELED') wait.push(cancelOrderFromEvent({ ...data, i: pair.copy_order_id }, copyCatBot));
        return Promise.all(wait);
      });
  }
};
