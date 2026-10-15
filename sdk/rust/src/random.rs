//! Randomness: from the operating system with the `std` feature. A `no_std` build has none of its own; the caller
//! passes salts, nonces and keys in (every function that needs them takes them as options).
use crate::error::{Error, Result};

/// Fill a buffer with random bytes.
pub fn fill(buf: &mut [u8]) -> Result<()> {
    #[cfg(feature = "std")]
    {
        getrandom::getrandom(buf).map_err(|e| Error::new(alloc::format!("random: {e}")))
    }
    #[cfg(not(feature = "std"))]
    {
        let _ = buf;
        Err(Error::new(
            "random: this build has no randomness of its own; pass salts, nonces and keys in",
        ))
    }
}

/// `n` random bytes.
pub fn bytes<const N: usize>() -> Result<[u8; N]> {
    let mut buf = [0u8; N];
    fill(&mut buf)?;
    Ok(buf)
}
