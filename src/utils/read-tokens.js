// @flow

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isEmpty, isEqual } from 'lodash';

export default ((): Function => {
  let retrieved = '';
  let tokens = {};

  return async (): Promise<Object> => new Promise((resolve: Function) => {
    fs.readFile(path.join(__dirname, 'tokens.conf'), (err?: ?Error, data: Buffer) => {
      if (err || isEmpty(data)) {
        resolve({});
        return;
      }

      const text = data.toString();
      if (isEqual(text, retrieved)) {
        resolve(tokens);
        return;
      } else {
        retrieved = text;
      }

      let [key, iv, payload] = text.split(':');
      iv = Buffer.from(iv, 'hex');
      key = Buffer.from(key, 'hex');
      payload = Buffer.from(payload, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(payload);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      decrypted = decrypted.toString();
      tokens = JSON.parse(decrypted);
      resolve(tokens);
    });
  });
})();
