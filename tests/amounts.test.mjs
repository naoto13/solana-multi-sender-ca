import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const maxU64 = (1n << 64n) - 1n;
const address = "11111111111111111111111111111111";
const secondAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// Run the actual page script with inert DOM/RPC/wallet adapters. No network,
// private keys, signatures or broadcast are available in this test harness.
function loadPage(path, asset = "SOL") {
  const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(script, `${path} must contain its application script`);
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        value: "", textContent: "", innerHTML: "", disabled: false,
        classList: { add() {}, toggle() {} }, addEventListener() {},
      });
    }
    return elements.get(selector);
  }
  element("#assetType").value = asset;
  element("#tokenPreset").value = "usdc";
  element("#mintInput").value = secondAddress;
  element("#batchSize").value = "1";
  class PublicKey {
    constructor(value) { this.value = value; }
    toBuffer() { return new Uint8Array(32); }
    static findProgramAddressSync() { return [new PublicKey(address)]; }
  }
  class Transaction {
    instructions = [];
    add(instruction) { this.instructions.push(instruction); return this; }
    serialize() { return new Uint8Array(100 + this.instructions.length * 50); }
  }
  class Connection {
    async getParsedAccountInfo() { return { value: { data: { parsed: { info: { decimals: 6 } } } } }; }
    async getAccountInfo() { return {}; }
    async getLatestBlockhash() { return { blockhash: address, lastValidBlockHeight: 1 }; }
    async confirmTransaction() { return { value: { err: null } }; }
    async getBalance() { return 0; }
    async getParsedTokenAccountsByOwner() { return { value: [] }; }
  }
  const signingRequests = [];
  const context = vm.createContext({
    Uint8Array, DataView, console,
    setTimeout(callback) { callback(); },
    document: { querySelector: element, querySelectorAll: () => [] },
    window: { solana: { isPhantom: true, async signAndSendTransaction(transaction) {
      signingRequests.push(transaction);
      return { signature: "test-fixture-no-signature-or-broadcast" };
    } } },
    solanaWeb3: {
      PublicKey, Transaction, Connection,
      TransactionInstruction: class { constructor(options) { Object.assign(this, options); } },
      SystemProgram: { programId: address, transfer: (options) => options },
      SYSVAR_RENT_PUBKEY: address,
    },
  });
  new vm.Script(script, { filename: path }).runInContext(context);
  vm.runInContext(`connectedPublicKey = "${address}"`, context);
  return { app: context, element, signingRequests };
}

function decimal(units, decimals) {
  if (!decimals) return String(units);
  const digits = String(units).padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

for (const path of ["index.html", "outputs/index.html"]) {
  test(`${path}: decimal conversion preserves exact unsigned transfer boundaries`, () => {
    const { app } = loadPage(path);
    for (const decimals of [0, 6, 9]) {
      for (const units of [1n, (1n << 53n) - 1n, 1n << 53n, (1n << 53n) + 1n, maxU64]) {
        assert.equal(app.parseDecimalToUnits(decimal(units, decimals), decimals), units);
      }
    }
    assert.equal(app.parseDecimalToUnits(" 001.25 ", 6), 1250000n);
  });

  test(`${path}: zero, malformed, over-precision and overflowing amounts are rejected`, () => {
    const { app } = loadPage(path);
    for (const decimals of [0, 6, 9]) {
      for (const units of [maxU64 + 1n, maxU64 + 2n]) {
        assert.throws(() => app.parseDecimalToUnits(decimal(units, decimals), decimals), /amount/i);
      }
    }
    for (const value of ["0", "0.000000", "-1", "", "1e3", "NaN", "Infinity", ".1", "1.", "1,000"]) {
      assert.throws(() => app.parseDecimalToUnits(value, 6), /amount/i, value);
    }
    assert.throws(() => app.parseDecimalToUnits("0.0000001", 6), /decimal places/i);
    assert.throws(() => app.parseDecimalToUnits("1.0", 0), /decimal places/i);
  });

  test(`${path}: u64 encoder refuses wrapping and encodes both endpoints`, () => {
    const { app } = loadPage(path);
    for (const units of [0n, 1n, maxU64]) {
      const bytes = app.u64Le(units);
      assert.equal(new DataView(bytes.buffer).getBigUint64(0, true), units);
    }
    for (const units of [-1n, maxU64 + 1n, maxU64 + 2n]) {
      assert.throws(() => app.u64Le(units), /amount|range|u64/i);
    }
  });

  test(`${path}: SOL builder passes exact lamports above Number.MAX_SAFE_INTEGER`, async () => {
    const { app } = loadPage(path);
    const transaction = await app.buildSolTransaction({}, [{ address, amountRaw: "9007199.254740993" }]);
    assert.equal(transaction.instructions[0].lamports, 9007199254740993n);
  });

  test(`${path}: SPL transfer instruction retains the exact u64 maximum`, async () => {
    const { app } = loadPage(path, "SPL");
    const payer = new app.solanaWeb3.PublicKey(address);
    const transaction = await app.buildSplTransaction(payer, [{ address, amountRaw: decimal(maxU64, 6) }]);
    const bytes = transaction.instructions.at(-1).data;
    assert.equal(bytes[0], 12);
    assert.equal(new DataView(bytes.buffer).getBigUint64(1, true), maxU64);
    assert.equal(bytes[9], 6);
  });

  for (const asset of ["SOL", "SPL"]) {
    test(`${path}: ${asset} invalid later batch stops before the first signing request`, async () => {
      const { app, element, signingRequests } = loadPage(path, asset);
      const decimals = asset === "SOL" ? 9 : 6;
      element("#recipientInput").value = `${address},1\n${secondAddress},${decimal(maxU64 + 2n, decimals)}`;
      await app.executeBatch();
      assert.equal(signingRequests.length, 0);
      assert.match(element("#statusBox").innerHTML, /amount/i);
      assert.match(element("#statusBox").innerHTML, /FAILED/);
      assert.equal(element("#executeBtn").disabled, false);
    });
  }

  test(`${path}: normal positive transfer still reaches the inert wallet adapter`, async () => {
    const { app, element, signingRequests } = loadPage(path);
    element("#recipientInput").value = `${address},0.000000001`;
    await app.executeBatch();
    assert.equal(signingRequests.length, 1);
    assert.equal(BigInt(signingRequests[0].instructions[0].lamports), 1n);
    assert.match(element("#statusBox").innerHTML, /SUBMITTED/);
  });
}

test("root and output HTML copies remain identical", () => {
  assert.equal(readFileSync(new URL("../index.html", import.meta.url), "utf8"),
    readFileSync(new URL("../outputs/index.html", import.meta.url), "utf8"));
});
