//! Music Theory Integration harnessing `audiotheorem` / `musictheory-rs`
//!
//! Provides scale definitions, chord generation, frequency calculations,
//! 144-pitch frequency map across 12 octaves, acoustic overtone & undertone
//! frequency propagation, cents tuning analysis, 12x12 Harmonic Pitch Matrix
//! (PitchClass x PitchGroup), and combinatorial pattern distribution over all 12 keys.

use audiotheorem::types::{Degree, Interval, MajorQuality, Matrix, PerfectQuality, PitchClass, PitchGroup};

pub const TOTAL_PITCHES: usize = 144;
pub const PITCHCLASSES_COUNT: usize = 12;
pub const PITCHGROUPS_COUNT: usize = 12;

pub const PITCHCLASS_NAMES: [&str; 12] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

pub const PITCHGROUP_NAMES: [&str; 12] = [
    "Cn", "Gn", "Dn", "An", "En", "Bn", "Fs", "Cs", "Gs", "Ds", "As", "Fn",
];

pub const PITCHGROUP_FULL_NAMES: [&str; 12] = [
    "Cn (C Major / A Minor)",
    "Gn (G Major / E Minor)",
    "Dn (D Major / B Minor)",
    "An (A Major / F# Minor)",
    "En (E Major / C# Minor)",
    "Bn (B Major / G# Minor)",
    "Fs (F# Major / D# Minor)",
    "Cs (Db Major / Bb Minor)",
    "Gs (Ab Major / F Minor)",
    "Ds (Eb Major / C Minor)",
    "As (Bb Major / G Minor)",
    "Fn (F Major / D Minor)",
];

#[allow(dead_code)]
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct NoteInfo {
    pub midi: u8,
    pub name: String,
    pub frequency: f32,
    pub octave: i8,
    pub key_char: Option<char>,
}

#[allow(dead_code)]
pub fn key_to_midi(key: char, base_octave: i8) -> Option<u8> {
    let lower_base = ((base_octave + 1) * 12) as i16; // e.g. Octave 3 -> MIDI 48 (C3)
    let upper_base = lower_base + 12;                 // e.g. Octave 4 -> MIDI 60 (C4)

    let semitone = match key.to_ascii_lowercase() {
        // Lower octave
        'z' => lower_base + 0,  // C
        's' => lower_base + 1,  // C#
        'x' => lower_base + 2,  // D
        'd' => lower_base + 3,  // D#
        'c' => lower_base + 4,  // E
        'v' => lower_base + 5,  // F
        'g' => lower_base + 6,  // F#
        'b' => lower_base + 7,  // G
        'h' => lower_base + 8,  // G#
        'n' => lower_base + 9,  // A
        'j' => lower_base + 10, // A#
        'm' => lower_base + 11, // B

        // Upper octave
        'q' => upper_base + 0,  // C
        '2' => upper_base + 1,  // C#
        'w' => upper_base + 2,  // D
        '3' => upper_base + 3,  // D#
        'e' => upper_base + 4,  // E
        'r' => upper_base + 5,  // F
        '5' => upper_base + 6,  // F#
        't' => upper_base + 7,  // G
        '6' => upper_base + 8,  // G#
        'y' => upper_base + 9,  // A
        '7' => upper_base + 10, // A#
        'u' => upper_base + 11, // B
        'i' => upper_base + 12, // C5

        _ => return None,
    };

    if (0..=143).contains(&semitone) {
        Some(semitone as u8)
    } else {
        None
    }
}

pub fn midi_to_freq(midi: u8) -> f32 {
    440.0 * 2.0f32.powf((midi as f32 - 69.0) / 12.0)
}

pub fn freq_to_midi(freq: f32) -> f32 {
    if freq <= 1.0 {
        return 0.0;
    }
    69.0 + 12.0 * (freq / 440.0).log2()
}

#[allow(dead_code)]
pub fn midi_to_name(midi: u8) -> String {
    let note_idx = (midi % 12) as usize;
    let octave = (midi as i8 / 12) - 1;
    format!("{}{}", PITCHCLASS_NAMES[note_idx], octave)
}

/// Natural Acoustic Propagation of a Frequency across the harmonic series
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct PropagatedHarmonic {
    pub harmonic_number: i32,  // 1 = Fundamental, 2..16 = Overtones, -2..-3 = Undertones
    pub frequency: f32,        // Exact physical frequency (Hz)
    pub midi_pitch: u8,        // Nearest 12-TET pitch index (0..143)
    pub cents_deviation: f32,  // Exact acoustic cents deviation from 12-TET (-50.0 to +50.0)
    pub pitch_class: usize,    // 0..11
    pub relative_energy: f32,  // Propagated energy with natural 1/k^alpha acoustic falloff
}

