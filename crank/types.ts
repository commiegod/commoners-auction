/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/commoners_auction.json`.
 */
export type CommonersAuction = {
  "address": "EWXiRHrYNtMy6wXQsy2oZhops6Dsw5M4GT59Bqb3xPjC",
  "metadata": {
    "name": "commonersAuction",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createAuction",
      "docs": [
        "Called by the backend crank at the start of each auction day",
        "to open bidding for the scheduled NFT."
      ],
      "discriminator": [
        234,
        6,
        201,
        246,
        47,
        219,
        176,
        107
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Backend crank wallet — must be the program admin."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  103,
                  114,
                  97,
                  109,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "nftMint"
        },
        {
          "name": "slot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  108,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              },
              {
                "kind": "account",
                "path": "slot.scheduled_date",
                "account": "slotRegistration"
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "auctionId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "auctionId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeProgram",
      "docs": [
        "One-time setup. Called once by the admin after deployment.",
        "Default values:",
        "fee_bps          = 900  (9%)",
        "bid_increment_bps = 500  (5%)",
        "time_buffer_secs = 600  (10 minutes anti-snipe window)",
        "min_reserve      = 420_000_000 lamports (0.42 SOL)"
      ],
      "discriminator": [
        176,
        107,
        205,
        168,
        24,
        157,
        175,
        103
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  103,
                  114,
                  97,
                  109,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "defaultFeeBps",
          "type": "u16"
        },
        {
          "name": "bidIncrementBps",
          "type": "u16"
        },
        {
          "name": "timeBufferSecs",
          "type": "i64"
        },
        {
          "name": "minReserveLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "listSlot",
      "docs": [
        "Called by an NFT holder to lock their MidEvil into escrow",
        "and reserve a future auction date."
      ],
      "discriminator": [
        206,
        123,
        215,
        156,
        84,
        78,
        37,
        118
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "nftMint"
        },
        {
          "name": "holderTokenAccount",
          "docs": [
            "Holder's token account for this NFT."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "escrowTokenAccount",
          "docs": [
            "Program-owned escrow token account for this NFT."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "slot"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "slot",
          "docs": [
            "Slot registration PDA — seeds ensure one slot per mint per date."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  108,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              },
              {
                "kind": "arg",
                "path": "scheduledDate"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "scheduledDate",
          "type": "i64"
        },
        {
          "name": "reservePrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "placeBid",
      "docs": [
        "Called by any wallet to place a bid.",
        "Automatically refunds the previous bidder and extends",
        "the auction if within the anti-sniping window."
      ],
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  103,
                  114,
                  97,
                  109,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auctionState"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "docs": [
            "SOL vault PDA that holds the current winning bid in escrow.",
            "Seeds tie it to a specific auction so vaults don't collide."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auctionState"
              }
            ]
          }
        },
        {
          "name": "prevBidder",
          "docs": [
            "Previous bidder account — required for the refund transfer.",
            "Validated at runtime: must match auction.current_bidder if set."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "bidAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleAuction",
      "docs": [
        "Called by the backend crank after auction end_time.",
        "Sends NFT to winner + SOL to seller if reserve met,",
        "or returns NFT to seller if reserve not met."
      ],
      "discriminator": [
        246,
        196,
        183,
        98,
        222,
        139,
        46,
        133
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Backend crank — must be admin."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  103,
                  114,
                  97,
                  109,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auctionState"
              }
            ]
          }
        },
        {
          "name": "slot",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  108,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              },
              {
                "kind": "account",
                "path": "slot.scheduled_date",
                "account": "slotRegistration"
              }
            ]
          }
        },
        {
          "name": "nftMint"
        },
        {
          "name": "escrowTokenAccount",
          "docs": [
            "Escrow token account holding the NFT (owned by slot PDA)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "slot"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "winnerTokenAccount",
          "docs": [
            "Winner's token account — receives NFT if reserve met."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "winner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerTokenAccount",
          "docs": [
            "Seller's token account — receives NFT back if reserve not met."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "bidVault",
          "docs": [
            "The auction vault holding the winning bid in escrow."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auctionState"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "winner",
          "writable": true
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury wallet — validated by config has_one constraint."
          ],
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateParams",
      "docs": [
        "Update global config parameters.",
        "Only the admin (Squads multisig) can call this."
      ],
      "discriminator": [
        108,
        178,
        190,
        95,
        94,
        203,
        116,
        20
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  103,
                  114,
                  97,
                  109,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newFeeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "newBidIncrementBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "newTimeBufferSecs",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "newMinReserveLamports",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "newCommonTokenMint",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "newDiscountTiers",
          "type": {
            "option": {
              "array": [
                {
                  "defined": {
                    "name": "discountTier"
                  }
                },
                4
              ]
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "auctionState",
      "discriminator": [
        252,
        227,
        205,
        147,
        72,
        64,
        250,
        126
      ]
    },
    {
      "name": "programConfig",
      "discriminator": [
        196,
        210,
        90,
        231,
        144,
        149,
        140,
        63
      ]
    },
    {
      "name": "slotRegistration",
      "discriminator": [
        119,
        114,
        239,
        196,
        78,
        13,
        64,
        243
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "auctionNotStarted",
      "msg": "Auction has not started yet"
    },
    {
      "code": 6001,
      "name": "auctionEnded",
      "msg": "Auction has already ended"
    },
    {
      "code": 6002,
      "name": "auctionNotEnded",
      "msg": "Auction has not ended yet"
    },
    {
      "code": 6003,
      "name": "alreadySettled",
      "msg": "Auction has already been settled"
    },
    {
      "code": 6004,
      "name": "bidTooLow",
      "msg": "Bid is below the minimum required amount"
    },
    {
      "code": 6005,
      "name": "reserveTooLow",
      "msg": "Reserve price is below the global minimum"
    },
    {
      "code": 6006,
      "name": "slotTaken",
      "msg": "Slot is already taken for this date"
    },
    {
      "code": 6007,
      "name": "notEscrowed",
      "msg": "Slot has not been escrowed yet"
    },
    {
      "code": 6008,
      "name": "slotConsumed",
      "msg": "Slot has already been consumed"
    },
    {
      "code": 6009,
      "name": "unauthorized",
      "msg": "Unauthorized — admin only"
    },
    {
      "code": 6010,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6011,
      "name": "dateInPast",
      "msg": "Scheduled date is in the past"
    },
    {
      "code": 6012,
      "name": "mintMismatch",
      "msg": "NFT mint does not match the registered slot"
    },
    {
      "code": 6013,
      "name": "sellerMismatch",
      "msg": "Seller does not match the registered slot owner"
    }
  ],
  "types": [
    {
      "name": "auctionState",
      "docs": [
        "Live auction state for a single day's auction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nftMint",
            "docs": [
              "The NFT mint being auctioned."
            ],
            "type": "pubkey"
          },
          {
            "name": "seller",
            "docs": [
              "Wallet that listed the NFT (receives proceeds minus fee)."
            ],
            "type": "pubkey"
          },
          {
            "name": "reservePrice",
            "docs": [
              "Minimum acceptable final bid in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "docs": [
              "Unix timestamp when bidding opens."
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Unix timestamp when bidding closes.",
              "Extended by time_buffer_secs on late bids."
            ],
            "type": "i64"
          },
          {
            "name": "currentBid",
            "docs": [
              "Highest bid placed so far in lamports. Zero if no bids."
            ],
            "type": "u64"
          },
          {
            "name": "currentBidder",
            "docs": [
              "Wallet that placed the current highest bid.",
              "Refunded automatically when outbid."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "feeBps",
            "docs": [
              "Fee bps applied at settlement (resolved from seller's COMMON balance)."
            ],
            "type": "u16"
          },
          {
            "name": "settled",
            "docs": [
              "Whether this auction has been settled."
            ],
            "type": "bool"
          },
          {
            "name": "reserveMet",
            "docs": [
              "Whether the reserve price was met at settlement."
            ],
            "type": "bool"
          },
          {
            "name": "auctionId",
            "docs": [
              "Auction sequence number (day index, 1-based)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "discountTier",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minBalance",
            "docs": [
              "Minimum COMMON token balance (in raw units) to qualify.",
              "Zero means this tier slot is unused."
            ],
            "type": "u64"
          },
          {
            "name": "feeBps",
            "docs": [
              "Fee in basis points for this tier."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "programConfig",
      "docs": [
        "Global program configuration. One per deployment, stored at a PDA.",
        "Controlled by admin (Squads multisig in production)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Admin authority — Squads multisig in production."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "SubDAO treasury wallet that receives auction fees."
            ],
            "type": "pubkey"
          },
          {
            "name": "defaultFeeBps",
            "docs": [
              "Default auction fee in basis points (900 = 9%)."
            ],
            "type": "u16"
          },
          {
            "name": "bidIncrementBps",
            "docs": [
              "Minimum bid increment in basis points (500 = 5%).",
              "New bids must exceed current bid by at least this percentage."
            ],
            "type": "u16"
          },
          {
            "name": "timeBufferSecs",
            "docs": [
              "Anti-sniping time buffer in seconds (600 = 10 min).",
              "A bid placed within this window extends the auction end time."
            ],
            "type": "i64"
          },
          {
            "name": "minReserveLamports",
            "docs": [
              "Global minimum reserve price in lamports (0.42 SOL = 420_000_000)."
            ],
            "type": "u64"
          },
          {
            "name": "commonTokenMint",
            "docs": [
              "COMMON token mint — set once the token launches.",
              "Used for fee discount tier calculations at settlement."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "discountTiers",
            "docs": [
              "Fee discount tiers based on COMMON token balance.",
              "Each tier: (min_common_balance, fee_bps).",
              "Populated via governance vote after COMMON token launches."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "discountTier"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "slotRegistration",
      "docs": [
        "A holder's reservation of a future auction slot.",
        "Created when a holder locks their NFT into escrow."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nftMint",
            "docs": [
              "NFT mint locked in escrow."
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Original owner / seller."
            ],
            "type": "pubkey"
          },
          {
            "name": "scheduledDate",
            "docs": [
              "Scheduled auction date as a Unix timestamp (start of day UTC)."
            ],
            "type": "i64"
          },
          {
            "name": "reservePrice",
            "docs": [
              "Reserve price in lamports set by the seller at listing time."
            ],
            "type": "u64"
          },
          {
            "name": "escrowed",
            "docs": [
              "Whether the NFT has been transferred into escrow."
            ],
            "type": "bool"
          },
          {
            "name": "consumed",
            "docs": [
              "Whether this slot has been consumed (auction created)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
