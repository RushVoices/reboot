// Simulates a real pump.fun launch transaction on mainnet without sending it
// or spending anything: `npm run simulate:launch -- [rpcUrl] [firstBuySol] [longest]`.
// Signatures aren't checked in a simulation, so any funded address can stand
// in as the creator. Prints the program logs and whether the launch succeeds.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { buildLaunchTx, txSize } from "../src/chain/pump";

const rpc = process.argv[2] || "https://api.mainnet-beta.solana.com";
const devBuySol = Number(process.argv[3] ?? "0.01");
const longest = process.argv[4] === "longest"; // max-length name and ticker
// A large public exchange wallet, used only as a funded stand-in fee payer for the simulation.
const STAND_IN = new PublicKey(process.env.SIM_CREATOR || "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");

// Use Node's own fetch (it honors NODE_USE_ENV_PROXY), passing only method,
// headers and body: web3.js also adds a Node http agent the runtime fetch rejects.
const nativeFetch = (globalThis as { __nativeFetch?: typeof fetch }).__nativeFetch ?? fetch;
const conn = new Connection(rpc, {
  commitment: "confirmed",
  fetch: (async (u: string, i?: RequestInit) => {
    try {
      return await nativeFetch(u, { method: i?.method, headers: i?.headers, body: i?.body });
    } catch (e) {
      console.error("RPC request failed:", (e as { cause?: unknown }).cause ?? e);
      throw e;
    }
  }) as never,
});
const mint = Keypair.generate();
const tx = await buildLaunchTx(conn, STAND_IN, mint.publicKey, {
  name: longest ? "N".repeat(32) : "Reboot Sim",
  symbol: longest ? "S".repeat(10) : "NXSIM",
  uri: "https://ipfs.io/ipfs/" + "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
  devBuyLamports: BigInt(Math.round(devBuySol * LAMPORTS_PER_SOL)),
});
tx.feePayer = STAND_IN;
tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

const message = tx.compileMessage();
const { VersionedTransaction, VersionedMessage } = await import("@solana/web3.js");
const vtx = new VersionedTransaction(VersionedMessage.deserialize(message.serialize()));
const res = await conn.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true });

console.log(`instructions: ${tx.instructions.length}, size: ${txSize(tx, STAND_IN)} bytes (limit 1232)`);
console.log((res.value.logs ?? []).filter((l) => /Instruction: (Create|Buy)|failed|Error/i.test(l)).join("\n"));
console.log(`units used: ${res.value.unitsConsumed}`);
if (res.value.err) { console.log("RESULT: FAILED", JSON.stringify(res.value.err)); process.exit(1); }
console.log("RESULT: launch transaction succeeds in simulation");
