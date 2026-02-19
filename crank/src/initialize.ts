/**
 * One-time initialization of the ProgramConfig account.
 *
 * Run once after deploying the program:
 *   npx tsx crank/src/initialize.ts
 *
 * Optional env vars:
 *   TREASURY_ADDRESS   — defaults to the admin wallet (swap to Squads before mainnet)
 *   SOLANA_RPC_URL     — defaults to devnet
 *   ADMIN_KEYPAIR_PATH — defaults to ~/.config/solana/id.json
 */
import { PublicKey } from "@solana/web3.js";
import { buildClient, configPDA, PROGRAM_ID } from "./client";

async function main() {
  const { program, adminKeypair, connection } = buildClient();

  // Treasury defaults to admin wallet for devnet.
  // Swap to your Squads multisig address before mainnet.
  const treasury = new PublicKey(
    process.env.TREASURY_ADDRESS ?? adminKeypair.publicKey.toBase58()
  );

  const [configAddress] = configPDA();

  // Check if already initialized
  const existing = await connection.getAccountInfo(configAddress);
  if (existing !== null) {
    console.log("ProgramConfig already initialized at", configAddress.toBase58());
    console.log("Use update_params to change settings.");
    process.exit(0);
  }

  console.log("Initializing ProgramConfig...");
  console.log("  Program ID : ", PROGRAM_ID.toBase58());
  console.log("  Admin      : ", adminKeypair.publicKey.toBase58());
  console.log("  Treasury   : ", treasury.toBase58());
  console.log("  Config PDA : ", configAddress.toBase58());

  const { SystemProgram } = await import("@solana/web3.js");
  const BN = require("bn.js");

  const tx = await (program.methods
    .initializeProgram(
      treasury,
      900,          // default_fee_bps     — 9%
      500,          // bid_increment_bps   — 5% min raise
      new BN(600),           // time_buffer_secs    — 10-min anti-snipe
      new BN(420_000_000)    // min_reserve_lamports — 0.42 SOL
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .accounts({
      admin: adminKeypair.publicKey,
      config: configAddress,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());

  console.log("\nProgramConfig initialized!");
  console.log("  Config address :", configAddress.toBase58());
  console.log("  Transaction    :", tx);
  console.log("\nNext step: run create_auction.ts when you have a slot registered.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
