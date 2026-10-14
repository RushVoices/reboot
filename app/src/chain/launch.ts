// Everything a coin launch needs, loaded only when someone launches (the
// Solana libraries are large). main.ts imports this module dynamically.

import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;

import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env, isLive } from "./config";
import { connectWallet } from "./wallet";
import { launchOnPump, pumpUrl } from "./pump";
import { uploadMetadata, type TokenMeta } from "./ipfs";

export { connectWallet, isLive, pumpUrl };

export interface CoinRequest extends TokenMeta {
  image: File;
  devBuySol: number;
}

export async function launchCoin(req: CoinRequest, onStep: (step: "upload" | "sign") => void) {
  if (!isLive()) throw new Error("Coin launches aren't switched on for this site yet (VITE_RPC_URL is missing).");
  const conn = new Connection(env.rpcUrl, "confirmed");
  const creator = await connectWallet();
  const lamports = BigInt(Math.round(req.devBuySol * LAMPORTS_PER_SOL));
  if (lamports > 0n) {
    const balance = BigInt(await conn.getBalance(creator));
    // ~0.03 SOL covers the mint, accounts and network fees.
    if (balance < lamports + 30_000_000n) throw new Error("Your wallet doesn't have enough SOL for that first buy plus fees.");
  }

  onStep("upload");
  const { image, devBuySol: _, ...meta } = req;
  const uri = await uploadMetadata(image, meta);

  onStep("sign");
  const { mint, signature } = await launchOnPump(conn, creator, { name: meta.name, symbol: meta.symbol, uri, devBuyLamports: lamports });
  return { mint: mint.toBase58(), signature, url: pumpUrl(mint) };
}
