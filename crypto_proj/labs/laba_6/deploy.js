const fs = require("fs");
const Web3 = require("web3").default;

const web3 = new Web3("http://127.0.0.1:8700");

const abi = JSON.parse(fs.readFileSync("MyToken.abi.json"));
const bytecode = "0x" + fs.readFileSync("MyToken.bin", "utf8");

(async () => {
  const accounts = await web3.eth.getAccounts();
  const deployer = accounts[0];

  console.log("Deploying from:", deployer);

  const contract = new web3.eth.Contract(abi);

  const instance = await contract
    .deploy({ data: bytecode })
    .send({
      from: deployer,
      gas: 3_000_000,
    });

  console.log("Contract deployed at:", instance.options.address);
})();
