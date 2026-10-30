//! Theory adapter for HUD: circle order is NOT scale/tetrachord order.
use super::theory;
pub const FIFTHS: [u8; 12] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

pub fn tetrachords(tonic: u8, mode: usize) -> [[u8; 4]; 2] {
    let roots = theory::mode_roots();
    let major = roots.iter().find(|r| r[0] == tonic % 12).unwrap();
    let ordered: [u8; 8] = std::array::from_fn(|i| major[(i + mode % 7) % 7]);
    [
        ordered[..4].try_into().unwrap(),
        ordered[4..].try_into().unwrap(),
    ]
}
pub fn group_tonic(group: usize) -> u8 {
    theory::mode_roots()[group % 12][0]
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn circle_and_tetrachords_preserve_all_transpositions() {
        for tonic in 0..12 {
            let [a, b] = tetrachords(tonic, 0);
            assert_eq!(a.map(|p| (p + 12 - tonic) % 12), [0, 2, 4, 5]);
            assert_eq!(b.map(|p| (p + 12 - tonic) % 12), [7, 9, 11, 0]);
            assert_eq!(b, tetrachords((tonic + 7) % 12, 0)[0]);
        }
        for pair in FIFTHS.windows(2) {
            assert_eq!((pair[1] + 12 - pair[0]) % 12, 7);
        }
    }
}
