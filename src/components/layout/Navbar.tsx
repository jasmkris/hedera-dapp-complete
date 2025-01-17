import { AppBar, Box, Link, Toolbar, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { HashConnectConnectButton } from "../hashconnect/hashconnect-client";

export const Navbar = () => {
  return (
    <>
      <HashConnectConnectButton />
    </>
  );
};
