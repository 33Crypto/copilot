#!/usr/bin/env python3
"""
Identity-Seeded Universal Decoder (ISUD)
Based on the identity: sec(x) - cos(x) = sin(x) * tan(x)

The identity is the sole hard-coded mathematical fact.
All other constants are derived from it.
"""

import math
import base64
import string
from typing import Callable, Dict, Any, Optional, Tuple

# ---------------------------------------------------------------------------
# Core identity and derived witnesses
# ---------------------------------------------------------------------------

def identity_witness(x: float) -> float:
    """Common value of both sides of sec(x) - cos(x) = sin(x)*tan(x)."""
    if abs(math.cos(x)) < 1e-12:
        raise ValueError("cos(x) ≈ 0; identity undefined")
    lhs = 1.0 / math.cos(x) - math.cos(x)
    rhs = math.sin(x) * math.tan(x)
    # Sanity check
    if abs(lhs - rhs) > 1e-9:
        raise RuntimeError("Identity failed")
    return rhs

def derive_modulus(x: float) -> int:
    """Positive integer modulus derived from the witness."""
    w = abs(identity_witness(x))
    return max(2, int(w * 1000) % 251 + 2)

def derive_shift(x: float) -> int:
    """Caesar-style shift derived from the witness."""
    return derive_modulus(x) % 26

def derive_seed(x: float) -> int:
    """Integer seed for other encodings."""
    w = identity_witness(x)
    return int(abs(w * 1_000_000)) % 10_000

# ---------------------------------------------------------------------------
# Encoding / decoding families
# ---------------------------------------------------------------------------

def encode_caesar(text: str, x: float) -> str:
    shift = derive_shift(x)
    result = []
    for c in text:
        if c.isupper():
            result.append(chr((ord(c) - 65 + shift) % 26 + 65))
        elif c.islower():
            result.append(chr((ord(c) - 97 + shift) % 26 + 97))
        else:
            result.append(c)
    return "".join(result)

def decode_caesar(text: str, x: float) -> str:
    shift = derive_shift(x)
    result = []
    for c in text:
        if c.isupper():
            result.append(chr((ord(c) - 65 - shift) % 26 + 65))
        elif c.islower():
            result.append(chr((ord(c) - 97 - shift) % 26 + 97))
        else:
            result.append(c)
    return "".join(result)

def encode_hex(data: bytes, x: float) -> str:
    """Plain hex; the witness is only used for validation later."""
    return data.hex()

def decode_hex(payload: str, x: float) -> bytes:
    return bytes.fromhex(payload)

def encode_base64(data: bytes, x: float) -> str:
    return base64.b64encode(data).decode("ascii")

def decode_base64(payload: str, x: float) -> bytes:
    return base64.b64decode(payload)

def encode_trig_offset(text: str, x: float) -> str:
    """Custom encoding: each char offset by a value derived from the identity."""
    seed = derive_seed(x)
    return "".join(chr(ord(c) + (seed % 20) + 1) for c in text)

def decode_trig_offset(payload: str, x: float) -> str:
    seed = derive_seed(x)
    return "".join(chr(ord(c) - (seed % 20) - 1) for c in payload)

def encode_lock33_pipe(text: str, x: float) -> str:
    """Encode shifted Unicode code points as pipe-separated hexadecimal."""
    shift = derive_seed(x) % 33 + 1
    return "|".join(f"{ord(c) + shift:x}" for c in text)

def decode_lock33_pipe(payload: str, x: float) -> str:
    """Decode pipe-separated hexadecimal Unicode code points."""
    if not payload:
        return ""
    shift = derive_seed(x) % 33 + 1
    decoded = []
    for token in payload.split("|"):
        if not token or any(char not in string.hexdigits for char in token):
            raise ValueError("Invalid lock33-pipe payload")
        codepoint = int(token, 16) - shift
        if not 0 <= codepoint <= 0x10FFFF:
            raise ValueError("Invalid lock33-pipe code point")
        decoded.append(chr(codepoint))
    return "".join(decoded)

