/**
 * Daily crank — creates an auction for the NFT registered in a slot.
 *
 * Called once per day by a scheduler (cron, GitHub Actions, etc.)
 * for the slot whose scheduled_date matches today.
 *
 * Usage:
 *   AUCTION_ID=1 SLOT_ADDRESS=<base58> NFT_MINT=<base58> \
 *     npx tsx crank/src/create_auction.ts
 */
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { buildClient, configPDA, auctionPDA, PROGRAM_ID } from "./client";

async function main() {
  const { program, adminKeypair } = buildClient();

  const auctionId = BigInt(process.env.AUCTION_ID ?? "1");
  const slotAddress = new PublicKey(
    process.env.SLOT_ADDRESS ?? (() => { throw new Error("SLOT_ADDRESS required"); })()
  );
  const nftMint = new PublicKey(
    process.env.NFT_MINT ?? (() => { throw new Error("NFT_MINT required"); })()
  );

  const [configAddress] = configPDA();
  const [auctionAddress] = auctionPDA(auctionId);

  console.log("Creating auction...");
  console.log("  Auction ID    :", auctionId.toString());
  console.log("  Slot          :", slotAddress.toBase58());
  console.log("  NFT Mint      :", nftMint.toBase58());
  console.log("  Auction PDA   :", auctionAddress.toBase58());

  const auctionIdBN = new BN(auctionId.toString());

  const { SystemProgram } = await import("@solana/web3.js");

  const tx = await (program.methods
    .createAuction(auctionIdBN)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .accounts({
      admin: adminKeypair.publicKey,
      config: configAddress,
      nftMint,
      slot: slotAddress,
      auction: auctionAddress,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());

  console.log("\nAuction created!");
  console.log("  Auction address :", auctionAddress.toBase58());
  console.log("  Transaction     :", tx);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
