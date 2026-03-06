use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::DiscountTier;

declare_id!("EWXiRHrYNtMy6wXQsy2oZhops6Dsw5M4GT59Bqb3xPjC");

#[program]
pub mod commoners_auction {
    use super::*;

    /// One-time setup. Called once by the admin after deployment.
    /// Default values:
    ///   fee_bps          = 900  (9%)
    ///   bid_increment_bps = 500  (5%)
    ///   time_buffer_secs = 600  (10 minutes anti-snipe window)
    ///   min_reserve      = 420_000_000 lamports (0.42 SOL)
    pub fn initialize_program(
        ctx: Context<InitializeProgram>,
        treasury: Pubkey,
        default_fee_bps: u16,
        bid_increment_bps: u16,
        time_buffer_secs: i64,
        min_reserve_lamports: u64,
        required_collection: Option<Pubkey>,
    ) -> Result<()> {
        instructions::initialize_program::initialize_program(
            ctx,
            treasury,
            default_fee_bps,
            bid_increment_bps,
            time_buffer_secs,
            min_reserve_lamports,
            required_collection,
        )
    }

    /// Called by an NFT holder to lock their MidEvil into escrow
    /// and reserve a future auction date.
    pub fn list_slot(
        ctx: Context<ListSlot>,
        scheduled_date: i64,
        reserve_price: u64,
    ) -> Result<()> {
        instructions::list_slot::list_slot(ctx, scheduled_date, reserve_price)
    }

    /// Called by the backend crank at the start of each auction day
    /// to open bidding for the scheduled NFT.
    /// `end_time` is the explicit Unix timestamp for auction close —
    /// pass the next midnight UTC so the auction ends deterministically
    /// regardless of when the crank actually runs.
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        auction_id: u64,
        end_time: i64,
    ) -> Result<()> {
        instructions::create_auction::create_auction(ctx, auction_id, end_time)
    }

    /// Called by any wallet to place a bid.
    /// Automatically refunds the previous bidder and extends
    /// the auction if within the anti-sniping window.
    pub fn place_bid(ctx: Context<PlaceBid>, bid_amount: u64) -> Result<()> {
        instructions::place_bid::place_bid(ctx, bid_amount)
    }

    /// Called by the backend crank after auction end_time.
    /// Sends NFT to winner + SOL to seller if reserve met,
    /// or returns NFT to seller if reserve not met.
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        instructions::settle_auction::settle_auction(ctx)
    }

    /// Update global config parameters.
    /// Only the admin (Squads multisig) can call this.
    pub fn update_params(
        ctx: Context<UpdateParams>,
        new_fee_bps: Option<u16>,
        new_bid_increment_bps: Option<u16>,
        new_time_buffer_secs: Option<i64>,
        new_min_reserve_lamports: Option<u64>,
        new_common_token_mint: Option<Pubkey>,
        new_discount_tiers: Option<[DiscountTier; 4]>,
    ) -> Result<()> {
        instructions::update_params::update_params(
            ctx,
            new_fee_bps,
            new_bid_increment_bps,
            new_time_buffer_secs,
            new_min_reserve_lamports,
            new_common_token_mint,
            new_discount_tiers,
        )
    }

    // ── Governance ───────────────────────────────────────────────────────────

    /// Admin creates an on-chain governance proposal after off-chain review.
    /// Opens the voting window immediately for `duration_secs`.
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
        instructions::create_proposal::create_proposal(
            ctx,
            proposal_id,
            proposer,
            title,
            description,
            proposal_type,
            treasury_sol,
            duration_secs,
        )
    }

    /// Commoner NFT holder casts a split vote on an active proposal.
    /// Requires voter + admin co-signature (admin verified NFT holdings off-chain).
    pub fn cast_vote(
        ctx: Context<CastVote>,
        proposal_id: u64,
        weight: u64,
        yes: u64,
        no: u64,
        abstain: u64,
    ) -> Result<()> {
        instructions::cast_vote::cast_vote(ctx, proposal_id, weight, yes, no, abstain)
    }

    /// Admin finalizes a proposal after the voting window closes.
    /// Status: 1 = passed, 2 = failed, 3 = queued (awaiting treasury execution).
    pub fn finalize_proposal(
        ctx: Context<FinalizeProposal>,
        proposal_id: u64,
        status: u8,
    ) -> Result<()> {
        instructions::finalize_proposal::finalize_proposal(ctx, proposal_id, status)
    }

    /// Admin closes a stale auction (ended 3+ days ago, still unsettled).
    /// Returns the escrowed NFT to the original seller.
    pub fn close_stale_auction(ctx: Context<CloseStaleAuction>) -> Result<()> {
        instructions::close_stale_auction::close_stale_auction(ctx)
    }

    /// Admin sets (or clears) the required NFT collection for list_slot.
    /// Set to the MidEvils collection mint before mainnet launch.
    pub fn set_required_collection(
        ctx: Context<SetRequiredCollection>,
        required_collection: Option<Pubkey>,
    ) -> Result<()> {
        instructions::set_required_collection::set_required_collection(ctx, required_collection)
    }
}
