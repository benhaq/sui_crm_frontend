// General Sui/blockchain utility functions

export const fromHex = (hexString: string): Uint8Array => {
  if (hexString.startsWith("0x")) {
    hexString = hexString.substring(2);
  }
  if (hexString.length % 2 !== 0) {
    throw new Error("Hex string must have an even number of characters.");
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
    if (isNaN(bytes[i])) {
      throw new Error("Invalid hex character found.");
    }
  }
  return bytes;
};

export const toHEX = (bytes: Uint8Array): string => {
  return Buffer.from(bytes).toString("hex");
};
