import { findOrderPair } from '../binance-order-execs/order-pairs-execs';

import { onLimitOrderAction } from './limit-order-actions';

export const onStopLimitOrderAction = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  if (data.x === 'NEW') {
    const [pair] = await findOrderPair({ symbol: data.s, targetOrderId: data.i });

    if (!pair) {
      await onLimitOrderAction({
        data,
        quoteAsset,
        baseAsset,
        targetAccountBalance,
        copycatAccountBalance,
        copyCatBot
      });
    }
  }

  if (data.x === 'CANCELED' || data.X === 'FILLED') {
    await onLimitOrderAction({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }
};
