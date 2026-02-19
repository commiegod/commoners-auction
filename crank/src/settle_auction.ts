/**
 * Settlement crank — called after an auction's end_time has passed.
 *
 * If reserve was met:  NFT → winner, SOL → seller (minus fee) + treasury
 * If reserve not met:  NFT → seller, no SOL moves
 *
 * Usage:
 *   AUCTION_ID=1 npx tsx crank/src/settle_auction.ts
 */
import {
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import { buildClient, configPDA, auctionPDA, bidVaultPDA, PROGRAM_ID } from "./client";

async function main() {
  const { program, adminKeypair, connection } = buildClient();

  const auctionId = BigInt(process.env.AUCTION_ID ?? (() => { throw new Error("AUCTION_ID required"); })());

  const [configAddress] = configPDA();
  const [auctionAddress] = auctionPDA(auctionId);
  const [bidVault] = bidVaultPDA(auctionId);

  // Fetch current auction state
  const auction = await program.account.auctionState.fetch(auctionAddress);

  const now = Math.floor(Date.now() / 1000);
  if (auction.endTime.toNumber() > now) {
    console.error(`Auction #${auctionId} has not ended yet.`);
    console.error(`  Ends at: ${new Date(auction.endTime.toNumber() * 1000).toISOString()}`);
    process.exit(1);
  }
  if (auction.settled) {
    console.log(`Auction #${auctionId} is already settled.`);
    process.exit(0);
  }

  const nftMint: PublicKey = auction.nftMint;
  const seller: PublicKey = auction.seller;
  const winner: PublicKey = auction.currentBidder ?? seller; // fallback to seller if no bids

  // Fetch config for treasury address
  const config = await program.account.programConfig.fetch(configAddress);
  const treasury: PublicKey = config.treasury;

  // Derive slot PDA — we need it for the NFT authority on no-reserve path
  // The slot is stored by (nft_mint, scheduled_date). We fetch via the auction's seller.
  // Simplest approach: scan SlotRegistration accounts for this mint.
  // For the crank, pass SLOT_ADDRESS explicitly to avoid the scan.
  const slotAddress = new PublicKey(
    process.env.SLOT_ADDRESS ?? (() => { throw new Error("SLOT_ADDRESS required"); })()
  );
  const slot = await program.account.slotRegistration.fetch(slotAddress);

  // Derive ATAs
  const escrowTokenAccount = await getAssociatedTokenAddress(
    nftMint, slotAddress, true
  );
  const winnerTokenAccount = await getAssociatedTokenAddress(nftMint, winner);
  const sellerTokenAccount = await getAssociatedTokenAddress(nftMint, seller);

  const reserveMet = auction.currentBidder !== null;

  console.log("Settling auction...");
  console.log("  Auction ID   :", auctionId.toString());
  console.log("  Seller       :", seller.toBase58());
  console.log("  Winner       :", reserveMet ? winner.toBase58() : "(none — reserve not met)");
  console.log("  Current bid  :", auction.currentBid.toString(), "lamports");
  console.log("  Reserve met  :", reserveMet);

  const tx = await (program.methods
    .settleAuction()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .accounts({
      admin: adminKeypair.publicKey,
      config: configAddress,
      auction: auctionAddress,
      slot: slotAddress,
      nftMint,
      escrowTokenAccount,
      winnerTokenAccount,
      sellerTokenAccount,
      bidVault,
      seller,
      winner,
      treasury,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());

  console.log("\nAuction settled!");
  console.log("  Transaction :", tx);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
