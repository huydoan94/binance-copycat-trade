import binanceTime from '../binance-time';
import binanceSymbol from '../binance-symbol';

import { floorWithPrecision } from '../utils/math';
import { getHash } from '../utils/hash';
import { searchParamToJson } from '../utils/url';

const flatoutQuantities = ({ symbol, quantity, quoteQuantity }) => {
  const { quoteAssetPrecision, filters } = binanceSymbol.getSymbolData(symbol);
  const lotSize = filters.find(f => f.filterType === 'LOT_SIZE');

  let flatoutQuantity = quantity;
  if (lotSize) {
    const { stepSize } = lotSize;
    const [, decimal] = `${Number(stepSize)}`.split('.');
    const quantityPrecision = decimal ? decimal.length : 0;
    flatoutQuantity = floorWithPrecision(quantity, quantityPrecision);
  }

  return {
    quantity: flatoutQuantity,
    quoteQuantity: floorWithPrecision(quoteQuantity, quoteAssetPrecision)
  };
};

export const createOrderFromEvent = async (event, { key, secret }) => {
  const today = binanceTime.getToday();

  const { quantity, quoteQuantity } = flatoutQuantities({
    symbol: event.s,
    quantity: Number(event.q),
    quoteQuantity: Number(event.Q)
  });

  const isStopLimit = Number(event.P) > 0;

  let params = `symbol=${event.s}&side=${event.S}&type=${event.o}` +
    `&timeInForce=${event.f}` +
    `&quantity=${quantity}` +
    `&price=${event.p}` + (isStopLimit ? `&stopPrice=${event.P}` : '') +
    `&timestamp=${today}`;

  if (event.o === 'MARKET') {
    params = `symbol=${event.s}&side=${event.S}&type=${event.o}` +
      (event.S === 'BUY' ? `&quoteOrderQty=${quoteQuantity}` : `&quantity=${quantity}`) +
      `&timestamp=${today}`;
  }

  const paramJson = searchParamToJson(params);
  delete paramJson.timestamp;

  console.warn(`Create Order: ${JSON.stringify(paramJson)}`);
  const sig = getHash(params, secret);
  let result = null;
  try {
    result = await global.spotApi.post(
      `/order?${params}&signature=${sig}`,
      undefined,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    console.log(`Create Order Done: ${JSON.stringify(paramJson)}`);
  } catch (e) {
    console.error(`Create Order Failed: ${JSON.stringify({ ...e.response.data, params: paramJson })}`);
  }

  return result;
};

export const cancelOrderFromEvent = async (event, { key, secret }) => {
  const today = binanceTime.getToday();
  const params = `symbol=${event.s}&orderId=${event.i}` +
    `&timestamp=${today}`;
  const paramJson = searchParamToJson(params);
  delete paramJson.timestamp;

  console.warn(`Cancel Order: ${JSON.stringify(paramJson)}`);
  const sig = getHash(params, secret);
  let result = null;
  try {
    result = await global.spotApi.delete(
      `/order?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    console.log(`Cancel Order Done: ${JSON.stringify(paramJson)}`);
  } catch (e) {
    console.error(`Cancel Order Failed: ${JSON.stringify({ ...e.response.data, params: paramJson })}`);
  }

  return result;
};

export const createOcoOrder = async (data, { key, secret }) => {
  const today = binanceTime.getToday();

  const stopLimitEvent = data.legEvents.find(l => l.o !== 'LIMIT_MAKER');
  const limitEvent = data.legEvents.find(l => l.o === 'LIMIT_MAKER');

  const { quantity } = flatoutQuantities({
    symbol: stopLimitEvent.s,
    quantity: data.quantity,
    quoteQuantity: 0
  });

  const params = `symbol=${limitEvent.s}&side=${limitEvent.S}` +
    `&quantity=${quantity}` +
    `&price=${limitEvent.p}` +
    `&stopPrice=${stopLimitEvent.P}&stopLimitPrice=${stopLimitEvent.p}` +
    `&stopLimitTimeInForce=${stopLimitEvent.f}` +
    `&timestamp=${today}`;

  const paramJson = searchParamToJson(params);
  delete paramJson.timestamp;

  console.warn(`Create OCO Order: ${JSON.stringify(paramJson)}`);
  const sig = getHash(params, secret);
  let result = null;
  try {
    result = await global.spotApi.post(
      `/order/oco?${params}&signature=${sig}`,
      undefined,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    console.log(`Create OCO Order Done: ${JSON.stringify(paramJson)}`);
  } catch (e) {
    console.error(`Create OCO Order Failed: ${JSON.stringify({ ...e.response.data, params: paramJson })}`);
  }

  return result;
};

export const cancelOcoOrder = async (event, { key, secret }) => {
  const today = binanceTime.getToday();
  const params = `symbol=${event.s}&orderListId=${event.g}` +
    `&timestamp=${today}`;
  const paramJson = searchParamToJson(params);
  delete paramJson.timestamp;

  console.warn(`Cancel OCO Order: ${JSON.stringify(paramJson)}`);
  const sig = getHash(params, secret);
  let result = null;
  try {
    result = await global.spotApi.delete(
      `/orderList?${params}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': key } }
    );
    console.log(`Cancel OCO Order Done: ${JSON.stringify(paramJson)}`);
  } catch (e) {
    console.error(`Cancel OCO Order Failed: ${JSON.stringify({ ...e.response.data, params: paramJson })}`);
  }

  return result;
};
