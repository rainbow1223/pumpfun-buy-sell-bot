const {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    BigNumberish,
    GetStructureSchema,
    MARKET_STATE_LAYOUT_V3,
    SYSTEM_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    blob,
    bool,
    seq,
    u8,
} = require("@raydium-io/raydium-sdk");
const {
    PublicKey,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} = require("@solana/web3.js");
const {
    struct,
    u64,
    AccountMeta,
    AccountMetaReadonly,
    publicKey,
} = require("@raydium-io/raydium-sdk");
const { MintLayout, getAssociatedTokenAddress } = require("@solana/spl-token");
const { DEFAULT_DECIMALS, PumpFunSDK } = require("pumpdotfun-sdk");
const { connection } = require("./constants.js");
// const connection = solana_connection;


const BONDING_CURVE_LAYOUT = struct([
    blob(8),
    u64("virtualTokenReserves"),
    u64("virtualSOLReserves"),
    u64("realTokenReserves"),
    u64("realSOLReserves"),
    u64("blob4"),
    bool("complete"),
]);

const GLOBAL_SETTINGS_LAYOUT = struct([
    blob(8),
    bool("initialized"),
    publicKey("authority"),
    publicKey("feeRecipient"),
    u64("initialVirtualTokenReserves"),
    u64("initialVirtualSOLReserves"),
    u64("initialRealTokenReserves"),
    u64("tokenTotalSupply"),
    u64("feeBasisPoints"),
]);


const getBondingCurveData = async (tokenMint) => {
    const PUMPManager = new PublicKey(
        "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
    );
    // const rpc = connection;
    const [bondingCurvePK] = await PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), tokenMint.toBuffer()],
        PUMPManager
    );

    const [globalSettingsPK] = await PublicKey.findProgramAddressSync(
        [Buffer.from("global")],
        PUMPManager
    );

    const [mintAuthorityPK] = await PublicKey.findProgramAddressSync(
        [Buffer.from("mint-authority")],
        PUMPManager
    );

    const accountInfos = await connection.getMultipleAccountsInfo([
        bondingCurvePK,
        globalSettingsPK,
    ]);
    let bondingCurve = {
        virtualTokenReserves: 0,
        virtualSOLReserves: 0,
        realTokenReserves: 0,
        realSOLReserves: 0,
        blob4: 0,
        complete: false,
    };
    let globalSettings = {
        initialized: false,
        authority: new PublicKey("11111111111111111111111111111111"),
        feeRecipient: new PublicKey("11111111111111111111111111111111"),
        initialVirtualTokenReserves: 0,
        initialVirtualSOLReserves: 0,
        initialRealTokenReserves: 0,
        tokenTotalSupply: 0,
        feeBasisPoints: 0,
    };

    if (accountInfos[0] !== null && accountInfos[0].data.length > 0) {
        bondingCurve = BONDING_CURVE_LAYOUT.decode(accountInfos[0].data);
    }

    if (accountInfos[1] !== null && accountInfos[1].data.length > 0) {
        globalSettings = GLOBAL_SETTINGS_LAYOUT.decode(accountInfos[1].data);
    }
    const associatedBondingCurve = await getAssociatedTokenAddress(
        tokenMint,
        bondingCurvePK,
        true
    );

    const [eventAuthority] = await PublicKey.findProgramAddressSync(
        [Buffer.from("__event_authority")],
        PUMPManager
    );

    return {
        BondingCurve: bondingCurve,
        BondingCurvePk: bondingCurvePK,
        AssociatedBondingCurvePk: associatedBondingCurve,
        GlobalSettings: globalSettings,
        GlobalSettingsPk: globalSettingsPK,
        MintAuthority: mintAuthorityPK,
        EventAuthority: eventAuthority,
        PUMPProgram: PUMPManager,
    };
}

const pumpGetFee = (amount, feeBP) => {
    const temp = BigInt(amount) * BigInt(feeBP);
    const feeAmount = temp / BigInt(10000);
    return feeAmount;
}

const pumpQuoteBuy = (
    amountIn,
    bondingCurveData
) => {
    const virtualSOLReservesBN = BigInt(
        bondingCurveData.BondingCurve.virtualSOLReserves
    );
    const virtualTokenReservesBN = BigInt(
        bondingCurveData.BondingCurve.virtualTokenReserves
    );
    const reservesProduct = virtualSOLReservesBN * virtualTokenReservesBN;
    const newVirtualSOLReserve = virtualSOLReservesBN + amountIn;
    let newVirtualTokenReserve = reservesProduct / newVirtualSOLReserve;
    newVirtualTokenReserve = newVirtualTokenReserve + BigInt(1);
    let amountOut = virtualTokenReservesBN - newVirtualTokenReserve;
    let finalAmountOut = amountOut;
    if (Number(amountOut) > bondingCurveData.BondingCurve.realTokenReserves) {
        finalAmountOut = BigInt(bondingCurveData.BondingCurve.realTokenReserves);
    }
    return finalAmountOut;
}

