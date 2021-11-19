const fs = require('fs');
const parseCSV = require('csv-parse/lib/sync');
const stringifyCSV = require('csv-stringify/lib/sync');
const {
  verifyLocalFile,
  loadFileFromLocal,
  getMimeAndExt,
  saveToLocal,
} = require('./utils/file');
const { loadFileFromIPFS, getIPFSHash, shutdownIPFSClient } = require('./utils/ipfs');
const { getArIdFromIPFSHash, uploadFilesToArweave } = require('./utils/arweave');

const INPUT_FILE_NAME = process.argv[2] || 'list.csv';
const OUTPUT_FILE_NAME = `output-${INPUT_FILE_NAME}`;

async function getFileBuffers(filename, ipfsHash) {
  if (verifyLocalFile(filename)) {
    console.log(`Loading files from local: ${filename}`);
    return loadFileFromLocal(`upload/${filename}`);
  }
  if (ipfsHash) {
    console.log(`Loading files from IPFS ${ipfsHash}`);
    let ipfsTar = await loadFileFromIPFS(ipfsHash);
    ipfsTar = ipfsTar.filter((i) => i.buffer && i.buffer.length);
    ipfsTar = ipfsTar.map((i) => {
      const name = i.name.replace(`${ipfsHash}/`, '');
      return {
        ...i,
        name,
      };
    });
    return ipfsTar;
  }
  throw new Error(`Cannot get ${filename} from local directory or IPFS.`);
}

function handleHeader(input) {
  const header = [...input];
  if (!header.includes('filename')) { header.push('filename'); }
  if (!header.includes('ipfsHash')) { header.push('ipfsHash'); }
  if (!header.includes('arweaveId')) { header.push('arweaveId'); }
  return header;
}

async function handleData(input, { filenameIndex, ipfsHashIndex, arIdIndex }) {
  const data = [...input];
  data[ipfsHashIndex] = data[ipfsHashIndex] || '';
  data[arIdIndex] = data[arIdIndex] || '';
  const filename = data[filenameIndex];
  try {
    if (data[arIdIndex]) {
      // eslint-disable-next-line no-console
      console.log(`Skip file: ${filename}(${data[ipfsHashIndex]}) has been in Arweave: ${data[arIdIndex]}`);
      return data;
    }
    let fileList = await getFileBuffers(filename, data[ipfsHashIndex]);
    const hasLocalFile = verifyLocalFile(filename);

    // check IPFS hash for local file
    if (hasLocalFile && data[ipfsHashIndex]) {
      const IPFSHash = await getIPFSHash(fileList);
      if (data[ipfsHashIndex] !== IPFSHash) {
        data[ipfsHashIndex] = IPFSHash;
        // eslint-disable-next-line no-console
        console.log(`Update IPFS hash of ${filename}: ${IPFSHash}`);
      }
    }

    // check if Arweave already has the file with the specified IPFS tags
    if (data[ipfsHashIndex]) {
      const arId = await getArIdFromIPFSHash(data[ipfsHashIndex]);
      if (arId) {
        data[arIdIndex] = arId;
        // eslint-disable-next-line no-console
        console.log(`Skip file: ${filename}(${data[ipfsHashIndex]}) has been in Arweave: ${data[arIdIndex]}`);
        return data;
      }
    }

    const mimeList = await Promise.all(fileList.map(async (f) => {
      const { mime, ext } = await getMimeAndExt(f.name, f.buffer);
      return { mime, ext };
    }));
    fileList = fileList.map((f, i) => ({ ...f, ...mimeList[i] }));
    data[arIdIndex] = await uploadFilesToArweave(fileList, data[ipfsHashIndex]);
    const arId = data[arIdIndex];

    // save file to local directory if there is no local file
    if (!hasLocalFile) {
      const savingName = saveToLocal(fileList, arId);
      data[filenameIndex] = savingName;
    }
    // eslint-disable-next-line no-console
    console.log(`Uploaded: ${data[filenameIndex]} - ${arId}`);
    return data;
  } catch ({ message }) {
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    return data;
  }
}

async function run() {
  const inputBuffer = fs.readFileSync(INPUT_FILE_NAME);
  const input = parseCSV(inputBuffer, { relax_column_count: true });

  const header = handleHeader(input[0]);
  fs.writeFileSync(OUTPUT_FILE_NAME, stringifyCSV([header]));

  const filenameIndex = header.indexOf('filename');
  const ipfsHashIndex = header.indexOf('ipfsHash');
  const arIdIndex = header.indexOf('arweaveId');
  /* eslint-disable no-await-in-loop */
  for (let i = 1; i < input.length; i += 1) {
    const data = await handleData(input[i], { filenameIndex, ipfsHashIndex, arIdIndex });
    fs.appendFileSync(OUTPUT_FILE_NAME, stringifyCSV([data]));
  }
  /* eslint-enable no-await-in-loop */
  await shutdownIPFSClient();
}

run();
