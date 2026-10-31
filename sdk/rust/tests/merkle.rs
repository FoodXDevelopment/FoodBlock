// The Merkle root of large content (modules/encoding.md): one convention, a proof for every chunk, and what it refuses.
use foodblock::merkle::{proof, root, verify};

fn chunks(n: usize) -> Vec<Vec<u8>> {
    (0..n).map(|i| format!("chunk {i}").into_bytes()).collect()
}

#[test]
fn every_chunk_of_every_size_proves_itself() {
    for n in 1..=17 {
        let c = chunks(n);
        let r = root(&c).unwrap();
        for i in 0..n {
            let p = proof(&c, i).unwrap();
            assert!(verify(&r, &c[i], i as u64, n as u64, &p), "chunk {i} of {n}");
            assert!(!verify(&r, b"other", i as u64, n as u64, &p), "a changed chunk {i} of {n}");
        }
    }
}

#[test]
fn a_carried_chunk_is_proved_by_fewer_hashes() {
    let c = chunks(5);
    assert_eq!(proof(&c, 4).unwrap().len(), 1);
    assert_eq!(proof(&c, 0).unwrap().len(), 3);
}

#[test]
fn nothing_to_prove_is_refused() {
    assert!(root(&[]).is_none());
    assert!(proof(&chunks(2), 2).is_none());
    assert!(!verify("00", b"x", 0, 0, &[]));
}

#[test]
fn a_node_is_never_a_chunk() {
    let two = chunks(2);
    let one_chunk_of_two_leaves = {
        let leaf = |c: &[u8]| {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update([0u8]);
            h.update(c);
            h.finalize().to_vec()
        };
        [leaf(&two[0]), leaf(&two[1])].concat()
    };
    assert_ne!(root(&[one_chunk_of_two_leaves]).unwrap(), root(&two).unwrap());
}