const pumpQuoteSell = (
    amountIn,
    bondingCurveData
) => {
    const newReserves =
        BigInt(bondingCurveData.BondingCurve.virtualTokenReserves) +
        BigInt(amountIn);
    const temp =
        BigInt(amountIn) * BigInt(bondingCurveData.BondingCurve.virtualSOLReserves);
    const amountOut = temp / newReserves;
    const fee = pumpGetFee(
        amountOut,
        bondingCurveData.GlobalSettings.feeBasisPoints
    );
    const amountOutAfterFee = amountOut - BigInt(fee);
    return amountOutAfterFee;
}

const applySlippage = (amount, slippage) => {
    const SlippageAdjustment = 10000;
    const Big10000 = BigInt(10000);

    let slippageBP =
        (BigInt(Math.floor(100 * slippage)) + BigInt(25)) *
        BigInt(SlippageAdjustment);
    const maxSlippage = Big10000 * BigInt(SlippageAdjustment);

    if (slippageBP > maxSlippage) {
        slippageBP = Big10000 * BigInt(SlippageAdjustment);
    }

    const slippageBPBN = BigInt(slippageBP);

    // we adjust slippage so that it caps out at 50%
    const slippageNumeratorMul = maxSlippage - slippageBPBN;
    const slippageNumerator = BigInt(amount) * slippageNumeratorMul;
    const amountWithSlippage = slippageNumerator / maxSlippage;
    return amountWithSlippage;
}

//Buy Instruction based on target token amount
const reserveMakePumpFunBuyFixedInInstruction = async ({
    userKeys,
    amountIn: tokenAmountToBuy,
}) => {
    const bondingCurve = await GetBondingCurveData(
        userKeys.tokenAccount
    );
    const currentuseBalance = await connection.getBalance(userKeys.owner);
    // console.log(`Current balance: ${currentuseBalance}`);
    const solAmountIn = Math.min(
        3 * Math.pow(10, 10),
        currentuseBalance - 5 * Math.pow(10, 7)
    );
    const LAYOUT = {
        span: 24,
    };
    const data = Buffer.alloc(LAYOUT.span);
    data.set([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]);
    data.writeBigInt64LE(BigInt(tokenAmountToBuy), 8);
    data.writeBigInt64LE(BigInt(solAmountIn), 16);
    const keys = [];

    const ata = await getAssociatedTokenAddress(
        userKeys.tokenAccount,
        userKeys.owner
    );

    keys.push(
        // serum
        AccountMetaReadonly(bondingCurve.GlobalSettingsPk, false),
        AccountMeta(bondingCurve.GlobalSettings.feeRecipient, false),
        AccountMetaReadonly(userKeys.tokenAccount, false),
        AccountMeta(bondingCurve.BondingCurvePk, false),
        AccountMeta(bondingCurve.AssociatedBondingCurvePk, false),
        AccountMeta(ata, false),
        AccountMeta(userKeys.owner, true),
        AccountMetaReadonly(SYSTEM_PROGRAM_ID, false),
        AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
        AccountMetaReadonly(SYSVAR_RENT_PUBKEY, false),
        AccountMetaReadonly(bondingCurve.EventAuthority, false),
        AccountMetaReadonly(bondingCurve.PUMPProgram, false)
    );

    return {
        instructions: [
            new TransactionInstruction({
                programId: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
                keys,
                data,
            }),
        ],
    };
};

const makePumpFunBuyFixedInInstruction = async ({
    userKeys,
    amountIn,
}) => {
    const bondingCurve = await GetBondingCurveData(
        userKeys.tokenAccount
    );
    const pumpFee = pumpGetFee(
        amountIn,
        bondingCurve.GlobalSettings.feeBasisPoints
    );
    const amountInAfterPumpFee = BigInt(amountIn) - pumpFee;
    const amountOut = pumpQuoteBuy(amountInAfterPumpFee, bondingCurve);
    const amountOutWithSlippage = applySlippage(amountOut, settings.SLIPPAGE);

    console.log("makePumpFunBuyFixedInInstruction");
    console.log("amountIn:", amountIn);
    console.log("pumpFee:", pumpFee);
    console.log("amountInAfterPumpFee:", amountInAfterPumpFee);
    console.log("amountOut:", amountOut);
    console.log("amountOutWithSlippage:", amountOutWithSlippage);
    const LAYOUT = {
        span: 24,
    };
    const data = Buffer.alloc(LAYOUT.span);
    data.set([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]);
    data.writeBigInt64LE(amountOutWithSlippage, 8);
    data.writeBigInt64LE(BigInt(amountIn), 16);

    const keys = [];

    const ata = await getAssociatedTokenAddress(
        userKeys.tokenAccount,
        userKeys.owner
    );

    keys.push(
        // serum
        AccountMetaReadonly(bondingCurve.GlobalSettingsPk, false),
        AccountMeta(bondingCurve.GlobalSettings.feeRecipient, false),
        AccountMetaReadonly(userKeys.tokenAccount, false),
        AccountMeta(bondingCurve.BondingCurvePk, false),
        AccountMeta(bondingCurve.AssociatedBondingCurvePk, false),
        AccountMeta(ata, false),
        AccountMeta(userKeys.owner, true),
        AccountMetaReadonly(SYSTEM_PROGRAM_ID, false),
        AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
        AccountMetaReadonly(SYSVAR_RENT_PUBKEY, false),
        AccountMetaReadonly(bondingCurve.EventAuthority, false),
        AccountMetaReadonly(bondingCurve.PUMPProgram, false)
    );

    return {
        instructions: [
            new TransactionInstruction({
                programId: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
                keys,
                data,
            }),
        ],
    };
};

