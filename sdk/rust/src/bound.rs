//! A bound is a polygon (things.md, Uses of a place): the one reading of it, shared by the write check and the folds, so every profile refuses the same shapes.
use crate::prelude::*;

pub(crate) const SCALE: usize = 9;

/// A coordinate in billionths of a degree, or None.
pub(crate) fn micro(v: &Value) -> Option<i128> {
    let t = v.as_str()?;
    if !crate::spec().is("decimal", t) {
        return None;
    }
    let (neg, body) = t.strip_prefix('-').map_or((false, t), |r| (true, r));
    let (whole, frac) = body.split_once('.').unwrap_or((body, ""));
    if frac.len() > SCALE {
        return None;
    }
    let n: i128 = format!("{whole}{frac:0<SCALE$}").parse().ok()?;
    Some(if neg { -n } else { n })
}

pub(crate) type P = (i128, i128);

/// The ring of a well-formed bound: positions (lon, lat), closed (first = last), at least four, within the globe. None when the bound is
/// not in shape (the check refuses it; a fold reads nothing from it).
pub(crate) fn ring_of(bound: &Value) -> Option<Vec<P>> {
    let o = bound.as_object()?;
    if o.len() != 2 || o.get("type")?.as_str()? != "Polygon" {
        return None;
    }
    let rings = o.get("coordinates")?.as_array()?;
    if rings.len() != 1 {
        return None;
    }
    let points = rings[0].as_array().filter(|p| p.len() <= crate::spec().bound_points)?;
    let ring: Vec<P> = points
        .iter()
        .map(|p| {
            let p = p.as_array().filter(|p| p.len() == 2)?;
            let (lon, lat) = (micro(&p[0])?, micro(&p[1])?);
            let g = 10i128.pow(SCALE as u32);
            (lon.abs() <= 180 * g && lat.abs() <= 90 * g).then_some((lon, lat))
        })
        .collect::<Option<_>>()?;
    (ring.len() >= 4 && ring.first() == ring.last()).then_some(ring)
}

/// A threshold read against a set of `members` voices (folds.md, Counts; 1.9 stage 6): a whole number from 1 to the size of the set is that
/// many. Anything else (`all`, a share), or a set with no voice, gives None: a set a signer can leave out of her causal past is one she can
/// shrink, so no count is ever `all` or a share, and none is filled in.
pub fn count_of(needed: &serde_json::Value, members: u64) -> Option<u64> {
    if members == 0 {
        return None;
    }
    crate::js::count_stated(Some(needed), Some(members as usize)).map(|n| n as u64)
}
