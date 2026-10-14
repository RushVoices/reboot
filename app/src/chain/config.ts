// Site configuration, read from Vite env vars (see .env.example).
export const env = {
  cluster: (import.meta.env.VITE_CLUSTER || "mainnet-beta") as "devnet" | "mainnet-beta",
  rpcUrl: import.meta.env.VITE_RPC_URL || "",
};

/** True when the site can talk to Solana (coin launches need this). */
export const isLive = () => !!env.rpcUrl;
