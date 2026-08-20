mod generated;

pub use generated::programs::PLAIN_ID as ID;
pub use generated::*;

/// Both events declare fewer discriminators than their hidden prefix carries: `plain` pins the
/// first of two 8-byte entries, `framed` pins the CPI framing and its own tag but not the third
/// entry. The body therefore starts past what any declared discriminator compares, so the gate
/// and the slice it guards are sized from different places unless the generator reconciles them.
/// Anchor-extracted IDLs declare every prefix entry, which is why the other fixtures never show
/// this. The buffers below match every declared discriminator and still stop short of the body.
#[cfg(test)]
mod prefix_skew_tests {
    use crate::generated::events::*;

    /// Prefix entry one, plus a single byte of entry two: matches every declared discriminator
    /// while `try_parse` wants 16 bytes.
    fn short_unframed() -> Vec<u8> {
        let mut data = SKEWED_EVENT_DISCRIMINATOR.to_vec();
        data.push(0x11);
        data
    }

    /// The framing and the event tag with nothing after them: matches both declared
    /// discriminators while `try_parse` wants 24 bytes.
    fn short_framed() -> Vec<u8> {
        let mut data = ANCHOR_EVENT_CPI_DISCRIMINATOR.to_vec();
        data.extend_from_slice(&FRAMED_SKEWED_EVENT_DISCRIMINATOR);
        data
    }

    fn full_unframed() -> Vec<u8> {
        let mut data = SKEWED_EVENT_DISCRIMINATOR.to_vec();
        data.extend_from_slice(&[0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
        data.extend_from_slice(&borsh::to_vec(&SkewedEvent { amount: 42 }).unwrap());
        data
    }

    fn full_framed() -> Vec<u8> {
        let mut data = short_framed();
        data.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef]);
        data.extend_from_slice(&borsh::to_vec(&FramedSkewedEvent { amount: 42 }).unwrap());
        data
    }

    #[test]
    fn a_short_unframed_buffer_never_reaches_the_body_offset() {
        let data = short_unframed();
        assert_eq!(data.len(), 9);

        assert!(!SkewedEvent::matches(&crate::PLAIN_ID, &data));
        assert!(SkewedEvent::try_parse(&crate::PLAIN_ID, &data).is_none());
        assert!(identify_plain_event(&crate::PLAIN_ID, &data).is_none());
        assert!(try_parse_plain_event(&crate::PLAIN_ID, &data).is_none());
    }

    #[test]
    fn a_short_framed_buffer_never_reaches_the_body_offset() {
        let data = short_framed();
        assert_eq!(data.len(), 16);

        assert!(!FramedSkewedEvent::matches(&crate::FRAMED_ID, &data));
        assert!(FramedSkewedEvent::try_parse(&crate::FRAMED_ID, &data).is_none());
        assert!(identify_framed_event(&crate::FRAMED_ID, &data).is_none());
        assert!(try_parse_framed_event(&crate::FRAMED_ID, &data).is_none());
    }

    #[test]
    fn the_gates_agree_with_what_they_gate_at_every_length() {
        let unframed = full_unframed();
        for len in 0..=unframed.len() {
            let data = &unframed[..len];
            assert_eq!(
                SkewedEvent::matches(&crate::PLAIN_ID, data),
                SkewedEvent::try_parse(&crate::PLAIN_ID, data).is_some(),
            );
            assert_eq!(
                identify_plain_event(&crate::PLAIN_ID, data).is_none(),
                try_parse_plain_event(&crate::PLAIN_ID, data).is_none(),
            );
        }

        let framed = full_framed();
        for len in 0..=framed.len() {
            let data = &framed[..len];
            assert_eq!(
                FramedSkewedEvent::matches(&crate::FRAMED_ID, data),
                FramedSkewedEvent::try_parse(&crate::FRAMED_ID, data).is_some(),
            );
            assert_eq!(
                identify_framed_event(&crate::FRAMED_ID, data).is_none(),
                try_parse_framed_event(&crate::FRAMED_ID, data).is_none(),
            );
        }
    }

    #[test]
    fn a_complete_buffer_still_parses() {
        assert_eq!(
            SkewedEvent::try_parse(&crate::PLAIN_ID, &full_unframed())
                .unwrap()
                .unwrap(),
            SkewedEvent { amount: 42 }
        );
        assert_eq!(
            try_parse_framed_event(&crate::FRAMED_ID, &full_framed())
                .unwrap()
                .unwrap(),
            FramedEvent::FramedSkewedEvent(FramedSkewedEvent { amount: 42 })
        );
    }
}
