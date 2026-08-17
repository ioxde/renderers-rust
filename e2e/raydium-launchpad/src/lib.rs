mod generated;

pub use generated::programs::RAYDIUM_LAUNCHPAD_ID as ID;
pub use generated::*;

#[cfg(test)]
mod tests {
    use solana_address::{address, Address};

    fn filler(byte: u8) -> Address {
        Address::new_from_array([byte; 32])
    }

    /// PDAs with a dynamic `programId` (a runtime account reference) must derive
    /// under that program, not the local launchpad program. Expected addresses are
    /// computed independently with codama's `dynamic-address-resolution` package
    /// (the runtime source of truth), using
    /// `market = So11111111111111111111111111111111111111112` and the default
    /// (canonical) amm program `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`.
    #[test]
    fn migrate_to_amm_derives_pdas_under_dynamic_amm_program() {
        let market = address!("So11111111111111111111111111111111111111112");
        let ix = crate::instructions::MigrateToAmmBuilder::new(
            filler(1),  // payer
            filler(2),  // base_mint
            filler(3),  // quote_mint
            market,     // market
            filler(5),  // request_queue
            filler(6),  // event_queue
            filler(7),  // bids
            filler(8),  // asks
            filler(9),  // market_vault_signer
            filler(10), // market_base_vault
            filler(11), // market_quote_vault
            filler(12), // amm_create_fee_destination
            filler(13), // global_config
            filler(14), // base_vault
            filler(15), // quote_vault
            filler(16), // pool_lp_token
            1,          // base_lot_size
            1,          // quote_lot_size
            0,          // market_vault_signer_nonce
        )
        .instruction();

        assert_eq!(
            ix.accounts[13].pubkey,
            address!("2ooeaoRtTBK2EgKFLUKeZVz7SJZo3etuVhHagwPxBegj"),
            "amm_pool"
        );
        assert_eq!(
            ix.accounts[14].pubkey,
            address!("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"),
            "amm_authority"
        );
        assert_eq!(
            ix.accounts[15].pubkey,
            address!("HUGGGKtDNCKVTWPRVcTXyEJxNchMhhyZjhvUpfqPbka"),
            "amm_open_orders"
        );
        assert_eq!(
            ix.accounts[20].pubkey,
            address!("9DCxsMizn3H1hprZ7xWe6LDzeUeZBksYFpBWBtSf1PQX"),
            "amm_config"
        );
    }

    /// Same as above for the cpswap/lock programs, with
    /// `cpswap_pool = base_mint = quote_mint = So11111111111111111111111111111111111111112`
    /// and the default cpswap/lock programs.
    #[test]
    fn migrate_to_cpswap_derives_pdas_under_dynamic_programs() {
        let shared = address!("So11111111111111111111111111111111111111112");
        let ix = crate::instructions::MigrateToCpswapBuilder::new(
            filler(1),  // payer
            shared,     // base_mint
            shared,     // quote_mint
            filler(4),  // platform_config
            shared,     // cpswap_pool
            filler(6),  // cpswap_config
            filler(7),  // cpswap_create_pool_fee
            filler(8),  // lock_lp_vault
            filler(9),  // global_config
            filler(10), // base_vault
            filler(11), // quote_vault
            filler(12), // pool_lp_token
        )
        .instruction();

        assert_eq!(
            ix.accounts[6].pubkey,
            address!("GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL"),
            "cpswap_authority"
        );
        assert_eq!(
            ix.accounts[7].pubkey,
            address!("CnXtmAN29yi5xNoc47HhtfEER7Ei3F3BBDM9KL6jen6d"),
            "cpswap_lp_mint"
        );
        assert_eq!(
            ix.accounts[14].pubkey,
            address!("3f7GcQFG397GAaEnv51zR6tsTVihYRydnydDD1cXekxH"),
            "lock_authority"
        );
    }

    /// A folded finder is only correct if it is what the syscall would have returned; deriving
    /// on-chain costs 1,500 CU per bump attempt, which is why it is folded in the first place.
    #[test]
    fn folded_finders_return_the_runtime_derivation() {
        assert_eq!(
            crate::pdas::find_authority_pda(),
            Address::find_program_address(&[crate::pdas::AUTHORITY_SEED], &crate::ID),
            "authority derives under this program"
        );
        assert_eq!(
            crate::pdas::find_cpswap_authority_pda(),
            Address::find_program_address(
                &[crate::pdas::CPSWAP_AUTHORITY_SEED],
                &crate::pdas::CPSWAP_AUTHORITY_PROGRAM_ADDRESS,
            ),
            "cpswap_authority derives under the program it is pinned to"
        );
    }

