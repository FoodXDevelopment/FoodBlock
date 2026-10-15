//! The smallest peer: a sensor that signs a reading in its own chain and checks it before sending.
//! cargo run --example micro --profile micro --no-default-features --features std,micro
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{amount, keypair_from_seed, write, ComposeOptions, WriteOptions};
use serde_json::json;

fn main() -> Result<(), foodblock::Error> {
    let keys = keypair_from_seed(&"5e".repeat(32))?;
    let recovery = keypair_from_seed(&"7e".repeat(32))?;
    let me = genesis(
        &keys,
        &GenesisOptions {
            kind: "sensor",
            at: "2026-10-15T09:00:00.000Z".into(),
            encryption_key: "0f101bc98e786e795207789cf2e203f0cad2c7cc97a96fb7c3a9b458e8fe4729",
            recovery_key: &recovery.public_key_sign,
            reach: "P30D",
        },
    )?;
    let id = me["hash"].as_str().unwrap().to_string();
    let held = [me.clone()];
    let options = WriteOptions {
        compose: ComposeOptions {
            author: id.clone(),
            at: Some("2026-10-15T09:01:00.000Z".into()),
            ..Default::default()
        },
        key: Some(&keys),
        held: &held,
        schemas: None,
    };
    let reading = write(
        "observe",
        &json!({ "kind": "reading", "amount": amount("3.9", "Cel") }),
        &json!({ "subject": id }),
        &options,
    )?;
    println!("{}", foodblock::wrap(&reading));
    Ok(())
}
