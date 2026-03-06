use anchor_lang::prelude::*;
use crate::state::{ProgramConfig, GovernanceProposal};
use crate::errors::AuctionError;

/// Called by the admin after a proposal has been reviewed and approved
/// off-chain (Discord discussion). Creates the immutable on-chain record
/// and opens the voting window.
pub fn create_proposal(
    ctx: Context<CreateProposal>,
    proposal_id: u64,
    proposer: Pubkey,
    title: String,
    description: String,
    proposal_type: String,
    treasury_sol: u64,
    duration_secs: i64,
) -> Result<()> {
    require!(title.len() <= 100, AuctionError::TitleTooLong);
    require!(description.len() <= 800, AuctionError::DescriptionTooLong);
    require!(proposal_type.len() <= 50, AuctionError::TypeTooLong);
    // 1 hour minimum, 7 days maximum
    require!(
        duration_secs >= 3_600 && duration_secs <= 604_800,
        AuctionError::InvalidDuration
    );

    let now = Clock::get()?.unix_timestamp;
    let ends_at = now.checked_add(duration_secs).ok_or(AuctionError::Overflow)?;

    let proposal = &mut ctx.accounts.proposal;
    proposal.proposal_id = proposal_id;
    proposal.proposer = proposer;
    proposal.admin = ctx.accounts.admin.key();
    proposal.title = title;
    proposal.description = description;
    proposal.proposal_type = proposal_type;
    proposal.treasury_sol = treasury_sol;
    proposal.created_at = now;
    proposal.ends_at = ends_at;
    proposal.yes = 0;
    proposal.no = 0;
    proposal.abstain = 0;
    proposal.status = 0; // active
    proposal.bump = ctx.bumps.proposal;

    msg!(
        "Governance proposal {} created. Ends: {}",
        proposal_id,
        ends_at
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
        has_one = admin @ AuctionError::Unauthorized,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        init,
        payer = admin,
        space = 8 + GovernanceProposal::INIT_SPACE,
        seeds = [GovernanceProposal::SEED, &proposal_id.to_le_bytes()],
        bump,
    )]
    pub proposal: Account<'info, GovernanceProposal>,

    pub system_program: Program<'info, System>,
}
