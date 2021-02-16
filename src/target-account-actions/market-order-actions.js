import { createOrderFromEvent } from '../binance-order-execs/order-execs';
import calculateFromPercentage from '../binance-order-execs/calc-from-percentage';

import isAssetFundAvailable from './check-asset-balance';

export const onMarketOrderAction = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  if (data.S === 'BUY' && data.X === 'FILLED') {
    const targetAsset = targetAccountBalance.getAsset(quoteAsset);
    const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
    if (isAssetFundAvailable(targetAsset) && isAssetFundAvailable(copyCatAsset)) {
      const percentage = Number(data.Z) / targetAsset.free;
      const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
      await createOrderFromEvent({ ...data, Q: orderQuantity }, copyCatBot);
    }
  }

  if (data.S === 'SELL' && data.X === 'FILLED') {
    const targetAsset = targetAccountBalance.getAsset(baseAsset);
    const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
    if (isAssetFundAvailable(targetAsset) && isAssetFundAvailable(copyCatAsset)) {
      const percentage = Number(data.q) / targetAsset.free;
      const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
      await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot);
    }
  }
};
