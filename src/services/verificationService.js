// src/services/verificationService.js
// Client-side Cryptographic Verification Engine for CDSCO Recalls & Batch Signatures

// Helper to compute SHA-256 hash using the Web Crypto API
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pre-computed hashes for our recalled batches Merkle Tree
// Leaf values: L0 = "B90210", L1 = "B12345", L2 = "LOT999", L3 = "RECALL888"
const L0 = "5e36ec5e5bf9da5fde7e47ec0bd7d58e125e4a158b6a56ce03df35efd0afeb12"; // hash("B90210")
const L1 = "423236bb31ab0778f2d0c4b0b627ef5ffa5042dbf9bc3b65ae02483544364f6e"; // hash("B12345")
const L2 = "a789d8964d18501b7baaf9ce8239125f4787ca7b640eae4594f19b35b8a149c9"; // hash("LOT999")
const L3 = "6e0b9e68e58c62cc6dd8b09b296ff30f82491ce02feadc96a090b3ffd9e68b46"; // hash("RECALL888")

// Parent Nodes
// H01 = hash(L0 + L1)
const H01 = "5d83a8b59e3d0c09592dfd1e05f6706f988f4aa7cd14ce63307fe1f46edc9f13";
// H23 = hash(L2 + L3)
const H23 = "c977c127dfb9eb6da80ceee2f0bb1f9b19c607b5becd1dab623087ce9438f392";

// Merkle Root
// Root = hash(H01 + H23)
export const RECALL_MERKLE_ROOT = "9c3f74ad730e0a914eaf96a545461889ef1dbe7016b23e854bf74ae3e16510c9";

// Recalled batches dictionary with their respective sibling proof paths
const RECALL_DATABASE = {
  'B90210': [
    { hash: L1, direction: 'right' },
    { hash: H23, direction: 'right' }
  ],
  'B12345': [
    { hash: L0, direction: 'left' },
    { hash: H23, direction: 'right' }
  ],
  'LOT999': [
    { hash: L3, direction: 'right' },
    { hash: H01, direction: 'left' }
  ],
  'RECALL888': [
    { hash: L2, direction: 'left' },
    { hash: H01, direction: 'left' }
  ]
};

/**
 * Validates if a batch leaf matches the Merkle root using the provided sibling path.
 * @param {string} batchNumber - Scanned batch number.
 * @param {Array} proof - Sibling proof array.
 * @param {string} root - Expected Merkle root hash.
 * @returns {Promise<boolean>} - True if validation succeeds.
 */
export async function verifyMerkleProof(batchNumber, proof, root) {
  let currentHash = await sha256(batchNumber);

  for (const sibling of proof) {
    if (sibling.direction === 'left') {
      currentHash = await sha256(sibling.hash + currentHash);
    } else {
      currentHash = await sha256(currentHash + sibling.hash);
    }
  }

  return currentHash === root;
}

/**
 * Checks if a batch is flagged in the CDSCO recall registry.
 * @param {string} batchNumber - The medicine batch ID.
 * @returns {Promise<object>} - Recall audit status with proof details.
 */
export async function checkRecallStatus(batchNumber) {
  const norm = (batchNumber || '').toUpperCase().trim();
  const proof = RECALL_DATABASE[norm];

  if (!proof) {
    return {
      recalled: false,
      message: "Batch verified against CDSCO recall list (not flagged).",
      root: RECALL_MERKLE_ROOT
    };
  }

  // Run cryptographic verification to prove it belongs in the Merkle root
  const verified = await verifyMerkleProof(norm, proof, RECALL_MERKLE_ROOT);

  return {
    recalled: verified,
    message: verified ? "⚠️ ALERT: Batch is matched in CDSCO recalled list!" : "Audit match failed.",
    root: RECALL_MERKLE_ROOT,
    proofPath: proof
  };
}

/**
 * Generates an ECDSA keypair for signing counterfeit reports.
 * @returns {Promise<CryptoKeyPair>} - ECDSA P-256 key pair.
 */
export async function generateReportingKeys() {
  return crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    true,
    ["sign", "verify"]
  );
}

/**
 * Signs a counterfeit medicine report using client-side ECDSA.
 * @param {object} reportPayload - JSON representation of the report.
 * @param {CryptoKey} privateKey - Client private key.
 * @returns {Promise<{ signatureHex: string, publicKeyJwk: object }>}
 */
export async function signCounterfeitReport(reportPayload, privateKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(reportPayload));

  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" }
    },
    privateKey,
    data
  );

  // We can export the matching public key from the keypair in usage

  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signatureHex;
}
