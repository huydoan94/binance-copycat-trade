import { isEmpty } from 'lodash';

import binanceTime from './binance-time';

import { getHash } from './utils/hash';

export default class AccountBalance {
  balances = []
  accountKey = null
  accountSecret = null
  id = null

  constructor (key, secret) {
    this.accountKey = key;
    this.accountSecret = secret;
    this.id = key.slice(-5);
  }

  fetchBalances = async () => {
    const params = `timestamp=${binanceTime.getToday()}`;
    const sig = getHash(params, this.accountSecret);
    try {
      console.log(`[${this.id}] Get balances`);
      const { data = {} } = await global.spotApi.get(
        `/account?${params}&signature=${sig}`,
        { headers: { 'X-MBX-APIKEY': this.accountKey } }
      );
      this.saveBalances((data.balances || []));
      console.log(`[${this.id}] Balances: ${JSON.stringify(this.balances)}`);
    } catch (e) {
      console.error(`[${this.id}] Balances get fail: ${JSON.stringify(e.response.data)}`);
    }
  }

  saveBalances = (balances) => {
    this.balances = balances
      .map(b => ({ ...b, free: Number(b.free), locked: Number(b.locked) }))
      .filter(b => b.free > 0 || b.locked > 0);
  }

  adjustAccountBalanceFromEvent = (event = [], disableLog) => {
    const msg = {};

    event.forEach(e => {
      const convertedEvent = { asset: e.a, free: Number(e.f), locked: Number(e.l) };
      const index = this.balances.findIndex(b => b.asset === e.a);
      if (index === -1) {
        if (convertedEvent.free !== 0 || convertedEvent.locked !== 0) {
          msg[convertedEvent.asset] = `0 => ${convertedEvent.free}` + (
            convertedEvent.locked !== 0 ? ` (locked 0 => ${convertedEvent.locked})` : ''
          );
        }

        this.balances.push(convertedEvent);
      } else {
        if (
          this.balances[index].free !== convertedEvent.free ||
          this.balances[index].locked !== convertedEvent.locked
        ) {
          msg[convertedEvent.asset] = `${this.balances[index].free} => ${convertedEvent.free}` +
            (
              this.balances[index].locked !== convertedEvent.locked
                ? ` (locked ${this.balances[index].locked} => ${convertedEvent.locked})`
                : ''
            );
        }

        this.balances[index] = convertedEvent;
      }
    });

    this.balances = this.balances.filter(b => b.free > 0 || b.locked > 0);
    if (!disableLog && !isEmpty(msg)) console.log(`[${this.id}] Adjust Balances: ${JSON.stringify(msg)}`);
  }

  getAsset = (coin) => {
    const asset = this.balances.find(b => b.asset === coin);
    if (!asset) return null;

    return { ...asset };
  }
}
