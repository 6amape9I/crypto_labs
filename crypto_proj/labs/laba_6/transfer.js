const fs = require("fs");
const Web3 = require("web3").default;

const RPC = "http://127.0.0.1:8700";
const CONTRACT_ADDRESS = "0x880EC53Af800b5Cd051531672EF4fc4De233bD5d"; // <-- вставь адрес

const web3 = new Web3(RPC);
const abi = JSON.parse(fs.readFileSync("MyToken.abi.json", "utf8"));
const token = new web3.eth.Contract(abi, CONTRACT_ADDRESS);

function toUnits(amount, decimals) {
  // amount строкой, decimals числом -> строка wei-подобных единиц
  return (BigInt(amount) * (10n ** BigInt(decimals))).toString();
}

(async () => {
  const accounts = await web3.eth.getAccounts();
  const a0 = accounts[0];
  const a1 = accounts[1];

  console.log("a0:", a0);
  console.log("a1:", a1);
  console.log("token:", CONTRACT_ADDRESS);

  // decimals/symbol/name (не обязательно, но удобно для отчёта)
  const name = await token.methods.name().call();
  const symbol = await token.methods.symbol().call();
  const decimals = Number(await token.methods.decimals().call());
  console.log("Token:", name, `(${symbol}), decimals=${decimals}`);

  // balances before
  const b0_before = await token.methods.balanceOf(a0).call();
  const b1_before = await token.methods.balanceOf(a1).call();
  console.log("Balance a0 before:", b0_before);
  console.log("Balance a1 before:", b1_before);

  // transfer 100 tokens (в единицах токена, не wei)
  const amount = toUnits("100", decimals);
  console.log(`Sending ${amount} (raw units) from a0 -> a1 ...`);

  const receipt = await token.methods.transfer(a1, amount).send({ from: a0 });
  console.log("TX hash:", receipt.transactionHash);
  console.log("Block:", receipt.blockNumber);

  // balances after
  const b0_after = await token.methods.balanceOf(a0).call();
  const b1_after = await token.methods.balanceOf(a1).call();
  console.log("Balance a0 after:", b0_after);
  console.log("Balance a1 after:", b1_after);

  // простая проверка (для отчёта)
  const ok = (BigInt(b1_after) - BigInt(b1_before)) === BigInt(amount);
  console.log("Transfer verified:", ok);

  // дополнительно: выведем блок
  const block = await web3.eth.getBlock(receipt.blockNumber);
  console.log("Block hash:", block.hash);
})();
