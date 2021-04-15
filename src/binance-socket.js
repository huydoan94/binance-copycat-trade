import { noop } from 'lodash';
import WebSocket from 'isomorphic-ws';

export const SOCKET_TYPES = {
  SPOT: 'SPOT',
  FUTURES: 'FUTURES'
};

const getAccountListenKey = async (key, socketType) => {
  let api = null;
  switch (socketType) {
    case SOCKET_TYPES.SPOT:
      api = () => global.spotApi.post('/userDataStream', undefined, { headers: { 'X-MBX-APIKEY': key } });
      break;
    case SOCKET_TYPES.FUTURES:
      api = () => global.futureApi.post('/listenKey', undefined, { headers: { 'X-MBX-APIKEY': key } });
      break;
    default:
      throw new Error('Invalid socket type');
  }

  const { data } = await api();
  return data.listenKey;
};

const getSocketTypeUrl = (targetListenKey, socketType) => {
  let url = null;
  switch (socketType) {
    case SOCKET_TYPES.SPOT:
      url = `wss://stream.binance.com:9443/ws/${targetListenKey}`;
      break;
    case SOCKET_TYPES.FUTURES:
      url = `wss://fstream.binance.com/ws/${targetListenKey}`;
      break;
    default:
      throw new Error('Invalid socket type');
  }

  return url;
};

export default class BinanceSocket {
  id = null
  key = null
  socketUrl = null
  socketClient = null
  messageHandler = noop
  logging = true
  type = SOCKET_TYPES.SPOT

  socketServerCycleTimeout = null
  forceRestart = false

  constructor ({ key, messageHandler, socketUrl, socketType }) {
    this.type = socketType || SOCKET_TYPES.SPOT;

    if (key) {
      this.key = key;
      this.id = key.slice(-5);
    }

    if (socketUrl) {
      this.socketUrl = socketUrl;
      this.id = socketUrl;
    }

    this.messageHandler = messageHandler;
    this.createSocketClient();
  }

  createSocketClient = async () => {
    let targetListenKey;
    if (this.key) targetListenKey = await getAccountListenKey(this.key, this.type);
    else targetListenKey = this.socketUrl;

    this.socketClient = new WebSocket(getSocketTypeUrl(targetListenKey, this.type));
    this.socketClient.addEventListener('open', this.openHandler);
    this.socketClient.addEventListener('message', this.messageHandlerParser);
    this.socketClient.addEventListener('close', this.closeHandler);
  }

  restartSocket = () => {
    this.socketClient.close(4990);
  }

  openHandler = () => {
    if (!this.forceRestart && this.logging) console.log(`[${this.id}]Socket opened!`);
    this.forceRestart = false;

    const restartWait = (this.key ? 30 : (20 * 60)) * 60 * 1000;
    this.socketServerCycleTimeout = setTimeout(this.restartSocket, restartWait);
  }

  messageHandlerParser = (evt) => {
    this.messageHandler(evt.data);
  }

  closeHandler = ({ code }) => {
    clearTimeout(this.socketServerCycleTimeout);

    if (code === 4990) this.forceRestart = true;
    else if (this.logging) console.log(`[${this.id}]Socket closed with code: ${code}`);

    if (code === 4991) return;

    setTimeout(this.createSocketClient, 1000);
  }
}
