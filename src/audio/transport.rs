//! Fixed-capacity SPSC transport; no callback-side blocking or allocation.
pub use rtrb::{Consumer, Producer};
pub fn channel<T>(capacity: usize) -> (Producer<T>, Consumer<T>) {
    rtrb::RingBuffer::new(capacity)
}
