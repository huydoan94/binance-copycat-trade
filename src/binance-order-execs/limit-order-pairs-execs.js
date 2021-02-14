import shortid from 'shortid';

import dbClient from '../postgres-db-client';

export const findLimitOrderPair = async ({ symbol, targetOrderId, copyOrderId }) => {
  let orderParam;
  if (targetOrderId) orderParam = ' ' + `AND target_order_id=${targetOrderId}`;
  if (copyOrderId) orderParam = ' ' + `AND copy_order_id=${copyOrderId}`;
  if (!symbol || !orderParam) return [];

  const { rows } = await dbClient
    .query(`SELECT * from limit_order_pairs WHERE symbol='${symbol}'${orderParam}`)
    .catch(() => ({ rows: [] }));
  return rows;
};

export const createLimitOrderPair = async ({ symbol, targetOrderId, copyOrderId }) => {
  if (!symbol || !targetOrderId || !copyOrderId) return;

  await dbClient
    .query(`INSERT INTO limit_order_pairs (id, target_order_id, copy_order_id, symbol)
            VALUES ('${shortid.generate()}', ${targetOrderId}, ${copyOrderId}, '${symbol}')`)
    .then(() => console.log(`Created limit order pair: ${JSON.stringify({ symbol, targetOrderId, copyOrderId })}`))
    .catch(() => null);
};

export const deleteLimitOrderPair = async ({ symbol, targetOrderId, copyOrderId }) => {
  let orderParam;
  if (targetOrderId) orderParam = ' ' + `AND target_order_id=${targetOrderId}`;
  if (copyOrderId) orderParam = ' ' + `AND copy_order_id=${copyOrderId}`;
  if (!symbol || !orderParam) return;

  await dbClient
    .query(`DELETE FROM limit_order_pairs WHERE symbol='${symbol}'${orderParam}`)
    .then(({ rowCount }) => {
      if (!rowCount) return;
      console.log(`Deleted limit order pair: ${JSON.stringify({ symbol, targetOrderId, copyOrderId })}`);
    })
    .catch(() => null);
};
