/**
 * List-slot crank — registers an NFT into escrow for a scheduled auction date.
 * Called by the NFT holder (or admin for testing) before the auction day.
 *
 * After registering the slot, automatically fetches the NFT's Metaplex metadata
 * from mainnet and writes the name, image, and traits into auction-schedule.json.
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
 *   SCHEDULE_PATH       Path to auction-schedule.json (optional)
 */
import fs from "fs";
import path from "path";
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

// ── metadata fetch ────────────────────────────────────────────────────────────

interface NftMeta {
  name: string;
  image: string;
  traits: string[];
  seller: string;
}

/**
 * Fetch NFT metadata via the DAS getAsset API (mainnet).
 * Returns null if the mint has no on-chain Metaplex metadata (e.g. test mints).
 */
async function fetchNftMetadata(
  mintAddress: string,
  sellerAddress: string
): Promise<NftMeta | null> {
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-asset",
        method: "getAsset",
        params: { id: mintAddress },
      }),
    });

    const json = await res.json();
    const asset = json.result;
    if (!asset) return null;

    const name: string = asset.content?.metadata?.name ?? "";
    const image: string = asset.content?.links?.image ?? "";
    const attrs: { trait_type: string; value: string }[] =
      asset.content?.metadata?.attributes ?? [];
    const traits = attrs.map((a) => a.value).filter((v) => v && v !== "None");

    if (!name || !image) return null;
    return { name, image, traits, seller: sellerAddress };
  } catch {
    return null;
  }
}

/**
 * Update auction-schedule.json with the metadata for a given date.
 * Creates the entry if it doesn't exist; updates in place if it does.
 */
function updateSchedule(
  schedulePath: string,
  dateStr: string,
  nftId: string,
  meta: NftMeta | null
) {
  const schedule: Record<string, any> = fs.existsSync(schedulePath)
    ? JSON.parse(fs.readFileSync(schedulePath, "utf-8"))
    : {};

  schedule[dateStr] = {
    nftId,
    name: meta?.name ?? null,
    image: meta?.image ?? null,
    traits: meta?.traits ?? [],
    seller: meta?.seller ?? null,
  };

  // Write back sorted by date
  const sorted = Object.fromEntries(
    Object.entries(schedule).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(schedulePath, JSON.stringify(sorted, null, 2) + "\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { program, adminKeypair, connection } = buildClient();
  const admin = adminKeypair.publicKey;

  const slotDateStr =
    process.env.SLOT_DATE ??
    (() => {
      throw new Error("SLOT_DATE required (format: YYYY-MM-DD)");
    })();

  const schedulePath =
    process.env.SCHEDULE_PATH ??
    path.resolve(__dirname, "../../../web/data/auction-schedule.json");

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
      admin,
      null,
      0
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

  // ── fetch metadata and update schedule ──────────────────────────────────────

  console.log("\nFetching NFT metadata from mainnet...");
  const meta = await fetchNftMetadata(nftMint.toBase58(), admin.toBase58());

  if (meta) {
    console.log("  Name   :", meta.name);
    console.log("  Image  :", meta.image);
    console.log("  Traits :", meta.traits.join(", "));
    updateSchedule(schedulePath, slotDateStr, nftMint.toBase58(), meta);
    console.log(`\nauction-schedule.json updated for ${slotDateStr} ✓`);
  } else {
    console.log("  No Metaplex metadata found (test mint or devnet) —");
    console.log("  writing stub entry to schedule.");
    updateSchedule(schedulePath, slotDateStr, nftMint.toBase58(), null);
    console.log(`\nauction-schedule.json updated for ${slotDateStr} (stub) ✓`);
    console.log("  Fill in name/image/traits manually for production NFTs.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
