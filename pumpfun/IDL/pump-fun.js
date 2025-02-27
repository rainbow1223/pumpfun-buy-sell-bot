const PumpFun = {
    address: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    metadata: {
      name: "pump",
      version: "0.1.0",
      spec: "0.1.0"
    },
    instructions: [
      {
        name: "initialize",
        discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
        docs: ["Creates the global state."],
        accounts: [
          {
            name: "global",
            writable: true,
            pda: {
              seeds: [
                {
                  kind: "const",
                  value: [103, 108, 111, 98, 97, 108]
                }
              ]
            }
          },
          {
            name: "user",
            writable: true,
            signer: true
          },
          {
            name: "systemProgram",
            address: "11111111111111111111111111111111"
          }
        ],
        args: []
      },
      {
        name: "setParams",
        discriminator: [165, 31, 134, 53, 189, 180, 130, 255],
        docs: ["Sets the global state parameters."],
        accounts: [
          {
            name: "global",
            writable: true,
            pda: {
              seeds: [
                {
                  kind: "const",
                  value: [103, 108, 111, 98, 97, 108]
                }
              ]
            }
          },
          {
            name: "user",
            writable: true,
            signer: true
          },
          {
            name: "systemProgram",
            address: "11111111111111111111111111111111"
          },
          {
            name: "eventAuthority",
            address: "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
          },
          {
            name: "program",
            address: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
          }
        ],
        args: [
          {
            name: "feeRecipient",
            type: "pubkey"
          },
          {
            name: "initialVirtualTokenReserves",
            type: "u64"
          },
          {
            name: "initialVirtualSolReserves",
            type: "u64"
          },
          {
            name: "initialRealTokenReserves",
            type: "u64"
          },
          {
            name: "tokenTotalSupply",
            type: "u64"
          },
          {
            name: "feeBasisPoints",
            type: "u64"
          }
        ]
      },
      // ... other instructions remain the same
    ],
    accounts: [
      {
        name: "BondingCurve",
        discriminator: [23, 183, 248, 55, 96, 216, 172, 96]
      },
      {
        name: "Global",
        discriminator: [167, 232, 232, 177, 200, 108, 114, 127]
      }
    ],
    events: [
      {
        name: "CreateEvent",
        discriminator: [27, 114, 169, 77, 222, 235, 99, 118]
      },
      {
        name: "TradeEvent",
        discriminator: [189, 219, 127, 211, 78, 230, 97, 238]
      },
      {
        name: "CompleteEvent",
        discriminator: [95, 114, 97, 156, 212, 46, 152, 8]
      },
      {
        name: "SetParamsEvent",
        discriminator: [223, 195, 159, 246, 62, 48, 143, 131]
      }
    ],
    types: [
      {
        name: "global",
        type: {
          kind: "struct",
          fields: [
            {
              name: "initialized",
              type: "bool"
            },
            {
              name: "authority",
              type: "pubkey"
            },
            {
              name: "feeRecipient",
              type: "pubkey"
            },
            {
              name: "initialVirtualTokenReserves",
              type: "u64"
            },
            {
              name: "initialVirtualSolReserves",
              type: "u64"
            },
            {
              name: "initialRealTokenReserves",
              type: "u64"
            },
            {
              name: "tokenTotalSupply",
              type: "u64"
            },
            {
              name: "feeBasisPoints",
              type: "u64"
            }
          ]
        }
      },
      // ... other types remain the same
    ],
    errors: [
      {
        code: 6000,
        name: "NotAuthorized",
        msg: "The given account is not authorized to execute this instruction."
      },
      {
        code: 6001,
        name: "AlreadyInitialized",
        msg: "The program is already initialized."
      },
      // ... other errors remain the same
    ]
  };
  
  module.exports = {
    PumpFun
  };
  