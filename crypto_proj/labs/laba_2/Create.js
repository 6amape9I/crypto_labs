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

const args = process.argv.slice(2);
if (args.length < 4) {
  console.log('Usage: node Create.js <amount_sats> <fee_sats> <receiver_address> <sender_tprv>');
  process.exit(1);
}

const AMOUNT = Number(args[0]);
const FEE = Number(args[1]);
const RECEIVER = String(args[2]).trim();
const SENDER_TPRV = String(args[3]).trim();

if (!Number.isInteger(AMOUNT) || AMOUNT <= 0) throw new Error('amount_sats must be positive int');
if (!Number.isInteger(FEE) || FEE <= 0) throw new Error('fee_sats must be positive int');

const DERIVATION_PATH = "m/44'/1'/0'/0/3";

async function http(method, url, data = undefined, headers = {}) {
  const resp = await axios({
    method,
    url,
    data,
    timeout: 20000,
    proxy: false,
    headers: {
      'User-Agent': 'crypto-labs/1.0',
      'Accept': 'application/json, text/plain, */*',
      ...headers,
    },
    transformRequest: [(d) => d],
    validateStatus: () => true,
  });

  if (resp.status >= 400) {
    console.error(`HTTP ${resp.status} ${method.toUpperCase()} ${url}`);
    console.error('Response headers:', resp.headers);
    console.error('Response body:', resp.data);
    throw new Error(`HTTP ${resp.status} on ${method.toUpperCase()} ${url}`);
  }
  return resp.data;
}

async function getUtxos(address) {
  return await http('get', `${MEMPOOL_API}/address/${address}/utxo`);
}

async function getRawTxHex(txid) {
  return await http('get', `${MEMPOOL_API}/tx/${txid}/hex`);
}

async function broadcast(txHex) {
  return await http('post', `${MEMPOOL_API}/tx`, txHex, { 'Content-Type': 'text/plain' });
}

function sumUtxos(utxos) {
  return utxos.reduce((s, u) => s + u.value, 0);
}

async function main() {
  try {
    const bip32 = BIP32Factory(ecc);
    const root = bip32.fromBase58(SENDER_TPRV, TESTNET);
    const child = root.derivePath(DERIVATION_PATH);
    if (!child.privateKey) throw new Error('No private key at derivation path');

    const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: TESTNET });

    const senderPayment = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: TESTNET });
    const senderAddress = senderPayment.address;

    console.log('=== Legacy P2PKH Tx Tool (testnet4) ===');
    console.log('Derivation path:', DERIVATION_PATH);
    console.log('Sender address :', senderAddress);
    console.log('Receiver       :', RECEIVER);
    console.log('Amount         :', AMOUNT, 'sats');
    console.log('Fee            :', FEE, 'sats');
    console.log('Receiver raw   :', JSON.stringify(RECEIVER));

    // validate receiver and get scriptPubKey
    let receiverScript;
    try {
      receiverScript = bitcoin.address.toOutputScript(RECEIVER, TESTNET);
    } catch (e) {
      throw new Error(`Receiver address invalid for testnet: ${e.message}`);
    }

    const utxos = await getUtxos(senderAddress);
    if (!utxos.length) throw new Error('No UTXOs found for sender address');

    console.log('\nUTXOs:', utxos.length, 'Total:', sumUtxos(utxos), 'sats');

    utxos.sort((a, b) => b.value - a.value);
    const utxo = utxos[0];

    console.log('\nUsing UTXO:');
    console.log('txid :', utxo.txid);
    console.log('vout :', utxo.vout);
    console.log('value:', utxo.value, 'sats');

    const need = AMOUNT + FEE;
    if (utxo.value < need) throw new Error(`Insufficient funds. Need ${need}, have ${utxo.value}`);

    const prevTxHex = await getRawTxHex(utxo.txid);

    const psbt = new Psbt({ network: TESTNET });

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
    });

    // ✅ values as BigInt for bitcoinjs-lib v7
    psbt.addOutput({ script: receiverScript, value: BigInt(AMOUNT) });

    const change = utxo.value - need;
    const DUST = 546;
    if (change > DUST) {
      const changeScript = bitcoin.address.toOutputScript(senderAddress, TESTNET);
      psbt.addOutput({ script: changeScript, value: BigInt(change) });
      console.log('Change output :', change, 'sats ->', senderAddress);
    } else {
      console.log('No change output (dust adds to fee). Change:', change);
    }

    psbt.signInput(0, keyPair);
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();

    console.log('\nLocal TXID:', tx.getId());
    console.log('TX HEX:', txHex);

    console.log('\nBroadcasting...');
    const txid = await broadcast(txHex);

    console.log('\n✅ SUCCESS');
    console.log('TXID:', txid);
    console.log('View:', `https://mempool.space/testnet4/tx/${txid}`);
  } catch (e) {
    console.error('\n✗ ERROR:', e.message);
    process.exit(1);
  }
}

main();
