use anchor_lang::prelude::*;
use crate::state::{ProgramConfig, GovernanceProposal};
use crate::errors::AuctionError;

/// Called by admin after the voting window closes to set the final status.
/// Status values: 1 = passed, 2 = failed, 3 = queued (awaiting execution).
pub fn finalize_proposal(
    ctx: Context<FinalizeProposal>,
    _proposal_id: u64,
    status: u8,
) -> Result<()> {
    require!(
        status >= 1 && status <= 3,
        AuctionError::InvalidFinalStatus
    );

    let proposal = &mut ctx.accounts.proposal;
    require!(proposal.status == 0, AuctionError::ProposalNotActive);

    let now = Clock::get()?.unix_timestamp;
    require!(now >= proposal.ends_at, AuctionError::VotingStillActive);

    proposal.status = status;

    msg!(
        "Proposal {} finalized with status {}",
        proposal.proposal_id,
        status
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct FinalizeProposal<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [ProgramConfig::SEED],
        bump = config.bump,
        has_one = admin @ AuctionError::Unauthorized,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        mut,
        seeds = [GovernanceProposal::SEED, &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, GovernanceProposal>,
}
