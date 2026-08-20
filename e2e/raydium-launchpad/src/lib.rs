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

    fn claim_vested_bytes() -> Vec<u8> {
        framed(
            CLAIM_VESTED_EVENT_DISCRIMINATOR,
            &borsh::to_vec(&claim_vested_event()).unwrap(),
        )
    }

    fn foreign_program() -> Address {
        Address::new_from_array([9; 32])
    }

    #[test]
    fn try_parse_decodes_a_matching_event() {
        let data = claim_vested_bytes();

        assert!(ClaimVestedEvent::matches(&crate::ID, &data));
        assert_eq!(
            ClaimVestedEvent::try_parse(&crate::ID, &data)
                .unwrap()
                .unwrap(),
            claim_vested_event()
        );
    }

    #[test]
    fn try_parse_returns_none_for_another_event_of_the_same_program() {
        let data = claim_vested_bytes();

        assert!(!TradeEvent::matches(&crate::ID, &data));
        assert!(TradeEvent::try_parse(&crate::ID, &data).is_none());
    }

    #[test]
    fn try_parse_returns_none_for_foreign_framed_data() {
        // Valid CPI framing, but a discriminator unknown to this program.
        let data = framed([0xff; 8], &[1, 2, 3]);

        assert!(ClaimVestedEvent::try_parse(&crate::ID, &data).is_none());
        assert!(identify_raydium_launchpad_event(&crate::ID, &data).is_none());
        assert!(try_parse_raydium_launchpad_event(&crate::ID, &data).is_none());
    }

    #[test]
    fn try_parse_surfaces_an_error_for_a_truncated_body() {
        // The discriminator matches, so the failure to deserialize is a real error, not a miss.
        let data = framed(CLAIM_VESTED_EVENT_DISCRIMINATOR, &[1, 2, 3]);

        assert!(ClaimVestedEvent::matches(&crate::ID, &data));
        assert!(ClaimVestedEvent::try_parse(&crate::ID, &data)
            .unwrap()
            .is_err());
        assert!(try_parse_raydium_launchpad_event(&crate::ID, &data)
            .unwrap()
            .is_err());
    }

    /// The body slice starts exactly at the end of the framing plus discriminator, so an empty
    /// body is the boundary case for the raw indexing in the generated skip.
    #[test]
    fn try_parse_surfaces_an_error_for_an_empty_body() {
        let data = framed(CLAIM_VESTED_EVENT_DISCRIMINATOR, &[]);
        assert_eq!(data.len(), 16);

        assert!(ClaimVestedEvent::matches(&crate::ID, &data));
        assert!(ClaimVestedEvent::try_parse(&crate::ID, &data)
            .unwrap()
            .is_err());
        assert!(try_parse_raydium_launchpad_event(&crate::ID, &data)
            .unwrap()
            .is_err());
    }

    #[test]
    fn identify_and_try_parse_dispatch_program_events() {
        let data = claim_vested_bytes();

        assert_eq!(
            identify_raydium_launchpad_event(&crate::ID, &data),
            Some(RaydiumLaunchpadEventKind::ClaimVestedEvent)
        );
        assert_eq!(
            try_parse_raydium_launchpad_event(&crate::ID, &data)
                .unwrap()
                .unwrap(),
            RaydiumLaunchpadEvent::ClaimVestedEvent(claim_vested_event())
        );
    }

    #[test]
    fn identify_returns_none_for_unframed_data() {
        assert!(identify_raydium_launchpad_event(&crate::ID, &[0u8; 32]).is_none());
        assert!(identify_raydium_launchpad_event(&crate::ID, &[]).is_none());
    }

    #[test]
    fn parse_helpers_reject_data_emitted_by_another_program() {
        let data = claim_vested_bytes();

        assert!(!ClaimVestedEvent::matches(&foreign_program(), &data));
        assert!(ClaimVestedEvent::try_parse(&foreign_program(), &data).is_none());
        assert!(identify_raydium_launchpad_event(&foreign_program(), &data).is_none());
        assert!(try_parse_raydium_launchpad_event(&foreign_program(), &data).is_none());
    }

    /// A program mismatch is a miss, not a decode failure: `Some(Err(_))` is the slot for a body
    /// that failed to deserialize, and conflating the two makes callers log every foreign event.
    #[test]
    fn a_program_mismatch_is_never_reported_as_a_decode_error() {
        let data = claim_vested_bytes();

        assert!(matches!(
            ClaimVestedEvent::try_parse(&foreign_program(), &data),
            None
        ));
        assert!(matches!(
            try_parse_raydium_launchpad_event(&foreign_program(), &data),
            None
        ));
    }

    /// The generated skip indexes raw (`&data[16..]`), which is only safe because `matches`
    /// proves the length. Every short input must fall out as a miss rather than a panic.
    #[test]
    fn short_inputs_are_misses_rather_than_panics() {
        let framing_only = ANCHOR_EVENT_CPI_DISCRIMINATOR.to_vec();
        let mut one_short = claim_vested_bytes();
        one_short.truncate(15);

        for data in [vec![0u8; 4], framing_only, one_short, Vec::new()] {
            assert!(!ClaimVestedEvent::matches(&crate::ID, &data));
            assert!(ClaimVestedEvent::try_parse(&crate::ID, &data).is_none());
            assert!(identify_raydium_launchpad_event(&crate::ID, &data).is_none());
            assert!(try_parse_raydium_launchpad_event(&crate::ID, &data).is_none());
        }
    }

    /// `matches` is the sole gate on `try_parse`, and `identify` the sole gate on the aggregate.
    #[test]
    fn the_gates_agree_with_what_they_gate() {
        let mut one_short = claim_vested_bytes();
        one_short.truncate(15);
        let inputs = [
            claim_vested_bytes(),
            framed(CLAIM_VESTED_EVENT_DISCRIMINATOR, &[]),
            framed(CLAIM_VESTED_EVENT_DISCRIMINATOR, &[1, 2, 3]),
            framed([0xff; 8], &[1, 2, 3]),
            ANCHOR_EVENT_CPI_DISCRIMINATOR.to_vec(),
            one_short,
            vec![0u8; 4],
            Vec::new(),
        ];

        for program_id in [crate::ID, foreign_program()] {
            for data in &inputs {
                assert_eq!(
                    ClaimVestedEvent::matches(&program_id, data),
                    ClaimVestedEvent::try_parse(&program_id, data).is_some(),
                );
                assert_eq!(
                    identify_raydium_launchpad_event(&program_id, data).is_none(),
                    try_parse_raydium_launchpad_event(&program_id, data).is_none(),
                );
            }
        }
    }
}
