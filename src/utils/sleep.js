// @flow
export default async (milliseconds: number): Promise<void> =>
  new Promise((resolve: Function): Function => setTimeout(resolve, milliseconds));
