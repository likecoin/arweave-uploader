# ISCN Arweave Uploader

Batch upload your files to Arweave.

## Installation

```bash
npm install
```
or

```bash
yarn install
```
## Configuration

Name your Arweave key as `arweave-key.json` and put it in the root directory.

## Usage

1. Store the files to be uploaded in `./upload/` folder.
2. Prepare the CSV file with `filename` and `ipfsHash` fields:
   The `filename` field should list the filenames match files in `./upload/` folder. 
3. Launch the program:
   ```bash
   node index.js [list.csv]
   ```
    The resulting Arweave hash will be show on both console and `./output-list.csv`.

Note that `ipfsHash` field is optinal, if `ipfsHash` is provided:
1. Program will check and update the `ipfsHash` if the matching local file is available.
2. Program will get file from IPFS and store in `./upload/` folder if local file is inavailable.
3. Program will skip uploading the file if file with the same `ipfsHash` tag can already be found on Arweave.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[GNU GPLv3](https://choosealicense.com/licenses/gpl-3.0/)