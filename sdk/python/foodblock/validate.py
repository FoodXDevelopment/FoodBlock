"""Schema validation for FoodBlocks (Section 8)."""

CORE_SCHEMAS = {
    "foodblock:substance.product@1.0": {
        "target_type": "substance.product",
        "version": "1.0",
        "fields": {
            "name": {"type": "str", "required": True},
            "price": {"type": "float"},
            "unit": {"type": "str"},
            "weight": {"type": "dict"},
            "allergens": {"type": "dict"},
            "gtin": {"type": "str"},
        },
        "expected_refs": ["seller"],
        "optional_refs": ["origin", "inputs", "certifications"],
        "requires_instance_id": False,
    },
    "foodblock:transfer.order@1.0": {
        "target_type": "transfer.order",
        "version": "1.0",
        "fields": {
            "instance_id": {"type": "str", "required": True},
            "quantity": {"type": "float"},
            "unit": {"type": "str"},
            "total": {"type": "float"},
            "payment_ref": {"type": "str"},
        },
        "expected_refs": ["buyer", "seller"],
        "optional_refs": ["product", "agent"],
        "requires_instance_id": True,
    },
    "foodblock:observe.review@1.0": {
        "target_type": "observe.review",
        "version": "1.0",
        "fields": {
            "instance_id": {"type": "str", "required": True},
            "rating": {"type": "float", "required": True},
            "text": {"type": "str"},
        },
        "expected_refs": ["subject", "author"],
        "optional_refs": [],
        "requires_instance_id": True,
    },
}

TYPE_MAP = {"str": str, "float": (int, float), "int": int, "dict": dict, "list": list, "bool": bool}

def validate(block: dict, schema: dict = None, registry: dict = None) -> list:
    errors = []
    if not block or "type" not in block or "state" not in block:
        errors.append("Block must have type and state")
        return errors
    schema_def = schema
    if not schema_def and "$schema" in block.get("state", {}):
        reg = registry or CORE_SCHEMAS
        schema_ref = block["state"]["$schema"]
        schema_def = reg.get(schema_ref)
        if not schema_def:
            errors.append(f"Unknown schema: {schema_ref}")
            return errors
    if not schema_def:
        return errors
    if schema_def.get("target_type") and block["type"] != schema_def["target_type"]:
        errors.append(f"Type mismatch: block is {block['type']}, schema is for {schema_def['target_type']}")
    fields = schema_def.get("fields", {})
    for field, defn in fields.items():
        if defn.get("required") and field not in block["state"]:
            errors.append(f"Missing required field: state.{field}")
        if field in block["state"] and "type" in defn:
            expected = TYPE_MAP.get(defn["type"])
            if expected and not isinstance(block["state"][field], expected):
                errors.append(f"Field state.{field} should be {defn['type']}, got {type(block['state'][field]).__name__}")
    for ref in schema_def.get("expected_refs", []):
        val = block.get("refs", {}).get(ref)
        if not val or (isinstance(val, list) and len(val) == 0):
            errors.append(f"Missing expected ref: refs.{ref}")
    if schema_def.get("requires_instance_id") and "instance_id" not in block.get("state", {}):
        errors.append("Missing required field: state.instance_id")
    return errors
