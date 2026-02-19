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
    ) -> Result<()> {
        instructions::initialize_program::initialize_program(
            ctx,
            treasury,
            default_fee_bps,
            bid_increment_bps,
            time_buffer_secs,
            min_reserve_lamports,
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
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        auction_id: u64,
    ) -> Result<()> {
        instructions::create_auction::create_auction(ctx, auction_id)
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
}
