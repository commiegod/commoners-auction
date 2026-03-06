use anchor_lang::prelude::*;
use crate::state::ProgramConfig;
use crate::errors::AuctionError;

/// Admin sets (or clears) the required NFT collection.
/// When set, list_slot will reject NFTs not from this collection.
/// Set to the MidEvils collection mint before mainnet launch.
/// Pass None to remove the restriction (devnet testing).
pub fn set_required_collection(
    ctx: Context<SetRequiredCollection>,
    required_collection: Option<Pubkey>,
) -> Result<()> {
    ctx.accounts.config.required_collection = required_collection;
    msg!("Required collection updated to {:?}", required_collection);
    Ok(())
}

#[derive(Accounts)]
pub struct SetRequiredCollection<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
        has_one = admin @ AuctionError::Unauthorized,
    )]
    pub config: Account<'info, ProgramConfig>,
}
