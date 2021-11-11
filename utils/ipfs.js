const { create } = require('ipfs-http-client');
const all = require('it-all');
const { concat } = require('uint8arrays/concat');

const ipfs = create({ url: 'https://ipfs.infura.io:5001/api/v0' });

async function loadFileFromIPFS(ipfsHash) {
  try {
    return concat(await all(ipfs.cat(ipfsHash)));
  } catch (error) {
    throw new Error(`Cannot get file from IPFS: ${ipfsHash}`);
  }
}

module.exports = {
  ipfs,
  loadFileFromIPFS,
};
