import { createOrderFromEvent, cancelOrderFromEvent } from '../binance-order-execs/order-execs-spot';
import {
  findOrderPair,
  createOrderPair,
  deleteOrderPair
} from '../binance-order-execs/order-pairs-execs';
import calculateFromPercentage from '../binance-order-execs/calc-from-percentage';

const onBuyLimit = async ({
  data,
  targetAccountBalance,
  copycatAccountBalance,
  quoteAsset,
  copyCatBot
}) => {
  const targetAsset = targetAccountBalance.getAsset(quoteAsset);
  const copycatAsset = copycatAccountBalance.getAsset(quoteAsset);
  if (!targetAsset || !copycatAsset || targetAsset.free === 0 || copycatAsset.free === 0) return;

  const percentage = (Number(data.q) * Number(data.p)) / targetAsset.free;
  const orderQuantity = calculateFromPercentage(copycatAsset.free, percentage) / Number(data.p);
  const { data: orderResp } = await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot);

  if (!orderResp) return;
  await createOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
};

const onSellLimit = async ({
  data,
  targetAccountBalance,
  copycatAccountBalance,
  baseAsset,
  copyCatBot
}) => {
  const targetAsset = targetAccountBalance.getAsset(baseAsset);
  const copycatAsset = copycatAccountBalance.getAsset(baseAsset);
  if (!targetAsset || !copycatAsset || targetAsset.free === 0 || copycatAsset.free === 0) return;

  const percentage = Number(data.q) / targetAsset.free;
  const orderQuantity = calculateFromPercentage(copycatAsset.free, percentage);
  const { data: orderResp } = await createOrderFromEvent({ ...data, q: orderQuantity }, copyCatBot);

  if (!orderResp) return;
  await createOrderPair({ symbol: data.s, targetOrderId: data.i, copyOrderId: orderResp.orderId });
};

const onCancelLimit = async ({
  data,
  copyCatBot
}) => {
  const [pair] = await findOrderPair({ symbol: data.s, targetOrderId: data.i });
  if (!pair) return;

  const wait = [deleteOrderPair({ symbol: data.s, targetOrderId: data.i })];
  if (data.x === 'CANCELED') wait.push(cancelOrderFromEvent({ ...data, i: pair.copy_order_id }, copyCatBot));
  await Promise.all(wait);
};

export const onLimitOrderAction = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  if (data.S === 'BUY' && data.x === 'NEW') {
    await onBuyLimit({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }

  if (data.S === 'SELL' && data.x === 'NEW') {
    await onSellLimit({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }

  if (data.x === 'CANCELED' || data.X === 'FILLED') {
    await onCancelLimit({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }
};
