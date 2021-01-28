// @flow
import { map, every, sortBy, isEmpty, isNil } from 'lodash';

const all = async (
  callers: Array<Function>,
  maxPromise?: number = 5,
  stopOnError?: boolean = true
): Promise<Array<any>> => {
  if (isEmpty(callers)) return [];
  return new Promise((resolve: Function, reject: Function) => {
    const resolveResults = (data: any) => {
      if (every(data, (r: any): boolean => r === null)) {
        reject(new Error('Promise all failed !!!'));
      }
      resolve(data);
    };

    const endIndex = callers.length - 1;
    let currentIndex = -1;
    let currentInPool = 0;
    let isFailed = false;
    const results = [];
    const next = () => {
      if (isFailed) return;
      if (currentIndex >= endIndex && currentInPool <= 0) {
        resolveResults(results);
        return;
      }
      if (currentIndex >= endIndex) return;

      currentIndex += 1;
      currentInPool += 1;
      ((innerIndex: number) => {
        callers[innerIndex]().then((res: any): any => {
          results.push(res);
          currentInPool -= 1;
          next();
          return res;
        }).catch((err: Error): null => {
          if (stopOnError) {
            isFailed = true;
            reject(err);
            return null;
          }
          results.push(null);
          currentInPool -= 1;
          next();
          return null;
        });
      })(currentIndex);
    };

    for (let i = 0; i < maxPromise; i += 1) {
      next();
    }
  });
};

const promiseMap = async (
  collection: (Object | Array<any>),
  iteratee: Function,
  maxPromise?: number = 20,
  stopOnError?: boolean = true
): Promise<Array<any>> => {
  if (isNil(collection)) return [];
  const iteratees = map(
    collection,
    (value: any, index: number, ...others: Array<any>): Function =>
      async (): Promise<{ index: number, result: any }> => {
        const result = await iteratee(value, index, ...others);
        return { index, result };
      });
  const results = await all(iteratees, maxPromise, stopOnError);
  const sorted = sortBy(results, (r: { index: number, result: any }): number => r.index);
  return map(sorted, (s: { index: number, result: any }): any => s.result);
};

export {
  all,
  promiseMap as map
};
