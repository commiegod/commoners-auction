/**
 * Daily crank — runs once per day at 00:05 UTC via GitHub Actions.
 *
 * 1. Settles ALL ended, unsettled auctions (not just yesterday's).
 * 2. Creates today's auction (if the slot is registered and ready).
 *
 * Convention:
 *   scheduledDate = Unix timestamp of midnight UTC for the date.
 *   auctionId     = same value (deterministic, unique per day).
 *
 * Environment variables:
 *   SCHEDULE_PATH       Path to auction-schedule.json
 *   ADMIN_KEYPAIR_JSON  JSON array of keypair bytes (for CI)
 *   ADMIN_KEYPAIR_PATH  Path to keypair file (local fallback)
 *   SOLANA_RPC_URL      RPC endpoint (default: devnet)
 *   CRANK_DATE          Override "today" for testing (YYYY-MM-DD)
 */
import fs from "fs";
import path from "path";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import idlJson from "../idl.json";
import {
  buildClient,
  configPDA,
  auctionPDA,
  bidVaultPDA,
  slotPDA,
} from "./client";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Unix timestamp of midnight UTC for a "YYYY-MM-DD" date string. */
function midnightUTC(dateStr: string): bigint {
  return BigInt(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface ScheduleEntry {
  nftId: string;
  name: string;
  image: string;
  traits: string[];
  seller: string | null;
}
type Schedule = Record<string, ScheduleEntry>;

// ── main ─────────────────────────────────────────────────────────────────────

/**
 * DRY_RUN=true  — build every instruction (validates IDL arg count/types)
 *                  but never send a transaction. Safe to run any time.
 */
const DRY_RUN = process.env.DRY_RUN === "true";

/** Execute or dry-run a prepared MethodsBuilder. Returns sig or null. */
async function send(builder: any): Promise<string | null> {
  if (DRY_RUN) {
    await builder.instruction(); // throws immediately if IDL args are wrong
    return null;
  }
  return builder.rpc();
}

async function main() {
  const { program, adminKeypair } = buildClient();
  const admin = adminKeypair.publicKey;

  if (DRY_RUN) console.log("  *** DRY RUN — no transactions will be sent ***\n");

  const schedulePath =
    process.env.SCHEDULE_PATH ??
    path.resolve(__dirname, "../../../web/data/auction-schedule.json");

  const schedule: Schedule = JSON.parse(
    fs.readFileSync(schedulePath, "utf-8")
  );

  // CRANK_DATE overrides "today" for testing (format: YYYY-MM-DD)
  const now = process.env.CRANK_DATE
    ? new Date(process.env.CRANK_DATE + "T00:00:00Z")
    : new Date();
  const todayStr = isoDate(now);
  const nowTs = Math.floor(Date.now() / 1000);

  const [configAddress] = configPDA();
  const coder = new anchor.BorshAccountsCoder(idlJson as anchor.Idl);

  // Build a mint → name map from the JSON schedule for log labels
  const mintToName: Record<string, string> = {};
  for (const entry of Object.values(schedule)) {
    mintToName[entry.nftId] = entry.name;
  }

  console.log("=".repeat(60));
  console.log(`  Daily Crank — ${todayStr}`);
  console.log("=".repeat(60));

  // ── 1. Settle ALL ended, unsettled auctions ───────────────────────────────
  //
  // Scans every AuctionState account on-chain. Any that are !settled and
  // end_time <= now get settled. No dependency on the JSON schedule.

  console.log("\n[settle] Scanning for ended auctions…");

  const AUCTION_STATE_SIZE = 150;
  const allAuctions = await (program.provider as any).connection.getProgramAccounts(
    program.programId,
    { filters: [{ dataSize: AUCTION_STATE_SIZE }] }
  );

  let settledCount = 0;

  // Fetch config once (needed for treasury address)
  const config = await program.account.programConfig.fetch(configAddress);

  for (const { pubkey: auctionAddress, account } of allAuctions) {
    let decoded: any;
    try {
      decoded = coder.decode("AuctionState", account.data);
    } catch {
      continue;
    }

    if (decoded.settled) continue;
    if (decoded.end_time.toNumber() > nowTs) continue;

    const nftMint = decoded.nft_mint as PublicKey;
    const auctionId = BigInt(decoded.auction_id.toString());
    const [slotAddress] = slotPDA(nftMint, auctionId);
    const [bidVaultAddress] = bidVaultPDA(auctionId);

    const winner = (decoded.current_bidder as PublicKey | null) ?? admin;
    const seller = decoded.seller as PublicKey;

    const label = mintToName[nftMint.toBase58()] ?? nftMint.toBase58().slice(0, 8) + "…";
    const endedAt = new Date(decoded.end_time.toNumber() * 1000).toISOString();
    console.log(`\n  ${label} (ended ${endedAt})`);

    const escrowTokenAccount = await getAssociatedTokenAddress(nftMint, slotAddress, true);
    const winnerTokenAccount = await getAssociatedTokenAddress(nftMint, winner);
    const sellerTokenAccount = await getAssociatedTokenAddress(nftMint, seller);

    try {
      const builder = program.methods
        .settleAuction()
        .accounts({
          payer: admin,
          config: configAddress,
          auction: auctionAddress,
          slot: slotAddress,
          nftMint,
          escrowTokenAccount,
          winnerTokenAccount,
          sellerTokenAccount,
          bidVault: bidVaultAddress,
          seller,
          winner,
          treasury: config.treasury as PublicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([adminKeypair]);

      const tx = await send(builder);
      const bidSol = (decoded.current_bid as BN).toNumber() / LAMPORTS_PER_SOL;
      console.log(`  Winner  : ${winner.toBase58()}`);
      console.log(`  Bid     : ${bidSol} SOL`);
      if (tx) console.log(`  Tx      : ${tx}`);
      else    console.log(`  [DRY RUN] settle instruction ok`);
      settledCount++;
    } catch (err: any) {
      console.error(`  Settle failed: ${err.message}`);
    }
  }

  if (settledCount === 0) {
    console.log("  Nothing to settle.");
  }

  // ── 2. Create today's auction ─────────────────────────────────────────────
  //
  // Source of truth: on-chain SlotRegistration accounts for today's midnight.
  // The JSON schedule is used as metadata enrichment only (name label in logs).

  const scheduledDate = midnightUTC(todayStr);
  const auctionId = scheduledDate;
  const todayTs = Number(scheduledDate);

  // Auction always ends at next midnight UTC — deterministic regardless of
  // when this crank actually runs (GitHub Actions can delay up to ~3 hours).
  const tomorrowStr = isoDate(new Date(now.getTime() + 86_400_000));
  const endTime = Number(midnightUTC(tomorrowStr));

  let nftMint: PublicKey | null = null;
  let createLabel = todayStr;

  console.log(`\n[create] Scanning on-chain slots for ${todayStr}…`);
  const SLOT_SIZE = 91;
  const slotAccounts = await (program.provider as any).connection.getProgramAccounts(
    program.programId,
    { filters: [{ dataSize: SLOT_SIZE }] }
  );

  for (const { account } of slotAccounts) {
    try {
      const decoded = coder.decode("SlotRegistration", account.data);
      const ts = decoded.scheduled_date.toNumber();
      if (ts === todayTs && decoded.escrowed && !decoded.consumed) {
        nftMint = decoded.nft_mint as PublicKey;
        const jsonEntry = Object.values(schedule).find(
          (e) => e.nftId === nftMint!.toBase58()
        );
        createLabel = jsonEntry
          ? `${jsonEntry.name} (${todayStr})`
          : `${nftMint.toBase58().slice(0, 8)}… (${todayStr})`;
        break;
      }
    } catch {}
  }

  // Fall back to JSON schedule if no on-chain slot found
  if (!nftMint) {
    const todayEntry = schedule[todayStr];
    if (todayEntry) {
      console.log(`  No on-chain slot found — trying JSON fallback…`);
      nftMint = new PublicKey(todayEntry.nftId);
      createLabel = `${todayEntry.name} (${todayStr}) [JSON fallback]`;
    }
  }

  if (!nftMint) {
    console.log(`  No slot registered for ${todayStr} — nothing to create.`);
    console.log("\nDone.");
    return;
  }

  console.log(`\n[create] ${createLabel}`);
  const [slotAddress] = slotPDA(nftMint, scheduledDate);
  const [auctionAddress] = auctionPDA(auctionId);

  // Idempotent — skip if already created (skip check in dry-run so we always
  // exercise the instruction builder, which is what validates IDL arg count)
  if (!DRY_RUN) {
    try {
      const existing = await program.account.auctionState.fetch(auctionAddress);
      console.log(`  Already exists (settled=${existing.settled}) — skipping.`);
      console.log("\nDone.");
      return;
    } catch {
      // Expected: account doesn't exist yet, proceed.
    }
  }

  try {
    const builder = program.methods
      .createAuction(new BN(auctionId.toString()), new BN(endTime))
      .accounts({
        admin,
        config: configAddress,
        nftMint,
        slot: slotAddress,
        auction: auctionAddress,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([adminKeypair]);

    const tx = await send(builder);
    console.log(`  Auction PDA : ${auctionAddress.toBase58()}`);
    console.log(`  Auction ID  : ${auctionId}`);
    console.log(`  End time    : ${new Date(endTime * 1000).toISOString()} (${tomorrowStr} 00:00 UTC)`);
    if (tx) console.log(`  Tx          : ${tx}`);
    else    console.log(`  [DRY RUN] createAuction instruction ok`);
  } catch (err: any) {
    if (err?.error?.errorCode?.code === "AccountNotInitialized") {
      console.log(
        `  Slot not initialized — NFT not listed yet. Skipping create.`
      );
    } else {
      throw err;
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nDaily crank failed:", err);
  process.exit(1);
});