/// Compute natural acoustic propagation (overtones 1..16 and undertones 2..3)
pub fn propagate_frequency(f0: f32, energy: f32) -> Vec<PropagatedHarmonic> {
    if f0 <= 1.0 || energy <= 0.001 {
        return Vec::new();
    }

    let mut harmonics = Vec::with_capacity(20);

    // 1. Harmonics 1 to 16 (Fundamental & Overtones)
    for k in 1..=16 {
        let f_k = f0 * (k as f32);
        if f_k > 20_000.0 {
            break;
        }

        let cont_midi = freq_to_midi(f_k);
        let round_midi = cont_midi.round() as i32;
        if (0..144).contains(&round_midi) {
            let cents = (cont_midi - round_midi as f32) * 100.0;
            // Acoustic falloff: 1 / k^0.85
            let k_falloff = 1.0 / (k as f32).powf(0.85);
            let rel_energy = (energy * k_falloff).min(1.0);

            harmonics.push(PropagatedHarmonic {
                harmonic_number: k,
                frequency: f_k,
                midi_pitch: round_midi as u8,
                cents_deviation: cents.clamp(-50.0, 50.0),
                pitch_class: (round_midi as usize) % 12,
                relative_energy: rel_energy,
            });
        }
    }

    // 2. Subharmonics (Undertones) k = 2, 3
    for k in 2..=3 {
        let f_sub = f0 / (k as f32);
        if f_sub < 8.0 {
            continue;
        }
        let cont_midi = freq_to_midi(f_sub);
        let round_midi = cont_midi.round() as i32;
        if (0..144).contains(&round_midi) {
            let cents = (cont_midi - round_midi as f32) * 100.0;
            let rel_energy = (energy * (0.28 / k as f32)).min(1.0);

            harmonics.push(PropagatedHarmonic {
                harmonic_number: -k,
                frequency: f_sub,
                midi_pitch: round_midi as u8,
                cents_deviation: cents.clamp(-50.0, 50.0),
                pitch_class: (round_midi as usize) % 12,
                relative_energy: rel_energy,
            });
        }
    }

    harmonics
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ScaleType {
    Chromatic,
    Major,
    Minor,
    Dorian,
    Phrygian,
    Lydian,
    Mixolydian,
    Aeolian,
    Locrian,
    PentatonicMajor,
    PentatonicMinor,
    Blues,
}

impl ScaleType {
    pub fn intervals(&self) -> &'static [u8] {
        match self {
            ScaleType::Chromatic => &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            ScaleType::Major => &[0, 2, 4, 5, 7, 9, 11],
            ScaleType::Minor | ScaleType::Aeolian => &[0, 2, 3, 5, 7, 8, 10],
            ScaleType::Dorian => &[0, 2, 3, 5, 7, 9, 10],
            ScaleType::Phrygian => &[0, 1, 3, 5, 7, 8, 10],
            ScaleType::Lydian => &[0, 2, 4, 6, 7, 9, 11],
            ScaleType::Mixolydian => &[0, 2, 4, 5, 7, 10],
            ScaleType::Locrian => &[0, 1, 3, 5, 6, 8, 10],
            ScaleType::PentatonicMajor => &[0, 2, 4, 7, 9],
            ScaleType::PentatonicMinor => &[0, 3, 5, 7, 10],
            ScaleType::Blues => &[0, 3, 5, 6, 7, 10],
        }
    }

    /// Snap a MIDI note to the closest note in this scale given a root pitch class (0..12)
    pub fn quantize(&self, midi: u8, root: u8) -> u8 {
        if *self == ScaleType::Chromatic {
            return midi;
        }
        let intervals = self.intervals();
        let pc = (midi + 12 - (root % 12)) % 12;
        let mut min_dist = 99i16;
        let mut closest_interval = 0u8;
        for &inv in intervals {
            let dist = ((pc as i16) - (inv as i16)).abs();
            if dist < min_dist {
                min_dist = dist;
                closest_interval = inv;
            }
        }
        let octave = midi / 12;
        let quantized = octave * 12 + (root % 12) + closest_interval;
        quantized.min(143)
    }
}

