// @flow
import { isEmpty } from 'lodash';
import readTokens from './read-tokens';

export default async (): Promise<string> => {
  const data = await readTokens();
  if (isEmpty(data.machineId)) process.exit(147);
  return data.machineId;
};
