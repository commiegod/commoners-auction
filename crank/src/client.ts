/**
 * Shared Anchor provider + program client.
 * All crank scripts import from here.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { CommonersAuction } from "../../target/types/commoners_auction";
import idl from "../../target/idl/commoners_auction.json";

// ---------------------------------------------------------------------------
// Config — override with env vars in production
// ---------------------------------------------------------------------------
export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID ?? "EWXiRHrYNtMy6wXQsy2oZhops6Dsw5M4GT59Bqb3xPjC"
);

const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const KEYPAIR_PATH =
  process.env.ADMIN_KEYPAIR_PATH ??
  path.join(process.env.HOME!, ".config/solana/id.json");

// ---------------------------------------------------------------------------
// Build provider + typed program client
// ---------------------------------------------------------------------------
export function buildClient() {
  // In CI: set ADMIN_KEYPAIR_JSON to the raw JSON array string.
  // Locally: falls back to the keypair file at KEYPAIR_PATH.
  const keypairBytes: number[] = process.env.ADMIN_KEYPAIR_JSON
    ? JSON.parse(process.env.ADMIN_KEYPAIR_JSON)
    : JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairBytes));

  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new anchor.Program<CommonersAuction>(
    idl as anchor.Idl,
    provider
  ) as anchor.Program<CommonersAuction>;

  return { provider, program, adminKeypair, connection };
}

// ---------------------------------------------------------------------------
// PDA helpers — mirrors the seeds in the Rust program
// ---------------------------------------------------------------------------
export function configPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("program-config")],
    PROGRAM_ID
  );
}

export function auctionPDA(auctionId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(auctionId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("auction"), buf],
    PROGRAM_ID
  );
}

export function bidVaultPDA(auctionId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(auctionId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bid-vault"), buf],
    PROGRAM_ID
  );
}

export function slotPDA(
  nftMint: PublicKey,
  scheduledDate: bigint
): [PublicKey, number] {
  const dateBuf = Buffer.alloc(8);
  dateBuf.writeBigInt64LE(scheduledDate);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("slot"), nftMint.toBuffer(), dateBuf],
    PROGRAM_ID
  );
}
