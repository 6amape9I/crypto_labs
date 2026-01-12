const https = require('https');

const address = '2N2hCKKTRiyMRHyt64KALCVmKaVaUUfZK2w';

const options = {
  hostname: 'mempool.space',
  port: 443,
  path: `/api/testnet4/address/${address}`,
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
