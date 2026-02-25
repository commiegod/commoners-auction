/**
 * Daily crank — runs once per day at 00:05 UTC via GitHub Actions.
 *
 * 1. Settles yesterday's auction (if it ended and wasn't settled yet).
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

async function main() {
  const { program, adminKeypair } = buildClient();
  const admin = adminKeypair.publicKey;

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
  const yesterdayStr = isoDate(new Date(now.getTime() - 86_400_000));

  const [configAddress] = configPDA();

  console.log("=".repeat(60));
  console.log(`  Daily Crank — ${todayStr}`);
  console.log("=".repeat(60));

  // ── 1. Settle yesterday ───────────────────────────────────────────────────
  const yesterdayEntry = schedule[yesterdayStr];
  if (yesterdayEntry) {
    console.log(`\n[settle] ${yesterdayEntry.name} (${yesterdayStr})`);
    const nftMint = new PublicKey(yesterdayEntry.nftId);
    const scheduledDate = midnightUTC(yesterdayStr);
    const auctionId = scheduledDate;
    const [slotAddress] = slotPDA(nftMint, scheduledDate);
    let [auctionAddress] = auctionPDA(auctionId);
    let [bidVaultAddress] = bidVaultPDA(auctionId);

    let auction: Awaited<
      ReturnType<typeof program.account.auctionState.fetch>
    > | null = null;
    // Primary: deterministic PDA keyed by scheduled midnight timestamp
    try {
      auction = await program.account.auctionState.fetch(auctionAddress);
    } catch {
      // Fallback: scan all AuctionState accounts for this mint.
      // Handles auctions created with non-deterministic IDs (e.g. create-auction.ts).
      const AUCTION_STATE_SIZE = 150;
      const rawAccounts = await (program.provider as any).connection.getProgramAccounts(
        program.programId,
        {
          filters: [
            { dataSize: AUCTION_STATE_SIZE },
            { memcmp: { offset: 8, bytes: nftMint.toBase58() } },
          ],
        }
      );
      for (const { pubkey, account } of rawAccounts) {
        try {
          const decoded = program.coder.accounts.decode("AuctionState", account.data);
          if (!decoded.settled) {
            auction = decoded;
            auctionAddress = pubkey;
            [bidVaultAddress] = bidVaultPDA(BigInt(decoded.auction_id.toString()));
            break;
          }
        } catch {}
      }
      if (!auction) {
        console.log("  No auction account found — skipping.");
      }
    }

    if (auction) {
      if (auction.settled) {
        console.log("  Already settled.");
      } else if (auction.endTime.toNumber() > Math.floor(Date.now() / 1000)) {
        console.log("  Auction hasn't ended yet — skipping.");
      } else {
        const config =
          await program.account.programConfig.fetch(configAddress);
        const winner = (auction.currentBidder as PublicKey | null) ?? admin;
        const seller = auction.seller as PublicKey;

        const escrowTokenAccount = await getAssociatedTokenAddress(
          nftMint,
          slotAddress,
          true
        );
        const winnerTokenAccount = await getAssociatedTokenAddress(
          nftMint,
          winner
        );
        const sellerTokenAccount = await getAssociatedTokenAddress(
          nftMint,
          seller
        );

        const tx = await (program.methods
          .settleAuction()
          .accounts({
            admin,
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
          .signers([adminKeypair])
          .rpc());

        const bidSol =
          (auction.currentBid as BN).toNumber() / LAMPORTS_PER_SOL;
        console.log(
          `  Winner  : ${winner.toBase58()}`
        );
        console.log(`  Bid     : ${bidSol} SOL`);
        console.log(`  Tx      : ${tx}`);
      }
    }
  } else {
    console.log(`\n[settle] No entry for ${yesterdayStr} — nothing to settle.`);
  }

  // ── 2. Create today's auction ─────────────────────────────────────────────
  //
  // Source of truth: on-chain SlotRegistration accounts for today's midnight.
  // The JSON schedule is used as metadata enrichment only (name label in logs).
  // This allows the crank to run correctly even when the JSON schedule has a
  // wrong nftId for today, or no entry at all.

  const scheduledDate = midnightUTC(todayStr);
  const auctionId = scheduledDate;
  const todayTs = Number(scheduledDate);

  let nftMint: PublicKey | null = null;
  let createLabel = todayStr;

  // Scan on-chain SlotRegistration accounts for today's date (primary)
  console.log(`\n[create] Scanning on-chain slots for ${todayStr}…`);
  const SLOT_SIZE = 91;
  const slotAccounts = await (program.provider as any).connection.getProgramAccounts(
    program.programId,
    { filters: [{ dataSize: SLOT_SIZE }] }
  );
  for (const { account } of slotAccounts) {
    try {
      const decoded = program.coder.accounts.decode("SlotRegistration", account.data);
      const ts = decoded.scheduledDate.toNumber();
      if (ts === todayTs && decoded.escrowed && !decoded.consumed) {
        nftMint = decoded.nftMint as PublicKey;
        // Enrich label from JSON schedule if available
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

  // Idempotent — skip if already created
  try {
    const existing = await program.account.auctionState.fetch(auctionAddress);
    console.log(`  Already exists (settled=${existing.settled}) — skipping.`);
    return;
  } catch {
    // Expected: account doesn't exist yet, proceed.
  }

  try {
    const tx = await (program.methods
      .createAuction(new BN(auctionId.toString()))
      .accounts({
        admin,
        config: configAddress,
        nftMint,
        slot: slotAddress,
        auction: auctionAddress,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([adminKeypair])
      .rpc());

    console.log(`  Auction PDA : ${auctionAddress.toBase58()}`);
    console.log(`  Auction ID  : ${auctionId}`);
    console.log(`  Tx          : ${tx}`);
  } catch (err: any) {
    // Slot not yet listed — warn but don't fail the whole workflow.
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
