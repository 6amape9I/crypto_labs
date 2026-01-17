const https = require('https');

const address = 'mp4naUYZdWMRURa9bbfDr2pMZ2P9L5gbKE';

const options = {
  hostname: 'mempool.space',
  port: 443,
  path: `/testnet4/api/address/${address}`,
  method: 'GET'
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Balance (satoshis):', data);
  });
});

req.on('error', err => console.error(err));
req.end();
