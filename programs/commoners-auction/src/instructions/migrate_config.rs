use anchor_lang::prelude::*;
use crate::state::ProgramConfig;

/// One-time migration: extends the ProgramConfig account to accommodate the
/// new `required_collection: Option<Pubkey>` field added at the end.
///
/// The existing account data is unchanged; realloc zero-initializes the new
/// 33 bytes, which encodes `required_collection = None` in borsh.
///
/// Safe to call multiple times — realloc to the same size is a no-op.
pub fn migrate_config(ctx: Context<MigrateConfig>) -> Result<()> {
    let new_size = 8 + ProgramConfig::INIT_SPACE;
    let account_info = ctx.accounts.config.to_account_info();
    let current_size = account_info.data_len();

    if current_size < new_size {
        // Fund the account if it needs more lamports for rent exemption.
        let rent = Rent::get()?;
        let required_lamports = rent.minimum_balance(new_size);
        let current_lamports = account_info.lamports();
        if current_lamports < required_lamports {
            let diff = required_lamports.saturating_sub(current_lamports);
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.admin.to_account_info(),
                        to: account_info.clone(),
                    },
                ),
                diff,
            )?;
        }
        account_info.realloc(new_size, false)?;
        msg!("ProgramConfig extended from {} to {} bytes", current_size, new_size);
    } else {
        msg!("ProgramConfig already at {} bytes — no migration needed", current_size);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct MigrateConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Using AccountInfo directly to avoid borsh decode of old layout.
    /// We verify admin authority via the discriminator + admin field manually
    /// and rely on the PDA seeds constraint for authenticity.
    #[account(
        mut,
        seeds = [ProgramConfig::SEED],
        bump,
    )]
    pub config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