/// Interval consonance vs dissonance lookup using AudioTheorem Interval
pub fn interval_base_dissonance(inv: &Interval) -> f32 {
    match inv {
        Interval::First(PerfectQuality::Perfect) | Interval::Octave(PerfectQuality::Perfect) => 0.02,
        Interval::Fifth(PerfectQuality::Perfect) | Interval::Twelfth(PerfectQuality::Perfect) => 0.07,
        Interval::Fourth(PerfectQuality::Perfect) | Interval::Eleventh(PerfectQuality::Perfect) => 0.12,
        Interval::Third(MajorQuality::Major) | Interval::Tenth(MajorQuality::Major) => 0.18,
        Interval::Third(MajorQuality::Minor) | Interval::Tenth(MajorQuality::Minor) => 0.22,
        Interval::Sixth(MajorQuality::Major) | Interval::Thirteenth(MajorQuality::Major) => 0.24,
        Interval::Sixth(MajorQuality::Minor) | Interval::Thirteenth(MajorQuality::Minor) => 0.28,
        Interval::Second(MajorQuality::Major) | Interval::Ninth(MajorQuality::Major) => 0.58,
        Interval::Seventh(MajorQuality::Minor) | Interval::Fourteenth(MajorQuality::Minor) => 0.62,
        Interval::Seventh(MajorQuality::Major) | Interval::Fourteenth(MajorQuality::Major) => 0.84,
        Interval::Second(MajorQuality::Minor) | Interval::Ninth(MajorQuality::Minor) => 0.88,
        Interval::Fifth(PerfectQuality::Diminished) | Interval::Fourth(PerfectQuality::Augmented) => 0.90,
        _ => 0.40,
    }
}

/// Degree weight for tonality and harmonic key affinity in AudioTheorem
pub fn degree_weight(deg: &Degree) -> f32 {
    match deg {
        Degree::Tonic(_) => 1.00,
        Degree::Dominant(_) => 0.92,
        Degree::Mediant(_) => 0.85,
        Degree::Subdominant(_) => 0.82,
        Degree::Submediant(_) => 0.74,
        Degree::Supertonic(_) => 0.68,
        Degree::Subtonic(_) => 0.62,
    }
}

/// Pairwise semitone interval dissonance (0.0 = consonant, 1.0 = dissonant)
pub fn pairwise_dissonance(pc_a: usize, pc_b: usize) -> f32 {
    let diff = (pc_b + 12 - (pc_a % 12)) % 12;
    let semitones = diff.min(12 - diff);
    match semitones {
        0 => 0.00,  // Unison / Octave
        5 => 0.08,  // Perfect 4th
        7 => 0.06,  // Perfect 5th
        4 => 0.16,  // Major 3rd
        3 => 0.20,  // Minor 3rd
        9 => 0.22,  // Major 6th
        8 => 0.25,  // Minor 6th
        2 => 0.58,  // Major 2nd
        10 => 0.62, // Minor 7th
        6 => 0.88,  // Tritone
        1 => 0.96,  // Minor 2nd
        11 => 0.94, // Major 7th
        _ => 0.50,
    }
}

/// Candidate Harmonic Pattern from combinatorial PitchGroup analysis
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HarmonicPatternCandidate {
    pub pitch_group_index: usize, // 0..11
    pub name: String,             // e.g. "Cn (C Major / A Minor)"
    pub short_name: String,       // "Cn"
    pub probability: f32,         // 0.0 to 1.0 (sums to 1.0 across all 12)
    pub affinity_score: f32,      // Raw matching score
    pub diatonic_matches: usize,  // Active pitch classes inside this key
    pub offnotes_count: usize,    // Active pitch classes outside this key
    pub is_harmonic: bool,        // AudioTheorem harmonious split flag
}

/// Comprehensive Harmonic Analysis payload for 144-pitch bar and 12x12 grid
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HarmonicAnalysis {
    pub pitch_energy: Vec<f32>,           // 144 pitches (0.0 to 1.0)
    pub pitch_cents: Vec<f32>,            // 144 cent deviations (-50.0 to +50.0)
    pub pitchclass_dissonance: [f32; 12], // 12 pitch classes (0.0 = consonant green, 1.0 = dissonant maroon)
    pub pitchclass_energy: [f32; 12],     // Energy per pitch class (0.0 to 1.0)
    pub grid_harmony: Vec<f32>,           // 144 cells: 12 PitchClasses (X) x 12 Octaves (Y)
    pub grid_energy: Vec<f32>,            // 144 cells illumination energy
    pub pitch_resonance: Vec<f32>,        // 144 pitches overtone & sympathetic resonance (White factor)
    pub grid_resonance: Vec<f32>,         // 12x12 grid resonance across octaves (White factor)
    pub pitchgroup_probs: [f32; 12],      // Probability distribution across 12 PitchGroups
    pub active_pitches: Vec<u8>,          // Active MIDI pitches (Blue factor)
    pub top_pitchgroup_name: String,      // Dominant PitchGroup / Tonality
    pub chord_name: String,               // Identified Chord
    pub overall_consonance: f32,          // 0.0 to 1.0 (1.0 = perfectly harmonious)
    pub ranked_patterns: Vec<HarmonicPatternCandidate>, // All 12 candidate keys ranked
    pub propagations: Vec<PropagatedHarmonic>,           // Natural overtone projections
}

