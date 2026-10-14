// Launches an app's coin on pump.fun: one transaction that creates the coin
// and, optionally, makes the creator's first buy. The connected wallet is the
// coin's creator, so pump.fun's creator fees go to that wallet.
//
// Pump SDK calls follow Pump's public docs:
// https://github.com/pump-fun/pump-public-docs
// `tools/simulate-launch.ts` simulates `buildLaunchTx` against mainnet.

import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import { signAndSendSequential } from "./wallet";

export interface LaunchParams {
  name: string;
  symbol: string;
  uri: string;
  devBuyLamports: bigint;
}

/** Compute budget for create (+ buy): enough units, plus a priority fee so it lands when the network is busy. */
const COMPUTE_UNITS = 400_000;
const PRIORITY_MICROLAMPORTS = 20_000; // per compute unit: at most 0.008 SOL at 400k CU, usually less

/** Token amount a SOL dev buy gets on a fresh curve, less a 3% cushion so price movement doesn't fail the buy. */
export function estimateTokensOut(global: Awaited<ReturnType<OnlinePumpSdk["fetchGlobal"]>>, lamportsIn: bigint): BN {
  const out = getBuyTokenAmountFromSolAmount({
    global, feeConfig: null, mintSupply: null, bondingCurve: null,
    amount: new BN(lamportsIn.toString()), quoteMint: NATIVE_MINT,
  });
  return out.muln(97).divn(100);
}

/** Serialized size of a legacy transaction once signed (each signature is 64 bytes). */
export function txSize(tx: Transaction, feePayer: PublicKey): number {
  const msg = new Transaction({ feePayer, recentBlockhash: PublicKey.default.toBase58() }).add(...tx.instructions).compileMessage();
  return msg.serialize().length + 1 + 64 * msg.header.numRequiredSignatures;
}

/** Solana's transaction size limit. */
export const TX_LIMIT = 1232;

/**
 * The launch transaction: create_v2 and the optional first buy, in one
 * transaction so nobody can buy in between. The priority fee is added when it
 * fits under Solana's size limit; create + buy alone is ~1,200 bytes, so with
 * a first buy it's often left to the wallet. The mint keypair must also sign.
 */
export async function buildLaunchTx(conn: Connection, creator: PublicKey, mint: PublicKey, p: LaunchParams): Promise<Transaction> {
  const common = { mint, name: p.name, symbol: p.symbol, uri: p.uri, creator, user: creator, mayhemMode: false };
  let ixs: TransactionInstruction[];
  if (p.devBuyLamports > 0n) {
    const global = await new OnlinePumpSdk(conn).fetchGlobal();
    ixs = await PUMP_SDK.createV2AndBuyInstructions({
      ...common,
      global,
      solAmount: new BN(p.devBuyLamports.toString()), // max SOL spent
      amount: estimateTokensOut(global, p.devBuyLamports),
    });
  } else {
    ixs = [await PUMP_SDK.createV2Instruction(common)];
  }
  const budget = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }),
  ];
  const withBudget = new Transaction().add(...budget, ...ixs);
  if (txSize(withBudget, creator) <= TX_LIMIT) return withBudget;
  const plain = new Transaction().add(...ixs);
  if (txSize(plain, creator) > TX_LIMIT) throw new Error("The coin's name, ticker or link is too long to fit in one transaction. Shorten the name.");
  return plain;
}

export async function launchOnPump(
  conn: Connection,
  creator: PublicKey,
  p: LaunchParams,
): Promise<{ mint: PublicKey; signature: string }> {
  const mint = Keypair.generate();
  const tx = await buildLaunchTx(conn, creator, mint.publicKey, p);
  const [signature] = await signAndSendSequential(conn, [tx], [[mint]]);
  return { mint: mint.publicKey, signature };
}

export const pumpUrl = (mint: PublicKey | string) => `https://pump.fun/coin/${mint.toString()}`;
