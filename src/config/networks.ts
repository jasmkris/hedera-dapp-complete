import { NetworkConfigs } from "./type"

export const networkConfig: NetworkConfigs = {
  mainnet: {
    network: "mainnet",
    jsonRpcUrl: "https://mainnet.hashio.io/api", // check out the readme for alternative RPC Relay urls
    mirrorNodeUrl: "https://mainnet.mirrornode.hedera.com",
    chainId: "0x128",
  }
}