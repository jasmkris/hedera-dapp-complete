import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import { ThemeProvider } from "./theme";
import { store } from "./store";
import { Buffer } from "buffer";
import { HashConnectClient } from "./components/hashconnect/hashconnect-client";

import './global.css';

window.Buffer = window.Buffer || Buffer;

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <HashConnectClient />
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);
