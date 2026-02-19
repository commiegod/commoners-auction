use anchor_lang::prelude::*;
use crate::state::{ProgramConfig, AuctionState, SlotRegistration};
use crate::errors::AuctionError;

/// Called by the backend crank at the start of each auction day.
/// Opens bidding for the NFT registered in the given slot.
/// Duration is always 86,400 seconds (24 hours).
pub fn create_auction(
    ctx: Context<CreateAuction>,
    auction_id: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let slot = &mut ctx.accounts.slot;

    require!(slot.escrowed, AuctionError::NotEscrowed);
    require!(!slot.consumed, AuctionError::SlotConsumed);
    require!(
        slot.nft_mint == ctx.accounts.nft_mint.key(),
        AuctionError::MintMismatch
    );

    // Capture values from slot and config before any mutable borrows.
    let seller = slot.owner;
    let reserve_price = slot.reserve_price;
    let nft_mint_key = ctx.accounts.nft_mint.key();

    let now = Clock::get()?.unix_timestamp;
    let end_time = now.checked_add(86_400).ok_or(AuctionError::Overflow)?;

    // Resolve the seller's fee based on their COMMON token balance.
    // common_balance is 0 until the COMMON token launches.
    let common_balance: u64 = 0; // TODO: CPI to SPL token when COMMON mint is set
    let fee_bps = config.resolve_fee_bps(common_balance);

    let slot = &mut ctx.accounts.slot;
    slot.consumed = true;

    let auction = &mut ctx.accounts.auction;
    auction.nft_mint = nft_mint_key;
    auction.seller = seller;
    auction.reserve_price = reserve_price;
    auction.start_time = now;
    auction.end_time = end_time;
    auction.current_bid = 0;
    auction.current_bidder = None;
    auction.fee_bps = fee_bps;
    auction.settled = false;
    auction.reserve_met = false;
    auction.auction_id = auction_id;
    auction.bump = ctx.bumps.auction;

    msg!(
        "Auction #{} created: mint={} seller={} end={} fee={}bps",
        auction_id,
        auction.nft_mint,
        auction.seller,
        auction.end_time,
        fee_bps,
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateAuction<'info> {
    /// Backend crank wallet — must be the program admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
        has_one = admin @ AuctionError::Unauthorized,
    )]
    pub config: Account<'info, ProgramConfig>,

    /// CHECK: mint pubkey read-only, validated via slot.nft_mint
    pub nft_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SlotRegistration::SEED, nft_mint.key().as_ref(), &slot.scheduled_date.to_le_bytes()],
        bump = slot.bump,
    )]
    pub slot: Account<'info, SlotRegistration>,

    #[account(
        init,
        payer = admin,
        space = 8 + AuctionState::INIT_SPACE,
        seeds = [AuctionState::SEED, &auction_id.to_le_bytes()],
        bump,
    )]
    pub auction: Account<'info, AuctionState>,

    pub system_program: Program<'info, System>,
}