impl Default for HarmonicAnalysis {
    fn default() -> Self {
        Self {
            pitch_energy: vec![0.0; TOTAL_PITCHES],
            pitch_cents: vec![0.0; TOTAL_PITCHES],
            pitchclass_dissonance: [0.0; 12],
            pitchclass_energy: [0.0; 12],
            grid_harmony: vec![0.0; TOTAL_PITCHES],
            grid_energy: vec![0.0; TOTAL_PITCHES],
            pitch_resonance: vec![0.0; TOTAL_PITCHES],
            grid_resonance: vec![0.0; TOTAL_PITCHES],
            pitchgroup_probs: [1.0 / 12.0; 12],
            active_pitches: Vec::new(),
            top_pitchgroup_name: "Cn".to_string(),
            chord_name: "None".to_string(),
            overall_consonance: 1.0,
            ranked_patterns: Vec::new(),
            propagations: Vec::new(),
        }
    }
}

pub struct HarmonicAnalyzer {
    pub pitch_groups: [PitchGroup; 12],
}

impl HarmonicAnalyzer {
    pub fn new() -> Self {
        Self {
            pitch_groups: PitchGroup::all(),
        }
    }

    /// Analyze current audio spectrum and active voices using audiotheorem PitchGroup & Matrix analysis
    /// and map natural frequency overtone propagation across the 144-pitch frequency spectrum.
    pub fn analyze(
        &self,
        active_notes: &[u8],
        pitch_energies: &[f32],
        pitch_cents: &[f32],
    ) -> HarmonicAnalysis {
        let mut final_pitch_energy = vec![0.0f32; TOTAL_PITCHES];
        let mut final_pitch_cents = vec![0.0f32; TOTAL_PITCHES];

        // 1. Ingest pitch energy and cent deviation from FFT
        let in_len = pitch_energies.len().min(TOTAL_PITCHES);
        for i in 0..in_len {
            final_pitch_energy[i] = pitch_energies[i];
        }
        let cents_len = pitch_cents.len().min(TOTAL_PITCHES);
        for i in 0..cents_len {
            final_pitch_cents[i] = pitch_cents[i];
        }

        // Boost active triggered voices into pitch energy
        for &note in active_notes {
            let idx = note as usize;
            if idx < TOTAL_PITCHES {
                final_pitch_energy[idx] = (final_pitch_energy[idx] + 0.88).min(1.0);
            }
        }

        // 2. Map Actual Frequency and its Natural Propagation (Acoustic Harmonics Series)
        let mut all_propagations = Vec::new();

        // Propagate from active notes
        for &note in active_notes {
            let f0 = midi_to_freq(note);
            let props = propagate_frequency(f0, 0.90);
            all_propagations.extend(props);
        }

        // Also propagate significant FFT peaks not already accounted for
        for (m, &e) in pitch_energies.iter().enumerate().take(TOTAL_PITCHES) {
            if e > 0.15 && !active_notes.contains(&(m as u8)) {
                // Check if it's a local peak
                let left = if m > 0 { pitch_energies[m - 1] } else { 0.0 };
                let right = if m + 1 < in_len { pitch_energies[m + 1] } else { 0.0 };
                if e >= left && e >= right {
                    let f0 = midi_to_freq(m as u8);
                    let props = propagate_frequency(f0, e * 0.75);
                    all_propagations.extend(props);
                }
            }
        }

        // Project propagated overtone energy and physical cents into the 144 pitches
        for prop in &all_propagations {
            let m = prop.midi_pitch as usize;
            if m < TOTAL_PITCHES {
                // Additive acoustic energy with saturation
                final_pitch_energy[m] = (final_pitch_energy[m] + prop.relative_energy * 0.40).min(1.0);

                // Blend cents deviation with acoustic overtone theory
                if final_pitch_cents[m].abs() < 1e-4 {
                    final_pitch_cents[m] = prop.cents_deviation;
                } else {
                    final_pitch_cents[m] = final_pitch_cents[m] * 0.60 + prop.cents_deviation * 0.40;
                }
            }
        }

        // 2b. Compute Resonance across octaves and pitch classes (White Factor)
        let mut pitch_resonance = vec![0.0f32; TOTAL_PITCHES];
        for prop in &all_propagations {
            let m = prop.midi_pitch as usize;
            if m < TOTAL_PITCHES && prop.harmonic_number != 1 {
                pitch_resonance[m] = (pitch_resonance[m] + prop.relative_energy * 0.85).min(1.0);
            }
        }

        // Sympathetic octave resonance across all 12 octaves
        for &note in active_notes {
            let base_m = note as usize;
            let pc = base_m % 12;
            for oct in 0..12 {
                let oct_m = oct * 12 + pc;
                if oct_m < TOTAL_PITCHES && oct_m != base_m {
                    let oct_dist = ((oct as i32) - (base_m as i32 / 12)).abs() as f32;
                    let falloff = 1.0 / (1.0 + oct_dist * 0.45);
                    pitch_resonance[oct_m] = (pitch_resonance[oct_m] + 0.45 * falloff).min(1.0);
                }
            }
        }

        let mut grid_resonance = vec![0.0f32; TOTAL_PITCHES];
        for oct in 0..12 {
            for pc in 0..12 {
                let m = oct * 12 + pc;
                grid_resonance[m] = pitch_resonance[m];
            }
        }

        // 3. Aggregate energy across 12 pitch classes (Cn..Bn)
        let mut pc_energy = [0.0f32; 12];
        for i in 0..TOTAL_PITCHES {
            let pc = i % 12;
            let octave_weight = 1.0 / (1.0 + (i as f32 / 48.0));
            pc_energy[pc] = (pc_energy[pc] + final_pitch_energy[i] * 0.35 * octave_weight).min(1.0);
        }

        // 4. Identify sounding pitch classes
        let mut active_pcs: Vec<PitchClass> = Vec::new();
        let mut active_pc_indices: Vec<usize> = Vec::new();
        for pc in 0..12 {
            if pc_energy[pc] > 0.07 || active_notes.iter().any(|&n| (n % 12) as usize == pc) {
                active_pcs.push(PitchClass::from_index(pc as u8));
                active_pc_indices.push(pc);
            }
        }

        // 5. AudioTheorem PitchGroup Split Classes & Combinatorial Pattern Distribution
        if active_pc_indices.is_empty() {
            // Idle state: No notes active -> No default key, zero dissonance, resting baseline
            let mut pattern_candidates = Vec::with_capacity(12);
            for (idx, _pg) in self.pitch_groups.iter().enumerate() {
                pattern_candidates.push(HarmonicPatternCandidate {
                    pitch_group_index: idx,
                    name: PITCHGROUP_FULL_NAMES[idx].to_string(),
                    short_name: PITCHGROUP_NAMES[idx].to_string(),
                    probability: 1.0 / 12.0,
                    affinity_score: 0.0,
                    diatonic_matches: 0,
                    offnotes_count: 0,
                    is_harmonic: false,
                });
            }
            let pitchgroup_probs = [1.0 / 12.0f32; 12];
            let top_pg_name = "None".to_string();
            let pc_dissonance = [0.0f32; 12];
            let grid_harmony = vec![0.0f32; TOTAL_PITCHES];
            let grid_energy = final_pitch_energy.clone();
            let chord_name = "Silent".to_string();
            let overall_consonance = 1.0f32;

            return HarmonicAnalysis {
                pitch_energy: final_pitch_energy,
                pitch_cents: final_pitch_cents,
                pitchclass_dissonance: pc_dissonance,
                pitchclass_energy: pc_energy,
                grid_harmony,
                grid_energy,
                pitch_resonance,
                grid_resonance,
                pitchgroup_probs,
                active_pitches: active_notes.to_vec(),
                top_pitchgroup_name: top_pg_name,
                chord_name,
                overall_consonance,
                ranked_patterns: pattern_candidates,
                propagations: all_propagations,
            };
        }

        let (harmonic_groups, dissonant_groups) = PitchGroup::split_classes(active_pcs.clone());

        // Evaluate all 12 candidate PitchGroups against active pitch combinations and acoustic energy
        let mut raw_scores = [0.0f32; 12];
        let mut pattern_candidates = Vec::with_capacity(12);

        for (idx, &pg) in self.pitch_groups.iter().enumerate() {
            let mut score = 0.0f32;
            let mut matches = 0usize;
            let mut offnotes = 0usize;

            // Diatonic degree weighting for every pitch class
            for pc_idx in 0..12 {
                let pc = PitchClass::from_index(pc_idx as u8);
                let e = pc_energy[pc_idx];

                if let Some(deg) = Matrix::degree(&pc, &pg) {
                    let w = degree_weight(&deg);
                    score += e * w * 1.5;
                    if active_pc_indices.contains(&pc_idx) {
                        matches += 1;
                        score += w * 2.0; // Strong match boost for directly played note
                    }
                } else {
                    // Non-diatonic (dissident) note in this key
                    if active_pc_indices.contains(&pc_idx) {
                        offnotes += 1;
                        score -= 1.25; // Significant penalty for non-diatonic sounding notes
                    }
                    score -= e * 0.40;
                }
            }

            // Dissenter penalty from AudioTheorem Kernel formula
            if dissonant_groups.contains(&pg) {
                score -= 0.364 * (offnotes as f32);
            }
            if harmonic_groups.contains(&pg) {
                score += 0.85;
            }

            let non_neg_score = score.max(0.001);
            raw_scores[idx] = non_neg_score;

            pattern_candidates.push(HarmonicPatternCandidate {
                pitch_group_index: idx,
                name: PITCHGROUP_FULL_NAMES[idx].to_string(),
                short_name: PITCHGROUP_NAMES[idx].to_string(),
                probability: 0.0, // Calculated below via softmax
                affinity_score: score,
                diatonic_matches: matches,
                offnotes_count: offnotes,
                is_harmonic: harmonic_groups.contains(&pg),
            });
        }

        // Softmax / normalized probability distribution across the 12 PitchGroups
        let gamma = 2.4f32;
        let powered_scores: Vec<f32> = raw_scores.iter().map(|&s| s.powf(gamma)).collect();
        let total_score: f32 = powered_scores.iter().sum();

        let mut pitchgroup_probs = [1.0 / 12.0f32; 12];
        if total_score > 1e-6 {
            for (i, p) in pitchgroup_probs.iter_mut().enumerate() {
                let prob = powered_scores[i] / total_score;
                *p = prob;
                pattern_candidates[i].probability = prob;
            }
        }

        // Sort candidate patterns by probability descending
        pattern_candidates.sort_by(|a, b| b.probability.partial_cmp(&a.probability).unwrap_or(std::cmp::Ordering::Equal));

        let top_pg_name = pattern_candidates[0].short_name.clone();
        let top_pg = self.pitch_groups[pattern_candidates[0].pitch_group_index];

        // 6. Compute PitchClass Dissonance (0.0 = consonant green, 1.0 = dissonant maroon/burgundy)
        // Strictly dynamic and relative to active sounding notes:
        // - Closeness to active sounding notes (minor 2nd = 0.96, tritone = 0.88, major 7th = 0.94 -> maroon/burgundy)
        // - Distance in terms of PitchGroups / modes / scales (off-notes outside the key receive an off-key dissidence penalty)
        // - Green/Yellow indicates notes within the harmonic range (5ths, 4ths, 3rds, 6ths in-key)
        let mut pc_dissonance = [0.0f32; 12];

        if active_pc_indices.len() == 1 {
            // Single root note sounding -> pure consonance at root, intervals relative to root & dynamic key
            let solo_pc = active_pc_indices[0];
            for pc in 0..12 {
                if pc == solo_pc {
                    pc_dissonance[pc] = 0.0;
                } else {
                    let base_diss = pairwise_dissonance(solo_pc, pc);
                    let in_key = Matrix::degree(&PitchClass::from_index(pc as u8), &top_pg).is_some();
                    let off_penalty = if in_key { 0.0 } else { 0.20 };
                    pc_dissonance[pc] = (base_diss + off_penalty).clamp(0.0, 1.0);
                }
            }
        } else {
            // Multiple pitch classes sounding -> pairwise harmonic tension & key dissidence
            for &pc_a in &active_pc_indices {
                let mut weighted_diss_sum = 0.0f32;
                let mut weight_sum = 0.0f32;
                for &pc_b in &active_pc_indices {
                    if pc_a != pc_b {
                        let w = pc_energy[pc_b].max(0.15);
                        weighted_diss_sum += pairwise_dissonance(pc_a, pc_b) * w;
                        weight_sum += w;
                    }
                }
                let in_key = Matrix::degree(&PitchClass::from_index(pc_a as u8), &top_pg).is_some();
                let off_penalty = if in_key { 0.0 } else { 0.15 };
                pc_dissonance[pc_a] = if weight_sum > 0.0 {
                    ((weighted_diss_sum / weight_sum) + off_penalty).clamp(0.0, 1.0)
                } else {
                    off_penalty
                };
            }

            // Inactive pitch classes evaluated against active chord & dynamic dominant key
            for pc in 0..12 {
                if !active_pc_indices.contains(&pc) {
                    let mut min_d = 1.0f32;
                    let mut max_d = 0.0f32;
                    let mut sum_d = 0.0f32;
                    for &root_pc in &active_pc_indices {
                        let d = pairwise_dissonance(root_pc, pc);
                        sum_d += d;
                        if d < min_d { min_d = d; }
                        if d > max_d { max_d = d; }
                    }
                    let avg_d = sum_d / active_pc_indices.len() as f32;
                    // A severe semitone clash against any active sounding note causes dominant dissonance
                    let interval_diss = if max_d >= 0.88 {
                        0.70 * max_d + 0.30 * avg_d
                    } else {
                        0.70 * avg_d + 0.30 * min_d
                    };
                    let in_key = Matrix::degree(&PitchClass::from_index(pc as u8), &top_pg).is_some();
                    let off_penalty = if in_key { 0.0 } else { 0.22 };
                    pc_dissonance[pc] = (interval_diss + off_penalty).clamp(0.0, 1.0);
                }
            }
        }

        // 7. Compute 12x12 Grid: 12 PitchClasses (Columns X: 0..11) x 12 Octaves (Rows Y: 0..11)
        // Total 144 pitches = 12 pitch classes x 12 octaves
        // Cell (x, y) corresponds to Pitch m = y * 12 + x, visualizing natural frequency modulation across octaves
        let mut grid_harmony = vec![0.0f32; TOTAL_PITCHES];
        let mut grid_energy = vec![0.0f32; TOTAL_PITCHES];

        for oct in 0..12 {
            for pc in 0..12 {
                let pitch_idx = oct * 12 + pc;
                let cell_idx = oct * 12 + pc;

                // Exact energy of this pitch: fundamental + natural acoustic overtone/undertone propagation
                let e = final_pitch_energy[pitch_idx];
                grid_energy[cell_idx] = e;

                // Color based on harmonic consonance/dissonance from PitchClass & AudioTheorem analysis
                // Consistent with the 144-pitch horizontal bar:
                // Consonant (P1, P5, P4, M3, m3) -> 0.0 - 0.20 (Emerald Green)
                // Mild tension (M2, M6, m7) -> 0.35 - 0.60 (Yellow / Gold)
                // Dissonant (Tritone, m2, M7, Off-Key) -> 0.70 - 1.0 (Maroon / Burgundy)
                grid_harmony[cell_idx] = pc_dissonance[pc];
            }
        }

        // 8. Chord naming
        let chord_name = identify_chord(&active_pc_indices);

        // 9. Overall consonance (1.0 - average dissonance of sounding notes)
        let overall_consonance = if active_pc_indices.is_empty() {
            1.0
        } else {
            let sum_diss: f32 = active_pc_indices.iter().map(|&i| pc_dissonance[i]).sum();
            (1.0 - (sum_diss / active_pc_indices.len() as f32)).clamp(0.0, 1.0)
        };

        HarmonicAnalysis {
            pitch_energy: final_pitch_energy,
            pitch_cents: final_pitch_cents,
            pitchclass_dissonance: pc_dissonance,
            pitchclass_energy: pc_energy,
            grid_harmony,
            grid_energy,
            pitch_resonance,
            grid_resonance,
            pitchgroup_probs,
            active_pitches: active_notes.to_vec(),
            top_pitchgroup_name: top_pg_name,
            chord_name,
            overall_consonance,
            ranked_patterns: pattern_candidates,
            propagations: all_propagations,
        }
    }
}

