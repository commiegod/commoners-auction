use anchor_lang::prelude::*;
use crate::state::{ProgramConfig, DiscountTier};

pub fn initialize_program(
    ctx: Context<InitializeProgram>,
    treasury: Pubkey,
    default_fee_bps: u16,
    bid_increment_bps: u16,
    time_buffer_secs: i64,
    min_reserve_lamports: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = treasury;
    config.default_fee_bps = default_fee_bps;
    config.bid_increment_bps = bid_increment_bps;
    config.time_buffer_secs = time_buffer_secs;
    config.min_reserve_lamports = min_reserve_lamports;
    config.common_token_mint = None;
    config.discount_tiers = [DiscountTier::default(); 4];
    config.bump = ctx.bumps.config;

    msg!(
        "Program initialized. Treasury: {}, Fee: {}bps, Buffer: {}s, MinReserve: {} lamports",
        treasury,
        default_fee_bps,
        time_buffer_secs,
        min_reserve_lamports
    );
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProgram<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + ProgramConfig::INIT_SPACE,
        seeds = [ProgramConfig::SEED],
        bump,
    )]
    pub config: Account<'info, ProgramConfig>,

    pub system_program: Program<'info, System>,
}
