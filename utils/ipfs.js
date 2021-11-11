const { create } = require('ipfs-http-client');
const { extract } = require('it-tar');
const { pipe } = require('it-pipe');
const toBuffer = require('it-to-buffer');
const map = require('it-map');
const all = require('it-all');

const ipfs = create({ url: 'https://ipfs.infura.io:5001/api/v0' });

async function* tarballed(source) {
  yield* pipe(
    source,
    extract(),
    // eslint-disable-next-line func-names
    async function* (src) {
      // eslint-disable-next-line no-restricted-syntax
      for await (const entry of src) {
        yield {
          ...entry,
          name: entry.header.name,
          buffer: await toBuffer(map(entry.body, (buf) => buf.slice())),
        };
      }
    },
  );
}

async function collect(source) {
  return all(source);
}

async function loadFileFromIPFS(ipfsHash) {
  try {
    const output = await pipe(
      ipfs.get(ipfsHash),
      tarballed,
      collect,
    );
    return output;
  } catch (error) {
    throw new Error(`Cannot get file from IPFS: ${ipfsHash}`);
  }
}

module.exports = {
  ipfs,
  loadFileFromIPFS,
};
