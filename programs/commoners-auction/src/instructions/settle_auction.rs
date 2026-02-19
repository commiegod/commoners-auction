use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::state::{ProgramConfig, AuctionState, SlotRegistration};
use crate::errors::AuctionError;

/// Called by the backend crank after the auction end_time has passed.
///
/// Settlement logic:
/// - If reserve_price was met: NFT → winner, SOL bid → seller (minus fee), fee → treasury
/// - If no bids or reserve not met: NFT → seller, no SOL moves
pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let now = Clock::get()?.unix_timestamp;

    require!(auction.is_ended(now), AuctionError::AuctionNotEnded);
    require!(!auction.settled, AuctionError::AlreadySettled);

    let reserve_met = auction.current_bid >= auction.reserve_price
        && auction.current_bidder.is_some();

    if reserve_met {
        // --- Transfer NFT from escrow to winner ---
        // Escrow authority is the slot PDA (set at list_slot time), not the auction.
        let nft_mint_key = ctx.accounts.nft_mint.key();
        let scheduled_date_bytes = ctx.accounts.slot.scheduled_date.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[
            SlotRegistration::SEED,
            nft_mint_key.as_ref(),
            &scheduled_date_bytes,
            &[ctx.accounts.slot.bump],
        ]];

        let nft_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.slot.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(nft_transfer_ctx, 1)?;

        // --- Split bid: seller gets (bid - fee), treasury gets fee ---
        let bid = auction.current_bid;
        let fee = bid
            .checked_mul(auction.fee_bps as u64)
            .ok_or(AuctionError::Overflow)?
            / 10_000;
        let seller_proceeds = bid.checked_sub(fee).ok_or(AuctionError::Overflow)?;

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
                    to: ctx.accounts.seller.to_account_info(),
                },
                signer_seeds,
            ),
            seller_proceeds,
        )?;

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.bid_vault.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;

        auction.reserve_met = true;

        msg!(
            "Settled auction #{}: NFT → {}, {} lamports → seller, {} lamports → treasury",
            auction.auction_id,
            auction.current_bidder.unwrap(),
            seller_proceeds,
            fee,
        );
    } else {
        // --- No reserve met: return NFT to seller ---
        let slot = &ctx.accounts.slot;
        let nft_mint_key = ctx.accounts.nft_mint.key();
        let scheduled_date_bytes = slot.scheduled_date.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[
            SlotRegistration::SEED,
            nft_mint_key.as_ref(),
            &scheduled_date_bytes,
            &[slot.bump],
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

        msg!(
            "Settled auction #{}: reserve not met, NFT returned to seller {}",
            auction.auction_id,
            auction.seller,
        );
    }

    auction.settled = true;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    /// Backend crank — must be admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
        has_one = admin @ AuctionError::Unauthorized,
        has_one = treasury,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        mut,
        seeds = [AuctionState::SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
        has_one = seller,
    )]
    pub auction: Account<'info, AuctionState>,

    #[account(
        seeds = [SlotRegistration::SEED, nft_mint.key().as_ref(), &slot.scheduled_date.to_le_bytes()],
        bump = slot.bump,
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

    /// Winner's token account — receives NFT if reserve met.
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = nft_mint,
        associated_token::authority = winner,
    )]
    pub winner_token_account: Account<'info, TokenAccount>,

    /// Seller's token account — receives NFT back if reserve not met.
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = nft_mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// The auction vault holding the winning bid in escrow.
    #[account(
        mut,
        seeds = [b"bid-vault", &auction.auction_id.to_le_bytes()],
        bump,
    )]
    pub bid_vault: SystemAccount<'info>,

    /// CHECK: seller identity — validated by auction has_one constraint.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: winner identity — validated at runtime against auction.current_bidder.
    #[account(
        mut,
        constraint = auction.current_bidder.map_or(true, |w| w == winner.key()),
    )]
    pub winner: UncheckedAccount<'info>,

    /// Treasury wallet — validated by config has_one constraint.
    /// CHECK: validated via config.has_one
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
