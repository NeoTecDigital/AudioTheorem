use super::{config, field, theory};
use crate::contracts::{Field, ModeCandidate};

pub struct RootHistory {
    persistence: [f32; 12],
    bass: [f32; 12],
    arrivals: [f32; 12],
    roots: [[u8; 7]; 12],
}

impl RootHistory {
    pub fn new() -> Self {
        Self {
            persistence: [0.0; 12],
            bass: [0.0; 12],
            arrivals: [0.0; 12],
            roots: theory::mode_roots(),
        }
    }

    pub fn update(
        &mut self,
        evidence: [f32; 12],
        bass: [f32; 12],
        seconds: f32,
        arrival: Option<u8>,
    ) {
        let decay = (-seconds / config::ROOT_MEMORY_SECONDS).exp();
        let evidence = field::normalize(evidence);
        let bass = field::normalize(bass);
        for p in 0..12 {
            self.persistence[p] = decay * self.persistence[p] + (1.0 - decay) * evidence[p];
            self.bass[p] = decay * self.bass[p] + (1.0 - decay) * bass[p];
            self.arrivals[p] *= decay;
        }
        if let Some(root) = arrival {
            self.arrivals[root as usize] += 1.0;
        }
    }

    pub fn candidates(&self, field: &Field) -> Vec<ModeCandidate> {
        let persistence = field::normalize(self.persistence);
        let bass = field::normalize(self.bass);
        let arrivals = field::normalize(self.arrivals);
        let mut result = Vec::with_capacity(84);
        for g in 0..12 {
            self.group_candidates(g, field, &persistence, &bass, &arrivals, &mut result);
        }
        result.sort_by(|a, b| b.weight.total_cmp(&a.weight));
        result
    }

    fn group_candidates(
        &self,
        g: usize,
        field: &Field,
        persistence: &[f32; 12],
        bass: &[f32; 12],
        arrivals: &[f32; 12],
        result: &mut Vec<ModeCandidate>,
    ) {
        let support: f32 = self.roots[g]
            .iter()
            .map(|p| field.evidence[*p as usize])
            .sum();
        for mode in 0..7 {
            let root = self.roots[g][mode] as usize;
            let components = [
                persistence[root],
                persistence[(root + 7) % 12],
                bass[root],
                arrivals[root],
            ];
            let mut intervals = self.roots[g].map(|p| (p + 12 - root as u8) % 12);
            intervals.sort_unstable();
            let score: f32 = components
                .iter()
                .zip(config::ROOT_WEIGHTS)
                .map(|(v, w)| v * w)
                .sum();
            result.push(ModeCandidate {
                group: g as u8,
                root: root as u8,
                mode: mode as u8,
                intervals,
                weight: score * support,
                persistence: components[0],
                fifth: components[1],
                bass: components[2],
                arrivals: components[3],
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_default_root_and_all_competing_modes_retained() {
        let roots = RootHistory::new();
        let candidates = roots.candidates(&Field::default());
        assert_eq!(candidates.len(), 84);
        assert!(candidates.iter().all(|c| c.weight == 0.0));
        for g in 0..12 {
            assert_eq!(candidates.iter().filter(|c| c.group == g).count(), 7);
        }
    }

    #[test]
    fn unfinished_hypothesis_never_reinforces_arrivals() {
        let mut roots = RootHistory::new();
        let evidence = [1.0; 12];
        roots.update(evidence, evidence, 12.0, None);
        assert_eq!(roots.arrivals, [0.0; 12]);
        roots.update(evidence, evidence, 0.1, Some(5));
        assert_eq!(roots.arrivals[5], 1.0);
        roots.update([0.0; 12], [0.0; 12], 12.0, None);
        assert!((roots.arrivals[5] - (-1.0_f32).exp()).abs() < 1e-5);
    }

    #[test]
    fn root_score_uses_explainable_weights_times_raw_group_support() {
        let mut roots = RootHistory::new();
        let evidence = [0.3, 0.1, 0.1, 0.0, 0.2, 0.1, 0.0, 0.2, 0.0, 0.0, 0.0, 0.0];
        roots.update(evidence, evidence, 1.0, Some(0));
        let matrix = theory::memberships();
        let field = field::interpret(evidence, &matrix);
        for candidate in roots.candidates(&field) {
            let support = field::dot(&field.evidence, &matrix[candidate.group as usize]);
            let score = candidate.persistence * 0.45
                + candidate.fifth * 0.25
                + candidate.bass * 0.20
                + candidate.arrivals * 0.10;
            assert!((candidate.weight - score * support).abs() < 1e-6);
        }
    }
}
