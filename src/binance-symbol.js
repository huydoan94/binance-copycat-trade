import axios from 'axios';
import { memoize, differenceWith, isEqual } from 'lodash';

export class BinanceSymbol {
  symbols = []
  fetchSymbolsTimeout = null
  firstRun = true

  fetchSymbols = async () => {
    clearTimeout(this.fetchSymbolsTimeout);

    if (this.firstRun) console.log('Get symbols');
    try {
      const { data = {} } = await axios.get('/exchangeInfo');
      const symbols = data.symbols || this.symbols;

      const isUpdated = this.symbols.length !== symbols.length ||
        differenceWith(this.symbols, symbols, isEqual).length > 0 ||
        differenceWith(symbols, this.symbols, isEqual).length > 0;
      if (isUpdated) {
        this.getSymbolData.cache.clear();
        console.log(`Symbol def updated: ${symbols.length}`);
      }

      this.symbols = symbols;
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
