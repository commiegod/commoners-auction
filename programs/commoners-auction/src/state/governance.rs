use anchor_lang::prelude::*;

/// On-chain governance proposal. Created by admin after off-chain review.
/// PDA seeds: ["proposal", proposal_id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct GovernanceProposal {
    /// Numeric ID, milliseconds since epoch at creation time.
    pub proposal_id: u64,

    /// Original submitter (Commoner NFT holder who proposed it).
    pub proposer: Pubkey,

    /// Admin who created this on-chain record after off-chain approval.
    pub admin: Pubkey,

    /// Short title (max 100 chars).
    #[max_len(100)]
    pub title: String,

    /// Full description (max 800 chars).
    #[max_len(800)]
    pub description: String,

    /// Proposal type slug, e.g. "community-initiative" (max 50 chars).
    #[max_len(50)]
    pub proposal_type: String,

    /// SOL amount requested from treasury (0 for non-treasury proposals).
    pub treasury_sol: u64,

    /// Unix timestamp when this record was created on-chain.
    pub created_at: i64,

    /// Unix timestamp when voting closes.
    pub ends_at: i64,

    /// Accumulated yes votes (NFT-weighted).
    pub yes: u64,

    /// Accumulated no votes.
    pub no: u64,

    /// Accumulated abstain votes.
    pub abstain: u64,

    /// 0 = active, 1 = passed, 2 = failed, 3 = queued
    pub status: u8,

    pub bump: u8,
}

impl GovernanceProposal {
    pub const SEED: &'static [u8] = b"proposal";
}

/// Per-voter vote record. Existence of this PDA prevents double-voting.
/// PDA seeds: ["vote", proposal_id.to_le_bytes(), voter_pubkey.as_ref()]
#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    /// The proposal this vote was cast for.
    pub proposal_id: u64,

    /// The wallet that cast the vote.
    pub voter: Pubkey,

    /// Total voting weight (number of Commoner NFTs held, verified off-chain).
    pub weight: u64,

    /// Votes allocated to yes.
    pub yes: u64,

    /// Votes allocated to no.
    pub no: u64,

    /// Votes allocated to abstain.
    pub abstain: u64,

    pub bump: u8,
}

impl VoteRecord {
    pub const SEED: &'static [u8] = b"vote";
}
