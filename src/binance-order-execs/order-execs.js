import axios from 'axios';

import binanceTime from '../binance-time';
import binanceSymbol from '../binance-symbol';

import { floorWithPrecision } from '../utils/math';
import { getHash } from '../utils/hash';

export const createOrderFromEvent = async (event, { key, secret }) => {
  const today = binanceTime.getToday();

  const { quoteAssetPrecision, filters } = binanceSymbol.getSymbolData(event.s);
  const lotSize = filters.find(f => f.filterType === 'LOT_SIZE');

  const quoteQuantity = floorWithPrecision(Number(event.Q), quoteAssetPrecision);
  let quantity = Number(event.q);
  if (lotSize) {
    const { stepSize } = lotSize;
    const [, decimal] = `${Number(stepSize)}`.split('.');
    const quantityPrecision = decimal ? decimal.length : 0;
    quantity = floorWithPrecision(quantity, quantityPrecision);
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

  console.warn(`Create Order: ${params}`);
  const sig = getHash(params, secret);
  let result = {};
  try {
    result = await axios.post(
      `/order?${params}&signature=${sig}`,
      undefined,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    console.log(`Create Order Done: ${params}`);
  } catch (e) {
    console.error(`Create Order Failed: ${JSON.stringify({ params, resp: e.response.data })}`);
  }

  return result;
};

export const cancelOrderFromEvent = async (event, { key, secret }) => {
  const today = binanceTime.getToday();
  const params = `symbol=${event.s}&orderId=${event.i}` +
    `&timestamp=${today}`;

  console.warn(`Cancel Order: ${params}`);
  const sig = getHash(params, secret);
  let result = {};
  try {
    result = await axios.delete(
      `/order?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    console.log(`Cancel Order Done: ${params}`);
  } catch (e) {
    console.error(`Cancel Order Failed: ${JSON.stringify({ params, resp: e.response.data })}`);
  }

  return result;
};
