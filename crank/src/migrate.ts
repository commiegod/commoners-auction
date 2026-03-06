import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "../idl.json";
import fs from "fs";

async function main() {
  const rpc = process.env.SOLANA_RPC_URL!;
  const keypairBytes = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairBytes));

  const conn = new Connection(rpc, "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as anchor.Idl, provider);
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-config")],
    program.programId
  );

  console.log("Calling migrate_config on PDA:", configPda.toBase58());
  const tx = await (program.methods as any).migrateConfig()
    .accounts({ admin: admin.publicKey, config: configPda })
    .rpc();
  console.log("Migration tx:", tx);
  console.log("Done.");
}

main().catch(console.error);
