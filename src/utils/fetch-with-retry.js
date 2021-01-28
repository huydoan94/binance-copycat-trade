// @flow
import { get } from 'lodash';
import sleep from './sleep';

export default async (fetcher: Function, ...params: Array<any>): Promise<any> => {
  const retryFunc = (remain: number): Promise<any> =>
    fetcher(...params).catch((err: Error): Promise<any> => {
      if (remain <= 0 || get(err, 'response.status') === 401) {
        throw err;
      }
      return sleep(3000).then((): Promise<any> => retryFunc(remain - 1));
    });
  return retryFunc(5);
};
