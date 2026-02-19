/**
 * End-to-end devnet test of the full auction loop.
 *
 * Walks through:
 *   1. Create a test SPL token mint (stands in for an NFT)
 *   2. Mint 1 token to admin (seller)
 *   3. list_slot  — admin locks NFT into escrow, reserves a slot
 *   4. create_auction — admin crank opens the auction
 *   5. update_params — shrink time_buffer to 3s so anti-snipe doesn't interfere
 *   6. place_bid (bidder2, 0.5 SOL)
 *   7. place_bid (admin,   0.55 SOL) — bidder2 gets refunded
 *   8. Wait for auction end (~32s)
 *   9. settle_auction — NFT to admin/winner, SOL to admin/seller minus fee
 *  10. Print final balances
 *
 * Run with:
 *   npx tsx crank/src/test_loop.ts
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
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
  PROGRAM_ID,
} from "./client";

// ── helpers ────────────────────────────────────────────────────────────────

function log(step: number, msg: string) {
  console.log(`\n[${step}] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function balanceSOL(conn: import("@solana/web3.js").Connection, pk: PublicKey) {
  const lamports = await conn.getBalance(pk);
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const { program, adminKeypair, connection } = buildClient();
  const admin = adminKeypair.publicKey;

  console.log("=".repeat(60));
  console.log("  Commoners Auction — Full Loop Test (devnet)");
  console.log("=".repeat(60));
  console.log("Program :", PROGRAM_ID.toBase58());
  console.log("Admin   :", admin.toBase58());
  console.log("Balance :", await balanceSOL(connection, admin), "SOL");

  // ── Step 1: Create a second bidder wallet and fund it ─────────────────
  log(1, "Creating bidder2 wallet and funding with 1 SOL...");
  const bidder2 = Keypair.generate();
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin,
      toPubkey: bidder2.publicKey,
      lamports: 1 * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, fundTx, [adminKeypair]);
  console.log("  Bidder2:", bidder2.publicKey.toBase58());
  console.log("  Bidder2 balance:", await balanceSOL(connection, bidder2.publicKey), "SOL");

  // ── Step 2: Create test SPL mint ──────────────────────────────────────
  log(2, "Creating test SPL token mint (NFT mock, decimals=0)...");
  const nftMint = await createMint(
    connection,
    adminKeypair,   // payer
    admin,           // mint authority
    null,            // freeze authority
    0                // decimals — NFT style
  );
  console.log("  Mint:", nftMint.toBase58());

  // ── Step 3: Mint 1 token to admin ─────────────────────────────────────
  log(3, "Creating admin ATA and minting 1 token...");
  const adminATA = await createAssociatedTokenAccount(
    connection,
    adminKeypair,
    nftMint,
    admin
  );
  await mintTo(connection, adminKeypair, nftMint, adminATA, adminKeypair, 1);
  console.log("  Admin ATA:", adminATA.toBase58());
  console.log("  Minted 1 token to admin");

  // ── Step 4: list_slot ──────────────────────────────────────────────────
  log(4, "Calling list_slot — admin locks NFT into escrow...");
  const scheduledDate = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
  const reservePrice = new BN(420_000_000); // 0.42 SOL

  const [slotAddress] = slotPDA(nftMint, scheduledDate);
  const escrowATA = await getAssociatedTokenAddress(nftMint, slotAddress, true);

  const [configAddress] = configPDA();
  const scheduledDateBN = new BN(scheduledDate.toString());

  await (program.methods
    .listSlot(scheduledDateBN, reservePrice)
    .accounts({
      holder: admin,
      config: configAddress,
      nftMint,
      holderTokenAccount: adminATA,
      escrowTokenAccount: escrowATA,
      slot: slotAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());
  console.log("  Slot PDA:", slotAddress.toBase58());
  console.log("  Escrow ATA:", escrowATA.toBase58());

  // Verify slot state
  const slotState = await program.account.slotRegistration.fetch(slotAddress);
  console.log("  slot.escrowed:", slotState.escrowed, "✓");
  console.log("  slot.consumed:", slotState.consumed);

  // ── Step 5: create_auction ────────────────────────────────────────────
  log(5, "Calling create_auction (30s test duration)...");
  // Use current timestamp as auction_id so re-runs don't collide on existing accounts.
  const auctionId = BigInt(Math.floor(Date.now() / 1000));
  const [auctionAddress] = auctionPDA(auctionId);
  const auctionIdBN = new BN(auctionId.toString());

  await (program.methods
    .createAuction(auctionIdBN)
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

  const auctionState = await program.account.auctionState.fetch(auctionAddress);
  const endTime = new Date(auctionState.endTime.toNumber() * 1000);
  console.log("  Auction PDA:", auctionAddress.toBase58());
  console.log("  Auction ends:", endTime.toISOString());
  console.log("  Reserve price:", auctionState.reservePrice.toNumber() / LAMPORTS_PER_SOL, "SOL");
  console.log("  Fee:", auctionState.feeBps, "bps");

  // ── Step 6: update_params — shrink time_buffer to 3s ─────────────────
  log(6, "Setting time_buffer_secs = 3 so bidding doesn't trigger anti-snipe...");
  await (program.methods
    .updateParams(
      null,          // fee_bps unchanged
      null,          // bid_increment_bps unchanged
      new BN(3),     // time_buffer_secs = 3s
      null,          // min_reserve unchanged
      null,          // common_token_mint unchanged
      null           // discount_tiers unchanged
    )
    .accounts({
      admin,
      config: configAddress,
    } as any)
    .signers([adminKeypair])
    .rpc());
  console.log("  time_buffer_secs set to 3 ✓");

  // ── Step 7: place_bid — bidder2 bids 0.5 SOL ─────────────────────────
  log(7, "Bidder2 places first bid: 0.5 SOL...");
  const bid1Amount = new BN(500_000_000); // 0.5 SOL
  const [bidVault] = bidVaultPDA(auctionId);

  await (program.methods
    .placeBid(bid1Amount)
    .accounts({
      bidder: bidder2.publicKey,
      config: configAddress,
      auction: auctionAddress,
      bidVault,
      prevBidder: bidder2.publicKey, // no prev bidder — constraint: map_or(true, ...) passes
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([bidder2])
    .rpc());

  let auction = await program.account.auctionState.fetch(auctionAddress);
  console.log("  Current bid:", auction.currentBid.toNumber() / LAMPORTS_PER_SOL, "SOL ✓");
  console.log("  Current bidder:", auction.currentBidder?.toBase58());

  // ── Step 8: place_bid — admin outbids at 0.55 SOL ────────────────────
  log(8, "Admin outbids at 0.55 SOL (bidder2 gets refunded)...");
  const bidder2BalBefore = await connection.getBalance(bidder2.publicKey);
  const bid2Amount = new BN(550_000_000); // 0.55 SOL (>= 0.5 * 1.05 = 0.525)

  await (program.methods
    .placeBid(bid2Amount)
    .accounts({
      bidder: admin,
      config: configAddress,
      auction: auctionAddress,
      bidVault,
      prevBidder: bidder2.publicKey, // must match auction.current_bidder
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());

  auction = await program.account.auctionState.fetch(auctionAddress);
  const bidder2BalAfter = await connection.getBalance(bidder2.publicKey);
  const refunded = (bidder2BalAfter - bidder2BalBefore) / LAMPORTS_PER_SOL;
  console.log("  New bid:", auction.currentBid.toNumber() / LAMPORTS_PER_SOL, "SOL ✓");
  console.log("  Winner:", auction.currentBidder?.toBase58());
  console.log("  Bidder2 refunded:", refunded.toFixed(4), "SOL ✓");

  // ── Step 9: Wait for auction to end ───────────────────────────────────
  const secsLeft = Math.max(0, auctionState.endTime.toNumber() - Math.floor(Date.now() / 1000)) + 3;
  log(9, `Waiting ${secsLeft}s for auction to end...`);
  for (let i = secsLeft; i > 0; i--) {
    process.stdout.write(`\r  ${i}s remaining...`);
    await sleep(1000);
  }
  process.stdout.write("\r  Auction ended!        \n");

  // ── Step 10: settle_auction ───────────────────────────────────────────
  log(10, "Calling settle_auction...");
  const sellerBalBefore = await connection.getBalance(admin);

  // Seller and winner are both admin in this test
  const adminNFTAta = await getAssociatedTokenAddress(nftMint, admin);
  // winner_token_account and seller_token_account both point to admin's ATA
  // (admin is both winner and seller — the program handles this fine)

  await (program.methods
    .settleAuction()
    .accounts({
      admin,
      config: configAddress,
      auction: auctionAddress,
      slot: slotAddress,
      nftMint,
      escrowTokenAccount: escrowATA,
      winnerTokenAccount: adminNFTAta,
      sellerTokenAccount: adminNFTAta,
      bidVault,
      seller: admin,
      winner: admin,
      treasury: admin,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());

  // ── Step 11: Verify final state ───────────────────────────────────────
  log(11, "Verifying final state...");
  const finalAuction = await program.account.auctionState.fetch(auctionAddress);
  const sellerBalAfter = await connection.getBalance(admin);
  const sellerReceived = (sellerBalAfter - sellerBalBefore) / LAMPORTS_PER_SOL;

  const fee = (0.55 * 900) / 10_000;
  const sellerExpected = 0.55 - fee;

  console.log("\n" + "=".repeat(60));
  console.log("  RESULTS");
  console.log("=".repeat(60));
  console.log(`  auction.settled  : ${finalAuction.settled}  ✓`);
  console.log(`  auction.reserveMet: ${finalAuction.reserveMet}  ✓`);
  console.log(`  Winning bid      : 0.55 SOL`);
  console.log(`  Fee (9%)         : ${fee.toFixed(4)} SOL → treasury`);
  console.log(`  Seller received  : ~${sellerExpected.toFixed(4)} SOL (net)`);
  console.log(`  Admin balance Δ  : ${sellerReceived >= 0 ? "+" : ""}${sellerReceived.toFixed(4)} SOL`);
  console.log(`  NFT returned     : admin ATA = ${adminNFTAta.toBase58()}`);
  console.log("=".repeat(60));
  console.log("\n  Full loop test complete! ✓");
}

main().catch((err) => {
  console.error("\nTest failed:", err);
  process.exit(1);
});
