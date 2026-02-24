/**
 * mint-devnet-nfts.ts
 *
 * Mints 5 test NFT tokens on devnet for end-to-end auction testing.
 * Each token has decimals=0, supply=1, mint authority revoked — valid
 * input for the commoners-auction list_slot instruction.
 *
 * Also lowers min_reserve_lamports to 0.01 SOL so testing doesn't
 * require large balances.
 *
 * Usage:
 *   cd commoners-auction
 *   npx ts-node scripts/mint-devnet-nfts.ts
 *
 * Output: scripts/devnet-nfts.json
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CommonersAuction } from "../target/types/commoners_auction";

const IDL = require("../target/idl/commoners_auction.json");
const PROGRAM_ID = new PublicKey("EWXiRHrYNtMy6wXQsy2oZhops6Dsw5M4GT59Bqb3xPjC");
const RPC = "https://api.devnet.solana.com";
const KEYPAIR_PATH = path.join(os.homedir(), ".config/solana/id.json");

// Devnet test NFTs — using real MidEvil display data so the site renders them
// with proper artwork while we test the on-chain flow.
const NFT_DEFS = [
  {
    name: "MidEvil #44 (Devnet)",
    traits: ["Blue", "Ape", "Chain Mail"],
    image: "https://magiceden-launchpad.mypinata.cloud/ipfs/bafybeifckj3kctgo6oztxbcrkg2vumodyvcbfkga3pnoeazrcv5wrc26je/43.png",
  },
  {
    name: "MidEvil #76 (Devnet)",
    traits: ["Brown", "Tiger", "Bear Suit"],
    image: "https://magiceden-launchpad.mypinata.cloud/ipfs/bafybeifckj3kctgo6oztxbcrkg2vumodyvcbfkga3pnoeazrcv5wrc26je/75.png",
  },
  {
    name: "MidEvil #79 (Devnet)",
    traits: ["Tan", "Gorilla", "Wolf of Camelot"],
    image: "https://magiceden-launchpad.mypinata.cloud/ipfs/bafybeifckj3kctgo6oztxbcrkg2vumodyvcbfkga3pnoeazrcv5wrc26je/78.png",
  },
  {
    name: "MidEvil #130 (Devnet)",
    traits: ["Tan", "Creature", "Chain Mail"],
    image: "https://magiceden-launchpad.mypinata.cloud/ipfs/bafybeifckj3kctgo6oztxbcrkg2vumodyvcbfkga3pnoeazrcv5wrc26je/129.png",
  },
  {
    name: "MidEvil #204 (Devnet)",
    traits: ["Brown", "Bear", "Bear Suit"],
    image: "https://magiceden-launchpad.mypinata.cloud/ipfs/bafybeifckj3kctgo6oztxbcrkg2vumodyvcbfkga3pnoeazrcv5wrc26je/203.png",
  },
];

async function main() {
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const connection = new Connection(RPC, "confirmed");

  console.log("Admin wallet:", payer.publicKey.toBase58());
  const balance = await connection.getBalance(payer.publicKey);
  console.log("Balance:", (balance / 1e9).toFixed(4), "SOL\n");

  // ── Lower min_reserve_lamports to 0.01 SOL for easier devnet testing ──────
  const provider = new AnchorProvider(
    connection,
    new Wallet(payer),
    { commitment: "confirmed" }
  );
  const program = new Program<CommonersAuction>(IDL, provider);

  console.log("Lowering min_reserve_lamports to 0.01 SOL…");
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-config")],
    PROGRAM_ID
  );
  await program.methods
    .updateParams(null, null, null, new BN(10_000_000), null, null)
    .accounts({ admin: payer.publicKey, config })
    .rpc();
  console.log("✓ min_reserve_lamports = 10,000,000 (0.01 SOL)\n");

  // ── Mint 5 devnet NFTs ─────────────────────────────────────────────────────
  const minted: Array<{ mint: string; name: string; traits: string[]; image: string }> = [];

  for (const nft of NFT_DEFS) {
    process.stdout.write(`Minting ${nft.name}… `);

    // Create mint: decimals=0
    const mint = await createMint(
      connection,
      payer,            // fee payer
      payer.publicKey,  // mint authority
      null,             // no freeze authority
      0                 // decimals
    );

    // Get/create ATA for payer
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      payer.publicKey
    );

    // Mint exactly 1 token
    await mintTo(connection, payer, mint, ata.address, payer, 1);

    // Revoke mint authority (makes it non-fungible)
    await setAuthority(
      connection,
      payer,
      mint,
      payer.publicKey,
      AuthorityType.MintTokens,
      null
    );

    const entry = { mint: mint.toBase58(), ...nft };
    minted.push(entry);
    console.log(`✓ ${mint.toBase58()}`);
  }

  // ── Write devnet-nfts.json ─────────────────────────────────────────────────
  const outPath = path.join(__dirname, "devnet-nfts.json");
  fs.writeFileSync(outPath, JSON.stringify(minted, null, 2));
  console.log(`\nWritten to ${outPath}`);

  // ── Print auction-schedule.json patch ─────────────────────────────────────
  // Map the 5 mints to the next 5 upcoming dates starting tomorrow.
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  console.log("\n=== Paste these nftId values into data/auction-schedule.json ===");
  for (let i = 0; i < minted.length; i++) {
    const d = new Date(tomorrow);
    d.setUTCDate(tomorrow.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    console.log(`"${dateStr}": { nftId: "${minted[i].mint}" }  // ${minted[i].name}`);
  }

  console.log("\nDone! Run `npx ts-node scripts/create-auction.ts` to open bidding.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
