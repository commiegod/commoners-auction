use anchor_lang::prelude::*;

/// Global program configuration. One per deployment, stored at a PDA.
/// Controlled by admin (Squads multisig in production).
#[account]
#[derive(InitSpace)]
pub struct ProgramConfig {
    /// Admin authority — Squads multisig in production.
    pub admin: Pubkey,

    /// SubDAO treasury wallet that receives auction fees.
    pub treasury: Pubkey,

    /// Default auction fee in basis points (900 = 9%).
    pub default_fee_bps: u16,

    /// Minimum bid increment in basis points (500 = 5%).
    /// New bids must exceed current bid by at least this percentage.
    pub bid_increment_bps: u16,

    /// Anti-sniping time buffer in seconds (600 = 10 min).
    /// A bid placed within this window extends the auction end time.
    pub time_buffer_secs: i64,

    /// Global minimum reserve price in lamports (0.42 SOL = 420_000_000).
    pub min_reserve_lamports: u64,

    /// COMMON token mint — set once the token launches.
    /// Used for fee discount tier calculations at settlement.
    pub common_token_mint: Option<Pubkey>,

    /// Fee discount tiers based on COMMON token balance.
    /// Each tier: (min_common_balance, fee_bps).
    /// Populated via governance vote after COMMON token launches.
    pub discount_tiers: [DiscountTier; 4],

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct DiscountTier {
    /// Minimum COMMON token balance (in raw units) to qualify.
    /// Zero means this tier slot is unused.
    pub min_balance: u64,
    /// Fee in basis points for this tier.
    pub fee_bps: u16,
}

impl ProgramConfig {
    pub const SEED: &'static [u8] = b"program-config";

    /// Resolve the effective fee bps for a seller given their COMMON balance.
    /// Returns the lowest qualifying tier, or default_fee_bps if none match.
    pub fn resolve_fee_bps(&self, common_balance: u64) -> u16 {
        let mut best = self.default_fee_bps;
        for tier in &self.discount_tiers {
            if tier.min_balance > 0
                && common_balance >= tier.min_balance
                && tier.fee_bps < best
            {
                best = tier.fee_bps;
            }
        }
        best
    }
}
