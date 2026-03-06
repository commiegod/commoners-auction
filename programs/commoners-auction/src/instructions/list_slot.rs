use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use borsh::BorshDeserialize;
use crate::state::{ProgramConfig, SlotRegistration};
use crate::errors::AuctionError;

/// Metaplex Token Metadata program ID.
const TOKEN_METADATA_PROGRAM_ID: Pubkey =
    pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/// Called by an NFT holder to lock their MidEvil into escrow
/// and claim a future auction slot. Once locked, the NFT will
/// be auctioned on the scheduled date regardless of whether
/// the holder changes their mind.
pub fn list_slot(
    ctx: Context<ListSlot>,
    scheduled_date: i64,
    reserve_price: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;

    require!(scheduled_date > now, AuctionError::DateInPast);
    require!(scheduled_date % 86_400 == 0, AuctionError::InvalidScheduledDate);
    require!(
        reserve_price >= config.min_reserve_lamports,
        AuctionError::ReserveTooLow
    );

    // Collection verification — only enforced when required_collection is configured.
    if let Some(required_collection) = config.required_collection {
        // Derive the expected Metaplex metadata PDA and verify the account matches.
        let tmid = TOKEN_METADATA_PROGRAM_ID;
        let (metadata_pda, _) = Pubkey::find_program_address(
            &[b"metadata", tmid.as_ref(), ctx.accounts.nft_mint.key().as_ref()],
            &tmid,
        );
        require_keys_eq!(
            ctx.accounts.nft_metadata.key(),
            metadata_pda,
            AuctionError::CollectionNotVerified
        );
        // Verify the account is actually owned by the Metaplex program.
        require!(
            *ctx.accounts.nft_metadata.owner == TOKEN_METADATA_PROGRAM_ID,
            AuctionError::CollectionNotVerified
        );
        verify_nft_collection(
            &ctx.accounts.nft_metadata.to_account_info(),
            required_collection,
        )?;
    }

    // Transfer NFT from holder into program escrow token account.
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.holder_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.holder.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, 1)?;

    // Record the slot registration.
    let slot = &mut ctx.accounts.slot;
    slot.nft_mint = ctx.accounts.nft_mint.key();
    slot.owner = ctx.accounts.holder.key();
    slot.scheduled_date = scheduled_date;
    slot.reserve_price = reserve_price;
    slot.escrowed = true;
    slot.consumed = false;
    slot.bump = ctx.bumps.slot;

    msg!(
        "Slot registered: mint={} owner={} date={}",
        slot.nft_mint,
        slot.owner,
        slot.scheduled_date
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(scheduled_date: i64)]
pub struct ListSlot<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    pub config: Account<'info, ProgramConfig>,

    pub nft_mint: Account<'info, Mint>,

    /// Metaplex metadata account for collection verification.
    /// CHECK: Validated in instruction via MetaplexMetadata::find_pda + safe_deserialize.
    pub nft_metadata: UncheckedAccount<'info>,

    /// Holder's token account for this NFT.
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = holder,
    )]
    pub holder_token_account: Account<'info, TokenAccount>,

    /// Program-owned escrow token account for this NFT.
    #[account(
        init_if_needed,
        payer = holder,
        associated_token::mint = nft_mint,
        associated_token::authority = slot,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Slot registration PDA — seeds ensure one slot per mint per date.
    #[account(
        init,
        payer = holder,
        space = 8 + SlotRegistration::INIT_SPACE,
        seeds = [SlotRegistration::SEED, nft_mint.key().as_ref(), &scheduled_date.to_le_bytes()],
        bump,
    )]
    pub slot: Account<'info, SlotRegistration>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Verify that the NFT belongs to the required Metaplex collection.
///
/// Deserializes the Metaplex metadata account (borsh v0.10) and checks:
///   - key == 4 (MetadataV1)
///   - collection.verified == true
///   - collection.key == required_collection
///
/// Metaplex on-chain layout (borsh-encoded):
///   key: u8, update_authority: [u8;32], mint: [u8;32],
///   name: String, symbol: String, uri: String,
///   seller_fee_basis_points: u16,
///   creators: Option<Vec<{addr:[u8;32], verified:bool, share:u8}>>,
///   primary_sale_happened: bool, is_mutable: bool,
///   edition_nonce: Option<u8>, token_standard: Option<u8>,
///   collection: Option<{verified:bool, key:[u8;32]}>
fn verify_nft_collection(
    metadata_info: &AccountInfo,
    required_collection: Pubkey,
) -> Result<()> {
    #[derive(BorshDeserialize)]
    struct MdCreator { _a: [u8; 32], _v: bool, _s: u8 }

    #[derive(BorshDeserialize)]
    struct MdCollection { verified: bool, key: [u8; 32] }

    let data = metadata_info.try_borrow_data()?;
    let buf = &mut &data[..];

    let key: u8 = u8::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?;
    require!(key == 4, AuctionError::CollectionNotVerified);
    let _: [u8; 32] = <[u8; 32]>::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // update_authority
    let _: [u8; 32] = <[u8; 32]>::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // mint
    let _: String = String::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // name
    let _: String = String::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // symbol
    let _: String = String::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // uri
    let _: u16 = u16::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // seller_fee_basis_points
    let _: Option<Vec<MdCreator>> = Option::<Vec<MdCreator>>::deserialize(buf)
        .map_err(|_| error!(AuctionError::CollectionNotVerified))?;
    let _: bool = bool::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // primary_sale_happened
    let _: bool = bool::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // is_mutable
    let _: Option<u8> = Option::<u8>::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // edition_nonce
    let _: Option<u8> = Option::<u8>::deserialize(buf).map_err(|_| error!(AuctionError::CollectionNotVerified))?; // token_standard
    let col: Option<MdCollection> = Option::<MdCollection>::deserialize(buf)
        .map_err(|_| error!(AuctionError::CollectionNotVerified))?;

    let col = col.ok_or_else(|| error!(AuctionError::CollectionNotVerified))?;
    require!(col.verified, AuctionError::CollectionNotVerified);
    require!(col.key == required_collection.to_bytes(), AuctionError::CollectionMismatch);

    Ok(())
}
