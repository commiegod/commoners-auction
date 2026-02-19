/**
 * List-slot crank — registers an NFT into escrow for a scheduled auction date.
 * Called by the NFT holder (or admin for testing) before the auction day.
 *
 * Usage:
 *   # Create a fresh test mint and register it (devnet only):
 *   NEW_MINT=1 SLOT_DATE=2026-02-19 npx tsx crank/src/list_slot.ts
 *
 *   # Register an existing mint you already hold:
 *   NFT_MINT=<base58> SLOT_DATE=2026-02-19 npx tsx crank/src/list_slot.ts
 *
 * Environment variables:
 *   SLOT_DATE           YYYY-MM-DD date to schedule (required)
 *   NFT_MINT            Mint address you hold (required unless NEW_MINT=1)
 *   NEW_MINT            Set to "1" to create + mint a fresh test token
 *   RESERVE_PRICE_SOL   Reserve price in SOL (default: 0.42)
 */
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import { buildClient, configPDA, slotPDA } from "./client";

async function main() {
  const { program, adminKeypair, connection } = buildClient();
  const admin = adminKeypair.publicKey;

  const slotDateStr =
    process.env.SLOT_DATE ??
    (() => {
      throw new Error("SLOT_DATE required (format: YYYY-MM-DD)");
    })();

  // Convention: scheduledDate = midnight UTC of the date
  const scheduledDate = BigInt(
    new Date(slotDateStr + "T00:00:00Z").getTime() / 1000
  );

  const reservePrice = new BN(
    Math.round(
      parseFloat(process.env.RESERVE_PRICE_SOL ?? "0.42") * LAMPORTS_PER_SOL
    )
  );

  let nftMint: PublicKey;

  if (process.env.NEW_MINT === "1") {
    console.log("Creating test SPL mint (decimals=0, NFT-style)...");
    nftMint = await createMint(
      connection,
      adminKeypair,
      admin, // mint authority
      null,  // freeze authority
      0      // decimals
    );
    const ata = await createAssociatedTokenAccount(
      connection,
      adminKeypair,
      nftMint,
      admin
    );
    await mintTo(connection, adminKeypair, nftMint, ata, adminKeypair, 1);
    console.log("  Mint :", nftMint.toBase58());
    console.log("  ATA  :", ata.toBase58());
    console.log("  Minted 1 token to admin ✓");
  } else {
    nftMint = new PublicKey(
      process.env.NFT_MINT ??
        (() => {
          throw new Error("NFT_MINT required (or set NEW_MINT=1 to create one)");
        })()
    );
  }

  const holderATA = await getAssociatedTokenAddress(nftMint, admin);
  const [configAddress] = configPDA();
  const [slotAddress] = slotPDA(nftMint, scheduledDate);
  const escrowATA = await getAssociatedTokenAddress(nftMint, slotAddress, true);

  console.log(`\nRegistering slot for ${slotDateStr}...`);
  console.log("  scheduledDate :", scheduledDate.toString());
  console.log("  Reserve price :", reservePrice.toNumber() / LAMPORTS_PER_SOL, "SOL");
  console.log("  Slot PDA      :", slotAddress.toBase58());

  const tx = await (program.methods
    .listSlot(new BN(scheduledDate.toString()), reservePrice)
    .accounts({
      holder: admin,
      config: configAddress,
      nftMint,
      holderTokenAccount: holderATA,
      escrowTokenAccount: escrowATA,
      slot: slotAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([adminKeypair])
    .rpc());

  console.log("\nSlot registered! ✓");
  console.log("  NFT Mint :", nftMint.toBase58());
  console.log("  Slot PDA :", slotAddress.toBase58());
  console.log("  Tx       :", tx);
  console.log("\nPaste this into auction-schedule.json for", slotDateStr + ":");
  console.log(`  \"nftId\": \"${nftMint.toBase58()}\"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
