import axios from 'axios';
import axiosRetry from 'axios-retry';

export const create = (baseURL) => {
  const axiosInstance = axios.create({ baseURL, timeout: 5 * 60 * 1000 });
  axiosRetry(axiosInstance, {
    shouldResetTimeout: true,
    retryDelay: (count, error) => {
      if (error.response && [418, 429].includes(error.response.status)) {
        return Number(error.response.headers['Retry-After']) * 1000;
      }
      return axiosRetry.exponentialDelay(count);
    }
  });
  return axiosInstance;
};