/// Simple chord identification from active pitch classes
fn identify_chord(pcs: &[usize]) -> String {
    if pcs.is_empty() {
        return "Silent".to_string();
    }
    if pcs.len() == 1 {
        return format!("{} Note", PITCHCLASS_NAMES[pcs[0]]);
    }
    if pcs.len() == 2 {
        let root = pcs[0];
        let diff = (pcs[1] + 12 - root) % 12;
        let int_name = match diff {
            1 => "Minor 2nd",
            2 => "Major 2nd",
            3 => "Minor 3rd",
            4 => "Major 3rd",
            5 => "Perfect 4th",
            6 => "Tritone",
            7 => "Perfect 5th",
            8 => "Minor 6th",
            9 => "Major 6th",
            10 => "Minor 7th",
            11 => "Major 7th",
            _ => "Unison",
        };
        return format!("{}-{}", PITCHCLASS_NAMES[root], int_name);
    }

    // Try each pitch class as potential root
    for &root in pcs {
        let rel_intervals: Vec<usize> = pcs.iter().map(|&p| (p + 12 - root) % 12).collect();

        let has = |semis: usize| rel_intervals.contains(&semis);

        if has(4) && has(7) && has(11) {
            return format!("{} Maj7", PITCHCLASS_NAMES[root]);
        }
        if has(4) && has(7) && has(10) {
            return format!("{} Dom7", PITCHCLASS_NAMES[root]);
        }
        if has(3) && has(7) && has(10) {
            return format!("{} Min7", PITCHCLASS_NAMES[root]);
        }
        if has(4) && has(7) {
            return format!("{} Major", PITCHCLASS_NAMES[root]);
        }
        if has(3) && has(7) {
            return format!("{} Minor", PITCHCLASS_NAMES[root]);
        }
        if has(3) && has(6) {
            return format!("{} Dim", PITCHCLASS_NAMES[root]);
        }
        if has(4) && has(8) {
            return format!("{} Aug", PITCHCLASS_NAMES[root]);
        }
        if has(5) && has(7) {
            return format!("{} Sus4", PITCHCLASS_NAMES[root]);
        }
        if has(2) && has(7) {
            return format!("{} Sus2", PITCHCLASS_NAMES[root]);
        }
    }

    format!("{} Cluster", PITCHCLASS_NAMES[pcs[0]])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_harmonic_analyzer_triad_consonance() {
        let analyzer = HarmonicAnalyzer::new();

        // C Major Triad: C4 (60), E4 (64), G4 (67)
        let active = [60, 64, 67];
        let analysis = analyzer.analyze(&active, &[], &[]);

        assert!(analysis.overall_consonance > 0.70, "C major triad should be highly consonant");
        assert_eq!(analysis.top_pitchgroup_name, "Cn", "C major notes should map to Cn group");
        assert!(analysis.chord_name.contains("Major"), "Identified as Major chord");
        assert!(analysis.pitchgroup_probs[0] > 0.20, "Cn should have high probability");
    }

    #[test]
    fn test_harmonic_analyzer_tritone_dissonance() {
        let analyzer = HarmonicAnalyzer::new();

        // C4 (60) and F#4 (66) -> Tritone
        let active = [60, 66];
        let analysis = analyzer.analyze(&active, &[], &[]);

        assert!(analysis.overall_consonance < 0.35, "Tritone should have low consonance / high dissonance");
        assert!(analysis.chord_name.contains("Tritone"));
    }

    #[test]
    fn test_frequency_propagation() {
        // A4 = 440 Hz
        let props = propagate_frequency(440.0, 1.0);
        assert!(!props.is_empty());
        // Fundamental is A4 (MIDI 69)
        assert_eq!(props[0].midi_pitch, 69);
        assert_eq!(props[0].pitch_class, 9); // A
        assert_eq!(props[0].harmonic_number, 1);

        // 2nd harmonic is A5 (880 Hz, MIDI 81)
        assert_eq!(props[1].midi_pitch, 81);
        assert_eq!(props[1].pitch_class, 9);

        // 3rd harmonic is E6 (1320 Hz, MIDI 88, +1.95 cents)
        assert_eq!(props[2].midi_pitch, 88);
        assert_eq!(props[2].pitch_class, 4); // E
        assert!((props[2].cents_deviation - 1.955).abs() < 0.5);

        // 5th harmonic is C#7 (2200 Hz, MIDI 97, -13.69 cents)
        assert_eq!(props[4].midi_pitch, 97);
        assert_eq!(props[4].pitch_class, 1); // C#
        assert!((props[4].cents_deviation - (-13.686)).abs() < 0.5);
    }

    #[test]
    fn test_144_pitches_coverage() {
        assert_eq!(TOTAL_PITCHES, 144);
        let c_minus1 = midi_to_freq(0);
        let b10 = midi_to_freq(143);
        assert!((c_minus1 - 8.1758).abs() < 0.1, "MIDI 0 frequency is ~8.176 Hz");
        assert!((b10 - 31608.53).abs() < 50.0, "MIDI 143 frequency is ~31.6 kHz");
    }

    #[test]
    fn test_idle_no_default_key() {
        let analyzer = HarmonicAnalyzer::new();
        let analysis = analyzer.analyze(&[], &[], &[]);

        assert_eq!(analysis.top_pitchgroup_name, "None", "No default key assumed when idle");
        assert_eq!(analysis.chord_name, "Silent", "Idle chord is Silent");
        assert_eq!(analysis.overall_consonance, 1.0, "Idle consonance is 1.0");
        for pc in 0..12 {
            assert_eq!(analysis.pitchclass_dissonance[pc], 0.0, "PitchClass {} has 0.0 dissonance when idle", pc);
        }
        for (i, &p) in analysis.pitchgroup_probs.iter().enumerate() {
            assert!((p - (1.0 / 12.0)).abs() < 1e-4, "PitchGroup {} has uniform prior when idle", i);
        }
    }

    #[test]
    fn test_accidental_fs_major_relational_harmony() {
        let analyzer = HarmonicAnalyzer::new();
        // F# Major Triad: F#4 (66, PC 6), A#4 (70, PC 10), C#5 (73, PC 1)
        let active = [66, 70, 73];
        let analysis = analyzer.analyze(&active, &[], &[]);

        println!("Top PG: {}", analysis.top_pitchgroup_name);
        for (i, d) in analysis.pitchclass_dissonance.iter().enumerate() {
            println!("PC {}: diss = {:.3}", PITCHCLASS_NAMES[i], d);
        }

        assert_eq!(analysis.top_pitchgroup_name, "Fs", "F# major notes should dynamically detect Fs pitchgroup");
        assert!(analysis.overall_consonance > 0.70, "F# major triad is consonant");
        assert!(analysis.chord_name.contains("Major"), "Identified as Major chord");

        // Black keys C# (PC 1) and A# (PC 10) are consonant harmonic green!
        assert!(analysis.pitchclass_dissonance[1] < 0.20, "C# is 5th of F# -> highly consonant");
        assert!(analysis.pitchclass_dissonance[10] < 0.20, "A# is 3rd of F# -> highly consonant");

        // White key G (PC 7, minor 2nd above F# and out-of-key) is severely dissonant!
        assert!(analysis.pitchclass_dissonance[7] > 0.85, "G is minor 2nd clash to F# -> highly dissonant maroon");
    }
}
