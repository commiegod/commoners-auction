use anchor_lang::prelude::*;

/// Live auction state for a single day's auction.
#[account]
#[derive(InitSpace)]
pub struct AuctionState {
    /// The NFT mint being auctioned.
    pub nft_mint: Pubkey,

    /// Wallet that listed the NFT (receives proceeds minus fee).
    pub seller: Pubkey,

    /// Minimum acceptable final bid in lamports.
    pub reserve_price: u64,

    /// Unix timestamp when bidding opens.
    pub start_time: i64,

    /// Unix timestamp when bidding closes.
    /// Extended by time_buffer_secs on late bids.
    pub end_time: i64,

    /// Highest bid placed so far in lamports. Zero if no bids.
    pub current_bid: u64,

    /// Wallet that placed the current highest bid.
    /// Refunded automatically when outbid.
    pub current_bidder: Option<Pubkey>,

    /// Fee bps applied at settlement (resolved from seller's COMMON balance).
    pub fee_bps: u16,

    /// Whether this auction has been settled.
    pub settled: bool,

    /// Whether the reserve price was met at settlement.
    pub reserve_met: bool,

    /// Auction sequence number (day index, 1-based).
    pub auction_id: u64,

    pub bump: u8,
}

impl AuctionState {
    pub const SEED: &'static [u8] = b"auction";

    pub fn is_active(&self, now: i64) -> bool {
        now >= self.start_time && now < self.end_time && !self.settled
    }

    pub fn is_ended(&self, now: i64) -> bool {
        now >= self.end_time
    }

    /// Compute minimum next bid given current bid and increment bps.
    pub fn min_next_bid(&self, increment_bps: u16) -> u64 {
        if self.current_bid == 0 {
            self.reserve_price
        } else {
            self.current_bid
                .checked_add(
                    self.current_bid
                        .checked_mul(increment_bps as u64)
                        .unwrap_or(u64::MAX)
                        / 10_000,
                )
                .unwrap_or(u64::MAX)
        }
    }
}
