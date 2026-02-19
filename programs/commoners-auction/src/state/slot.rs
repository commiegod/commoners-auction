use anchor_lang::prelude::*;

/// A holder's reservation of a future auction slot.
/// Created when a holder locks their NFT into escrow.
#[account]
#[derive(InitSpace)]
pub struct SlotRegistration {
    /// NFT mint locked in escrow.
    pub nft_mint: Pubkey,

    /// Original owner / seller.
    pub owner: Pubkey,

    /// Scheduled auction date as a Unix timestamp (start of day UTC).
    pub scheduled_date: i64,

    /// Reserve price in lamports set by the seller at listing time.
    pub reserve_price: u64,

    /// Whether the NFT has been transferred into escrow.
    pub escrowed: bool,

    /// Whether this slot has been consumed (auction created).
    pub consumed: bool,

    pub bump: u8,
}

impl SlotRegistration {
    pub const SEED: &'static [u8] = b"slot";
}
