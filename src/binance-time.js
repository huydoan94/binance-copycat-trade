export class BinanceTime {
  timeDiff = 0;

  adjustTimeDiff = async () => {
    const { data: { serverTime } } = await global.spotApi.get('/time');
    const today = new Date().valueOf();
    this.timeDiff = serverTime - today;
  }

  getToday = () => {
    return new Date().valueOf() + this.timeDiff;
  }
}

export default new BinanceTime();
