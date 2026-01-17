const fs = require("fs");
const path = require("path");
const solc = require("solc");

const contractPath = path.resolve(__dirname, "MyToken.sol");
const source = fs.readFileSync(contractPath, "utf8");

// 🔑 ВАЖНО: обработка imports
function findImports(importPath) {
  try {
    // путь вида @openzeppelin/...
    const fullPath = path.resolve(__dirname, "node_modules", importPath);
    const content = fs.readFileSync(fullPath, "utf8");
    return { contents: content };
  } catch (e) {
    return { error: "File not found: " + importPath };
  }
}

const input = {
  language: "Solidity",
  sources: {
    "MyToken.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode"],
      },
    },
  },
};

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports })
);

// печатаем ошибки, если есть
if (output.errors) {
  for (const err of output.errors) {
    console.log(err.severity.toUpperCase() + ":", err.formattedMessage);
  }
}

// проверяем результат
if (!output.contracts || !output.contracts["MyToken.sol"]) {
  throw new Error("Compilation failed");
}

const contract = output.contracts["MyToken.sol"]["MyToken"];

fs.writeFileSync("MyToken.abi.json", JSON.stringify(contract.abi, null, 2));
fs.writeFileSync("MyToken.bin", contract.evm.bytecode.object);

console.log("✔ Compilation successful");
console.log("ABI and bytecode saved");
