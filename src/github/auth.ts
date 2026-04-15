import type { Env } from '../index';

/**
 * Parses a PEM-encoded private key (PKCS#8) into a CryptoKey.
 * GitHub App private keys may need to be converted from PKCS#1 to PKCS#8:
 *   openssl pkcs8 -topk8 -inform PEM -outform PEM -in pk.pem -out pk-pkcs8.pem -nocrypt
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\\n/g, '\n')
    .replace(/\s/g, '');

  const der = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  // Detect if this is PKCS#1 (starts with SEQUENCE containing INTEGER 0) or PKCS#8
  const isPKCS8 = pem.includes('BEGIN PRIVATE KEY');

  let keyData: ArrayBuffer;

  if (isPKCS8) {
    keyData = der.buffer;
  } else {
    // Wrap PKCS#1 in PKCS#8 container
    keyData = wrapPKCS1inPKCS8(der);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Wraps a PKCS#1 RSA private key DER in a PKCS#8 container.
 */
function wrapPKCS1inPKCS8(pkcs1Der: Uint8Array): ArrayBuffer {
  // RSA OID: 1.2.840.113549.1.1.1
  const rsaOidSeq = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);

  const octetString = encodeTag(0x04, pkcs1Der);
  const inner = new Uint8Array([
    ...encodeTag(0x02, new Uint8Array([0x00])), // INTEGER 0 (version)
    ...rsaOidSeq,
    ...octetString,
  ]);

  return encodeTag(0x30, inner).buffer as ArrayBuffer;
}

function encodeTag(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let lenBytes: number[];
  if (len < 0x80) {
    lenBytes = [len];
  } else if (len < 0x100) {
    lenBytes = [0x81, len];
  } else {
    lenBytes = [0x82, (len >> 8) & 0xff, len & 0xff];
  }
  return new Uint8Array([tag, ...lenBytes, ...content]);
}

/**
 * Creates a signed GitHub App JWT for use in API calls.
 */
async function createAppJWT(appId: string, privateKey: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // issued 60s ago to account for clock skew
    exp: now + 9 * 60, // expires in 9 minutes (max 10)
    iss: appId,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${encodedSig}`;
}

/**
 * Retrieves an installation access token for the given installation ID.
 */
export async function getInstallationToken(installationId: number, env: Env): Promise<string> {
  const privateKey = await importPrivateKey(env.GITHUB_PRIVATE_KEY);
  const jwt = await createAppJWT(env.GITHUB_APP_ID, privateKey);

  const resp = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Mushin-App/1.0',
      },
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to get installation token: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { token: string };
  return data.token;
}