const makePumpFunSellFixedInInstruction = async ({
    userKeys,
    amountIn,
}) => {
    const bondingCurve = await GetBondingCurveData(
        userKeys.tokenAccount
    );

    const amountOut = pumpQuoteSell(amountIn, bondingCurve);
    const amountOutWithSlippage = applySlippage(amountOut, settings.SLIPPAGE);

    const LAYOUT = {
        span: 24,
    };
    const data = Buffer.alloc(LAYOUT.span);
    data.set([0x33, 0xe6, 0x85, 0xa4, 0x01, 0x7f, 0x83, 0xad]);
    data.writeBigInt64LE(amountIn, 8);
    data.writeBigInt64LE(amountOutWithSlippage, 16);

    const keys = [];

    const ata = await getAssociatedTokenAddress(
        userKeys.tokenAccount,
        userKeys.owner
    );

    keys.push(
        // serum
        AccountMetaReadonly(bondingCurve.GlobalSettingsPk, false),
        AccountMeta(bondingCurve.GlobalSettings.feeRecipient, false),
        AccountMetaReadonly(userKeys.tokenAccount, false),
        AccountMeta(bondingCurve.BondingCurvePk, false),
        AccountMeta(bondingCurve.AssociatedBondingCurvePk, false),
        AccountMeta(ata, false),
        AccountMeta(userKeys.owner, true),
        AccountMetaReadonly(SYSTEM_PROGRAM_ID, false),
        AccountMetaReadonly(ASSOCIATED_TOKEN_PROGRAM_ID, false),
        AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
        AccountMetaReadonly(bondingCurve.EventAuthority, false),
        AccountMetaReadonly(bondingCurve.PUMPProgram, false)
    );

    return {
        instructions: [
            new TransactionInstruction({
                programId: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
                keys,
                data,
            }),
        ],
    };
};

const makePumpFunPresaleFixedInInstruction = async ({
    userKeys,
    amountIn,
}) => {
    const bondingCurve = await GetBondingCurveData(
        userKeys.tokenAccount
    );
    const pumpFee = pumpGetFee(
        amountIn,
        bondingCurve.GlobalSettings.feeBasisPoints
    );
    console.log(`pumpfee: ${pumpFee}`);
    const amountInAfterPumpFee = BigInt(amountIn) - pumpFee;
    const amountOut = pumpQuoteBuy(amountInAfterPumpFee, bondingCurve);
    const amountOutWithSlippage = applySlippage(amountOut, settings.SLIPPAGE);

    console.log("makePumpFunPresaleFixedInInstruction:");
    console.log("amountIN:", amountIn);
    console.log("amountOut:", amountOut);
    console.log("amountOutWithSlippage:", amountOutWithSlippage);
    const LAYOUT = {
        span: 24,
    };
    const data = Buffer.alloc(LAYOUT.span);
    data.set([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]);
    data.writeBigInt64LE(amountOutWithSlippage, 8);
    data.writeBigInt64LE(BigInt(amountIn), 16);

    const keys = [];

    const ata = await getAssociatedTokenAddress(
        userKeys.tokenAccount,
        userKeys.owner
    );

    keys.push(
        // serum
        AccountMetaReadonly(bondingCurve.GlobalSettingsPk, false),
        AccountMeta(bondingCurve.GlobalSettings.feeRecipient, false),
        AccountMeta(userKeys.tokenAccount, true),
        AccountMeta(bondingCurve.BondingCurvePk, false),
        AccountMeta(bondingCurve.AssociatedBondingCurvePk, false),
        AccountMeta(ata, false),
        AccountMeta(userKeys.owner, true),
        AccountMetaReadonly(SYSTEM_PROGRAM_ID, false),
        AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
        AccountMetaReadonly(SYSVAR_RENT_PUBKEY, false),
        AccountMetaReadonly(bondingCurve.EventAuthority, false),
        AccountMetaReadonly(bondingCurve.PUMPProgram, false)
    );

    return {
        instructions: [
            new TransactionInstruction({
                programId: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), // pumpfun smart contract
                keys,
                data,
            }),
        ],
    };
};

module.exports = {
    getBondingCurveData,
    pumpGetFee,
    pumpQuoteBuy,
    pumpQuoteSell,
    applySlippage,
    reserveMakePumpFunBuyFixedInInstruction,
    makePumpFunBuyFixedInInstruction,
    makePumpFunSellFixedInInstruction,
    makePumpFunPresaleFixedInInstruction,
};