    /// The folded constants are usable where a runtime derivation is not.
    const _FOLDED_IN_CONST_CONTEXT: (Address, u8) = crate::pdas::find_authority_pda();

    #[test]
    fn folded_signer_seeds_recreate_the_folded_address() {
        assert_eq!(
            Address::create_program_address(crate::pdas::AUTHORITY_SIGNER_SEEDS, &crate::ID)
                .unwrap(),
            crate::pdas::AUTHORITY_ADDRESS,
            "authority signs for itself"
        );
        assert_eq!(
            Address::create_program_address(
                crate::pdas::CPSWAP_AUTHORITY_SIGNER_SEEDS,
                &crate::pdas::CPSWAP_AUTHORITY_PROGRAM_ADDRESS,
            )
            .unwrap(),
            crate::pdas::CPSWAP_AUTHORITY_ADDRESS,
            "cpswap_authority signs under its pin"
        );
    }
}

#[cfg(test)]
mod event_tests {
    use crate::generated::events::*;
    use solana_address::Address;

    fn framed(discriminator: [u8; 8], body: &[u8]) -> Vec<u8> {
        let mut data = ANCHOR_EVENT_CPI_DISCRIMINATOR.to_vec();
        data.extend_from_slice(&discriminator);
        data.extend_from_slice(body);
        data
    }

    fn claim_vested_event() -> ClaimVestedEvent {
        ClaimVestedEvent {
            pool_state: Address::new_from_array([1; 32]),
            beneficiary: Address::new_from_array([2; 32]),
            claim_amount: 42,
        }
    }

    #[test]
    fn try_parse_decodes_a_matching_event() {
        let event = claim_vested_event();
        let data = framed(
            CLAIM_VESTED_EVENT_DISCRIMINATOR,
            &borsh::to_vec(&event).unwrap(),
        );

        assert!(ClaimVestedEvent::matches(&data));
        assert_eq!(ClaimVestedEvent::try_parse(&data).unwrap().unwrap(), event);
    }

    #[test]
    fn try_parse_returns_none_for_another_event_of_the_same_program() {
        let event = claim_vested_event();
        let data = framed(
            CLAIM_VESTED_EVENT_DISCRIMINATOR,
            &borsh::to_vec(&event).unwrap(),
        );

        assert!(!TradeEvent::matches(&data));
        assert!(TradeEvent::try_parse(&data).is_none());
    }

    #[test]
    fn try_parse_returns_none_for_foreign_framed_data() {
        // Valid CPI framing, but a discriminator unknown to this program.
        let data = framed([0xff; 8], &[1, 2, 3]);

        assert!(ClaimVestedEvent::try_parse(&data).is_none());
        assert!(identify_raydium_launchpad_event(&data).is_none());
        assert!(try_parse_raydium_launchpad_event(&data).is_none());
    }

    #[test]
    fn try_parse_surfaces_an_error_for_a_truncated_body() {
        // The discriminator matches, so the failure to deserialize is a real error.
        let data = framed(CLAIM_VESTED_EVENT_DISCRIMINATOR, &[1, 2, 3]);

        assert!(ClaimVestedEvent::matches(&data));
        assert!(ClaimVestedEvent::try_parse(&data).unwrap().is_err());
        assert!(try_parse_raydium_launchpad_event(&data).unwrap().is_err());
    }

    #[test]
    fn identify_and_try_parse_dispatch_program_events() {
        let event = claim_vested_event();
        let data = framed(
            CLAIM_VESTED_EVENT_DISCRIMINATOR,
            &borsh::to_vec(&event).unwrap(),
        );

        assert_eq!(
            identify_raydium_launchpad_event(&data),
            Some(RaydiumLaunchpadEventKind::ClaimVestedEvent)
        );
        assert_eq!(
            try_parse_raydium_launchpad_event(&data).unwrap().unwrap(),
            RaydiumLaunchpadEvent::ClaimVestedEvent(event)
        );
    }

    #[test]
    fn identify_returns_none_for_unframed_data() {
        assert!(identify_raydium_launchpad_event(&[0u8; 32]).is_none());
        assert!(identify_raydium_launchpad_event(&[]).is_none());
    }
}
