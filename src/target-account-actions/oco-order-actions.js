import { createOcoOrder, cancelOcoOrder } from '../binance-order-execs/order-execs-spot';
import { findOrderPair, createOrderPair, deleteOrderPair } from '../binance-order-execs/order-pairs-execs';

import calculateFromPercentage from '../binance-order-execs/calc-from-percentage';

const ocoCache = {};

const onCreateOcoOrder = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  const [pair] = await findOrderPair({ symbol: data.s, targetOrderId: data.g, isOco: true });
  if (pair) return;

  let ocoCacheEvent = ocoCache[data.g];
  if (!ocoCacheEvent) {
    ocoCacheEvent = {
      id: data.g,
      legs: [],
      legEvents: [],
      allLegsReceived: false,
      listStatusReceived: false,
      quantity: 0
    };
  }

  if (ocoCacheEvent.listStatusReceived && ocoCacheEvent.allLegsReceived) return;

  if (data.e === 'executionReport' && data.x === 'NEW') {
    if (!ocoCacheEvent.legEvents.find(le => le.i === data.i)) {
      ocoCacheEvent.legEvents.push(data);

      if (data.S === 'BUY') {
        const targetAsset = targetAccountBalance.getAsset(quoteAsset);
        const copycatAsset = copycatAccountBalance.getAsset(quoteAsset);
        if (!targetAsset || !copycatAsset || targetAsset.free === 0 || copycatAsset.free === 0) return;

        const percentage = (Number(data.q) * Number(data.p)) / targetAsset.free;
        ocoCacheEvent.quantity = calculateFromPercentage(copycatAsset.free, percentage) / Number(data.p);
      }

      if (data.S === 'SELL') {
        const targetAsset = targetAccountBalance.getAsset(baseAsset);
        const copycatAsset = copycatAccountBalance.getAsset(baseAsset);
        if (!targetAsset || !copycatAsset || targetAsset.free === 0 || copycatAsset.free === 0) return;

        const percentage = Number(data.q) / targetAsset.free;
        ocoCacheEvent.quantity = calculateFromPercentage(copycatAsset.free, percentage);
      }
    }
  }

  if (data.e === 'listStatus' && !ocoCacheEvent.listStatusReceived) {
    ocoCacheEvent.listStatusReceived = true;

    const legs = data.O || [];
    ocoCacheEvent.legs = legs.map(leg => leg.i);
  }

  if (ocoCacheEvent.listStatusReceived) {
    const flatIdFromEvents = ocoCacheEvent.legEvents.map(le => le.i);
    if (ocoCacheEvent.legs.every(l => flatIdFromEvents.includes(l))) {
      ocoCacheEvent.allLegsReceived = true;
    }
  }

  ocoCache[data.g] = ocoCacheEvent;
  if (ocoCacheEvent.listStatusReceived && ocoCacheEvent.allLegsReceived) {
    const { data: orderResp } = await createOcoOrder(ocoCacheEvent, copyCatBot);
    if (orderResp) {
      await createOrderPair({
        symbol: data.s,
        targetOrderId: data.g,
        copyOrderId: orderResp.orderListId,
        isOco: true
      });
      delete ocoCache[data.g];
    }
  }
};

const onCancelOcoOrder = async ({
  data,
  copyCatBot
}) => {
  const [pair] = await findOrderPair({ symbol: data.s, targetOrderId: data.g, isOco: true });
  if (!pair) return;

  const wait = [deleteOrderPair({ symbol: data.s, targetOrderId: data.g, isOco: true })];
  if (data.x === 'CANCELED') wait.push(cancelOcoOrder({ ...data, g: pair.copy_order_id }, copyCatBot));
  await Promise.all(wait);
};

export const onOcoOrderAction = async ({
  data,
  quoteAsset,
  baseAsset,
  targetAccountBalance,
  copycatAccountBalance,
  copyCatBot
}) => {
  if (data.g === -1) return;

  if (data.x === 'CANCELED' || data.X === 'FILLED') {
    await onCancelOcoOrder({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  } else {
    await onCreateOcoOrder({
      data,
      quoteAsset,
      baseAsset,
      targetAccountBalance,
      copycatAccountBalance,
      copyCatBot
    });
  }
};
