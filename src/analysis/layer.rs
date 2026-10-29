use super::{cadence::CadenceTrace, field, roots::RootHistory, theory::Memberships};
use crate::contracts::{CadenceState, Field, ModeCandidate};

pub struct Layer {
    cadence: CadenceTrace,
    roots: RootHistory,
}

impl Layer {
    pub fn new(rate: u32) -> Self {
        Self {
            cadence: CadenceTrace::new(rate),
            roots: RootHistory::new(),
        }
    }

    pub fn analyze(
        &mut self,
        evidence: [f32; 12],
        bass: [f32; 12],
        dt: f32,
        sample: u64,
        matrix: &Memberships,
        audible: bool,
    ) -> (Field, Vec<ModeCandidate>, CadenceState) {
        let field = field::interpret(evidence, matrix);
        let cadence_evidence = if audible {
            field.clone()
        } else {
            Field::default()
        };
        let (cadence, arrival) = self.cadence.update(&cadence_evidence, dt, sample, matrix);
        self.roots.update(evidence, bass, dt, arrival);
        let roots = self.roots.candidates(&field);
        (field, roots, cadence)
    }
}
