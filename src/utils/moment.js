// @flow
import 'moment-timezone';
import moment, { Moment } from 'moment';

import msTimezoneMap from './ms-timezone-map';

class MomentManagement {
  timeZone: ?string = moment.tz.guess(true)
  locale: ?string = moment.locale()

  setDefaultTimezone = (timezone?: ?string = this.timeZone, locale?: ?string = this.locale) => {
    const msConverted = msTimezoneMap[timezone];
    this.timeZone = msConverted === undefined ? timezone : msConverted;
    this.locale = locale;
  }

  getMoment = (time?: string): Moment => {
    let momentTime = moment.tz(time, this.timeZone);
    momentTime = momentTime.isValid() ? momentTime : moment().tz(this.timeZone);
    return momentTime.locale(this.locale);
  }
}

const momentManagement = new MomentManagement();
export const setDefaultTimezone = momentManagement.setDefaultTimezone;
export default momentManagement.getMoment;
