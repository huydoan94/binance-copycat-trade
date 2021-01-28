// @flow
import { Timber } from '@timberio/node';
import shortId from 'shortid';
import { map } from 'lodash';

import moment from './moment';
import isDev from './is-dev';

class Logger {
  masterSession: Array<string> = [shortId.generate()];
  timberLogger: Timber = new Timber(
    // eslint-disable-next-line max-len
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2FwaS50aW1iZXIuaW8vIiwiZXhwIjpudWxsLCJpYXQiOjE1ODYwMjEyMTYsImlzcyI6Imh0dHBzOi8vYXBpLnRpbWJlci5pby9hcGlfa2V5cyIsInByb3ZpZGVyX2NsYWltcyI6eyJhcGlfa2V5X2lkIjo3MjEwLCJ1c2VyX2lkIjoiYXBpX2tleXw3MjEwIn0sInN1YiI6ImFwaV9rZXl8NzIxMCJ9.WEtdMyBN29iQIlE_xdV6yEJihwtq5KYLLaoAX4y86I4',
    '35785'
  );

  formatMessage = (message: string, sessions: Array<string>): string => {
    const headerSessions = map(sessions, (session: string): string => `[${session}]`).join('');
    const header = `[${moment().format('YYYY-MM-DD H:mm:ss Z')}]${headerSessions}`;
    return `${header}: ${message}`;
  }

  info = (message: string, sessions: Array<string> = this.masterSession) => {
    const formatted = this.formatMessage(message, sessions);
    if (isDev()) console.info(formatted);
    else this.timberLogger.info(formatted);
  }

  error = (message: string, sessions: Array<string> = this.masterSession) => {
    const formatted = this.formatMessage(message, sessions);
    if (isDev()) console.error(formatted);
    else this.timberLogger.error(formatted);
  }

  newLogSession = (
    prevSessions: Array<string> = this.masterSession
  ): { info: Function, error: Function, newLogSession: Function } => {
    const session = shortId.generate();
    const sessions = prevSessions.concat(session);
    return {
      info: (message: string): void => this.info(message, sessions),
      error: (message: string): void => this.error(message, sessions),
      newLogSession: (): { info: Function, error: Function, newLogSession: Function } => this.newLogSession(sessions)
    };
  }

  refreshMasterSession = () => {
    this.masterSession = [shortId.generate()];
  }
}

export default new Logger();
