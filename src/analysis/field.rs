use super::{config, theory::Memberships};
use crate::contracts::Field;

pub fn normalize(mut values: [f32; 12]) -> [f32; 12] {
    values
        .iter_mut()
        .for_each(|v| *v = if v.is_finite() { v.max(0.0) } else { 0.0 });
    let total: f32 = values.iter().sum();
    if total > config::SILENCE_POWER {
        values.iter_mut().for_each(|v| *v /= total);
    }
    values
}

pub fn interpret(evidence: [f32; 12], memberships: &Memberships) -> Field {
    let mut field = Field {
        compatibility: [0.5; 12],
        ..Field::default()
    };
    if evidence.iter().sum::<f32>() <= config::SILENCE_POWER {
        return field;
    }
    field.evidence = normalize(evidence);
    let support = memberships.map(|row| dot(&field.evidence, &row));
    field.group_weights = normalize(support.map(|s| s.powi(config::GROUP_EXPONENT)));
    field.confidence = confidence(&field.group_weights);
    field.compatibility = std::array::from_fn(|p| {
        (0..12)
            .map(|g| field.group_weights[g] * memberships[g][p])
            .sum()
    });
    field
}

pub fn dot(a: &[f32; 12], b: &[f32; 12]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn confidence(weights: &[f32; 12]) -> f32 {
    let entropy: f32 = weights
        .iter()
        .filter(|v| **v > 0.0)
        .map(|v| -v * v.ln())
        .sum();
    (1.0 - entropy / 12.0_f32.ln()).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::theory;

    #[test]
    fn silence_and_chromatic_are_neutral_without_default_key() {
        let silent = interpret([0.0; 12], &theory::memberships());
        let chromatic = interpret([1.0; 12], &theory::memberships());
        assert_eq!(silent.compatibility, [0.5; 12]);
        assert_eq!(silent.group_weights, [0.0; 12]);
        assert!(chromatic.confidence < 1e-5);
        assert!(chromatic
            .compatibility
            .iter()
            .all(|v| (*v - 7.0 / 12.0).abs() < 1e-6));
    }

    #[test]
    fn fourth_power_weighting_and_scale_invariance() {
        let mut input = [0.0; 12];
        input[0] = 0.5;
        input[4] = 0.3;
        input[7] = 0.2;
        let matrix = theory::memberships();
        let field = interpret(input, &matrix);
        let powers = matrix.map(|m| dot(&input, &m).powi(4));
        let expected = normalize(powers);
        assert_eq!(field.group_weights, expected);
        let louder = interpret(input.map(|x| x * 10.0), &matrix);
        assert!(field
            .compatibility
            .iter()
            .zip(louder.compatibility)
            .all(|(a, b)| (a - b).abs() < 1e-5));
        assert!(field.compatibility[0] > field.compatibility[1]);
    }
}
