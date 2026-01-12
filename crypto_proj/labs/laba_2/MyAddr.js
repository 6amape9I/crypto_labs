const bitcoin = require('bitcoinjs-lib');
const BIP32Factory = require('bip32').default;
const ecc = require('tiny-secp256k1');

const bip32 = BIP32Factory(ecc);
const TESTNET = bitcoin.networks.testnet;

const tprv = 'tprv8ZgxMBicQKsPdPM3NaU525GXxyrjQhKR5qT8nL7QTE7HM4pQ5CQQWipnae68tUgyirff1fCuakm9urD1jxtb4Ug1bB2vsE6zHmFwXbx21rz'; // твой tprv
const root = bip32.fromBase58(tprv, TESTNET);

// SegWit путь
const child = root.derivePath("m/84'/1'/0'/0/0");

const { address } = bitcoin.payments.p2wpkh({
  pubkey: child.publicKey,
  network: TESTNET,
});

console.log(address); // tb1q....
