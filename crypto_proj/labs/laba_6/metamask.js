const fs = require("fs");
const Web3 = require("web3").default;

// ===== НАСТРОЙКИ =====
const RPC_URL = "http://127.0.0.1:8700";

// адрес задеплоенного ERC20 контракта
const CONTRACT_ADDRESS = "0x880EC53Af800b5Cd051531672EF4fc4De233bD5d";

// адрес MetaMask (куда отправляем токены)
const METAMASK_ADDRESS = "0x8d7d6016f61B9A923acc2459a72CFE5EEe9e836C";

// сколько токенов отправить (в обычных токенах, не raw)
const AMOUNT_TOKENS = "100";
// =====================

const web3 = new Web3(RPC_URL);
const abi = JSON.parse(fs.readFileSync("MyToken.abi.json", "utf8"));
const token = new web3.eth.Contract(abi, CONTRACT_ADDRESS);

function toUnits(amount, decimals) {
  return (BigInt(amount) * 10n ** BigInt(decimals)).toString();
}

(async () => {
  const accounts = await web3.eth.getAccounts();
  const sender = accounts[0]; // dev-аккаунт

  console.log("Sender (dev):", sender);
  console.log("Recipient (MetaMask):", METAMASK_ADDRESS);
  console.log("Token contract:", CONTRACT_ADDRESS);

  const name = await token.methods.name().call();
  const symbol = await token.methods.symbol().call();
  const decimals = Number(await token.methods.decimals().call());

  console.log(`Token: ${name} (${symbol}), decimals=${decimals}`);

  // Баланс ДО
  const before = await token.methods.balanceOf(METAMASK_ADDRESS).call();
  console.log("Balance before:", before);

  const amountRaw = toUnits(AMOUNT_TOKENS, decimals);
  console.log(`Transferring ${AMOUNT_TOKENS} ${symbol}...`);

  const receipt = await token.methods
    .transfer(METAMASK_ADDRESS, amountRaw)
    .send({ from: sender });

  console.log("TX hash:", receipt.transactionHash);
  console.log("Block number:", receipt.blockNumber);

  // Баланс ПОСЛЕ
  const after = await token.methods.balanceOf(METAMASK_ADDRESS).call();
  console.log("Balance after:", after);

  const ok = BigInt(after) - BigInt(before) === BigInt(amountRaw);
  console.log("Transfer verified:", ok);

  const block = await web3.eth.getBlock(receipt.blockNumber);
  console.log("Block hash:", block.hash);
})();
