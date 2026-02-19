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
}
