use anchor_lang::prelude::*;
use crate::state::{ProgramConfig, DiscountTier};
use crate::errors::AuctionError;

/// Update global program parameters.
/// Only callable by the admin (Squads multisig in production).
pub fn update_params(
    ctx: Context<UpdateParams>,
    new_fee_bps: Option<u16>,
    new_bid_increment_bps: Option<u16>,
    new_time_buffer_secs: Option<i64>,
    new_min_reserve_lamports: Option<u64>,
    new_common_token_mint: Option<Pubkey>,
    new_discount_tiers: Option<[DiscountTier; 4]>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(fee) = new_fee_bps {
        config.default_fee_bps = fee;
        msg!("Fee updated to {}bps", fee);
    }
    if let Some(inc) = new_bid_increment_bps {
        config.bid_increment_bps = inc;
        msg!("Bid increment updated to {}bps", inc);
    }
    if let Some(buf) = new_time_buffer_secs {
        config.time_buffer_secs = buf;
        msg!("Time buffer updated to {}s", buf);
    }
    if let Some(min) = new_min_reserve_lamports {
        config.min_reserve_lamports = min;
        msg!("Min reserve updated to {} lamports", min);
    }
    if let Some(mint) = new_common_token_mint {
        config.common_token_mint = Some(mint);
        msg!("COMMON token mint set to {}", mint);
    }
    if let Some(tiers) = new_discount_tiers {
        config.discount_tiers = tiers;
        msg!("Discount tiers updated");
    }

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateParams<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
        has_one = admin @ AuctionError::Unauthorized,
    )]
    pub config: Account<'info, ProgramConfig>,
}
