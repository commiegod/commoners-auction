use anchor_lang::prelude::*;
use crate::state::{ProgramConfig, GovernanceProposal, VoteRecord};
use crate::errors::AuctionError;

/// Called by a Commoner NFT holder to cast their vote on an active proposal.
///
/// Requires TWO signers:
///   - `voter`  — the Commoner holder's wallet (proves on-chain identity)
///   - `admin`  — the program admin (proves NFT holdings were verified off-chain)
///
/// The VoteRecord PDA is keyed by (proposal_id, voter) so a second call
/// with the same voter will fail at account init — preventing double-votes.
///
/// `weight` is the voter's Commoner NFT count, verified by the admin before
/// co-signing. Allocations (yes + no + abstain) must not exceed weight.
pub fn cast_vote(
    ctx: Context<CastVote>,
    _proposal_id: u64,
    weight: u64,
    yes: u64,
    no: u64,
    abstain: u64,
) -> Result<()> {
    require!(weight > 0, AuctionError::NoVotesAllocated);
    require!(weight <= 120, AuctionError::TallyOverflow);

    let total = yes
        .checked_add(no)
        .ok_or(AuctionError::Overflow)?
        .checked_add(abstain)
        .ok_or(AuctionError::Overflow)?;

    require!(total > 0, AuctionError::NoVotesAllocated);
    require!(total <= weight, AuctionError::AllocationExceedsWeight);

    let proposal = &mut ctx.accounts.proposal;
    let now = Clock::get()?.unix_timestamp;

    require!(proposal.status == 0, AuctionError::ProposalNotActive);
    require!(now < proposal.ends_at, AuctionError::VotingEnded);

    // Ensure global tally cannot exceed the 120-NFT collection ceiling.
    let accumulated = proposal.yes
        .checked_add(proposal.no)
        .and_then(|s| s.checked_add(proposal.abstain))
        .ok_or(AuctionError::Overflow)?;
    require!(
        accumulated.checked_add(total).ok_or(AuctionError::Overflow)? <= 120,
        AuctionError::TallyOverflow
    );

    // Update proposal tallies atomically.
    proposal.yes = proposal.yes.checked_add(yes).ok_or(AuctionError::Overflow)?;
    proposal.no = proposal.no.checked_add(no).ok_or(AuctionError::Overflow)?;
    proposal.abstain = proposal.abstain.checked_add(abstain).ok_or(AuctionError::Overflow)?;

    // Write vote record (init fails if this voter already voted).
    let record = &mut ctx.accounts.vote_record;
    record.proposal_id = proposal.proposal_id;
    record.voter = ctx.accounts.voter.key();
    record.weight = weight;
    record.yes = yes;
    record.no = no;
    record.abstain = abstain;
    record.bump = ctx.bumps.vote_record;

    msg!(
        "Vote recorded: voter={} yes={} no={} abstain={}",
        ctx.accounts.voter.key(),
        yes,
        no,
        abstain,
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CastVote<'info> {
    /// The Commoner NFT holder casting the vote. Signs and pays rent.
    #[account(mut)]
    pub voter: Signer<'info>,

    /// Admin co-signature proves this voter's NFT holdings were verified
    /// off-chain via Helius DAS before the transaction was constructed.
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

    /// VoteRecord PDA — `init` will fail if voter already voted for this
    /// proposal, preventing double-voting without any explicit check.
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [VoteRecord::SEED, &proposal_id.to_le_bytes(), voter.key().as_ref()],
        bump,
    )]
    pub vote_record: Account<'info, VoteRecord>,

    pub system_program: Program<'info, System>,
}
