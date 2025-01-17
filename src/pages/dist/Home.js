"use strict";
exports.__esModule = true;
exports.Home = void 0;
var material_1 = require("@mui/material");
var react_1 = require("react");
var react_redux_1 = require("react-redux");
exports.Home = function () {
    var _a = react_redux_1.useSelector(function (state) { return state.hashconnect; }), connectedAccountIds = _a.accountIds, isConnected = _a.isConnected;
    var _b = react_1.useState(""), fromAccountId = _b[0], setFromAccountId = _b[1];
    var _c = react_1.useState(""), toAccountId = _c[0], setToAccountId = _c[1];
    return (React.createElement(material_1.Stack, { spacing: 1 },
        React.createElement(material_1.Typography, { variant: "h2" }, "Connected Accounts"),
        connectedAccountIds.map(function (accountId) { return (React.createElement(material_1.Box, { key: accountId },
            React.createElement(material_1.Typography, null,
                "Account ID: ",
                accountId))); }),
        !isConnected && React.createElement(material_1.Typography, null, "NONE")));
};
