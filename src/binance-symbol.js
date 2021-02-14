import axios from 'axios';
import { memoize } from 'lodash';

export class BinanceSymbol {
  symbols = []
  fetchSymbolsTimeout = null

  fetchSymbols = async () => {
    clearTimeout(this.fetchSymbolsTimeout);

    console.log('Get symbols');
    try {
      const { data = {} } = await axios.get('/exchangeInfo');
      this.symbols = (data.symbols || []);
      console.log(`Symbol def count: ${this.symbols.length}`);
    } catch (e) {
      console.error(`Symbols get fail: ${JSON.stringify(e.response.data)}`);
    }

    this.fetchSymbolsTimeout = setTimeout(this.fetchSymbols, 30 * 60 * 1000);
  }

  getSymbolData = memoize((symbol) => {
    return this.symbols.find(s => s.symbol === symbol);
  })
}

export default new BinanceSymbol();
