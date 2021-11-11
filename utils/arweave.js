const Arweave = require('arweave/node');
const jwk = require('../arweave-key.json');

const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });

const IPFS_KEY = 'IPFS-Add';
const IPFS_CONSTRAINT_KEY = 'standard';
const IPFS_CONSTRAINT = 'v0.1';

async function getArIdFromIPFSHash(ipfsHash) {
  const res = await arweave.arql(
    {
      op: 'and',
      expr1: {
        op: 'equals',
        expr1: IPFS_KEY,
        expr2: ipfsHash,
      },
      expr2: {
        op: 'equals',
        expr1: IPFS_CONSTRAINT_KEY,
        expr2: IPFS_CONSTRAINT,
      },
    },
  );
  return res[0] || null;
}

async function submitToArweave(buffer, mimetype, ipfsHash = null) {
  const { data: anchorId } = await arweave.api.get('/tx_anchor');
  const tx = await arweave.createTransaction({ data: buffer, last_tx: anchorId }, jwk);
  if (mimetype) {
    tx.addTag('Content-Type', mimetype);
  }
  if (ipfsHash) {
    tx.addTag(IPFS_KEY, ipfsHash);
    tx.addTag(IPFS_CONSTRAINT_KEY, IPFS_CONSTRAINT);
  }
  await arweave.transactions.sign(tx, jwk);
  await arweave.transactions.post(tx);
  return tx.id;
}

module.exports = {
  getArIdFromIPFSHash,
  submitToArweave,
};
