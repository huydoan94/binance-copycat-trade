import { memoize, xorWith, isEqual, forEach, uniqBy } from 'lodash';

export class BinanceSymbol {
  symbols = []
  fetchSymbolsTimeout = null
  firstRun = true

  fetchSymbols = async () => {
    clearTimeout(this.fetchSymbolsTimeout);

    if (this.firstRun) console.log('Get symbols');
    try {
      const { data = {} } = await global.spotApi.get('/exchangeInfo');
      const symbols = data.symbols || this.symbols;

      let diff = xorWith(this.symbols, symbols, isEqual);
      diff = uniqBy(diff, 'symbol');
      if (diff.length > 0) {
        forEach(diff, s => { this.getSymbolData.cache.delete(s.symbol); });
        this.symbols = symbols;
      }

      if (this.firstRun) console.log(`Symbol def updated: ${this.symbols.length}`);
    } catch (e) {
      console.error(`Symbols get fail: ${JSON.stringify(e.response.data)}`);
    }

    this.firstRun = false;
    this.fetchSymbolsTimeout = setTimeout(this.fetchSymbols, 30 * 60 * 1000);
  }

  getSymbolData = memoize((symbol) => {
    return this.symbols.find(s => s.symbol === symbol);
  })
}

export default new BinanceSymbol();
