import shortid from 'shortid';

import dbClient from '../postgres-db-client';

export const findOrderPair = async ({ symbol, targetOrderId, copyOrderId, isOco = false }) => {
  let orderParam;
  if (targetOrderId) orderParam = ' ' + `AND target_order_id=${targetOrderId}`;
  if (copyOrderId) orderParam = ' ' + `AND copy_order_id=${copyOrderId}`;
  if (!symbol || !orderParam) return [];

  const table = isOco ? 'oco_order_pairs' : 'limit_order_pairs';

  const { rows } = await dbClient
    .query(`SELECT * FROM ${table} WHERE symbol='${symbol}'${orderParam}`)
    .catch(() => ({ rows: [] }));
  return rows;
};

export const createOrderPair = async ({ symbol, targetOrderId, copyOrderId, isOco = false }) => {
  if (!symbol || !targetOrderId || !copyOrderId) return;

  const table = isOco ? 'oco_order_pairs' : 'limit_order_pairs';
  await dbClient
    .query(`INSERT INTO ${table} (id, target_order_id, copy_order_id, symbol)
            VALUES ('${shortid.generate()}', ${targetOrderId}, ${copyOrderId}, '${symbol}')`)
    .then(() => console.log(`Created pair in ${table}: ${JSON.stringify({ symbol, targetOrderId, copyOrderId })}`))
    .catch(() => null);
};

export const deleteOrderPair = async ({ symbol, targetOrderId, copyOrderId, isOco = false }) => {
  let orderParam;
  if (targetOrderId) orderParam = ' ' + `AND target_order_id=${targetOrderId}`;
  if (copyOrderId) orderParam = ' ' + `AND copy_order_id=${copyOrderId}`;
  if (!symbol || !orderParam) return;

  const table = isOco ? 'oco_order_pairs' : 'limit_order_pairs';

  await dbClient
    .query(`DELETE FROM ${table} WHERE symbol='${symbol}'${orderParam}`)
    .then(({ rowCount }) => {
      if (!rowCount) return;
      console.log(`Deleted pair in ${table}: ${JSON.stringify({ symbol, targetOrderId, copyOrderId })}`);
    })
    .catch(() => null);
};
