const COSINE_EPSILON = 1e-12;
const IDENTITY_TOLERANCE = 1e-9;

export function identityWitness(x: number): number {
  if (!Number.isFinite(x)) {
    throw new RangeError("x must be a finite number");
  }

  const cosine = Math.cos(x);
  if (Math.abs(cosine) < COSINE_EPSILON) {
    throw new RangeError("cos(x) ≈ 0; identity undefined");
  }

  const lhs = 1 / cosine - cosine;
  const rhs = Math.sin(x) * Math.tan(x);
  if (Math.abs(lhs - rhs) > IDENTITY_TOLERANCE) {
    throw new Error("Identity failed");
  }
  return rhs;
}

export function deriveModulus(x: number): number {
  const witness = Math.abs(identityWitness(x));
  return Math.max(2, Math.trunc(witness * 1000) % 251 + 2);
}

export function deriveShift(x: number): number {
  return deriveModulus(x) % 26;
}

export function deriveSeed(x: number): number {
  const scaledWitness = Math.trunc(Math.abs(identityWitness(x) * 1_000_000));
  return Number(BigInt(scaledWitness) % 10_000n);
}

export function encodeLock33Pipe(text: string, x: number): string {
  const shift = deriveSeed(x) % 33 + 1;
  const encoded: string[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Invalid Unicode character");
    }
    encoded.push((codePoint + shift).toString(16));
  }
  return encoded.join("|");
}

export function decodeLock33Pipe(payload: string, x: number): string {
  if (payload === "") {
    return "";
  }

  const shift = deriveSeed(x) % 33 + 1;
  return payload.split("|").map((token) => {
    if (!/^[0-9a-f]+$/i.test(token)) {
      throw new Error("Invalid lock33-pipe payload");
    }

    const codePoint = Number.parseInt(token, 16) - shift;
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      throw new Error("Invalid lock33-pipe code point");
    }
    return String.fromCodePoint(codePoint);
  }).join("");
}
