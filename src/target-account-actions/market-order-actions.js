import { createOrderFromEvent } from '../binance-order-execs/order-execs-spot';
import calculateFromPercentage from '../binance-order-execs/calc-from-percentage';

const onBuyMarket = async ({
  data,
  quoteAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  const targetAsset = targetAccountBalance.getAsset(quoteAsset);
  const copyCatAsset = copycatAccountBalance.getAsset(quoteAsset);
  if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) return;

  const percentage = Number(data.Z) / targetAsset.free;
  const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
  await createOrderFromEvent({ ...data, Q: orderQuantity }, copyCatBot);
};

const onSellMarket = async ({
  data,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  const targetAsset = targetAccountBalance.getAsset(baseAsset);
  const copyCatAsset = copycatAccountBalance.getAsset(baseAsset);
  if (!targetAsset || !copyCatAsset || targetAsset.free === 0 || copyCatAsset.free === 0) return;

  const percentage = Number(data.q) / targetAsset.free;
  const orderQuantity = calculateFromPercentage(copyCatAsset.free, percentage);
  await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot);
};

export const onMarketOrderAction = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  if (data.S === 'BUY' && data.X === 'FILLED') {
    await onBuyMarket({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }

  if (data.S === 'SELL' && data.X === 'FILLED') {
    await onSellMarket({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }
};
