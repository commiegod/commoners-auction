use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::state::{ProgramConfig, SlotRegistration};
use crate::errors::AuctionError;

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
    require!(
        reserve_price >= config.min_reserve_lamports,
        AuctionError::ReserveTooLow
    );

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
