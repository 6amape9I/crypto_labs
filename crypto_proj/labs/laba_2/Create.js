'use strict';

const bitcoin = require('bitcoinjs-lib');
const { Psbt } = bitcoin;
const axios = require('axios');

const BIP32Factory = require('bip32').default;
const ecc = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');
const ECPair = ECPairFactory(ecc);

const TESTNET = bitcoin.networks.testnet;
const MEMPOOL_API = 'https://mempool.space/testnet4/api';

// ---- CLI ----
const args = process.argv.slice(2);
if (args.length < 4) {
  console.log('Usage: node legacy_p2pkh_tx.js <amount_sats> <fee_sats> <receiver_address> <sender_tprv>');
  console.log('Example: node legacy_p2pkh_tx.js 50000 1500 2N2Y... "tprv..."');
  process.exit(1);
}

const AMOUNT = Number(args[0]);
const FEE = Number(args[1]);
const RECEIVER = args[2];
const SENDER_TPRV = args[3];

// Copay testnet: BIP44, account #0, external chain 0, index i.
// Ты уже нашёл, что нужный адрес у тебя на i = 3:
const DERIVATION_PATH = "m/44'/1'/0'/0/3";

if (!Number.isInteger(AMOUNT) || AMOUNT <= 0) throw new Error('amount_sats must be positive integer');
if (!Number.isInteger(FEE) || FEE <= 0) throw new Error('fee_sats must be positive integer');

// ---- API helpers ----
async function http(method, url, data = undefined, headers = {}) {
  try {
    const resp = await axios({
      method,
      url,
      data,
      timeout: 20000,
      headers: {
        'User-Agent': 'crypto-labs/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...headers,
      },
      // важно: не даём axios “умничать” со строкой raw tx
      transformRequest: [(d) => d],
      validateStatus: () => true, // НЕ бросаем исключение, сами обработаем
    });

    if (resp.status >= 400) {
      console.error(`HTTP ${resp.status} ${method.toUpperCase()} ${url}`);
      console.error('Response headers:', resp.headers);
      console.error('Response body:', resp.data);
      throw new Error(`HTTP ${resp.status} on ${method.toUpperCase()} ${url}`);
    }

    return resp.data;
  } catch (e) {
    // если упали ДО получения resp (timeout/ssl/etc)
    if (!String(e.message || '').startsWith('HTTP ')) {
      console.error(`Request failed: ${method.toUpperCase()} ${url}`);
      console.error(e);
    }
    throw e;
  }
}

async function getUtxos(address) {
  return await http('get', `${MEMPOOL_API}/address/${address}/utxo`);
}

async function getRawTxHex(txid) {
  // raw tx hex — обычная строка
  return await http('get', `${MEMPOOL_API}/tx/${txid}/hex`);
}

async function broadcast(txHex) {
  return await http(
    'post',
    `${MEMPOOL_API}/tx`,
    txHex,
    { 'Content-Type': 'text/plain' }
  );
}


function sumUtxos(utxos) {
  return utxos.reduce((s, u) => s + u.value, 0);
}

// ---- Main ----
async function main() {
  // 1) derive key + legacy address
  const bip32 = BIP32Factory(ecc);
  const root = bip32.fromBase58(SENDER_TPRV, TESTNET);
  const child = root.derivePath(DERIVATION_PATH);

  if (!child.privateKey) throw new Error('No private key at derivation path');

  const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: TESTNET });

  // Legacy P2PKH sender address (mn... / mk...)
  const senderPayment = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: TESTNET,
  });
  const senderAddress = senderPayment.address;

  console.log('=== Legacy P2PKH Tx Tool (testnet4) ===');
  console.log('Derivation path:', DERIVATION_PATH);
  console.log('Sender address :', senderAddress);
  console.log('Receiver       :', RECEIVER);
  console.log('Amount         :', AMOUNT, 'sats');
  console.log('Fee            :', FEE, 'sats');

  // 2) fetch utxos
  const utxos = await getUtxos(senderAddress);
  if (!utxos.length) throw new Error('No UTXOs found for sender address');

  console.log('\nUTXOs:', utxos.length, 'Total:', sumUtxos(utxos), 'sats');

  // 3) pick ONE utxo (упрощаем как ты просил)
  // Если UTXO несколько — возьми самый крупный, чтобы точно хватило:
  utxos.sort((a, b) => b.value - a.value);
  const utxo = utxos[0];

  console.log('\nUsing UTXO:');
  console.log('txid :', utxo.txid);
  console.log('vout :', utxo.vout);
  console.log('value:', utxo.value, 'sats');

  const need = AMOUNT + FEE;
  if (utxo.value < need) {
    throw new Error(`Insufficient funds in selected UTXO. Need ${need}, have ${utxo.value}`);
  }

  // 4) build PSBT with nonWitnessUtxo (обязательно для P2PKH)
  const prevTxHex = await getRawTxHex(utxo.txid);
  const psbt = new Psbt({ network: TESTNET });

  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
  });

  psbt.addOutput({ address: RECEIVER, value: AMOUNT });

  const change = utxo.value - need;
  const DUST = 546;
  if (change > DUST) {
    psbt.addOutput({ address: senderAddress, value: change });
    console.log('Change output :', change, 'sats ->', senderAddress);
  } else {
    console.log('No change output (dust adds to fee). Change:', change);
  }

  // 5) sign + finalize
  psbt.signInput(0, keyPair);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  const txHex = tx.toHex();

  console.log('\nLocal TXID:', tx.getId());
  console.log('TX HEX:', txHex);

  // 6) broadcast
  console.log('\nBroadcasting...');
  const pushedTxid = await broadcast(txHex);

  console.log('\n✅ SUCCESS');
  console.log('TXID:', pushedTxid);
  console.log('View:', `https://mempool.space/testnet4/tx/${pushedTxid}`);
}

main().catch((e) => {
  console.error('\n✗ ERROR:', e.message);
  process.exit(1);
});
