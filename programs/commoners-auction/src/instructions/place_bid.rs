use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{ProgramConfig, AuctionState};
use crate::errors::AuctionError;

/// Called by any wallet to place a bid on the active auction.
///
/// Rules enforced:
/// - Auction must be active (started, not ended, not settled)
/// - Bid must meet minimum: max(reserve_price, current_bid * (1 + increment_bps))
/// - Previous bidder is immediately refunded their full bid
/// - If bid lands within time_buffer_secs of end, extend end_time
pub fn place_bid(ctx: Context<PlaceBid>, bid_amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    let auction = &mut ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;

    require!(now >= auction.start_time, AuctionError::AuctionNotStarted);
    require!(!auction.settled, AuctionError::AlreadySettled);
    require!(now < auction.end_time, AuctionError::AuctionEnded);

    let min_bid = auction.min_next_bid(config.bid_increment_bps);
    require!(bid_amount >= min_bid, AuctionError::BidTooLow);

    // Refund the previous bidder if one exists.
    if let Some(prev_bidder) = auction.current_bidder {
        let prev_bid = auction.current_bid;
        if prev_bid > 0 {
            // bid_vault is a system-owned PDA — use CPI with PDA signer seeds.
            let auction_id_bytes = auction.auction_id.to_le_bytes();
            let vault_bump = ctx.bumps.bid_vault;
            let seeds: &[&[u8]] = &[b"bid-vault", &auction_id_bytes, &[vault_bump]];
            let signer_seeds = &[seeds];

            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.bid_vault.to_account_info(),
                        to: ctx.accounts.prev_bidder.to_account_info(),
                    },
                    signer_seeds,
                ),
                prev_bid,
            )?;

            msg!("Refunded {} lamports to {}", prev_bid, prev_bidder);
        }
    }

    // Transfer new bid into the vault.
    let transfer_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.bidder.to_account_info(),
            to: ctx.accounts.bid_vault.to_account_info(),
        },
    );
    system_program::transfer(transfer_ctx, bid_amount)?;

    // Anti-sniping: extend auction if bid is within the time buffer.
    let time_remaining = auction.end_time.checked_sub(now).unwrap_or(0);
    if time_remaining < config.time_buffer_secs {
        auction.end_time = now
            .checked_add(config.time_buffer_secs)
            .ok_or(AuctionError::Overflow)?;
        msg!(
            "Anti-snipe: auction extended to {}",
            auction.end_time
        );
    }

    // Record the bid.
    auction.current_bid = bid_amount;
    auction.current_bidder = Some(ctx.accounts.bidder.key());

    msg!(
        "Bid placed: {} lamports by {} (auction #{}, ends {})",
        bid_amount,
        ctx.accounts.bidder.key(),
        auction.auction_id,
        auction.end_time,
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(bid_amount: u64)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        mut,
        seeds = [AuctionState::SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, AuctionState>,

    /// SOL vault PDA that holds the current winning bid in escrow.
    /// Seeds tie it to a specific auction so vaults don't collide.
    #[account(
        mut,
        seeds = [b"bid-vault", &auction.auction_id.to_le_bytes()],
        bump,
    )]
    pub bid_vault: SystemAccount<'info>,

    /// Previous bidder account — required for the refund transfer.
    /// Validated at runtime: must match auction.current_bidder if set.
    /// CHECK: we verify this matches auction.current_bidder below via constraint.
    #[account(
        mut,
        constraint = auction.current_bidder.map_or(true, |pb| pb == prev_bidder.key()),
    )]
    pub prev_bidder: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
