//! AudioTheorem is the only source of membership data.
use audiotheorem::types::PitchGroup;

pub type Memberships = [[f32; 12]; 12];

pub fn memberships() -> Memberships {
    let mut matrix = [[0.0; 12]; 12];
    for (g, group) in PitchGroup::all().iter().enumerate() {
        for pitch in group.pitch_classes() {
            matrix[g][pitch.to_index() as usize] = 1.0;
        }
    }
    matrix
}

pub fn mode_roots() -> [[u8; 7]; 12] {
    std::array::from_fn(|g| {
        let group = PitchGroup::all()[g];
        let tonic = group.pitch_class().to_index();
        let mut roots = group.pitch_classes().map(|p| p.to_index());
        roots.sort_by_key(|p| (p + 12 - tonic) % 12);
        roots
    })
}

pub fn pitch(hz: f32) -> Option<(i32, f32)> {
    if !hz.is_finite() || hz <= 0.0 {
        return None;
    }
    let midi = 69.0 + 12.0 * (hz / 440.0).log2();
    let rounded = midi.round();
    Some((rounded as i32, 100.0 * (midi - rounded)))
}

pub fn pitch_class(hz: f32) -> Option<usize> {
    pitch(hz).map(|(midi, _)| midi.rem_euclid(12) as usize)
}

#[cfg(test)]
mod tests {
    use super::*;
    use audiotheorem::types::{Matrix, PitchClass};

    #[test]
    fn every_membership_and_transposition_matches_diatonic_intervals() {
        let expected = [0, 2, 4, 5, 7, 9, 11];
        let matrix = memberships();
        for (g, group) in PitchGroup::all().iter().enumerate() {
            let tonic = group.pitch_class().to_index();
            let members = &matrix[g];
            assert_eq!(members.iter().sum::<f32>(), 7.0);
            assert_members(group, tonic, members, &expected);
        }
    }

    fn assert_members(group: &PitchGroup, tonic: u8, members: &[f32; 12], expected: &[u8]) {
        for pc in 0..12 {
            let yes = expected.contains(&((pc + 12 - tonic) % 12));
            assert_eq!(members[pc as usize] > 0.0, yes);
            assert_eq!(
                Matrix::interval(&PitchClass::from_index(pc), group).is_some(),
                yes
            );
            assert_eq!(
                Matrix::sharp(&PitchClass::from_index(pc), group).is_some(),
                yes
            );
            assert_eq!(
                Matrix::flat(&PitchClass::from_index(pc), group).is_some(),
                yes
            );
        }
    }

    #[test]
    fn all_modes_are_ordered_from_the_major_tonic() {
        for (g, roots) in mode_roots().iter().enumerate() {
            let tonic = PitchGroup::all()[g].pitch_class().to_index();
            assert_eq!(roots.map(|p| (p + 12 - tonic) % 12), [0, 2, 4, 5, 7, 9, 11]);
        }
    }

    #[test]
    fn exact_detuning_and_outside_matrix_are_not_clamped() {
        let (midi, cents) = pitch(440.0 * 2.0_f32.powf(17.0 / 1200.0)).unwrap();
        assert_eq!(midi, 69);
        assert!((cents - 17.0).abs() < 0.001);
        assert!(pitch(1.0).unwrap().0 < 0);
        assert!(pitch(100_000.0).unwrap().0 > 143);
        assert_eq!(pitch(f32::NAN), None);
    }
}
