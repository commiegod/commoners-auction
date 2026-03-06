use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::state::{AuctionState, SlotRegistration};
use crate::errors::AuctionError;

/// Minimum seconds after auction.end_time before admin can close as stale.
const STALE_THRESHOLD_SECS: i64 = 3 * 24 * 60 * 60; // 3 days

/// Permissionless stale auction cleanup — callable by anyone.
/// Returns the escrowed NFT to the original seller for auctions that ended
/// 3+ days ago without being settled. The seller is most incentivized to
/// call this, but any wallet can trigger it.
pub fn close_stale_auction(ctx: Context<CloseStaleAuction>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;

    require!(!auction.settled, AuctionError::AlreadySettled);
    require!(
        now >= auction.end_time
            .checked_add(STALE_THRESHOLD_SECS)
            .ok_or(AuctionError::Overflow)?,
        AuctionError::AuctionNotStale
    );

    // Return NFT to seller via slot PDA as escrow authority.
    let nft_mint_key = ctx.accounts.nft_mint.key();
    let scheduled_date_bytes = ctx.accounts.slot.scheduled_date.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SlotRegistration::SEED,
        nft_mint_key.as_ref(),
        &scheduled_date_bytes,
        &[ctx.accounts.slot.bump],
    ]];

    let nft_return_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: ctx.accounts.slot.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(nft_return_ctx, 1)?;

    auction.settled = true;
    auction.reserve_met = false;

    msg!(
        "Stale auction #{} closed — NFT returned to seller {}",
        auction.auction_id,
        auction.seller,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct CloseStaleAuction<'info> {
    /// Anyone can trigger stale cleanup. Pays tx fee + ATA rent if needed.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [AuctionState::SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
        has_one = seller,
        constraint = auction.nft_mint == nft_mint.key() @ AuctionError::MintMismatch,
    )]
    pub auction: Account<'info, AuctionState>,

    #[account(
        seeds = [SlotRegistration::SEED, nft_mint.key().as_ref(), &slot.scheduled_date.to_le_bytes()],
        bump = slot.bump,
        constraint = slot.owner == auction.seller @ AuctionError::SellerMismatch,
    )]
    pub slot: Account<'info, SlotRegistration>,

    pub nft_mint: Account<'info, Mint>,

    /// Escrow token account holding the NFT (owned by slot PDA).
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = slot,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Seller's token account — receives the NFT back.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = nft_mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// CHECK: validated by auction has_one = seller.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
