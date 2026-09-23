import {
  createPublicClient,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as Address;
export const PONS_LAUNCH_AND_BUY = "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" as Address;\nexport const PONS_FEE_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e" as Address;

export const robinhoodChain = {
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
} as const;

const factoryAbi = parseAbi([
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (uint256 supply,uint256 curveFeeBps,uint256 phantomQuote,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,bool enabled)",
  "function launchFee() view returns (uint256)",
  "function launchEnabled() view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function snipeTaxStartBps() view returns (uint256)",
  "function snipeTaxSeconds() view returns (uint256)",
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote,uint256 graduationThreshold,uint8 decimals)",
  "function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)",
  "function canLaunch(address launcher) view returns (bool)",
]);

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

function client() {
  return createPublicClient({ chain: robinhoodChain, transport: http(robinhoodChain.rpcUrls.default.http[0]) });
}

export async function getPonsCapabilities() {
  const c = client();
  const [count, launchFee, launchEnabled, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, block] = await Promise.all([
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchConfigCount" }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchFee" }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchEnabled" }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "maxCreatorTaxBps" }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "snipeTaxStartBps" }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "snipeTaxSeconds" }),
    c.getBlockNumber(),
  ]);

  const configs = await Promise.all(
    Array.from({ length: Number(count) }, async (_, id) => {
      const config = await c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "getLaunchConfig", args: [BigInt(id)] });
      return {
        id,
        supply: config[0].toString(),
        curveFeeBps: Number(config[1]),
        phantomQuote: config[2].toString(),
        graduationThreshold: config[3].toString(),
        poolFee: Number(config[4]),
        tickSpacing: Number(config[5]),
        enabled: config[6],
      };
    }),
  );

  return {
    chainId: ROBINHOOD_CHAIN_ID,
    block: block.toString(),
    factory: PONS_FACTORY,
    launchAndBuy: PONS_LAUNCH_AND_BUY,
    launchEnabled,
    launchFeeWei: launchFee.toString(),
    launchFeeEth: formatEther(launchFee),
    maxCreatorTaxBps: Number(maxCreatorTaxBps),
    snipeTaxStartBps: Number(snipeTaxStartBps),
    snipeTaxSeconds: Number(snipeTaxSeconds),
    configs,
  };
}

export async function validatePonsPair(pair: string, launchConfigId = 0) {
  if (!pair || pair.toLowerCase() === "eth" || pair === zeroAddress) {
    const c = client();
    const economics = await c.readContract({
      address: PONS_FACTORY,
      abi: factoryAbi,
      functionName: "previewLaunchEconomics",
      args: [BigInt(launchConfigId), zeroAddress],
    });
    return { address: zeroAddress, symbol: "ETH", name: "Ether", decimals: 18, approved: true, expectedEconomics: economics };
  }
  if (!isAddress(pair)) throw new Error("Invalid Robinhood Chain token address.");
  const address = pair as Address;
  const c = client();
  const [approved, economics, expectedEconomics, symbol, name, decimals] = await Promise.all([
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "approvedPairTokens", args: [address] }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "pairTokenEconomics", args: [address] }),
    c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [BigInt(launchConfigId), address] }),
    c.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
    c.readContract({ address, abi: erc20Abi, functionName: "name" }).catch(() => "Token"),
    c.readContract({ address, abi: erc20Abi, functionName: "decimals" }).catch(() => economicsDecimalsFallback()),
  ]);
  return {
    address,
    approved,
    symbol,
    name,
    decimals: Number(decimals),
    phantomQuoteRaw: economics[0].toString(),
    graduationThresholdRaw: economics[1].toString(),
    phantomQuote: formatUnits(economics[0], economics[2]),
    graduationThreshold: formatUnits(economics[1], economics[2]),
    expectedEconomics,
  };
}

function economicsDecimalsFallback() {
  return 18 as const;
}
