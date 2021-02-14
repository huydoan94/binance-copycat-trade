import axios from 'axios';
import { memoize } from 'lodash';

export class BinanceSymbol {
  symbols = []

  fetchSymbols = async () => {
    console.log('Get symbols');
    try {
      const { data = {} } = await axios.get('/exchangeInfo');
      this.symbols = (data.symbols || []);
      console.log(`Symbol def count: ${this.symbols.length}`);
    } catch (e) {
      console.error(`Symbols get fail: ${JSON.stringify(e.response.data)}`);
    }
  }

  getSymbolData = memoize((symbol) => {
    return this.symbols.find(s => s.symbol === symbol);
  })
}

export default new BinanceSymbol();
