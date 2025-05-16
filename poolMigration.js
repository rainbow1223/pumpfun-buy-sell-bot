const { PublicKey } = require('@solana/web3.js');
const dotenv = require('dotenv');
const { base58 } = require('bs58');
const { connection } = require("./core/constants.js");
dotenv.config();
const pumpAMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const pumpdotfun = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

require('./config/db.js');

const SolanaPoolModel = require("./models/solanaPoolModel");

// Create a new Pool
const createPool = async (poolData) => {
    const newPool = await SolanaPoolModel.create(poolData);
    return newPool;
};

// const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
connection.onLogs(new PublicKey(pumpAMM), async (logs) => {
    console.log('logs', logs);
    if (logs.logs.includes('Program log: Instruction: CreatePool') && logs.err == null) {
        getAmmPool(logs.signature);
    }
});

const getAmmPool = async (signature) => {
    const tx = await connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
    });

    const accountKeys = tx?.transaction.message.accountKeys;
    const pumpdotfunIndex = accountKeys?.findIndex((account) => 
        account.pubkey.equals(new PublicKey(pumpdotfun))
    );

    const pumpfunInstruction = tx?.transaction.message.instructions?.find(
        (instruction) => (
            instruction.programId.equals(new PublicKey(pumpdotfun)) && 
            instruction.accounts?.length == 24
        )
    );

    let ammPool = pumpfunInstruction?.accounts[9];

    if (pumpfunInstruction) {
        ammPool = pumpfunInstruction.accounts[9];
    } else {
        if (pumpdotfunIndex && pumpdotfunIndex >= 0) {
            const innerInstructions = [];

            tx?.meta?.innerInstructions?.forEach((instruction) => {
                innerInstructions.push(...instruction.instructions);
            });

            const pumpdotfunInstruction = innerInstructions?.find(
                (instruction) => (
                    instruction.programId.equals(new PublicKey(pumpdotfun)) && 
                    instruction.accounts?.length == 24
                )
            );
            ammPool = pumpdotfunInstruction?.accounts[9];
        }
    }

    if (ammPool) {
        const accountInfo = await connection.getAccountInfo(new PublicKey(ammPool));
        const bufferData = accountInfo?.data;

        if (bufferData) {
            const bump = bufferData.readUint8(8);
            const index = bufferData.readUint16LE(9);
            const creator = base58.encode(bufferData.slice(11, 43)).toString();
            const baseMint = base58.encode(bufferData.slice(43, 75)).toString();
            const quoteMint = base58.encode(bufferData.slice(75, 107)).toString();
            const lpMint = base58.encode(bufferData.slice(107, 139)).toString();

            try {
                await createPool({
                    pool_address: ammPool,
                    pool_base_mint: baseMint,
                    pool_quote_mint: quoteMint,
                    pool_lp_mint: lpMint,
                    pool_index: index,
                    pool_creator: creator,
                    pool_discriminator: 'Pump AMM',
                    pool_bump: bump
                });
            } catch (err) {
                console.log(err);
            }
        }
    }
};