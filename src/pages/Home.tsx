import {
  AccountId,
  Hbar,
  TransactionId,
  TransferTransaction,
} from "@hashgraph/sdk";
import {
  Stack,
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  TextField,
} from "@mui/material";
import { useState, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getConnectedAccountIds,
  executeTransaction,
  signTransaction,
  hcInitPromise,
  hc,
} from "../services/hashconnect";
import { actions, AppStore } from "../store";
// import { MirrorNodeAccountTokenBalanceWithInfo, MirrorNodeClient } from "../services/mirrorNodeClient";
import { appConfig } from "../config";

export const Home = () => {

  const { accountIds: connectedAccountIds, isConnected } = useSelector(
    (state: AppStore) => state.hashconnect
  );

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");

  return (
    <Stack spacing={1}>
      <Typography variant="h2">Connected Accounts</Typography>
      {connectedAccountIds.map((accountId) => (
        <Box key={accountId}>
          <Typography>Account ID: {accountId}</Typography>
        </Box>
      ))}
      {!isConnected && <Typography>NONE</Typography>}
    </Stack>
  );
};
