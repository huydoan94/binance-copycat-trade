import crypto from 'crypto';

export const getHash = (data, secret) => {
  return crypto.createHmac('SHA256', secret).update(data).digest('hex');
};
