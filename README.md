# ISUD Decoder

The Python implementation is in `isud_decoder.py`. An Edge popup extension is
available in `edge-extension/` and supports Caesar, hex, Base64, trig offset,
Lock33 pipe, and Morse encodings.
`tanx.ts` exports the identity witness, derived values, and Lock33 pipe codec.

## Load the extension in Microsoft Edge

1. Open `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this repository's `edge-extension`
   directory.
4. Open the ISUD Decoder toolbar button. Choose an operation and encoding,
   enter an angle in radians, and submit your text or payload.

   Lock33 pipe writes each Unicode code point, shifted by `(derive_seed(x) % 33) +
   1`, as hexadecimal; fields are separated with `|`.

When decoding, the claimed witness is optional. If supplied, it is checked
against the encoded payload before decoding.
