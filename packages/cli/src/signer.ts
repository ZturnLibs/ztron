/**
 * `ztron signer` — minisign-compatible key generation, signing and
 * verification for the updater security chain (GAP.md D1/F4).
 *
 * Formats are wire-exact with jedisct1/minisign: signatures produced here
 * verify under the real `minisign` tool and vice-versa (unencrypted secret
 * keys only; password-boxed `.key` files arrive with a later batch).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  generateKeypair,
  parseSecretKeyFile,
  dumpEncryptedSecretKeyFile,
  signMinisig,
  verifyMinisig,
} from "@ztron/core";

interface SignerArgs {
  action: string;
  flags: Record<string, string>;
  positional: string[];
}

function parseSignerArgs(argv: string[]): SignerArgs {
  const args: SignerArgs = { action: argv[0] ?? "", flags: {}, positional: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next: string | undefined = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.flags[key] = next;
        i++;
      } else {
        args.flags[key] = "true";
      }
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

function writeFile(p: string, text: string): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

export async function signer(argv: string[]): Promise<void> {
  const { action, flags, positional } = parseSignerArgs(argv);
  switch (action) {
    case "generate": {
      const pkPath = flags["pk-file"] ?? "minisign.pub";
      const skPath = flags["sk-file"] ?? "minisign.key";
      const comment = flags.comment ?? "ztron signer public key";
      const password =
        flags.password ?? process.env.ZTRON_SIGNER_PASSWORD ?? "";
      const { publicKeyText, secret } = generateKeypair(comment);
      writeFile(pkPath, publicKeyText);
      if (flags.password || process.env.ZTRON_SIGNER_PASSWORD) {
        writeFile(skPath, dumpEncryptedSecretKeyFile(secret, password));
        console.log("signer: secret key written ENCRYPTED (scrypt, minisign format)");
      } else {
        const { secretKeyText } = generateKeypair(comment);
        writeFile(skPath, secretKeyText);
      }
      console.log(`signer: generated key pair\n  public key: ${pkPath}\n  secret key: ${skPath}`);
      break;
    }
    case "sign": {
      const file = positional[0];
      const skFile = flags["secret-key"];
      if (!file || !skFile) {
        console.error("usage: ztron signer sign <file> --secret-key <path> [--trusted-comment <text>]");
        process.exit(1);
      }
      const sk = parseSecretKeyFile(
        readFileSync(skFile, "utf8"),
        flags.password ?? process.env.ZTRON_SIGNER_PASSWORD,
      );
      const data = new Uint8Array(readFileSync(file));
      const sigText = signMinisig(data, sk, {
        trustedComment: flags["trusted-comment"],
        untrustedComment: flags.comment,
      });
      const out = flags.output ?? `${file}.minisig`;
      writeFile(out, sigText);
      console.log(`signer: wrote ${out}`);
      break;
    }
    case "verify": {
      const file = positional[0];
      if (!file) {
        console.error("usage: ztron signer verify <file> --public-key <path> [--signature <path.minisig>]");
        process.exit(1);
      }
      const pk = readFileSync(flags["public-key"] ?? "minisign.pub", "utf8");
      const sigPath = flags.signature ?? `${file}.minisig`;
      const sigText = readFileSync(sigPath, "utf8");
      const result = verifyMinisig(new Uint8Array(readFileSync(file)), sigText, pk);
      if (!result.ok) {
        console.error(`signature verification FAILED (${result.error ?? "?"})`);
        process.exit(1);
      }
      console.log(`signature verified`);
      if (result.trustedComment) {
        console.log(`Trusted comment: ${result.trustedComment}`);
      }
      break;
    }
    default:
      console.error(
        "usage:\n" +
          "  ztron signer generate [--pk-file p] [--sk-file s] [--password pw]\n" +
          "  ztron signer sign <file> --secret-key <path> [--password pw]\n" +
          "  ztron signer verify <file> --public-key <path>",
      );
      process.exit(1);
  }
}
