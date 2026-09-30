import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * The exact string a wallet signs. The frontend builds the same string —
 * keep the two in sync or every signature check fails.
 */
export function submissionMessage(
  wallet: string,
  roundId: number,
  ts: number,
  reason: string,
): string {
  return `REASON submission\nwallet: ${wallet}\nround: ${roundId}\nts: ${ts}\nreason: ${reason}`;
}

/** signatureB64: base64 of the 64-byte ed25519 detached signature. */
export function verifySubmissionSignature(
  wallet: string,
  message: string,
  signatureB64: string,
): boolean {
  try {
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length !== nacl.sign.signatureLength) return false;
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      new Uint8Array(sig),
      bs58.decode(wallet),
    );
  } catch {
    return false;
  }
}
