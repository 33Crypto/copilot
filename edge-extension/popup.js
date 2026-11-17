const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..", " ": "/"
};
const MORSE_REV = Object.fromEntries(
  Object.entries(MORSE).map(([letter, code]) => [code, letter])
);

function identityWitness(x) {
  if (!Number.isFinite(x)) {
    throw new Error("Angle must be a finite number.");
  }
  if (Math.abs(Math.cos(x)) < 1e-12) {
    throw new Error("cos(x) ≈ 0; identity undefined");
  }
  const lhs = 1 / Math.cos(x) - Math.cos(x);
  const rhs = Math.sin(x) * Math.tan(x);
  if (Math.abs(lhs - rhs) > 1e-9) {
    throw new Error("Identity failed");
  }
  return rhs;
}

function deriveModulus(x) {
  const witness = Math.abs(identityWitness(x));
  return Math.max(2, Math.trunc(witness * 1000) % 251 + 2);
}

function deriveShift(x) {
  return deriveModulus(x) % 26;
}

function deriveSeed(x) {
  const scaledWitness = Math.trunc(Math.abs(identityWitness(x) * 1_000_000));
  return Number(BigInt(scaledWitness) % 10_000n);
}

function encodeCaesar(text, x) {
  const shift = deriveShift(x);
  return Array.from(text, (character) => {
    const code = character.codePointAt(0);
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint((code - 65 + shift) % 26 + 65);
    }
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint((code - 97 + shift) % 26 + 97);
    }
    return character;
  }).join("");
}

function decodeCaesar(text, x) {
  const shift = deriveShift(x);
  return Array.from(text, (character) => {
    const code = character.codePointAt(0);
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint((code - 65 - shift + 26) % 26 + 65);
    }
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint((code - 97 - shift + 26) % 26 + 97);
    }
    return character;
  }).join("");
}

function encodeHex(text) {
  return Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function decodeHex(payload) {
  const compactPayload = payload.replace(/\s/g, "");
  if (compactPayload.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(compactPayload)) {
    throw new Error("Invalid hex payload.");
  }
  const bytes = new Uint8Array(compactPayload.match(/.{2}/g)?.map((pair) =>
    Number.parseInt(pair, 16)
  ) ?? []);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(payload) {
  let binary;
  try {
    binary = atob(payload);
  } catch {
    throw new Error("Invalid base64 payload.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Base64 payload is not valid UTF-8 text.");
  }
}

function encodeTrigOffset(text, x) {
  const offset = deriveSeed(x) % 20 + 1;
  return Array.from(text, (character) => {
    const code = character.codePointAt(0) + offset;
    if (code > 0x10ffff) {
      throw new Error("Trig offset result is outside the Unicode range.");
    }
    return String.fromCodePoint(code);
  }).join("");
}

function decodeTrigOffset(payload, x) {
  const offset = deriveSeed(x) % 20 + 1;
  return Array.from(payload, (character) => {
    const code = character.codePointAt(0) - offset;
    if (code < 0) {
      throw new Error("Trig offset payload is outside the Unicode range.");
    }
    return String.fromCodePoint(code);
  }).join("");
}

function encodeLock33Pipe(text, x) {
  const shift = deriveSeed(x) % 33 + 1;
  return Array.from(text, (character) =>
    (character.codePointAt(0) + shift).toString(16)
  ).join("|");
}

function decodeLock33Pipe(payload, x) {
  if (payload === "") {
    return "";
  }
  const shift = deriveSeed(x) % 33 + 1;
  return payload.split("|").map((token) => {
    if (!/^[0-9a-f]+$/i.test(token)) {
      throw new Error("Invalid lock33-pipe payload.");
    }
    const codePoint = Number.parseInt(token, 16) - shift;
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      throw new Error("Invalid lock33-pipe code point.");
    }
    return String.fromCodePoint(codePoint);
  }).join("");
}

function encodeMorse(text) {
  return Array.from(text, (character) => MORSE[character.toUpperCase()] ?? "?").join(" ");
}

function decodeMorse(payload) {
  return payload.split(/\s+/).filter(Boolean)
    .map((token) => token === "/" ? " " : MORSE_REV[token] ?? "?").join("");
}

const ENCODERS = {
  caesar: encodeCaesar,
  hex: encodeHex,
  base64: encodeBase64,
  trig_offset: encodeTrigOffset,
  "lock33-pipe": encodeLock33Pipe,
  morse: encodeMorse
};
const DECODERS = {
  caesar: decodeCaesar,
  hex: decodeHex,
  base64: decodeBase64,
  trig_offset: decodeTrigOffset,
  "lock33-pipe": decodeLock33Pipe,
  morse: decodeMorse
};

function computePayloadWitness(payload, x) {
  let checksum = 0;
  for (const character of payload) {
    checksum += character.codePointAt(0);
  }
  return identityWitness(x) + checksum % 1000 / 1000;
}

function validate(payload, claimedWitness, x) {
  return Math.abs(computePayloadWitness(payload, x) - claimedWitness) < 1e-6;
}

const form = document.getElementById("decoder-form");
const operation = document.getElementById("operation");
const submit = document.getElementById("submit");
const witnessInput = document.getElementById("witness");
const output = document.getElementById("output");
const resultWitness = document.getElementById("result-witness");
const status = document.getElementById("status");

witnessInput.disabled = operation.value === "encode";

operation.addEventListener("change", () => {
  const isEncoding = operation.value === "encode";
  submit.textContent = isEncoding ? "Encode" : "Decode";
  witnessInput.disabled = isEncoding;
  resultWitness.value = "";
  status.textContent = "";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  output.value = "";
  resultWitness.value = "";
  status.textContent = "";

  try {
    const x = Number(document.getElementById("angle").value);
    const codeType = document.getElementById("code-type").value;
    const text = document.getElementById("input").value;

    if (operation.value === "encode") {
      const payload = ENCODERS[codeType](text, x);
      output.value = payload;
      resultWitness.value = computePayloadWitness(payload, x).toString();
    } else {
      if (witnessInput.value !== "") {
        const claimedWitness = Number(witnessInput.value);
        if (!Number.isFinite(claimedWitness) || !validate(text, claimedWitness, x)) {
          throw new Error("Witness validation failed");
        }
      }
      output.value = DECODERS[codeType](text, x);
    }
  } catch (error) {
    status.textContent = error.message;
  }
});
