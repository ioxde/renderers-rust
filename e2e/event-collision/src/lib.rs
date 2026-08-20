mod generated;

pub use generated::programs::ALPHA_ID as ID;
pub use generated::*;

/// Both events carry `sha256("event:TradeEvent")[..8]`: alpha's is that of its own name, beta's is
/// hardcoded to the same bytes in the fixture IDL rather than derived from `BetaTradeEvent`. The
/// byte identity is constructed because the real thing cannot be rendered — two programs declaring
/// an event named `TradeEvent` collide on the output path `events/trade_event.rs` and one struct is
/// silently dropped. Both events are unframed, so the guard is the only thing a foreign program id
/// meets. Alpha's body is a strict borsh prefix of beta's, and borsh does not require full
/// consumption, so without the guard alpha's parser decodes beta's bytes into a well-typed wrong
/// value.
#[cfg(test)]
mod collision_tests {
    use crate::generated::events::*;
    use solana_address::Address;

    fn beta_event() -> BetaTradeEvent {
        BetaTradeEvent {
            user: Address::new_from_array([7; 32]),
            amount_in: 1_000,
            amount_out: 900,
            fee: 100,
        }
    }

    fn beta_bytes() -> Vec<u8> {
        let mut data = BETA_TRADE_EVENT_DISCRIMINATOR.to_vec();
        data.extend_from_slice(&borsh::to_vec(&beta_event()).unwrap());
        data
    }

    #[test]
    fn the_two_programs_share_a_discriminator() {
        assert_eq!(TRADE_EVENT_DISCRIMINATOR, BETA_TRADE_EVENT_DISCRIMINATOR);
        assert_eq!(
            TRADE_EVENT_DISCRIMINATOR,
            [189, 219, 127, 211, 78, 230, 97, 238]
        );
        assert_ne!(crate::ALPHA_ID, crate::BETA_ID);
    }

    #[test]
    fn alpha_rejects_beta_bytes() {
        let data = beta_bytes();

        assert!(!TradeEvent::matches(&crate::BETA_ID, &data));
        assert!(TradeEvent::try_parse(&crate::BETA_ID, &data).is_none());
        assert!(identify_alpha_event(&crate::BETA_ID, &data).is_none());
        assert!(try_parse_alpha_event(&crate::BETA_ID, &data).is_none());
    }

    /// The bytes alone are not enough to tell the two apart: under alpha's own id the same data
    /// decodes, silently dropping beta's trailing `fee`. The program id is the only discriminant.
    #[test]
    fn only_the_program_id_separates_them() {
        let data = beta_bytes();
        let beta = beta_event();

        let alpha = TradeEvent::try_parse(&crate::ALPHA_ID, &data)
            .unwrap()
            .unwrap();
        assert_eq!(alpha.user, beta.user);
        assert_eq!(alpha.amount_in, beta.amount_in);
        assert_eq!(alpha.amount_out, beta.amount_out);
    }

    #[test]
    fn beta_accepts_its_own_bytes_under_its_own_id() {
        let data = beta_bytes();

        assert_eq!(
            BetaTradeEvent::try_parse(&crate::BETA_ID, &data)
                .unwrap()
                .unwrap(),
            beta_event()
        );
        assert_eq!(
            identify_beta_event(&crate::BETA_ID, &data),
            Some(BetaEventKind::BetaTradeEvent)
        );
        assert!(identify_beta_event(&crate::ALPHA_ID, &data).is_none());
    }
}
