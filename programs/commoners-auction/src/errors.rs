use anchor_lang::prelude::*;

#[error_code]
pub enum AuctionError {
    #[msg("Auction has not started yet")]
    AuctionNotStarted,

    #[msg("Auction has already ended")]
    AuctionEnded,

    #[msg("Auction has not ended yet")]
    AuctionNotEnded,

    #[msg("Auction has already been settled")]
    AlreadySettled,

    #[msg("Bid is below the minimum required amount")]
    BidTooLow,

    #[msg("Reserve price is below the global minimum")]
    ReserveTooLow,

    #[msg("Slot is already taken for this date")]
    SlotTaken,

    #[msg("Slot has not been escrowed yet")]
    NotEscrowed,

    #[msg("Slot has already been consumed")]
    SlotConsumed,

    #[msg("Unauthorized — admin only")]
    Unauthorized,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Scheduled date is in the past")]
    DateInPast,

    #[msg("NFT mint does not match the registered slot")]
    MintMismatch,

    #[msg("Seller does not match the registered slot owner")]
    SellerMismatch,

    #[msg("end_time must be in the future and no more than 48 hours away")]
    InvalidEndTime,

    // ── Governance ───────────────────────────────────────────────────────────
    #[msg("Proposal is not active")]
    ProposalNotActive,

    #[msg("Voting period has ended")]
    VotingEnded,

    #[msg("Vote allocation exceeds voter's weight")]
    AllocationExceedsWeight,

    #[msg("No votes allocated")]
    NoVotesAllocated,

    #[msg("Title exceeds maximum length")]
    TitleTooLong,

    #[msg("Description exceeds maximum length")]
    DescriptionTooLong,

    #[msg("Proposal type exceeds maximum length")]
    TypeTooLong,

    // ── Collection verification ──────────────────────────────────────────────
    #[msg("NFT collection is not verified or metadata is missing")]
    CollectionNotVerified,

    #[msg("NFT is not from the required collection")]
    CollectionMismatch,

    // ── Parameter validation ─────────────────────────────────────────────────
    #[msg("Fee basis points exceed 10000 (100%)")]
    FeeTooHigh,

    #[msg("Bid increment basis points must be between 0 and 5000")]
    InvalidBidIncrement,

    #[msg("Time buffer seconds must be non-negative")]
    InvalidTimeBuffer,

    // ── Slot / schedule ──────────────────────────────────────────────────────
    #[msg("Scheduled date must be midnight UTC (Unix timestamp divisible by 86400)")]
    InvalidScheduledDate,

    #[msg("auction_id must equal the slot's scheduled_date")]
    AuctionIdMismatch,

    // ── Stale auction cleanup ────────────────────────────────────────────────
    #[msg("Auction must be ended for at least 3 days before it can be closed as stale")]
    AuctionNotStale,

    // ── Proposal finalization ────────────────────────────────────────────────
    #[msg("Invalid finalization status — must be 1 (passed), 2 (failed), or 3 (queued)")]
    InvalidFinalStatus,

    #[msg("Voting period is still active — cannot finalize before votes close")]
    VotingStillActive,

    #[msg("Proposal duration must be between 1 hour and 7 days")]
    InvalidDuration,

    #[msg("Vote tally would exceed the 120-NFT maximum for this collection")]
    TallyOverflow,
}