# Morse (simple subset)
MORSE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".",
    "F": "..-.", "G": "--.", "H": "....", "I": "..", "J": ".---",
    "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---",
    "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...", "T": "-",
    "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--",
    "Z": "--..", " ": "/"
}
MORSE_REV = {v: k for k, v in MORSE.items()}

def encode_morse(text: str, x: float) -> str:
    return " ".join(MORSE.get(c.upper(), "?") for c in text)

def decode_morse(payload: str, x: float) -> str:
    return "".join(
        " " if tok == "/" else MORSE_REV.get(tok, "?")
        for tok in payload.split()
    )

# ---------------------------------------------------------------------------
# Witness validation
# ---------------------------------------------------------------------------

def compute_payload_witness(payload: str, x: float) -> float:
    """Simple numeric fingerprint of a payload mixed with the identity witness."""
    base = identity_witness(x)
    s = sum(ord(c) for c in payload) % 1000
    return base + s / 1000.0

def validate(payload: str, claimed_witness: float, x: float, tol: float = 1e-6) -> bool:
    expected = compute_payload_witness(payload, x)
    return abs(expected - claimed_witness) < tol

# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

ENCODERS: Dict[str, Callable] = {
    "caesar": encode_caesar,
    "hex": encode_hex,
    "base64": encode_base64,
    "trig_offset": encode_trig_offset,
    "lock33-pipe": encode_lock33_pipe,
    "morse": encode_morse,
}

DECODERS: Dict[str, Callable] = {
    "caesar": decode_caesar,
    "hex": decode_hex,
    "base64": decode_base64,
    "trig_offset": decode_trig_offset,
    "lock33-pipe": decode_lock33_pipe,
    "morse": decode_morse,
}

def encode(text: str, code_type: str, x: float) -> Tuple[str, float]:
    if code_type not in ENCODERS:
        raise ValueError(f"Unknown code type: {code_type}")
    if code_type in ("hex", "base64"):
        data = text.encode("utf-8")
        payload = ENCODERS[code_type](data, x)
    else:
        payload = ENCODERS[code_type](text, x)
    witness = compute_payload_witness(payload, x)
    return payload, witness

def decode(payload: str, code_type: str, x: float, claimed_witness: Optional[float] = None) -> Any:
    if code_type not in DECODERS:
        raise ValueError(f"Unknown code type: {code_type}")
    if claimed_witness is not None and not validate(payload, claimed_witness, x):
        raise ValueError("Witness validation failed")
    return DECODERS[code_type](payload, x)

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def run_tests():
    print("=== Identity check ===")
    for angle in [math.pi/6, math.pi/4, math.pi/3, 1.0]:
        w = identity_witness(angle)
        print(f"x={angle:.4f}  witness={w:.6f}  modulus={derive_modulus(angle)}  shift={derive_shift(angle)}")

    print("\n=== Round-trip tests ===")
    samples = [
        ("HELLO WORLD", "caesar"),
        ("secret message", "trig_offset"),
        ("Lock33 ☃", "lock33-pipe"),
        ("SOS", "morse"),
        ("HELLO WORLD", "morse"),
        ("Hello", "hex"),
        ("Test data", "base64"),
    ]
    x = math.pi / 4

    for original, ctype in samples:
        payload, witness = encode(original, ctype, x)
        decoded = decode(payload, ctype, x, witness)
        if ctype in ("hex", "base64"):
            decoded = decoded.decode("utf-8")
        ok = decoded == original
        print(f"{ctype:12}  '{original}' -> '{payload[:40]}...' -> '{decoded}'  [{'PASS' if ok else 'FAIL'}]")

    print("\n=== Negative test (tampered witness) ===")
    payload, witness = encode("ATTACK", "caesar", x)
    try:
        decode(payload, "caesar", x, witness + 1.0)
        print("FAIL: should have rejected")
    except ValueError as e:
        print(f"PASS: correctly rejected ({e})")

    print("\n=== All tests completed ===")

if __name__ == "__main__":
    run_tests()
